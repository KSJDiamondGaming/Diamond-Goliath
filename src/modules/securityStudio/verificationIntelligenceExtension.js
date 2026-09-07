'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const verificationPanel = require('./verificationPanel');
const verificationStore = require('./verificationStore');
const joinIntelligence = require('../../core/administration/mod/joinIntelligence');

const PATCH_FLAG = Symbol.for('goliath.verification.joinIntelligenceExtension');
const PAGE_ID = 'admin:verification:intelligence';
const TOGGLE_ID = 'admin:verification:intelligence:toggle';
const CONTINUOUS_TOGGLE_ID = 'admin:verification:intelligence:continuous';
const BOT_TOGGLE_ID = 'admin:verification:intelligence:bots';
const CHANNEL_ID = 'admin:verification:intelligence:channel';
const FALLBACK_ID = 'admin:verification:intelligence:fallback';
const BACK_ID = 'admin:verification:intelligence:back';

function canManage(interaction) {
  return Boolean(
    interaction?.guild?.ownerId === interaction?.user?.id
    || interaction?.member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || interaction?.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)
  );
}

function displayName(interaction) {
  return interaction?.member?.displayName
    || interaction?.user?.displayName
    || interaction?.user?.username
    || 'Unknown User';
}

function getSection(guildId) { return verificationStore.getVerificationSection(guildId); }
function getConfig(guildId) { return joinIntelligence.normalizeConfig(getSection(guildId).settings?.joinIntelligence || {}); }
function saveConfig(guildId, patch, actorId = null) {
  const current = getSection(guildId).settings?.joinIntelligence || {};
  const next = joinIntelligence.normalizeConfig({ ...current, ...(patch || {}) });
  verificationStore.updateSettings(guildId, { joinIntelligence: next }, {
    action: 'verification_join_intelligence_update',
    actorId,
  });
  return next;
}
function formatChannel(channelId) { return channelId ? `<#${channelId}>` : 'Not set'; }

function buildPage(interaction) {
  const section = getSection(interaction.guild.id);
  const config = getConfig(interaction.guild.id);
  const effectiveChannelId = joinIntelligence.getOutputChannelId(interaction.guild.id);
  const usingFallback = !config.channelId && Boolean(section.settings?.logChannelId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57F287 : 0x5865F2)
    .setTitle('🧠 Member Intelligence Automation')
    .setDescription([
      'Run the same Goliath intelligence system used by `/mod` automatically as members enter and move through the server.',
      '',
      '**Join Intelligence** snapshots every new member and classifies them as **CLEAR**, **REVIEW**, or **HIGH ATTENTION**. The classification never punishes or isolates a member automatically.',
      '',
      '**Continuous Intelligence** reassesses meaningful member/identity changes immediately and also performs a periodic sweep for new moderation, watchlist, network, reputation or correlation intelligence. Staff are only alerted when something materially changes.',
      '',
      'Every automatic join snapshot remains available later under `/mod` → Intelligence → History.',
    ].join('\n'))
    .addFields(
      { name: 'Join Scan', value: config.enabled ? '🟢 Enabled' : '⚪ Disabled', inline: true },
      { name: 'Continuous', value: config.continuousEnabled ? `🟢 Enabled • ${config.periodicMinutes}m sweep` : '⚪ Disabled', inline: true },
      { name: 'Bots', value: config.includeBots ? 'Included on join' : 'Ignored', inline: true },
      { name: 'Output', value: effectiveChannelId ? `${formatChannel(effectiveChannelId)}${usingFallback ? ' *(Verification Log fallback)*' : ''}` : '⚠️ No output channel configured', inline: false },
      { name: 'Staff Actions', value: 'Reports provide **Open Intelligence**, **Investigate**, **Watch Member**, and **Mark Clear** controls. Existing `/mod` permission checks still apply.', inline: false },
    )
    .setFooter({ text: 'Security Studio • Verification & onboarding intelligence' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(TOGGLE_ID).setLabel(config.enabled ? 'Disable Join Scan' : 'Enable Join Scan').setEmoji(config.enabled ? '⏸️' : '▶️').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(CONTINUOUS_TOGGLE_ID).setLabel(config.continuousEnabled ? 'Disable Continuous' : 'Enable Continuous').setEmoji('🔁').setStyle(config.continuousEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setDisabled(!config.enabled),
        new ButtonBuilder().setCustomId(BOT_TOGGLE_ID).setLabel(config.includeBots ? 'Ignore Bots' : 'Include Bots').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(CHANNEL_ID).setPlaceholder('Choose intelligence output channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(FALLBACK_ID).setLabel('Use Verification Log Channel').setEmoji('📝').setStyle(ButtonStyle.Secondary).setDisabled(!section.settings?.logChannelId),
        new ButtonBuilder().setCustomId(BACK_ID).setLabel('Back to Verification').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function injectButton(payload) {
  if (!payload || !Array.isArray(payload.components)) return payload;
  const button = new ButtonBuilder().setCustomId(PAGE_ID).setLabel('Join Intelligence').setEmoji('🧠').setStyle(ButtonStyle.Secondary);
  const components = [...payload.components];
  if (components.length < 5) {
    components.push(new ActionRowBuilder().addComponents(button));
    return { ...payload, components };
  }
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const row = components[index];
    const existing = Array.isArray(row?.components) ? row.components : [];
    if (existing.length >= 5) continue;
    components[index] = ActionRowBuilder.from(row).addComponents(button);
    return { ...payload, components };
  }
  return payload;
}

function install() {
  if (verificationPanel[PATCH_FLAG]) return verificationPanel;
  verificationPanel[PATCH_FLAG] = true;
  const originalBuild = verificationPanel.buildVerificationAdminPanel;
  const originalHandler = verificationPanel.handleVerificationAdminInteraction;

  if (typeof originalBuild === 'function') {
    verificationPanel.buildVerificationAdminPanel = async function patchedBuild(...args) {
      const payload = await originalBuild(...args);
      return injectButton(payload);
    };
  }

  if (typeof originalHandler === 'function') {
    verificationPanel.handleVerificationAdminInteraction = async function patchedHandler(interaction) {
      const id = String(interaction?.customId || '');
      if (id === 'admin:verification') {
        const payload = await originalBuild(interaction.guild, displayName(interaction));
        await interaction.update(injectButton(payload));
        return true;
      }
      if (!id.startsWith('admin:verification:intelligence')) return originalHandler(interaction);
      if (!canManage(interaction)) {
        await interaction.reply({ content: '❌ You need Manage Server or Administrator to configure automatic Member Intelligence.', flags: 64 }).catch(() => null);
        return true;
      }

      if (id === PAGE_ID || id === BACK_ID) {
        if (id === BACK_ID) {
          const payload = await originalBuild(interaction.guild, displayName(interaction));
          await interaction.update(injectButton(payload));
        } else {
          await interaction.update(buildPage(interaction));
        }
        return true;
      }
      if (id === TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        const enabled = !current.enabled;
        saveConfig(interaction.guild.id, { enabled, continuousEnabled: enabled ? current.continuousEnabled : false }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }
      if (id === CONTINUOUS_TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        saveConfig(interaction.guild.id, { continuousEnabled: current.enabled ? !current.continuousEnabled : false }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }
      if (id === BOT_TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        saveConfig(interaction.guild.id, { includeBots: !current.includeBots }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }
      if (id === FALLBACK_ID) {
        saveConfig(interaction.guild.id, { channelId: null }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }
      if (interaction.isChannelSelectMenu?.() && id === CHANNEL_ID) {
        saveConfig(interaction.guild.id, { channelId: interaction.values?.[0] || null }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }
      return true;
    };
  }
  return verificationPanel;
}

module.exports = { install, getConfig, saveConfig, buildPage };
