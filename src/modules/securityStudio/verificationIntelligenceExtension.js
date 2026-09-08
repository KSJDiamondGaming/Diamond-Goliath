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

const OVERVIEW_IDS = Object.freeze({
  workflow: 'admin:verification:page:workflow',
  roles: 'admin:verification:page:roles',
  requirements: 'admin:verification:page:requirements',
  messages: 'admin:verification:page:messages',
  panels: 'admin:verification:page:panel',
  settings: 'admin:verification:page:settings',
});

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
      '**Join Intelligence** scans each new member and classifies the result as **CLEAR**, **REVIEW**, or **HIGH ATTENTION**. Intelligence never punishes or isolates someone automatically.',
      '',
      '**Continuous Intelligence** reassesses meaningful member or identity changes and performs periodic checks for new moderation, watchlist, network, reputation or correlation intelligence.',
      '',
      'Automatic snapshots remain available under `/mod` → Intelligence → History.',
    ].join('\n'))
    .addFields(
      { name: 'Join Scan', value: config.enabled ? '🟢 Enabled' : '⚪ Disabled', inline: true },
      { name: 'Continuous', value: config.continuousEnabled ? `🟢 Enabled • ${config.periodicMinutes}m sweep` : '⚪ Disabled', inline: true },
      { name: 'Bots', value: config.includeBots ? 'Included on join' : 'Ignored', inline: true },
      { name: 'Output Channel', value: effectiveChannelId ? `${formatChannel(effectiveChannelId)}${usingFallback ? ' *(Verification Log fallback)*' : ''}` : '⚠️ No output channel configured', inline: false },
      { name: 'Staff Actions', value: '**Open Intelligence** • **Investigate** • **Watch Member** • **Mark Clear**', inline: false },
    )
    .setFooter({ text: 'Security Studio • Verification • Member Intelligence' })
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
        new ButtonBuilder().setCustomId(FALLBACK_ID).setLabel('Use Verification Log').setEmoji('📝').setStyle(ButtonStyle.Secondary).setDisabled(!section.settings?.logChannelId),
        new ButtonBuilder().setCustomId(BACK_ID).setLabel('Back to Verification').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function toComponentData(component) {
  return typeof component?.toJSON === 'function' ? component.toJSON() : { ...(component || {}) };
}

function componentId(component) {
  const data = toComponentData(component);
  return data.custom_id || data.customId || null;
}

function rowData(...components) {
  return {
    type: 1,
    components: components.filter(Boolean).map(toComponentData),
  };
}

function findComponent(rows, id) {
  for (const row of rows || []) {
    for (const component of row?.components || []) {
      if (componentId(component) === id) return toComponentData(component);
    }
  }
  return null;
}

function styleButton(component) {
  const data = toComponentData(component);
  if (Number(data.type) !== 2) return data;

  const id = String(componentId(data) || '');
  let style = data.style;

  if (id.includes(':toggle:')) {
    return data;
  }

  if (
    id.includes(':delete')
    || id.includes(':reset')
    || id.includes(':remove')
    || id.includes(':disable')
  ) {
    style = ButtonStyle.Danger;
  } else if (
    id.includes(':save')
    || id.includes(':publish')
    || id.includes(':enable')
    || id.includes(':create')
  ) {
    style = ButtonStyle.Success;
  } else if (
    id.includes(':back')
    || id.includes(':settings')
    || id.includes(':next')
    || id.includes(':status')
    || id.includes(':timing')
    || id === 'admin:modules'
    || id.startsWith('admin:studio:')
  ) {
    style = ButtonStyle.Secondary;
  } else if (
    id.startsWith('admin:verification:page:')
    || id === PAGE_ID
  ) {
    style = ButtonStyle.Primary;
  }

  return { ...data, style };
}

function payloadTitle(payload) {
  const first = payload?.embeds?.[0];
  if (!first) return '';
  if (typeof first?.toJSON === 'function') return String(first.toJSON()?.title || '');
  return String(first?.title || first?.data?.title || '');
}

function polishOverview(payload) {
  const rows = (payload.components || []).map((row) => ({
    ...toComponentData(row),
    components: (toComponentData(row).components || []).map(toComponentData),
  }));

  const workflow = findComponent(rows, OVERVIEW_IDS.workflow);
  const roles = findComponent(rows, OVERVIEW_IDS.roles);
  const requirements = findComponent(rows, OVERVIEW_IDS.requirements);
  const messages = findComponent(rows, OVERVIEW_IDS.messages);
  const panels = findComponent(rows, OVERVIEW_IDS.panels);
  const settings = findComponent(rows, OVERVIEW_IDS.settings);
  const back = findComponent(rows, 'admin:studio:securityStudio') || findComponent(rows, 'admin:modules');

  if (![workflow, roles, requirements, messages, panels, settings, back].every(Boolean)) return payload;

  const intelligence = {
    type: 2,
    custom_id: PAGE_ID,
    label: 'Join Intelligence',
    emoji: { name: '🧠' },
    style: ButtonStyle.Primary,
    disabled: false,
  };

  return {
    ...payload,
    components: [
      rowData(styleButton(workflow), styleButton(roles), styleButton(requirements)),
      rowData(styleButton(messages), styleButton(panels), intelligence),
      rowData(styleButton(back), styleButton(settings)),
    ],
  };
}

function polishPayload(payload) {
  if (!payload || !Array.isArray(payload.components)) return payload;

  if (payloadTitle(payload) === '✅ Verification · Overview') {
    return polishOverview(payload);
  }

  return {
    ...payload,
    components: payload.components.map((row) => {
      const data = toComponentData(row);
      return {
        ...data,
        components: (data.components || []).map(styleButton),
      };
    }),
  };
}

async function replacePanelMessage(interaction, payload) {
  if (!interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
  }
  if (interaction.webhook?.editMessage) {
    await interaction.webhook.editMessage('@original', polishPayload(payload));
    return true;
  }
  throw new Error('Verification panel could not edit the ephemeral interaction response.');
}

async function runOriginalWithPolish(interaction, originalHandler) {
  const originalUpdate = typeof interaction.update === 'function' ? interaction.update.bind(interaction) : null;
  const originalEditReply = typeof interaction.editReply === 'function' ? interaction.editReply.bind(interaction) : null;

  if (originalUpdate) {
    interaction.update = async (payload, ...args) => {
      const polished = polishPayload(payload);
      if (payloadTitle(polished) === '✅ Verification · Overview') {
        return replacePanelMessage(interaction, polished);
      }
      return originalUpdate(polished, ...args);
    };
  }

  if (originalEditReply) {
    interaction.editReply = (payload, ...args) => originalEditReply(polishPayload(payload), ...args);
  }

  try {
    return await originalHandler(interaction);
  } finally {
    if (originalUpdate) interaction.update = originalUpdate;
    if (originalEditReply) interaction.editReply = originalEditReply;
  }
}

function install() {
  if (verificationPanel[PATCH_FLAG]) return verificationPanel;
  verificationPanel[PATCH_FLAG] = true;
  const originalBuild = verificationPanel.buildVerificationAdminPanel;
  const originalHandler = verificationPanel.handleVerificationAdminInteraction;

  if (typeof originalBuild === 'function') {
    verificationPanel.buildVerificationAdminPanel = async function patchedBuild(...args) {
      const payload = await originalBuild(...args);
      return polishPayload(payload);
    };
  }

  if (typeof originalHandler === 'function') {
    verificationPanel.handleVerificationAdminInteraction = async function patchedHandler(interaction) {
      const id = String(interaction?.customId || '');

      if (id === 'admin:verification') {
        const payload = await originalBuild(interaction.guild, displayName(interaction));
        await replacePanelMessage(interaction, payload);
        return true;
      }

      if (!id.startsWith('admin:verification:intelligence')) {
        return runOriginalWithPolish(interaction, originalHandler);
      }

      if (!canManage(interaction)) {
        await interaction.reply({ content: '❌ You need Manage Server or Administrator to configure automatic Member Intelligence.', flags: 64 }).catch(() => null);
        return true;
      }

      if (id === PAGE_ID || id === BACK_ID) {
        if (id === BACK_ID) {
          const payload = await originalBuild(interaction.guild, displayName(interaction));
          await replacePanelMessage(interaction, payload);
        } else {
          await interaction.update(polishPayload(buildPage(interaction)));
        }
        return true;
      }

      if (id === TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        const enabled = !current.enabled;
        saveConfig(interaction.guild.id, { enabled, continuousEnabled: enabled ? current.continuousEnabled : false }, interaction.user.id);
        await interaction.update(polishPayload(buildPage(interaction)));
        return true;
      }

      if (id === CONTINUOUS_TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        saveConfig(interaction.guild.id, { continuousEnabled: current.enabled ? !current.continuousEnabled : false }, interaction.user.id);
        await interaction.update(polishPayload(buildPage(interaction)));
        return true;
      }

      if (id === BOT_TOGGLE_ID) {
        const current = getConfig(interaction.guild.id);
        saveConfig(interaction.guild.id, { includeBots: !current.includeBots }, interaction.user.id);
        await interaction.update(polishPayload(buildPage(interaction)));
        return true;
      }

      if (id === FALLBACK_ID) {
        saveConfig(interaction.guild.id, { channelId: null }, interaction.user.id);
        await interaction.update(polishPayload(buildPage(interaction)));
        return true;
      }

      if (interaction.isChannelSelectMenu?.() && id === CHANNEL_ID) {
        saveConfig(interaction.guild.id, { channelId: interaction.values?.[0] || null }, interaction.user.id);
        await interaction.update(polishPayload(buildPage(interaction)));
        return true;
      }

      return true;
    };
  }

  return verificationPanel;
}

module.exports = { install, getConfig, saveConfig, buildPage, polishPayload };
