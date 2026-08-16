'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const welcome = require('./welcome');
const embedTemplateManager = require('../embed/embedTemplates');

const selections = new Map();

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function selectionKey(interactionOrGuild, userId = 'panel') {
  const guildId = interactionOrGuild?.guild?.id || interactionOrGuild?.id;
  const resolvedUserId = interactionOrGuild?.user?.id || userId;
  return `${guildId}:${resolvedUserId}`;
}

function templateTypeLabel(template = {}) {
  const type = String(template.templateType || template.module || 'global');
  return type === 'global' ? 'General' : type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getTemplateOptions(guildId) {
  return Object.values(embedTemplateManager.listTemplates(guildId))
    .filter(Boolean)
    .sort((a, b) => {
      const aWelcome = a.templateType === 'welcome' || a.module === 'welcome' ? 0 : 1;
      const bWelcome = b.templateType === 'welcome' || b.module === 'welcome' ? 0 : 1;
      return aWelcome - bWelcome || String(a.name || a.templateId).localeCompare(String(b.name || b.templateId));
    })
    .slice(0, 25)
    .map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: `${templateTypeLabel(template)} · ${template.embed?.title || template.panels?.[0]?.title || 'Embed Studio template'}`.slice(0, 100),
      value: String(template.templateId),
    }));
}

function templateMenu(guild, activeTemplateId, userId) {
  const options = getTemplateOptions(guild.id);
  const selected = selections.get(`${guild.id}:${userId}`) || activeTemplateId || null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:welcome:template')
    .setPlaceholder(options.length ? 'Choose an Embed Studio template' : 'No templates available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(options.length === 0);

  if (options.length) {
    menu.addOptions(options.map((option) => ({ ...option, default: option.value === selected })));
  } else {
    menu.addOptions({ label: 'No templates found', value: 'none' });
  }
  return menu;
}

function interactionMember(interaction) {
  return interaction.member;
}

async function buildWelcomePanel(guild, memberDisplayName = 'Unknown User', userId = 'panel') {
  const config = welcome.getWelcomeSection(guild.id);
  const moduleEnabled = guildManager.isModuleEnabled(guild.id, 'welcome');
  const health = await welcome.buildHealthReport(guild);
  const analytics = config.analytics || {};
  const publicBinding = welcome.getWelcomeBinding(guild.id, 'welcome');
  const dmBinding = welcome.getWelcomeBinding(guild.id, 'dm_welcome');
  const publicTemplate = welcome.getAssignedTemplate(guild.id, 'welcome', config);
  const dmTemplate = welcome.getAssignedTemplate(guild.id, 'dmWelcome', config);
  const activeTemplateId = publicTemplate?.templateId || config.templateId;
  const stagedTemplateId = selections.get(`${guild.id}:${userId}`);
  const stagedTemplate = stagedTemplateId ? embedTemplateManager.getTemplate(guild.id, stagedTemplateId) : null;
  const warnings = health.warnings || [];
  const roleNotificationLabel = config.mentionRoleIds.length
    ? config.mentionRoleIds.map((roleId) => `<@&${roleId}>`).join(', ')
    : 'None selected';

  const embed = new EmbedBuilder()
    .setColor(!moduleEnabled ? 0xed4245 : warnings.length ? 0xfaa61a : 0x57f287)
    .setTitle('👋 Welcome · Setup')
    .setDescription([
      `**Status:** ${moduleEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Channel:** ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}`,
      `**DM:** ${config.dmEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Member notify:** ${config.allowUserPing ? 'Real ping ✅' : 'Display only'}`,
      `**Role notify:** ${config.allowRolePings ? `Enabled ✅ · ${roleNotificationLabel}` : `Disabled · ${roleNotificationLabel}`}`,
      `**Bots:** ${config.ignoreBots ? 'Excluded' : 'Included'}`,
      '',
      '**📨 Public Welcome**',
      `**Template:** ${publicTemplate ? `\`${publicTemplate.name || publicTemplate.templateId}\`` : '`Not set`'}`,
      `**Assignment:** ${publicBinding ? 'Assigned ✅' : 'Using configured template'}`,
      '',
      '**💬 Welcome DM**',
      `**Template:** ${dmTemplate ? `\`${dmTemplate.name || dmTemplate.templateId}\`` : '`Not set`'}`,
      `**Source:** ${dmBinding || config.dmTemplateId ? 'Separate DM template' : 'Same as public'}`,
      stagedTemplate ? `**Selected:** \`${stagedTemplate.name || stagedTemplate.templateId}\`` : null,
      '',
      `Public: \`${analytics.publicSent || 0}\` | DMs: \`${analytics.dmSent || 0}\` | Failed: \`${(analytics.publicFailed || 0) + (analytics.dmFailed || 0)}\``,
      '',
      warnings.length ? `**Warnings**\n${warnings.map((warning) => `• ${warning}`).join('\n')}` : '**Health:** Healthy ✅',
    ].filter(Boolean).join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:welcome:channel')
        .setPlaceholder('Select the welcome channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(templateMenu(guild, activeTemplateId, userId)),
      row(
        button(moduleEnabled ? 'admin:welcome:disable' : 'admin:welcome:enable', moduleEnabled ? '⏸ Disable' : '▶ Enable', moduleEnabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:welcome:toggleDm', config.dmEnabled ? '📨 DM On' : '📨 DM Off', config.dmEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:welcome:mentions', '🔔 Mentions', (config.allowUserPing || config.allowRolePings) ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:welcome:toggleBots', config.ignoreBots ? '🤖 Bots Off' : '🤖 Bots On', config.ignoreBots ? ButtonStyle.Secondary : ButtonStyle.Success)
      ),
      row(
        button('admin:welcome:assign', '✅ Public', ButtonStyle.Primary),
        button('admin:welcome:assignDm', '💬 DM', ButtonStyle.Primary),
        button('admin:welcome:test', '🧪 Test', ButtonStyle.Success),
        button('admin:welcome:send', '📨 Send', ButtonStyle.Success),
        button('admin:welcome:repair', '🩺 Repair')
      ),
      row(
        button('admin:welcome:dmPublic', '↩ DM = Public'),
        button('admin:welcome:reset', '♻ Reset', ButtonStyle.Danger),
        button('admin:welcome:export', '📤 Export'),
        button('admin:modules', '⬅ Modules')
      ),
    ],
  };
}

function buildMentionSettingsPanel(guild, memberDisplayName = 'Unknown User') {
  const config = welcome.getWelcomeSection(guild.id);
  const selectedRoles = config.mentionRoleIds.length
    ? config.mentionRoleIds.map((roleId) => `<@&${roleId}>`).join(', ')
    : '`None`';

  return {
    embeds: [new EmbedBuilder()
      .setColor(config.allowRolePings ? 0x57f287 : 0x5865f2)
      .setTitle('🔔 Welcome · Mention Settings')
      .setDescription([
        'Choose who the public welcome should notify above the embed.',
        '',
        `**New member ping:** ${config.allowUserPing ? 'Enabled ✅' : 'Disabled'}`,
        `**Role pings:** ${config.allowRolePings ? 'Enabled ✅' : 'Disabled'}`,
        `**Selected roles:** ${selectedRoles}`,
        '',
        'Role notifications are restricted to only the selected roles. Embed mentions remain display-only.',
        'This works cleanly with Auto Roles and Timed Roles: an initial join role can be awarded first, welcomed, then later removed/replaced by a Timed Roles milestone.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:welcome:roles')
        .setPlaceholder('Choose roles to notify in welcome messages')
        .setMinValues(0)
        .setMaxValues(10)),
      row(
        button('admin:welcome:togglePing', config.allowUserPing ? '🔔 Member Ping On' : '🔕 Member Ping Off', config.allowUserPing ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:welcome:toggleRolePings', config.allowRolePings ? '📣 Role Pings On' : '📣 Role Pings Off', config.allowRolePings ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:welcome', '⬅ Back')
      ),
    ],
  };
}

async function updatePanel(interaction, payload = null) {
  const next = payload || await buildWelcomePanel(
    interaction.guild,
    interaction.member?.displayName || interaction.user?.username,
    interaction.user.id
  );
  if (interaction.deferred || interaction.replied) return interaction.editReply(next);
  return interaction.update(next);
}

function selectedTemplate(interaction) {
  const templateId = selections.get(selectionKey(interaction));
  if (!templateId || !embedTemplateManager.getTemplate(interaction.guild.id, templateId)) {
    throw new Error('Choose a template from the dropdown first.');
  }
  return templateId;
}

async function handleWelcomeInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:welcome')) return false;

  try {
    if (customId === 'admin:welcome') return updatePanel(interaction);
    if (customId === 'admin:welcome:mentions') {
      return updatePanel(interaction, buildMentionSettingsPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username
      ));
    }

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:welcome:channel') {
      welcome.updateConfig(interaction.guild.id, { channelId: interaction.values?.[0] || null }, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:welcome:roles') {
      const mentionRoleIds = (interaction.values || []).filter((roleId) => roleId !== interaction.guild.id);
      welcome.updateConfig(interaction.guild.id, { mentionRoleIds }, { actorId: interaction.user.id });
      return updatePanel(interaction, buildMentionSettingsPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username
      ));
    }

    if (interaction.isStringSelectMenu?.() && customId === 'admin:welcome:template') {
      const templateId = interaction.values?.[0];
      if (!templateId || templateId === 'none' || !embedTemplateManager.getTemplate(interaction.guild.id, templateId)) {
        throw new Error('Choose a valid Embed Studio template.');
      }
      selections.set(selectionKey(interaction), templateId);
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:assign') {
      welcome.bindWelcomeTemplate(interaction.guild.id, selectedTemplate(interaction), 'welcome', { actorId: interaction.user.id });
      selections.delete(selectionKey(interaction));
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:assignDm') {
      welcome.bindWelcomeTemplate(interaction.guild.id, selectedTemplate(interaction), 'dm_welcome', { actorId: interaction.user.id });
      welcome.updateConfig(interaction.guild.id, { dmEnabled: true }, { actorId: interaction.user.id });
      selections.delete(selectionKey(interaction));
      return updatePanel(interaction);
    }

    const config = welcome.getWelcomeSection(interaction.guild.id);
    if (customId === 'admin:welcome:enable') guildManager.setModuleEnabled(interaction.guild.id, 'welcome', true, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:disable') guildManager.setModuleEnabled(interaction.guild.id, 'welcome', false, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleDm') welcome.updateConfig(interaction.guild.id, { dmEnabled: !config.dmEnabled }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:togglePing') {
      welcome.updateConfig(interaction.guild.id, { allowUserPing: !config.allowUserPing }, { actorId: interaction.user.id });
      return updatePanel(interaction, buildMentionSettingsPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username
      ));
    }
    if (customId === 'admin:welcome:toggleRolePings') {
      if (!config.allowRolePings && !config.mentionRoleIds.length) throw new Error('Choose at least one role before enabling role pings.');
      welcome.updateConfig(interaction.guild.id, { allowRolePings: !config.allowRolePings }, { actorId: interaction.user.id });
      return updatePanel(interaction, buildMentionSettingsPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username
      ));
    }
    if (customId === 'admin:welcome:toggleBots') welcome.updateConfig(interaction.guild.id, { ignoreBots: !config.ignoreBots }, { actorId: interaction.user.id });

    if (['admin:welcome:enable', 'admin:welcome:disable', 'admin:welcome:toggleDm', 'admin:welcome:toggleBots'].includes(customId)) {
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:dmPublic') {
      welcome.clearDmTemplate(interaction.guild.id, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:test') {
      const member = interactionMember(interaction);
      if (!member) throw new Error('Your server member record is unavailable.');
      const current = welcome.getWelcomeSection(interaction.guild.id);
      const payload = welcome.buildDiscordPayload(member, 'welcome', current, { suppressPing: true });
      payload.ephemeral = true;
      return interaction.reply(payload);
    }

    if (customId === 'admin:welcome:send') {
      const member = interactionMember(interaction);
      if (!member) throw new Error('Your server member record is unavailable.');
      const result = await welcome.sendWelcome(member, { force: true, previewOnly: true, silent: false });
      const lines = [
        result.publicSent ? `✅ Public welcome sent to <#${welcome.getWelcomeSection(interaction.guild.id).channelId}>.` : null,
        result.dmSent ? '✅ Welcome DM sent.' : null,
        result.publicFailed ? '❌ Public welcome failed.' : null,
        result.dmFailed ? '❌ Welcome DM failed. Check the recipient’s Discord privacy settings.' : null,
        ...(result.errors || []).map((error) => `• ${error}`),
      ].filter(Boolean);
      if (!lines.length) lines.push('⚠️ Nothing was sent. Enable a channel or DM welcome first.');
      return interaction.reply({ content: lines.join('\n').slice(0, 2000), ephemeral: true });
    }

    if (customId === 'admin:welcome:repair') {
      await interaction.deferUpdate();
      await welcome.repairConfiguration(interaction.guild, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:reset') {
      await interaction.deferUpdate();
      selections.delete(selectionKey(interaction));
      welcome.resetWelcome(interaction.guild.id, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:export') {
      const exported = {
        ...welcome.exportConfiguration(interaction.guild.id),
        enabled: guildManager.isModuleEnabled(interaction.guild.id, 'welcome'),
      };
      const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(exported, null, 2), 'utf8'),
        { name: `goliath-welcome-${interaction.guild.id}.json` }
      );
      await interaction.reply({ content: '📤 Welcome configuration export.', files: [attachment], ephemeral: true });
      return true;
    }

    return updatePanel(interaction);
  } catch (error) {
    const payload = { content: `❌ Welcome setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildWelcomePanel,
  buildMentionSettingsPanel,
  handleWelcomeInteraction,
  buildWelcomeAdminPanel: buildWelcomePanel,
  handleWelcomeAdminInteraction: handleWelcomeInteraction,
};
