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

function getSection(guildId) {
  return verificationStore.getVerificationSection(guildId);
}

function getConfig(guildId) {
  return joinIntelligence.normalizeConfig(getSection(guildId).settings?.joinIntelligence || {});
}

function saveConfig(guildId, patch, actorId = null) {
  const current = getSection(guildId).settings?.joinIntelligence || {};
  const next = joinIntelligence.normalizeConfig({ ...current, ...(patch || {}) });
  verificationStore.updateSettings(guildId, { joinIntelligence: next }, {
    action: 'verification_join_intelligence_update',
    actorId,
  });
  return next;
}

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : 'Not set';
}

function buildPage(interaction) {
  const section = getSection(interaction.guild.id);
  const config = getConfig(interaction.guild.id);
  const effectiveChannelId = joinIntelligence.getOutputChannelId(interaction.guild.id);
  const usingFallback = !config.channelId && Boolean(section.settings?.logChannelId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57F287 : 0x5865F2)
    .setTitle('🧠 Automatic Join Intelligence')
    .setDescription([
      'Run a Goliath intelligence snapshot automatically whenever a member joins this server.',
      '',
      'The scan uses the same intelligence store behind `/mod` → **Intelligence**, including account history, moderation history, Goliath network intelligence, watchlist/reputation data and heuristic account correlation.',
      '',
      'Automatic scans are also written into Member Scan History, so staff can open the member later in `/mod` and see the original join snapshot.',
    ].join('\n'))
    .addFields(
      { name: 'Status', value: config.enabled ? '🟢 Enabled' : '⚪ Disabled', inline: true },
      { name: 'Bots', value: config.includeBots ? 'Included' : 'Ignored', inline: true },
      { name: 'Output', value: effectiveChannelId ? `${formatChannel(effectiveChannelId)}${usingFallback ? ' *(Verification Log fallback)*' : ''}` : '⚠️ No output channel configured', inline: false },
    )
    .setFooter({ text: 'Security Studio • Verification & onboarding intelligence' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(TOGGLE_ID)
          .setLabel(config.enabled ? 'Disable Auto Scan' : 'Enable Auto Scan')
          .setEmoji(config.enabled ? '⏸️' : '▶️')
          .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(BOT_TOGGLE_ID)
          .setLabel(config.includeBots ? 'Ignore Bots' : 'Include Bots')
          .setEmoji('🤖')
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(CHANNEL_ID)
          .setPlaceholder('Choose intelligence output channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(FALLBACK_ID)
          .setLabel('Use Verification Log Channel')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!section.settings?.logChannelId),
        new ButtonBuilder()
          .setCustomId(BACK_ID)
          .setLabel('Back to Verification')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function injectButton(payload) {
  if (!payload || !Array.isArray(payload.components)) return payload;
  const button = new ButtonBuilder()
    .setCustomId(PAGE_ID)
    .setLabel('Join Intelligence')
    .setEmoji('🧠')
    .setStyle(ButtonStyle.Secondary);

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
    verificationPanel.buildVerificationAdminPanel = function patchedBuild(...args) {
      return injectButton(originalBuild(...args));
    };
  }

  if (typeof originalHandler === 'function') {
    verificationPanel.handleVerificationAdminInteraction = async function patchedHandler(interaction) {
      const id = String(interaction?.customId || '');

      // The original handler closes over its private build function, so intercept the
      // Verification root explicitly to guarantee the new entry point is visible.
      if (id === 'admin:verification') {
        await interaction.update(injectButton(originalBuild(interaction.guild, displayName(interaction))));
        return true;
      }

      if (!id.startsWith('admin:verification:intelligence')) return originalHandler(interaction);

      if (!canManage(interaction)) {
        await interaction.reply({ content: '❌ You need Manage Server or Administrator to configure automatic join intelligence.', flags: 64 }).catch(() => null);
        return true;
      }

      if (id === PAGE_ID || id === BACK_ID) {
        if (id === BACK_ID) {
          await interaction.update(injectButton(originalBuild(interaction.guild, displayName(interaction))));
        } else {
          await interaction.update(buildPage(interaction));
        }
        return true;
      }

      if (id === TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        saveConfig(interaction.guild.id, { enabled: !current.enabled }, interaction.user.id);
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
        const channelId = interaction.values?.[0] || null;
        saveConfig(interaction.guild.id, { channelId }, interaction.user.id);
        await interaction.update(buildPage(interaction));
        return true;
      }

      return true;
    };
  }

  return verificationPanel;
}

module.exports = {
  install,
  getConfig,
  saveConfig,
  buildPage,
};
