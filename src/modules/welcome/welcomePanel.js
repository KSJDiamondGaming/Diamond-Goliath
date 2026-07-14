'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const welcome = require('./welcome');
const embedTemplateManager = require('../embed/embedTemplateManager');
const guildManager = require('../../core/guild/guildManager');

const LEGACY_PRESET_PREFIX = 'legacy-preset:';
const LEGACY_VARIABLES = Object.freeze({
  guildMemberCount: 'memberCount',
  guildmembercount: 'memberCount',
  userDisplay: 'username',
  userdisplay: 'username',
  userDisplayName: 'username',
  userdisplayname: 'username',
  userName: 'username',
  userNoPing: 'userMention',
  usernoping: 'userMention',
  serverIcon: 'guildIcon',
  servericon: 'guildIcon',
  userServerAvatar: 'userAvatar',
  userserveravatar: 'userAvatar',
  userCreatedAt: 'createdAt',
  usercreatedat: 'createdAt',
  userJoinedAt: 'joinedAt',
  userjoinedat: 'joinedAt',
  nowTimestamp: 'timestamp',
  nowtimestamp: 'timestamp',
});

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function translateLegacyVariables(value) {
  if (typeof value === 'string') {
    return value.replace(/\{([a-zA-Z0-9_.:-]+)\}/g, (match, key) => {
      const replacement = LEGACY_VARIABLES[key];
      return replacement ? `{${replacement}}` : match;
    });
  }
  if (Array.isArray(value)) return value.map(translateLegacyVariables);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateLegacyVariables(item)]));
  }
  return value;
}

function legacyPresetTemplateId(name) {
  return `embed_preset_${embedTemplateManager.cleanKey(name)}`;
}

function legacyPresetToTemplate(name, preset = {}) {
  const panel = Array.isArray(preset.panels) && preset.panels.length ? preset.panels[0] : preset;
  return translateLegacyVariables({
    templateId: legacyPresetTemplateId(name),
    name: String(preset.name || name).slice(0, 100),
    module: 'welcome',
    templateType: 'welcome',
    content: String(preset.content || preset.message || '').slice(0, 2000),
    embed: {
      title: panel.title || '',
      description: panel.description || '',
      color: panel.color || '#5865F2',
      author: {
        name: panel.authorName || panel.author?.name || '',
        iconURL: panel.authorIcon || panel.author?.iconURL || '',
        url: panel.authorUrl || panel.author?.url || '',
      },
      thumbnailURL: panel.thumbnail || panel.thumbnailURL || '',
      imageURL: panel.image || panel.imageURL || '',
      footer: {
        text: typeof panel.footer === 'string' ? panel.footer : panel.footer?.text || '',
        iconURL: panel.footerIcon || panel.footer?.iconURL || '',
      },
      fields: Array.isArray(panel.fields) ? panel.fields : [],
      buttons: Array.isArray(preset.buttons) ? preset.buttons : [],
    },
    tags: ['embed-preset', 'welcome'],
    sourcePresetName: name,
  });
}

function getWelcomeOptions(guildId) {
  const templates = Object.values(embedTemplateManager.listTemplates(guildId))
    .filter((template) => template?.templateType === 'welcome')
    .map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: String(template.embed?.title || 'Welcome template').slice(0, 100),
      value: String(template.templateId),
      activeTemplateId: String(template.templateId),
    }));

  const existingIds = new Set(templates.map((template) => template.activeTemplateId));
  const presets = typeof guildManager.getEmbedPresets === 'function'
    ? guildManager.getEmbedPresets(guildId) || {}
    : {};

  for (const [name, preset] of Object.entries(presets)) {
    if (!preset || preset.template !== 'welcome') continue;
    const templateId = legacyPresetTemplateId(name);
    if (existingIds.has(templateId)) continue;
    templates.push({
      label: String(preset.name || name).slice(0, 100),
      description: 'Saved welcome preset',
      value: `${LEGACY_PRESET_PREFIX}${name}`,
      activeTemplateId: templateId,
    });
  }

  return templates.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 25);
}

function templateMenu(guildId, activeTemplateId) {
  const templates = getWelcomeOptions(guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:welcome:template')
    .setPlaceholder(templates.length ? 'Choose a welcome message' : 'No welcome messages available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(templates.length === 0);

  if (templates.length) {
    menu.addOptions(templates.map((template) => ({
      label: template.label,
      description: template.description,
      value: template.value,
      default: template.activeTemplateId === String(activeTemplateId),
    })));
  } else {
    menu.addOptions({ label: 'No templates found', value: 'none' });
  }
  return menu;
}

async function buildWelcomePanel(guild, memberDisplayName = 'Unknown User') {
  const config = welcome.getWelcomeSection(guild.id);
  const health = await welcome.buildHealthReport(guild);
  const analytics = config.analytics || {};
  const binding = welcome.getWelcomeBinding(guild.id, 'welcome');
  const activeTemplateId = binding?.templateId || config.templateId;
  const activeTemplateName = binding?.name || health.templateName || activeTemplateId;
  const actionableWarnings = health.warnings.filter(
    (warning) => !warning.startsWith('No Embed Studio template is explicitly bound')
  );

  const embed = new EmbedBuilder()
    .setColor(actionableWarnings.length ? 0xfaa61a : 0x57f287)
    .setTitle('👋 Welcome · Setup')
    .setDescription([
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Welcome Channel:** ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}`,
      `**Welcome DM:** ${config.dmEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Ping New Member:** ${config.allowUserPing ? 'Yes ✅' : 'No ❌'}`,
      `**Ignore Bots:** ${config.ignoreBots ? 'Yes ✅' : 'No ❌'}`,
      '',
      '**📨 Current Welcome Message**',
      `**Name:** ${activeTemplateName ? `\`${activeTemplateName}\`` : '`Not set`'}`,
      `**Template ID:** ${activeTemplateId ? `\`${activeTemplateId}\`` : '`Not set`'}`,
      `**Assignment:** ${binding ? 'Assigned ✅' : 'Using configured default ✅'}`,
      `**Source:** ${binding ? 'Selected welcome message' : 'Configured default template'}`,
      '',
      `Public sent: \`${analytics.publicSent || 0}\` | DMs sent: \`${analytics.dmSent || 0}\` | Failed: \`${(analytics.publicFailed || 0) + (analytics.dmFailed || 0)}\``,
      '',
      actionableWarnings.length
        ? `**Warnings**\n${actionableWarnings.map((warning) => `• ${warning}`).join('\n')}`
        : '**Health:** Healthy ✅',
    ].join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:welcome:channel')
        .setPlaceholder('Select the public welcome channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(templateMenu(guild.id, activeTemplateId)),
      row(
        button(config.enabled ? 'admin:welcome:disable' : 'admin:welcome:enable', config.enabled ? '⏸️ Disable' : '▶️ Enable', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:welcome:toggleDm', config.dmEnabled ? '📨 Disable DM' : '📨 Enable DM'),
        button('admin:welcome:togglePing', config.allowUserPing ? '🔕 Disable Ping' : '🔔 Enable Ping'),
        button('admin:welcome:toggleBots', config.ignoreBots ? '🤖 Include Bots' : '🤖 Ignore Bots')
      ),
      row(
        button('admin:welcome:test', '👁️ Preview', ButtonStyle.Success),
        button('admin:welcome:repair', '🩺 Repair', ButtonStyle.Primary),
        button('admin:welcome:export', '📤 Export'),
        button('admin:welcome:reset', '♻️ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅️ Modules')
      ),
    ],
  };
}

async function updatePanel(interaction) {
  const payload = await buildWelcomePanel(interaction.guild, interaction.member?.displayName || interaction.user?.username);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function handleWelcomeInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:welcome')) return false;

  try {
    if (customId === 'admin:welcome') return updatePanel(interaction);

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:welcome:channel') {
      welcome.updateConfig(interaction.guild.id, { channelId: interaction.values?.[0] || null }, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (interaction.isStringSelectMenu?.() && customId === 'admin:welcome:template') {
      let templateId = interaction.values?.[0];
      if (!templateId || templateId === 'none') throw new Error('Choose a valid welcome message.');

      if (templateId.startsWith(LEGACY_PRESET_PREFIX)) {
        const presetName = templateId.slice(LEGACY_PRESET_PREFIX.length);
        const preset = guildManager.getEmbedPreset(interaction.guild.id, presetName);
        if (!preset || preset.template !== 'welcome') throw new Error('That welcome preset no longer exists.');
        const savedTemplate = embedTemplateManager.saveTemplate(
          interaction.guild.id,
          legacyPresetToTemplate(presetName, preset)
        );
        templateId = savedTemplate.templateId;
        if (typeof guildManager.reloadGuild === 'function') guildManager.reloadGuild(interaction.guild.id);
      }

      welcome.bindWelcomeTemplate(interaction.guild.id, templateId, 'welcome', { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    const config = welcome.getWelcomeSection(interaction.guild.id);
    if (customId === 'admin:welcome:enable') welcome.updateConfig(interaction.guild.id, { enabled: true }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:disable') welcome.updateConfig(interaction.guild.id, { enabled: false }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleDm') welcome.updateConfig(interaction.guild.id, { dmEnabled: !config.dmEnabled }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:togglePing') welcome.updateConfig(interaction.guild.id, { allowUserPing: !config.allowUserPing }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleBots') welcome.updateConfig(interaction.guild.id, { ignoreBots: !config.ignoreBots }, { actorId: interaction.user.id });

    if (customId === 'admin:welcome:test') {
      await interaction.deferUpdate();
      const current = welcome.getWelcomeSection(interaction.guild.id);
      if (!current.channelId && !current.dmEnabled) throw new Error('Select a welcome channel or enable welcome DMs before previewing.');
      await welcome.sendWelcome(interaction.member, { silent: false, force: true, previewOnly: true });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:repair') {
      await interaction.deferUpdate();
      await welcome.repairConfiguration(interaction.guild, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:reset') {
      await interaction.deferUpdate();
      welcome.resetWelcome(interaction.guild.id, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:export') {
      const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(welcome.exportConfiguration(interaction.guild.id), null, 2), 'utf8'),
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
  handleWelcomeInteraction,
  buildWelcomeAdminPanel: buildWelcomePanel,
  handleWelcomeAdminInteraction: handleWelcomeInteraction,
};
