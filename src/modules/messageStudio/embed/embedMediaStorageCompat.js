'use strict';

const panel = require('./embedPreviewCompat');
const state = require('./embedState');

function clone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value ?? fallback)); } catch { return fallback; }
}

function normalizeState(stateValue) {
  if (!stateValue || typeof stateValue !== 'object') return stateValue;
  const source = stateValue.media || stateValue.mediaV2 || null;
  if (!source) return stateValue;
  return { ...stateValue, media: clone(source), mediaV2: clone(source) };
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

function ts(timestamp, style = 'F') {
  const seconds = Math.floor(Number(timestamp || 0) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? `<t:${seconds}:${style}>` : 'Unknown';
}

function safeAsset(fn, fallback = '') {
  try { return fn?.() || fallback; } catch { return fallback; }
}

const EXTRA_HELPERS = [
  '{channelId}', '{channelName}', '{channelMention}',
  '{guildOwnerId}', '{guildOwnerMention}', '{guildCreatedAt}', '{guildCreatedTimestamp}',
  '{guildBoostCount}', '{guildBoostTier}', '{guildSplash}', '{guildDiscoverySplash}',
  '{userBot}', '{userTopRoleId}', '{userTopRoleMention}',
];

if (!panel.__embedStatePatched) {
  state.configure({ defaultState: panel.defaultState, sync: panel.sync });

  Object.assign(panel, {
    HELPERS: state.HELPERS,
    clone: state.clone,
    trim: state.trim,
    fmtDate: state.fmtDate,
    fmtTs: state.fmtTs,
    avatar: state.avatar,
    guildIcon: state.guildIcon,
    guildBanner: state.guildBanner,
    memberName: state.memberName,
    displayName: state.displayName,
    refreshGuild: state.refreshGuild,
    sessionKey: state.sessionKey,
    replaceVars: state.replaceVars,
    getSession: state.getSession,
    saveSession: state.saveSession,
    markUnsaved: state.markUnsaved,
    clearUnsaved: state.clearUnsaved,
    resetSession: state.resetSession,
  });

  panel.applyTemplate = (interaction, name) => {
    const current = state.getSession(interaction);
    const nextPanel = panel.basePanel(name);
    return state.markUnsaved(interaction, panel.sync({
      ...current,
      template: name,
      selectedPanelIndex: 0,
      panels: [nextPanel],
      selectedPreset: null,
    }));
  };

  panel.applyPreset = (interaction, name, preset = {}) => {
    const current = state.getSession(interaction);
    const panels = Array.isArray(preset?.panels) && preset.panels.length
      ? state.clone(preset.panels)
      : [panel.basePanel('custom')];
    return state.markUnsaved(interaction, panel.sync({
      ...current,
      template: preset?.template || 'custom',
      selectedPreset: name || null,
      panels,
      selectedPanelIndex: 0,
      allowUserPing: !!preset?.allowUserPing,
      showTimestamp: preset?.showTimestamp !== false,
      fieldLayout: preset?.fieldLayout || 'auto',
    }));
  };

  panel.setDefault = (interaction, name) => {
    const current = state.getSession(interaction);
    return state.saveSession(interaction, { ...current, selectedPreset: name || null });
  };

  panel.__embedStatePatched = true;
}

if (!panel.__neutralMediaStoragePatched) {
  if (typeof panel.getSession === 'function') {
    const originalGetSession = panel.getSession.bind(panel);
    panel.getSession = (interaction) => normalizeState(originalGetSession(interaction));
  }

  if (typeof panel.saveSession === 'function') {
    const originalSaveSession = panel.saveSession.bind(panel);
    panel.saveSession = (interaction, stateValue) => originalSaveSession(interaction, normalizeState(stateValue));
  }

  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (stateValue) => {
      const normalized = normalizeState(stateValue);
      const preset = originalPresetData(normalized) || {};
      const media = clone(preset.media || preset.mediaV2 || normalized?.media || normalized?.mediaV2, null);
      const output = { ...preset };
      delete output.mediaV2;
      if (media) output.media = media;
      return output;
    };
  }

  if (typeof panel.applyPreset === 'function') {
    const originalApplyPreset = panel.applyPreset.bind(panel);
    panel.applyPreset = (interaction, name, preset = {}) => {
      const source = preset?.media || preset?.mediaV2 || null;
      const compatiblePreset = source ? { ...preset, mediaV2: clone(source) } : preset;
      const result = originalApplyPreset(interaction, name, compatiblePreset);
      return normalizeState(source ? { ...result, media: clone(source) } : result);
    };
  }

  panel.__neutralMediaStoragePatched = true;
}

if (!panel.__expandedVariablesPatched && typeof panel.replaceVars === 'function') {
  const originalReplaceVars = panel.replaceVars.bind(panel);
  panel.replaceVars = (text, interaction) => {
    const sentinels = {
      accountAge: '__GOLIATH_ACCOUNT_AGE__',
      membershipDuration: '__GOLIATH_MEMBERSHIP_DURATION__',
    };
    let prepared = String(text || '')
      .replaceAll('{accountAge}', sentinels.accountAge)
      .replaceAll('{accountage}', sentinels.accountAge)
      .replaceAll('{membershipDuration}', sentinels.membershipDuration)
      .replaceAll('{membershipduration}', sentinels.membershipDuration);
    let output = originalReplaceVars(prepared, interaction);

    const user = interaction?.user || {};
    const member = interaction?.member || {};
    const guild = interaction?.guild || {};
    const channel = interaction?.channel || {};
    const channelId = interaction?.channelId || channel?.id || '';
    const ownerId = guild?.ownerId || '';
    const topRole = member?.roles?.highest || null;
    const guildCreatedTimestamp = guild?.createdTimestamp || 0;
    const extras = {
      accountAge: durationFrom(user?.createdTimestamp),
      membershipDuration: durationFrom(member?.joinedTimestamp),
      channelId,
      channelName: channel?.name || 'Unknown Channel',
      channelMention: channelId ? `<#${channelId}>` : '',
      guildOwnerId: ownerId,
      guildOwnerMention: ownerId ? `<@${ownerId}>` : '',
      guildCreatedAt: ts(guildCreatedTimestamp, 'F'),
      guildCreatedTimestamp: ts(guildCreatedTimestamp, 'R'),
      guildBoostCount: String(guild?.premiumSubscriptionCount || 0),
      guildBoostTier: String(guild?.premiumTier ?? 0),
      guildSplash: safeAsset(() => guild?.splashURL?.({ extension: 'png', size: 2048 })),
      guildDiscoverySplash: safeAsset(() => guild?.discoverySplashURL?.({ extension: 'png', size: 2048 })),
      userBot: user?.bot ? 'Yes' : 'No',
      userTopRoleId: topRole?.id || '',
      userTopRoleMention: topRole?.id ? `<@&${topRole.id}>` : '',
    };

    output = output
      .replaceAll(sentinels.accountAge, extras.accountAge)
      .replaceAll(sentinels.membershipDuration, extras.membershipDuration);
    for (const [key, value] of Object.entries(extras)) {
      output = output.replaceAll(`{${key}}`, String(value ?? ''));
      output = output.replaceAll(`{${key.toLowerCase()}}`, String(value ?? ''));
    }
    return output;
  };

  if (Array.isArray(panel.HELPERS)) {
    for (const helper of EXTRA_HELPERS) if (!panel.HELPERS.includes(helper)) panel.HELPERS.push(helper);
  }
  panel.__expandedVariablesPatched = true;
}

module.exports = panel;
