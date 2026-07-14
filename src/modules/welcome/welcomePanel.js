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
const { buildPreviewEmbeds } = require('../embed/embedPanel');
const embedTemplateManager = require('../embed/embedTemplateManager');
const guildManager = require('../../core/guild/guildManager');

const PRESET_PREFIX = 'preset:';
const selections = new Map();

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function selectionKey(interactionOrGuild) {
  const guildId = interactionOrGuild?.guild?.id || interactionOrGuild?.id;
  const userId = interactionOrGuild?.user?.id || 'panel';
  return `${guildId}:${userId}`;
}

function presetTemplateId(name) {
  return `embed_preset_${embedTemplateManager.cleanKey(name)}`;
}

function getPreset(guildId, name) {
  return typeof guildManager.getEmbedPreset === 'function'
    ? guildManager.getEmbedPreset(guildId, name)
    : null;
}

function getWelcomeOptions(guildId) {
  const presets = typeof guildManager.getEmbedPresets === 'function'
    ? guildManager.getEmbedPresets(guildId) || {}
    : {};

  const options = Object.entries(presets)
    .filter(([, preset]) => preset?.template === 'welcome')
    .map(([name, preset]) => ({
      label: String(preset.name || name).slice(0, 100),
      description: String(preset.title || preset.panels?.[0]?.title || 'Saved welcome message').slice(0, 100),
      value: `${PRESET_PREFIX}${name}`,
      activeTemplateId: presetTemplateId(name),
    }));

  return options.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 25);
}

function selectedValue(guild, activeTemplateId, userId = 'panel') {
  const staged = selections.get(`${guild.id}:${userId}`);
  if (staged) return staged;
  const option = getWelcomeOptions(guild.id).find((item) => item.activeTemplateId === activeTemplateId);
  return option?.value || null;
}

function templateMenu(guild, activeTemplateId, userId) {
  const options = getWelcomeOptions(guild.id);
  const selected = selectedValue(guild, activeTemplateId, userId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:welcome:template')
    .setPlaceholder(options.length ? 'Choose a welcome message' : 'No welcome messages available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(options.length === 0);

  if (options.length) {
    menu.addOptions(options.map((option) => ({
      label: option.label,
      description: option.description,
      value: option.value,
      default: option.value === selected,
    })));
  } else {
    menu.addOptions({ label: 'No welcome messages found', value: 'none' });
  }

  return menu;
}

function presetToTemplate(name, preset = {}) {
  const panel = Array.isArray(preset.panels) && preset.panels.length ? preset.panels[0] : preset;
  return {
    templateId: presetTemplateId(name),
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
    sourcePresetName: name,
    sourcePreset: preset,
    tags: ['embed-preset', 'welcome'],
  };
}

function assignPreset(guildId, name, preset, actorId) {
  const template = embedTemplateManager.saveTemplate(guildId, presetToTemplate(name, preset));
  welcome.bindWelcomeTemplate(guildId, template.templateId, 'welcome', { actorId });
  welcome.updateConfig(guildId, {
    templateId: template.templateId,
    presetName: name,
  }, { action: 'welcome_preset_assign', actorId });
  return template;
}

function activePreset(config, binding, guildId) {
  const name = config.presetName || binding?.sourcePresetName;
  const preset = name ? getPreset(guildId, name) : null;
  return preset ? { name, preset } : null;
}

async function buildWelcomePanel(guild, memberDisplayName = 'Unknown User', userId = 'panel') {
  const config = welcome.getWelcomeSection(guild.id);
  const health = await welcome.buildHealthReport(guild);
  const analytics = config.analytics || {};
  const binding = welcome.getWelcomeBinding(guild.id, 'welcome');
  const assignedPreset = activePreset(config, binding, guild.id);
  const activeTemplateId = assignedPreset ? presetTemplateId(assignedPreset.name) : (binding?.templateId || config.templateId);
  const activeName = assignedPreset?.preset?.name || assignedPreset?.name || binding?.name || health.templateName || activeTemplateId;
  const staged = selections.get(`${guild.id}:${userId}`);
  const stagedName = staged?.startsWith(PRESET_PREFIX) ? staged.slice(PRESET_PREFIX.length) : null;
  const warnings = health.warnings.filter((warning) => !warning.startsWith('No Embed Studio template is explicitly bound'));

  const embed = new EmbedBuilder()
    .setColor(warnings.length ? 0xfaa61a : 0x57f287)
    .setTitle('👋 Welcome · Setup')
    .setDescription([
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Welcome Channel:** ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}`,
      `**Welcome DM:** ${config.dmEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Ping New Member:** ${config.allowUserPing ? 'Yes ✅' : 'No ❌'}`,
      `**Ignore Bots:** ${config.ignoreBots ? 'Yes ✅' : 'No ❌'}`,
      '',
      '**📨 Current Welcome Message**',
      `**Name:** ${activeName ? `\`${activeName}\`` : '`Not set`'}`,
      `**Assignment:** ${assignedPreset || binding ? 'Assigned ✅' : 'Using default'}`,
      `**Source:** ${assignedPreset ? 'Embed panel preset' : binding ? 'Embed Studio' : 'Built-in default'}`,
      stagedName ? `**Selected:** \`${getPreset(guild.id, stagedName)?.name || stagedName}\` · press **Assign**` : null,
      '',
      `Public sent: \`${analytics.publicSent || 0}\` | DMs sent: \`${analytics.dmSent || 0}\` | Failed: \`${(analytics.publicFailed || 0) + (analytics.dmFailed || 0)}\``,
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
        .setPlaceholder('Select the public welcome channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(templateMenu(guild, activeTemplateId, userId)),
      row(
        button(config.enabled ? 'admin:welcome:disable' : 'admin:welcome:enable', config.enabled ? '⏸ Disable' : '▶ Enable', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:welcome:toggleDm', config.dmEnabled ? '📨 No DM' : '📨 DM'),
        button('admin:welcome:togglePing', config.allowUserPing ? '🔕 No Ping' : '🔔 Ping'),
        button('admin:welcome:toggleBots', config.ignoreBots ? '🤖 Bots' : '🤖 Ignore')
      ),
      row(
        button('admin:welcome:assign', '✅ Assign', ButtonStyle.Primary),
        button('admin:welcome:test', '🧪 Test', ButtonStyle.Success),
        button('admin:welcome:repair', '🩺 Repair'),
        button('admin:welcome:reset', '♻ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅ Modules')
      ),
    ],
  };
}

async function updatePanel(interaction) {
  const payload = await buildWelcomePanel(
    interaction.guild,
    interaction.member?.displayName || interaction.user?.username,
    interaction.user.id
  );
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
      const value = interaction.values?.[0];
      if (!value || value === 'none' || !value.startsWith(PRESET_PREFIX)) throw new Error('Choose a valid welcome message.');
      selections.set(selectionKey(interaction), value);
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:assign') {
      const value = selections.get(selectionKey(interaction));
      if (!value?.startsWith(PRESET_PREFIX)) throw new Error('Choose a welcome message first.');
      const name = value.slice(PRESET_PREFIX.length);
      const preset = getPreset(interaction.guild.id, name);
      if (!preset || preset.template !== 'welcome') throw new Error('That welcome message no longer exists.');
      assignPreset(interaction.guild.id, name, preset, interaction.user.id);
      selections.delete(selectionKey(interaction));
      return updatePanel(interaction);
    }

    const config = welcome.getWelcomeSection(interaction.guild.id);
    if (customId === 'admin:welcome:enable') welcome.updateConfig(interaction.guild.id, { enabled: true }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:disable') welcome.updateConfig(interaction.guild.id, { enabled: false }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleDm') welcome.updateConfig(interaction.guild.id, { dmEnabled: !config.dmEnabled }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:togglePing') welcome.updateConfig(interaction.guild.id, { allowUserPing: !config.allowUserPing }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleBots') welcome.updateConfig(interaction.guild.id, { ignoreBots: !config.ignoreBots }, { actorId: interaction.user.id });

    if (customId === 'admin:welcome:test') {
      const current = welcome.getWelcomeSection(interaction.guild.id);
      const assigned = activePreset(current, welcome.getWelcomeBinding(interaction.guild.id, 'welcome'), interaction.guild.id);
      if (!assigned) throw new Error('Assign a saved welcome message first.');
      const previewState = { ...assigned.preset, allowUserPing: false };
      return interaction.reply({
        content: assigned.preset.content || assigned.preset.message || '',
        embeds: buildPreviewEmbeds(previewState, interaction),
        allowedMentions: { parse: [], repliedUser: false },
        ephemeral: true,
      });
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