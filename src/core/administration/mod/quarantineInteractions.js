'use strict';

const Discord = require('discord.js');
const { safeReply, safeEditReply } = require('../../../core/ui/interactionResponse');
const {
  requireModeratableTarget,
  recordModerationSystemEvent,
} = require('./permissions');
const {
  createCase,
  updateCaseStatus,
  recordCaseAudit,
} = require('./storage');
const {
  QUARANTINE_MODES,
  quarantineMember,
  restoreQuarantinedMember,
  getQuarantineState,
  getQuarantineMode,
  attachQuarantineCase,
} = require('../../security/protection/quarantine');
const { refreshDashboard } = require('./panel');

function isGuildOwner(interaction) {
  return Boolean(
    interaction?.guild?.ownerId
    && interaction?.user?.id
    && String(interaction.guild.ownerId) === String(interaction.user.id)
  );
}

function targetIdFrom(customId) {
  return String(customId || '').split(':')[1] || null;
}

function fieldValue(interaction, key) {
  try {
    return String(interaction.fields?.getTextInputValue?.(key) || '').trim();
  } catch {
    return '';
  }
}

async function ensureInitiatorInterviewAccess(guild, channelId, initiatorId) {
  if (!guild || !channelId || !initiatorId) return { success: false, reason: 'Missing guild/channel/initiator.' };
  const channel = guild.channels.cache.get(String(channelId))
    || await guild.channels.fetch(String(channelId)).catch(() => null);
  if (!channel?.permissionOverwrites?.edit) return { success: false, reason: 'Investigation room is unavailable.' };
  const member = guild.members.cache.get(String(initiatorId))
    || await guild.members.fetch(String(initiatorId)).catch(() => null);
  if (!member) return { success: false, reason: 'Initiating moderator is no longer in the guild.' };
  try {
    // Keep this to the permissions required to use the room. Asking Discord to
    // grant unrelated bits (for example ManageMessages) can return 50013 when
    // the bot does not itself hold that bit in the private category.
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }, { reason: 'Ensure investigating moderator can access the private interview room' });
    return { success: true, channelId: channel.id, memberId: member.id };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

function investigationModal(targetId) {
  return new Discord.ModalBuilder()
    .setCustomId(`mod_submit_quarantine_investigation:${targetId}`)
    .setTitle('Investigate Member')
    .addComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason for investigation')
          .setStyle(Discord.TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(500)
          .setPlaceholder('Why is this member being isolated for investigation?')
      )
    );
}

async function resolveTarget(interaction, targetId, action = 'quarantine') {
  if (!targetId) {
    await safeReply(interaction, { content: '❌ Missing target member.', flags: 64 });
    return null;
  }
  return requireModeratableTarget(interaction, targetId, action);
}

function currentSnapshot(interaction, targetId) {
  return getQuarantineState(interaction.guild.id)?.users?.[String(targetId)] || null;
}

async function openQuarantine(interaction, targetId) {
  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  const existing = currentSnapshot(interaction, target.id);
  if (existing) {
    const mode = getQuarantineMode(existing);
    return safeReply(interaction, {
      content: `⚠️ **${target.user.tag}** is already in **${mode === QUARANTINE_MODES.SECURITY ? 'Full Security Isolation' : 'Investigation Isolation'}**.`,
      flags: 64,
    });
  }

  // /mod is an investigation workflow only. Manual Full Security Isolation lives in /admin.
  await interaction.showModal(investigationModal(target.id));
  return true;
}

async function openInvestigationModal(interaction, targetId) {
  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  if (currentSnapshot(interaction, target.id)) {
    return safeReply(interaction, { content: `⚠️ **${target.user.tag}** is already isolated.`, flags: 64 });
  }
  await interaction.showModal(investigationModal(target.id));
  return true;
}

async function securityMovedToAdmin(interaction, targetId, submitAttempt = false) {
  recordModerationSystemEvent({
    interaction,
    event: 'moderation.quarantine.security_moved_to_admin',
    action: 'quarantine',
    targetId,
    reason: 'Manual Full Security Isolation is only available from the owner controls in /admin.',
    metadata: { submitAttempt },
  });
  return safeReply(interaction, {
    content: '🚨 **Full Security Isolation has moved to `/admin`.** The `/mod` panel is for staff investigations only.',
    flags: 64,
  });
}

function createQuarantineCase(interaction, target, mode, reason, result) {
  if (result?.dryRun) return null;
  const created = createCase({
    guildId: interaction.guild.id,
    userId: target.id,
    moderatorId: interaction.user.id,
    action: 'quarantine',
    reason,
    metadata: {
      containmentMode: mode,
      source: 'moderation',
      interviewChannelId: result?.interviewChannelId || null,
      securityEscalation: false,
      quarantineResult: {
        mode: result?.mode || mode,
        roleId: result?.roleId || null,
        interviewChannelId: result?.interviewChannelId || null,
        escalated: false,
      },
    },
    status: 'active',
    actorId: interaction.user.id,
  });
  if (created?.caseId) attachQuarantineCase(interaction.guild, target.id, created.caseId);
  return created;
}

async function submitQuarantine(interaction, targetId, requestedMode, legacy = false) {
  if (requestedMode === QUARANTINE_MODES.SECURITY) {
    return securityMovedToAdmin(interaction, targetId, true);
  }

  const mode = QUARANTINE_MODES.INVESTIGATION;
  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  const reason = fieldValue(interaction, 'reason');
  if (!reason) return safeReply(interaction, { content: '❌ An investigation reason is required.', flags: 64 });

  // Acknowledge first: isolation performs several Discord API writes and may outlive the modal deadline.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
  }

  const result = await quarantineMember(interaction.guild, target, {
    reason,
    quarantinedBy: interaction.user.id,
    source: 'moderation',
    mode,
  });

  if (!result?.success) {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.failed',
      action: 'quarantine',
      targetId: target.id,
      reason,
      after: result,
      metadata: { containmentMode: mode, legacyEntryPoint: legacy },
    });
    return safeEditReply(interaction, {
      content: `❌ Failed to investigate **${target.user.tag}**: ${result?.error || result?.reason || 'Unknown error'}`,
      flags: 64,
    });
  }

  if (!result.dryRun && result.interviewChannelId) {
    const access = await ensureInitiatorInterviewAccess(
      interaction.guild,
      result.interviewChannelId,
      interaction.user.id,
    );
    if (!access.success) {
      console.warn(`[InvestigationIsolation] Could not guarantee initiator access in ${interaction.guild.id}: ${access.reason}`);
      recordModerationSystemEvent({
        interaction,
        event: 'moderation.investigation.initiator_access_failed',
        action: 'quarantine',
        targetId: target.id,
        reason: access.reason,
        metadata: { interviewChannelId: result.interviewChannelId },
      });
    }
  }

  let modCase = null;
  try {
    modCase = createQuarantineCase(interaction, target, mode, reason, result);
  } catch (error) {
    console.error('❌ Failed to create investigation moderation case:', error);
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.case_failed',
      action: 'quarantine',
      targetId: target.id,
      reason: error.message,
      metadata: { containmentMode: mode },
    });
  }

  recordModerationSystemEvent({
    interaction,
    event: 'moderation.quarantine.applied',
    action: 'quarantine',
    targetId: target.id,
    reason,
    after: result,
    metadata: {
      containmentMode: mode,
      caseId: modCase?.caseId || null,
      legacyEntryPoint: legacy,
      guildOwnerAuthorized: false,
    },
  });

  const content = result.dryRun
    ? `🧪 Investigation dry-run completed for **${target.user.tag}**.`
    : `🔒 **${target.user.tag}** is now under **Investigation Isolation**.${result.interviewChannelId ? ` • Interview room: <#${result.interviewChannelId}>` : ''}${modCase?.caseId ? ` • Case **#${modCase.caseId}**` : ''}`;

  await safeEditReply(interaction, { content, flags: 64 });
  await refreshDashboard(Discord, interaction, target, { view: 'actions' });
  return true;
}

async function removeQuarantine(interaction, targetId) {
  const target = await resolveTarget(interaction, targetId, 'remove_quarantine');
  if (!target) return true;
  const snapshot = currentSnapshot(interaction, target.id);
  if (!snapshot) {
    return safeReply(interaction, { content: `⚠️ **${target.user.tag}** is not currently isolated.`, flags: 64 });
  }
  const mode = getQuarantineMode(snapshot);

  if (mode === QUARANTINE_MODES.SECURITY) {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.security_remove_moved_to_admin',
      action: 'remove_quarantine',
      targetId: target.id,
      reason: 'Full Security Isolation release is only available from /admin.',
      metadata: { containmentMode: mode, caseId: snapshot.caseId || null },
    });
    return safeReply(interaction, {
      content: '🚨 **Full Security Isolation can only be cleared from `/admin` by the server owner.**',
      flags: 64,
    });
  }

  const result = await restoreQuarantinedMember(interaction.guild, target, {
    reason: `Investigation Isolation cleared by ${interaction.user?.tag || interaction.user?.id || 'staff'}`,
    restoredBy: interaction.user.id,
    source: 'moderation',
  });

  recordModerationSystemEvent({
    interaction,
    event: result.success ? 'moderation.quarantine.removed' : 'moderation.quarantine.remove_failed',
    action: 'remove_quarantine',
    targetId: target.id,
    after: result,
    metadata: { containmentMode: mode, caseId: snapshot.caseId || null },
  });

  if (!result.success) {
    return safeReply(interaction, {
      content: `❌ Failed to clear Investigation Isolation from **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`,
      flags: 64,
    });
  }

  if (snapshot.caseId) {
    try {
      updateCaseStatus(interaction.guild.id, snapshot.caseId, 'reversed', interaction.user.id);
      recordCaseAudit({
        guildId: interaction.guild.id,
        caseId: snapshot.caseId,
        actorId: interaction.user.id,
        event: 'case.quarantine.released',
        before: { status: 'active', containmentMode: mode },
        after: { status: 'reversed', containmentMode: mode, restoredRoles: result.restoredRoles || 0 },
        metadata: { interviewArchive: result.archive || null },
      });
    } catch (error) {
      console.error(`❌ Failed to update investigation case #${snapshot.caseId}:`, error);
      recordModerationSystemEvent({
        interaction,
        event: 'moderation.quarantine.case_release_update_failed',
        action: 'remove_quarantine',
        targetId: target.id,
        reason: error.message,
        metadata: { caseId: snapshot.caseId, containmentMode: mode },
      });
    }
  }

  const archiveText = result.archive?.archived && result.archive?.channelId
    ? ` • Interview room archived: <#${result.archive.channelId}>`
    : '';
  await safeReply(interaction, {
    content: `🔓 **Investigation cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s)${archiveText}.`,
    flags: 64,
  });
  await refreshDashboard(Discord, interaction, target, { view: 'actions' });
  return true;
}

async function handleQuarantineInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (!id) return false;

  if (interaction.isButton?.()) {
    if (id.startsWith('mod_open_quarantine:')) return openQuarantine(interaction, targetIdFrom(id));
    if (id.startsWith('mod_quarantine_investigation:')) return openInvestigationModal(interaction, targetIdFrom(id));
    if (id.startsWith('mod_quarantine_security:')) return securityMovedToAdmin(interaction, targetIdFrom(id), false);
    if (id.startsWith('mod_remove_quarantine:')) return removeQuarantine(interaction, targetIdFrom(id));
    return false;
  }

  if (interaction.isModalSubmit?.()) {
    if (id.startsWith('mod_submit_quarantine_investigation:')) {
      return submitQuarantine(interaction, targetIdFrom(id), QUARANTINE_MODES.INVESTIGATION, false);
    }
    if (id.startsWith('mod_submit_quarantine_security:')) {
      return securityMovedToAdmin(interaction, targetIdFrom(id), true);
    }
    // Legacy quarantine modal submissions are deliberately downgraded to Investigation Isolation.
    if (id.startsWith('mod_submit_quarantine:')) {
      return submitQuarantine(interaction, targetIdFrom(id), QUARANTINE_MODES.INVESTIGATION, true);
    }
  }

  return false;
}

module.exports = {
  handleQuarantineInteraction,
  ensureInitiatorInterviewAccess,
  isGuildOwner,
};
