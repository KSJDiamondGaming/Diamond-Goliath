'use strict';

const Discord = require('discord.js');
const { safeReply, safeUpdate } = require('../../../core/ui/interactionResponse');
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

function investigationModal(targetId) {
  return new Discord.ModalBuilder()
    .setCustomId(`mod_submit_quarantine_investigation:${targetId}`)
    .setTitle('Investigation Isolation')
    .addComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason for investigation isolation')
          .setStyle(Discord.TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(500)
          .setPlaceholder('Why is this member being isolated for investigation?')
      )
    );
}

function securityModal(targetId) {
  return new Discord.ModalBuilder()
    .setCustomId(`mod_submit_quarantine_security:${targetId}`)
    .setTitle('Full Security Isolation')
    .addComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Security isolation reason')
          .setStyle(Discord.TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(500)
          .setPlaceholder('Why does this member require full Security Isolation?')
      ),
      new Discord.ActionRowBuilder().addComponents(
        new Discord.TextInputBuilder()
          .setCustomId('confirmation')
          .setLabel('Type FULL ISOLATION to confirm')
          .setStyle(Discord.TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(14)
          .setMaxLength(14)
          .setPlaceholder('FULL ISOLATION')
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

  // Moderators never receive a Full Security Isolation choice.
  if (!isGuildOwner(interaction)) {
    await interaction.showModal(investigationModal(target.id));
    return true;
  }

  const embed = new Discord.EmbedBuilder()
    .setColor(0xED4245)
    .setTitle(`☢️ Quarantine Mode • ${target.user.tag}`)
    .setDescription([
      `**Target:** ${target.user}`,
      '',
      '🔒 **Investigation Isolation**',
      'Strips normal roles and server access, then gives the member one private interview room with authorised staff.',
      '',
      '🚨 **Full Security Isolation**',
      'Complete containment with no interview-room access. This manual action is restricted to the **server owner only**.',
      '',
      'Anti-Nuke may still apply Full Security Isolation automatically when required.',
    ].join('\n'))
    .setFooter({ text: 'Full Security Isolation cannot be delegated to moderators or administrators.' })
    .setTimestamp();

  const components = [
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId(`mod_quarantine_investigation:${target.id}`)
        .setLabel('Investigation Isolation')
        .setEmoji('🔒')
        .setStyle(Discord.ButtonStyle.Primary),
      new Discord.ButtonBuilder()
        .setCustomId(`mod_quarantine_security:${target.id}`)
        .setLabel('Full Security Isolation')
        .setEmoji('🚨')
        .setStyle(Discord.ButtonStyle.Danger),
      new Discord.ButtonBuilder()
        .setCustomId(`mod_dashboard:${target.id}:actions`)
        .setLabel('Cancel')
        .setStyle(Discord.ButtonStyle.Secondary)
    ),
  ];
  return safeUpdate(interaction, { content: null, embeds: [embed], components });
}

async function openInvestigationModal(interaction, targetId) {
  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  if (currentSnapshot(interaction, target.id)) {
    return safeReply(interaction, { content: `⚠️ **${target.user.tag}** is already quarantined.`, flags: 64 });
  }
  await interaction.showModal(investigationModal(target.id));
  return true;
}

async function openSecurityModal(interaction, targetId) {
  if (!isGuildOwner(interaction)) {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.security_denied',
      action: 'quarantine',
      targetId,
      reason: 'Full Security Isolation is server-owner only.',
    });
    return safeReply(interaction, {
      content: '❌ **Full Security Isolation is restricted to the server owner.** Moderators and administrators can use Investigation Isolation instead.',
      flags: 64,
    });
  }
  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  const existing = currentSnapshot(interaction, target.id);
  if (existing && getQuarantineMode(existing) === QUARANTINE_MODES.SECURITY) {
    return safeReply(interaction, { content: `⚠️ **${target.user.tag}** is already in Full Security Isolation.`, flags: 64 });
  }
  await interaction.showModal(securityModal(target.id));
  return true;
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
      securityEscalation: Boolean(result?.escalated),
      quarantineResult: {
        mode: result?.mode || mode,
        roleId: result?.roleId || null,
        interviewChannelId: result?.interviewChannelId || null,
        escalated: Boolean(result?.escalated),
      },
    },
    status: 'active',
    actorId: interaction.user.id,
  });
  if (created?.caseId) attachQuarantineCase(interaction.guild, target.id, created.caseId);
  return created;
}

async function submitQuarantine(interaction, targetId, requestedMode, legacy = false) {
  const mode = requestedMode === QUARANTINE_MODES.SECURITY
    ? QUARANTINE_MODES.SECURITY
    : QUARANTINE_MODES.INVESTIGATION;

  if (mode === QUARANTINE_MODES.SECURITY && !isGuildOwner(interaction)) {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.security_denied',
      action: 'quarantine',
      targetId,
      reason: 'Security isolation submit rejected: server-owner only.',
      metadata: { submitAttempt: true },
    });
    return safeReply(interaction, { content: '❌ Full Security Isolation can only be applied by the server owner.', flags: 64 });
  }

  if (mode === QUARANTINE_MODES.SECURITY && fieldValue(interaction, 'confirmation') !== 'FULL ISOLATION') {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.security_confirmation_failed',
      action: 'quarantine',
      targetId,
    });
    return safeReply(interaction, { content: '❌ Confirmation did not match `FULL ISOLATION`. No security isolation was applied.', flags: 64 });
  }

  const target = await resolveTarget(interaction, targetId, 'quarantine');
  if (!target) return true;
  const reason = fieldValue(interaction, 'reason');
  if (!reason) return safeReply(interaction, { content: '❌ A quarantine reason is required.', flags: 64 });

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
    return safeReply(interaction, {
      content: `❌ Failed to place **${target.user.tag}** in ${mode === QUARANTINE_MODES.SECURITY ? 'Full Security Isolation' : 'Investigation Isolation'}: ${result?.error || result?.reason || 'Unknown error'}`,
      flags: 64,
    });
  }

  let modCase = null;
  try {
    modCase = createQuarantineCase(interaction, target, mode, reason, result);
  } catch (error) {
    console.error('❌ Failed to create quarantine moderation case:', error);
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
    event: result.escalated ? 'moderation.quarantine.escalated' : 'moderation.quarantine.applied',
    action: 'quarantine',
    targetId: target.id,
    reason,
    after: result,
    metadata: {
      containmentMode: mode,
      caseId: modCase?.caseId || null,
      legacyEntryPoint: legacy,
      guildOwnerAuthorized: mode === QUARANTINE_MODES.SECURITY,
    },
  });

  let content;
  if (result.dryRun) {
    content = `🧪 Quarantine dry-run completed for **${target.user.tag}**.`;
  } else if (mode === QUARANTINE_MODES.SECURITY) {
    content = `🚨 **${target.user.tag}** is now in **Full Security Isolation**.${modCase?.caseId ? ` • Case **#${modCase.caseId}**` : ''}`;
  } else {
    content = `🔒 **${target.user.tag}** is now in **Investigation Isolation**.${result.interviewChannelId ? ` • Interview room: <#${result.interviewChannelId}>` : ''}${modCase?.caseId ? ` • Case **#${modCase.caseId}**` : ''}`;
  }

  await safeReply(interaction, { content, flags: 64 });
  await refreshDashboard(Discord, interaction, target, { view: 'actions' });
  return true;
}

async function removeQuarantine(interaction, targetId) {
  const target = await resolveTarget(interaction, targetId, 'remove_quarantine');
  if (!target) return true;
  const snapshot = currentSnapshot(interaction, target.id);
  if (!snapshot) {
    return safeReply(interaction, { content: `⚠️ **${target.user.tag}** is not currently quarantined.`, flags: 64 });
  }
  const mode = getQuarantineMode(snapshot);

  if (mode === QUARANTINE_MODES.SECURITY && !isGuildOwner(interaction)) {
    recordModerationSystemEvent({
      interaction,
      event: 'moderation.quarantine.security_remove_denied',
      action: 'remove_quarantine',
      targetId: target.id,
      reason: 'Full Security Isolation removal is server-owner only.',
      metadata: { containmentMode: mode, caseId: snapshot.caseId || null },
    });
    return safeReply(interaction, {
      content: '❌ **Full Security Isolation can only be cleared by the server owner.** You cannot release this member from security containment.',
      flags: 64,
    });
  }

  const result = await restoreQuarantinedMember(interaction.guild, target, {
    reason: `${mode === QUARANTINE_MODES.SECURITY ? 'Full Security Isolation' : 'Investigation Isolation'} cleared by ${interaction.user?.tag || interaction.user?.id || 'staff'}`,
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
      content: `❌ Failed to clear ${mode === QUARANTINE_MODES.SECURITY ? 'Full Security Isolation' : 'Investigation Isolation'} from **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`,
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
      console.error(`❌ Failed to update quarantine case #${snapshot.caseId}:`, error);
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
    content: `🔓 **${mode === QUARANTINE_MODES.SECURITY ? 'Full Security Isolation' : 'Investigation Isolation'} cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s)${archiveText}.`,
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
    if (id.startsWith('mod_quarantine_security:')) return openSecurityModal(interaction, targetIdFrom(id));
    if (id.startsWith('mod_remove_quarantine:')) return removeQuarantine(interaction, targetIdFrom(id));
    return false;
  }

  if (interaction.isModalSubmit?.()) {
    if (id.startsWith('mod_submit_quarantine_investigation:')) {
      return submitQuarantine(interaction, targetIdFrom(id), QUARANTINE_MODES.INVESTIGATION, false);
    }
    if (id.startsWith('mod_submit_quarantine_security:')) {
      return submitQuarantine(interaction, targetIdFrom(id), QUARANTINE_MODES.SECURITY, false);
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
  isGuildOwner,
};
