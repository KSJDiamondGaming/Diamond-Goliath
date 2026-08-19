'use strict';

const HELPERS = [
  '{userId}', '{userTag}', '{userName}', '{userGlobalName}', '{userMention}', '{userNoPing}',
  '{userAvatar}', '{userServerAvatar}', '{userNickname}', '{userDisplay}', '{userCreatedAt}',
  '{userCreatedTimestamp}', '{userJoinedAt}', '{userJoinedTimestamp}', '{createdAt}', '{joinedAt}',
  '{leftAt}', '{timestamp}', '{accountAge}', '{membershipDuration}', '{departureIcon}',
  '{departureType}', '{departureLabel}', '{departureReason}', '{departureModerator}',
  '{departureModeratorId}', '{nowTimestamp}', '{successEmoji}', '{warningEmoji}', '{errorEmoji}',
  '{proofVerifiedEmoji}', '{successColor}', '{warningColor}', '{errorColor}', '{proofVerifiedColor}',
  '{guildId}', '{guildName}', '{server}', '{guildIcon}', '{serverIcon}', '{guildBanner}',
  '{guildMemberCount}', '{memberCount}', '{guildVanityCode}', '{channelId}', '{channelName}',
  '{channelMention}', '{guildOwnerId}', '{guildOwnerMention}', '{guildCreatedAt}',
  '{guildCreatedTimestamp}', '{guildBoostCount}', '{guildBoostTier}', '{guildSplash}',
  '{guildDiscoverySplash}', '{userBot}', '{userTopRoleId}', '{userTopRoleMention}',
];

const sessions = new Map();
const pendingPresetSaves = new Map();
let defaultStateFactory = null;
let stateSync = (state) => state;
let basePanelFactory = null;
let presetCompatibilityInstalled = false;

function configure({ defaultState, sync, basePanel } = {}) {
  if (typeof defaultState === 'function') defaultStateFactory = defaultState;
  if (typeof sync === 'function') stateSync = sync;
  if (typeof basePanel === 'function') basePanelFactory = basePanel;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function trim(value, max = 4096) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function fmtDate(value) {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString();
}

function fmtTs(value, style = 'F') {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function durationFrom(timestamp) {
  const started = Number(timestamp || 0);
  if (!started || started > Date.now()) return 'Unknown';
  let months = Math.max(0, Math.floor((Date.now() - started) / (1000 * 60 * 60 * 24 * 30.4375)));
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months || !parts.length) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function avatar(member) {
  return member?.displayAvatarURL?.({ size: 1024 })
    || member?.user?.displayAvatarURL?.({ size: 1024 })
    || undefined;
}

function guildIcon(guild) {
  return guild?.iconURL?.({ size: 1024 }) || undefined;
}

function guildBanner(guild) {
  return guild?.bannerURL?.({ size: 2048 }) || undefined;
}

function safeAsset(fn, fallback = '') {
  try { return fn?.() || fallback; } catch { return fallback; }
}

function memberName(interaction) {
  return interaction?.member?.displayName
    || interaction?.user?.globalName
    || interaction?.user?.username
    || 'Unknown User';
}

function displayName(member) {
  return member?.displayName
    || member?.user?.globalName
    || member?.user?.username
    || 'Unknown User';
}

function refreshGuild(interaction) {
  return interaction?.guild || null;
}

function sessionKey(interaction) {
  return `${interaction?.guildId || interaction?.guild?.id || 'global'}:${interaction?.user?.id || 'system'}`;
}

function cleanPresetName(value) {
  return String(value || '').trim().slice(0, 50);
}

function replaceVars(value, interaction, allowUserPing = false) {
  let output = String(value ?? '');
  const guild = interaction?.guild;
  const user = interaction?.user || interaction?.member?.user;
  const member = interaction?.member;
  const channel = interaction?.channel || {};
  const channelId = interaction?.channelId || channel?.id || '';
  const memberCount = guild?.memberCount ?? 0;
  const ownerId = guild?.ownerId || '';
  const topRole = member?.roles?.highest || null;
  const guildCreatedTimestamp = guild?.createdTimestamp || 0;
  const vars = {
    '{userId}': user?.id || '',
    '{userTag}': user?.tag || user?.username || '',
    '{userName}': user?.username || '',
    '{userGlobalName}': user?.globalName || '',
    '{userMention}': user?.id ? (allowUserPing ? `<@${user.id}>` : `@${displayName(member)}`) : '',
    '{userNoPing}': user?.id ? `@${displayName(member)}` : '',
    '{userAvatar}': avatar(member) || user?.displayAvatarURL?.({ size: 1024 }) || '',
    '{userServerAvatar}': avatar(member) || '',
    '{userNickname}': member?.nickname || '',
    '{userDisplay}': displayName(member),
    '{userCreatedAt}': fmtDate(user?.createdAt),
    '{userCreatedTimestamp}': fmtTs(user?.createdAt),
    '{userJoinedAt}': fmtDate(member?.joinedAt),
    '{userJoinedTimestamp}': fmtTs(member?.joinedAt),
    '{createdAt}': fmtDate(user?.createdAt),
    '{joinedAt}': fmtDate(member?.joinedAt),
    '{leftAt}': fmtDate(new Date()),
    '{timestamp}': fmtTs(new Date()),
    '{accountAge}': durationFrom(user?.createdTimestamp),
    '{membershipDuration}': durationFrom(member?.joinedTimestamp),
    '{departureIcon}': '',
    '{departureType}': '',
    '{departureLabel}': '',
    '{departureReason}': '',
    '{departureModerator}': '',
    '{departureModeratorId}': '',
    '{nowTimestamp}': fmtTs(new Date()),
    '{successEmoji}': '✅',
    '{warningEmoji}': '⚠️',
    '{errorEmoji}': '❌',
    '{proofVerifiedEmoji}': '✅',
    '{successColor}': '#57F287',
    '{warningColor}': '#FEE75C',
    '{errorColor}': '#ED4245',
    '{proofVerifiedColor}': '#57F287',
    '{guildId}': guild?.id || '',
    '{guildName}': guild?.name || '',
    '{server}': guild?.name || '',
    '{guildIcon}': guildIcon(guild) || '',
    '{serverIcon}': guildIcon(guild) || '',
    '{guildBanner}': guildBanner(guild) || '',
    '{guildMemberCount}': String(memberCount),
    '{memberCount}': String(memberCount),
    '{guildVanityCode}': guild?.vanityURLCode || '',
    '{channelId}': channelId,
    '{channelName}': channel?.name || 'Unknown Channel',
    '{channelMention}': channelId ? `<#${channelId}>` : '',
    '{guildOwnerId}': ownerId,
    '{guildOwnerMention}': ownerId ? `<@${ownerId}>` : '',
    '{guildCreatedAt}': fmtTs(guildCreatedTimestamp, 'F'),
    '{guildCreatedTimestamp}': fmtTs(guildCreatedTimestamp, 'R'),
    '{guildBoostCount}': String(guild?.premiumSubscriptionCount || 0),
    '{guildBoostTier}': String(guild?.premiumTier ?? 0),
    '{guildSplash}': safeAsset(() => guild?.splashURL?.({ extension: 'png', size: 2048 })),
    '{guildDiscoverySplash}': safeAsset(() => guild?.discoverySplashURL?.({ extension: 'png', size: 2048 })),
    '{userBot}': user?.bot ? 'Yes' : 'No',
    '{userTopRoleId}': topRole?.id || '',
    '{userTopRoleMention}': topRole?.id ? `<@&${topRole.id}>` : '',
  };

  for (const [key, replacement] of Object.entries(vars)) {
    output = output.split(key).join(String(replacement ?? ''));
    output = output.split(key.toLowerCase()).join(String(replacement ?? ''));
  }
  return output;
}

function getSession(interaction) {
  const key = sessionKey(interaction);
  if (!sessions.has(key)) {
    if (typeof defaultStateFactory !== 'function') {
      throw new Error('Embed state is not configured with a defaultState factory.');
    }
    sessions.set(key, stateSync(defaultStateFactory()));
  }
  return sessions.get(key);
}

function saveSession(interaction, state) {
  const synced = stateSync(state);
  sessions.set(sessionKey(interaction), synced);
  return synced;
}

function saveSelected(state, patch = {}) {
  const panels = clone(state?.panels || []);
  const selectedPanelIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0);
  if (!panels[selectedPanelIndex]) return stateSync(state);
  panels[selectedPanelIndex] = { ...panels[selectedPanelIndex], ...clone(patch) };
  return stateSync({ ...state, panels });
}

function markUnsaved(interaction, state) {
  return saveSession(interaction, { ...state, hasUnsavedChanges: true });
}

function clearUnsaved(interaction, state) {
  return saveSession(interaction, { ...state, hasUnsavedChanges: false });
}

function resetSession(interaction) {
  if (typeof defaultStateFactory !== 'function') {
    throw new Error('Embed state is not configured with a defaultState factory.');
  }
  const next = stateSync(defaultStateFactory());
  sessions.set(sessionKey(interaction), next);
  return next;
}

function clearSession(interaction) {
  return sessions.delete(sessionKey(interaction));
}

function allowedMentions(state) {
  return state?.allowUserPing ? { parse: ['users', 'roles'] } : { parse: [] };
}

function presetData(state) {
  return {
    template: state?.template || 'custom',
    panels: clone(state?.panels || []),
    allowUserPing: !!state?.allowUserPing,
    showTimestamp: state?.showTimestamp !== false,
    fieldLayout: state?.fieldLayout || 'auto',
  };
}

function applyTemplate(interaction, name) {
  if (typeof basePanelFactory !== 'function') throw new Error('Embed state is not configured with a basePanel factory.');
  const current = getSession(interaction);
  const nextPanel = basePanelFactory(name);
  return markUnsaved(interaction, stateSync({
    ...current,
    template: name,
    selectedPanelIndex: 0,
    panels: [nextPanel],
    selectedPreset: null,
  }));
}

function applyPreset(interaction, name, preset = {}) {
  if (typeof basePanelFactory !== 'function') throw new Error('Embed state is not configured with a basePanel factory.');
  const current = getSession(interaction);
  const panels = Array.isArray(preset?.panels) && preset.panels.length
    ? clone(preset.panels)
    : [basePanelFactory('custom')];
  return markUnsaved(interaction, stateSync({
    ...current,
    template: preset?.template || 'custom',
    selectedPreset: name || null,
    panels,
    selectedPanelIndex: 0,
    allowUserPing: !!preset?.allowUserPing,
    showTimestamp: preset?.showTimestamp !== false,
    fieldLayout: preset?.fieldLayout || 'auto',
  }));
}

function setDefault(interaction, name) {
  const current = getSession(interaction);
  return saveSession(interaction, { ...current, selectedPreset: name || null });
}

function installPresetCompatibility() {
  if (presetCompatibilityInstalled) return true;

  let discord;
  let embedPanel;
  let interactions;
  let guildManager;
  try {
    discord = require('discord.js');
    embedPanel = require('./embedPanel');
    interactions = require('./embedInteractions');
    guildManager = require('../../../core/guild/guildManager');
  } catch {
    return false;
  }

  if (!embedPanel || typeof embedPanel.buildPresetsPanel !== 'function') return false;

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
  } = discord;

  const originalBuildPresetsPanel = embedPanel.buildPresetsPanel.bind(embedPanel);
  embedPanel.buildPresetsPanel = function buildPresetsPanelCompatibility(interaction, presets, defaultName = null) {
    const guildId = interaction?.guildId || interaction?.guild?.id || null;
    let resolvedPresets = presets;
    let resolvedDefault = defaultName;

    if (!resolvedPresets || typeof resolvedPresets !== 'object' || Array.isArray(resolvedPresets)) {
      resolvedPresets = guildId && typeof guildManager.getEmbedPresets === 'function'
        ? guildManager.getEmbedPresets(guildId) || {}
        : {};
    }

    const current = getSession(interaction);
    if (resolvedDefault == null && guildId && typeof guildManager.getEmbedDefaults === 'function') {
      const defaults = guildManager.getEmbedDefaults(guildId) || {};
      resolvedDefault = defaults[current?.template || 'custom'] || null;
    }

    const base = originalBuildPresetsPanel(interaction, resolvedPresets, resolvedDefault);
    const entries = Object.entries(resolvedPresets || {}).slice(0, 25);
    const rows = [];

    if (entries.length) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:preset-select')
          .setPlaceholder('💾 Select preset')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(entries.map(([key, preset]) => {
            const display = cleanPresetName(preset?.name || key) || key;
            return {
              label: display.slice(0, 100),
              value: key.slice(0, 100),
              description: resolvedDefault === key ? 'Default preset' : 'Saved preset',
              default: current?.selectedPreset === key,
            };
          })),
      ));
    }

    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:preset-load').setLabel('📂 Load').setStyle(ButtonStyle.Primary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-save').setLabel('💾 Save Current').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('embed:preset-new').setLabel('➕ New').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:preset-rename').setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-duplicate').setLabel('📄 Duplicate').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:preset-delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-default').setLabel('⭐ Set Default').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    ));

    return { ...base, components: rows.slice(0, 5) };
  };

  if (typeof embedPanel.setDefault === 'function') {
    const originalSetDefault = embedPanel.setDefault.bind(embedPanel);
    embedPanel.setDefault = function setDefaultCompatibility(first, templateKey, presetName, guildOrMeta) {
      if (typeof first === 'string' && /^\d{16,20}$/.test(first) && templateKey && presetName) {
        try {
          guildManager.setEmbedDefault(first, templateKey, presetName, guildOrMeta);
          return true;
        } catch (error) {
          console.warn('[Embed Presets] Failed to set default preset:', error?.message || error);
          return false;
        }
      }
      return originalSetDefault(first, templateKey);
    };
  }

  function nameModal(customId, title, label, value = '') {
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle(title)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setValue(cleanPresetName(value)),
      ));
  }

  if (interactions && typeof interactions.handleInteraction === 'function' && !interactions.__namedPresetCompatibility) {
    const originalHandleInteraction = interactions.handleInteraction.bind(interactions);
    interactions.handleInteraction = async function handleNamedPresetInteraction(interaction) {
      const customId = String(interaction?.customId || '');
      const guildId = interaction?.guildId || interaction?.guild?.id || null;
      const state = getSession(interaction);

      if (interaction?.isStringSelectMenu?.() && customId === 'embed:preset-select') {
        const presetName = String(interaction.values?.[0] || '');
        const presets = guildManager.getEmbedPresets?.(guildId) || {};
        if (!presets[presetName]) {
          await interaction.reply({ content: 'Preset not found.', flags: 64 });
          return true;
        }
        saveSession(interaction, { ...state, selectedPreset: presetName });
        await interaction.update(embedPanel.buildPresetsPanel(interaction));
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-load') {
        const presetName = state?.selectedPreset || null;
        const preset = presetName ? guildManager.getEmbedPreset?.(guildId, presetName) : null;
        if (!preset) {
          await interaction.reply({ content: 'Select a valid preset first.', flags: 64 });
          return true;
        }
        applyPreset(interaction, presetName, preset);
        clearUnsaved(interaction, getSession(interaction));
        await interaction.update(embedPanel.buildEditorPanel(interaction, memberName(interaction)));
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-new') {
        resetSession(interaction);
        await interaction.update(embedPanel.buildEditorPanel(interaction, memberName(interaction)));
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-rename') {
        if (!state?.selectedPreset) {
          await interaction.reply({ content: 'Select a preset first.', flags: 64 });
          return true;
        }
        await interaction.showModal(nameModal('embed:preset-rename-modal', 'Rename Embed Preset', 'New preset name', state.selectedPreset));
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-duplicate') {
        if (!state?.selectedPreset) {
          await interaction.reply({ content: 'Select a preset first.', flags: 64 });
          return true;
        }
        await interaction.showModal(nameModal('embed:preset-duplicate-modal', 'Duplicate Embed Preset', 'Copy name', `${state.selectedPreset} Copy`));
        return true;
      }

      if (interaction?.isModalSubmit?.() && customId === 'embed:preset-rename-modal') {
        const oldName = state?.selectedPreset || null;
        const newName = cleanPresetName(interaction.fields.getTextInputValue('name'));
        const presets = guildManager.getEmbedPresets?.(guildId) || {};
        if (!oldName || !presets[oldName]) {
          await interaction.reply({ content: 'The selected preset no longer exists.', flags: 64 });
          return true;
        }
        if (!newName) {
          await interaction.reply({ content: 'A preset name is required.', flags: 64 });
          return true;
        }
        if (newName !== oldName && presets[newName]) {
          await interaction.reply({ content: `A preset named **${newName}** already exists.`, flags: 64 });
          return true;
        }
        if (newName !== oldName) {
          guildManager.saveEmbedPreset(guildId, newName, { ...presets[oldName], name: newName }, interaction.guild);
          guildManager.deleteEmbedPreset?.(guildId, oldName, interaction.guild);
          const defaults = guildManager.getEmbedDefaults?.(guildId) || {};
          for (const [templateKey, defaultPreset] of Object.entries(defaults)) {
            if (defaultPreset === oldName) guildManager.setEmbedDefault?.(guildId, templateKey, newName, interaction.guild);
          }
        }
        saveSession(interaction, { ...state, selectedPreset: newName });
        await interaction.reply({ content: `✅ Renamed preset to **${newName}**.`, ...embedPanel.buildPresetsPanel(interaction), flags: 64 });
        return true;
      }

      if (interaction?.isModalSubmit?.() && customId === 'embed:preset-duplicate-modal') {
        const sourceName = state?.selectedPreset || null;
        const newName = cleanPresetName(interaction.fields.getTextInputValue('name'));
        const presets = guildManager.getEmbedPresets?.(guildId) || {};
        if (!sourceName || !presets[sourceName]) {
          await interaction.reply({ content: 'The selected preset no longer exists.', flags: 64 });
          return true;
        }
        if (!newName) {
          await interaction.reply({ content: 'A preset name is required.', flags: 64 });
          return true;
        }
        if (presets[newName]) {
          await interaction.reply({ content: `A preset named **${newName}** already exists.`, flags: 64 });
          return true;
        }
        guildManager.saveEmbedPreset(guildId, newName, { ...presets[sourceName], name: newName }, interaction.guild);
        saveSession(interaction, { ...state, selectedPreset: newName });
        await interaction.reply({ content: `✅ Duplicated as **${newName}**.`, ...embedPanel.buildPresetsPanel(interaction), flags: 64 });
        return true;
      }

      if (interaction?.isModalSubmit?.() && customId === 'embed:preset-save-modal') {
        const name = cleanPresetName(interaction.fields.getTextInputValue('name'));
        const presets = guildManager.getEmbedPresets?.(guildId) || {};
        if (name && presets[name]) {
          pendingPresetSaves.set(sessionKey(interaction), { name, data: presetData(state) });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('embed:preset-overwrite-confirm').setLabel('✅ Overwrite').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('embed:preset-overwrite-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
          );
          await interaction.reply({ content: `⚠️ **${name}** already exists. Overwrite it?`, components: [row], flags: 64 });
          return true;
        }
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-overwrite-confirm') {
        const pending = pendingPresetSaves.get(sessionKey(interaction));
        if (!pending) {
          await interaction.update({ content: 'This overwrite request has expired.', components: [] });
          return true;
        }
        guildManager.saveEmbedPreset(guildId, pending.name, pending.data, interaction.guild);
        pendingPresetSaves.delete(sessionKey(interaction));
        clearUnsaved(interaction, { ...state, selectedPreset: pending.name });
        await interaction.update({ content: `✅ Overwrote **${pending.name}**.`, ...embedPanel.buildPresetsPanel(interaction) });
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-overwrite-cancel') {
        pendingPresetSaves.delete(sessionKey(interaction));
        await interaction.update({ content: 'Overwrite cancelled.', components: [] });
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-default') {
        const presetName = state?.selectedPreset || null;
        if (!presetName) {
          await interaction.reply({ content: 'Select a preset first.', flags: 64 });
          return true;
        }
        try {
          guildManager.setEmbedDefault(guildId, state.template || 'custom', presetName, interaction.guild);
          await interaction.update(embedPanel.buildPresetsPanel(interaction));
        } catch (error) {
          await interaction.reply({ content: `❌ Could not set default preset: ${error?.message || error}`, flags: 64 });
        }
        return true;
      }

      if (interaction?.isButton?.() && customId === 'embed:preset-delete') {
        const presetName = state?.selectedPreset || null;
        if (!presetName) {
          await interaction.reply({ content: 'Select a preset first.', flags: 64 });
          return true;
        }

        const defaults = typeof guildManager.getEmbedDefaults === 'function'
          ? guildManager.getEmbedDefaults(guildId) || {}
          : {};
        const templateKey = state.template || 'custom';

        if (typeof guildManager.deleteEmbedPreset === 'function') {
          guildManager.deleteEmbedPreset(guildId, presetName, interaction.guild);
        } else {
          const presets = typeof guildManager.getEmbedPresets === 'function' ? guildManager.getEmbedPresets(guildId) || {} : {};
          delete presets[presetName];
          if (typeof guildManager.replaceGuildSection === 'function') guildManager.replaceGuildSection(guildId, 'embedPresets', presets, interaction.guild);
        }

        if (defaults[templateKey] === presetName && typeof guildManager.clearEmbedDefault === 'function') {
          guildManager.clearEmbedDefault(guildId, templateKey, interaction.guild);
        }

        clearUnsaved(interaction, { ...state, selectedPreset: null });
        await interaction.update(embedPanel.buildPresetsPanel(interaction));
        return true;
      }

      return originalHandleInteraction(interaction);
    };
    interactions.__namedPresetCompatibility = true;
  }

  presetCompatibilityInstalled = true;
  return true;
}

queueMicrotask(() => {
  if (!installPresetCompatibility()) setImmediate(installPresetCompatibility);
});

function bindPanel(panel, { defaultState, sync, basePanel } = {}) {
  if (!panel || typeof panel !== 'object') return panel;
  configure({ defaultState, sync, basePanel });
  Object.assign(panel, {
    HELPERS,
    clone,
    trim,
    fmtDate,
    fmtTs,
    durationFrom,
    avatar,
    guildIcon,
    guildBanner,
    memberName,
    displayName,
    refreshGuild,
    sessionKey,
    replaceVars,
    getSession,
    saveSession,
    saveSelected,
    markUnsaved,
    clearUnsaved,
    resetSession,
    clearSession,
    allowedMentions,
    presetData,
    applyTemplate,
    applyPreset,
    setDefault,
  });
  return panel;
}

module.exports = {
  HELPERS,
  sessions,
  configure,
  bindPanel,
  clone,
  trim,
  fmtDate,
  fmtTs,
  durationFrom,
  avatar,
  guildIcon,
  guildBanner,
  memberName,
  displayName,
  refreshGuild,
  sessionKey,
  replaceVars,
  getSession,
  saveSession,
  saveSelected,
  markUnsaved,
  clearUnsaved,
  resetSession,
  clearSession,
  allowedMentions,
  presetData,
  applyTemplate,
  applyPreset,
  setDefault,
  installPresetCompatibility,
};
