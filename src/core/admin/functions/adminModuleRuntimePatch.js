'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const FULL_SERVER_MODULES = [
  ['admin:embed', '✨ Embed Studio', 'Embed Studio', 'Build and manage Discord embeds.'],
  ['admin:forms', '📝 Forms', 'Forms', 'Forms, submissions, review and response storage.'],
  ['admin:fun', '🎮 Fun', 'Fun', 'Fun commands and optional community extras.'],
  ['admin:giveaways', '🎉 Giveaways', 'Giveaways', 'Giveaway creation, entries, winners and rerolls.'],
  ['admin:goodbye', '👋 Goodbye', 'Goodbye', 'Public farewell messages and Embed Studio templates.'],
  ['admin:invites', '✉️ Invite Studio', 'Invite Studio', 'Create invite links, attach roles and track member joins.'],
  ['admin:leveling', '🏆 Leveling', 'Leveling', 'XP, levels, leaderboards and level roles.'],
  ['admin:polls', '📊 Polls', 'Polls', 'Poll creation, voting and results.'],
  ['admin:reactionRoles', '🎭 Role Studio', 'Role Studio', 'Manage Auto Roles, Reaction Roles, Timed Roles and Temporary Roles in one place.'],
  ['admin:stats', '📊 Server Stats', 'Server Stats', 'Server counters, member statistics and activity tracking.'],
  ['admin:social', '📣 Social Alerts', 'Social Alerts', 'Creator alerts for Twitch, YouTube, TikTok, Kick and more.'],
  ['admin:starboard', '⭐ Starboard', 'Starboard', 'Highlight popular server messages.'],
  ['admin:sticky', '💬 Sticky Messages', 'Sticky Messages', 'Keep important messages at the bottom of chat.'],
  ['admin:suggestions', '💡 Suggestions', 'Suggestions', 'Suggestion intake, voting and review workflow.'],
  ['admin:tempVoice', '🔊 Temp Voice', 'Temp Voice', 'Temporary voice channels and room automation.'],
  ['admin:tickets', '🎟️ Tickets', 'Tickets', 'Support ticket creation and management.'],
  ['admin:translation', '🌐 Translation', 'Translation', 'Language preferences and translation controls.'],
  ['admin:verification', '✅ Verification', 'Verification', 'Member verification and onboarding protection.'],
  ['admin:welcome', '👋 Welcome', 'Welcome', 'Welcome messages, member DMs and Embed Studio templates.'],
].sort((a, b) => a[2].localeCompare(b[2]));

function button(customId, label) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

function componentId(component) {
  return component?.data?.custom_id
    || component?.custom_id
    || component?.customId
    || null;
}

function ensureNavigation(payload, interaction) {
  if (!payload || !Array.isArray(payload.components)) return payload;

  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('admin:')) return payload;
  if (customId === 'admin:home') return payload;

  const rows = [...payload.components];
  const ids = new Set();
  for (const actionRow of rows) {
    const components = actionRow?.components || actionRow?.data?.components || [];
    for (const component of components) {
      const id = componentId(component);
      if (id) ids.add(id);
    }
  }

  const required = [];
  if (customId !== 'admin:modules' && !ids.has('admin:modules')) {
    required.push(button('admin:modules', '⬅️ Back'));
  }
  if (!ids.has('admin:home')) {
    required.push(button('admin:home', '🏠 Admin Home'));
  }
  if (!required.length) return payload;

  const last = rows[rows.length - 1];
  const lastComponents = last?.components || last?.data?.components || [];
  const lastIsButtonRow = lastComponents.length > 0 && lastComponents.every((component) => {
    const type = component?.data?.type ?? component?.type;
    return type === 2;
  });

  if (lastIsButtonRow && lastComponents.length + required.length <= 5) {
    if (typeof last.addComponents === 'function') {
      last.addComponents(...required);
    } else {
      last.components = [...lastComponents, ...required];
    }
    return { ...payload, components: rows };
  }

  if (rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(...required));
    return { ...payload, components: rows };
  }

  // Discord permits only five component rows. Preserve all existing module
  // controls and add whichever navigation action still fits in the final row.
  if (lastIsButtonRow && lastComponents.length < 5) {
    const available = 5 - lastComponents.length;
    const additions = required.slice(0, available);
    if (typeof last.addComponents === 'function') last.addComponents(...additions);
    else last.components = [...lastComponents, ...additions];
    return { ...payload, components: rows };
  }

  return payload;
}

function wrapInteractionMethod(interaction, methodName) {
  const original = interaction?.[methodName];
  if (typeof original !== 'function') return null;
  interaction[methodName] = function patchedAdminResponse(payload, ...args) {
    return original.call(this, ensureNavigation(payload, interaction), ...args);
  };
  return () => { interaction[methodName] = original; };
}

function wrapHandler(target, methodName) {
  const original = target?.[methodName];
  if (typeof original !== 'function' || original.__goliathAdminNavigationWrapped) return;

  async function wrapped(interaction, ...args) {
    const restores = ['reply', 'update', 'editReply', 'followUp']
      .map((method) => wrapInteractionMethod(interaction, method))
      .filter(Boolean);
    try {
      return await original.call(this, interaction, ...args);
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  }

  wrapped.__goliathAdminNavigationWrapped = true;
  target[methodName] = wrapped;
}

function installRegistry(moduleAdminPanels) {
  if (!Array.isArray(moduleAdminPanels?.SERVER_MODULES)) return;
  moduleAdminPanels.SERVER_MODULES.splice(
    0,
    moduleAdminPanels.SERVER_MODULES.length,
    ...FULL_SERVER_MODULES.map((entry) => [...entry])
  );
}

function safeRequire(modulePath) {
  try { return require(modulePath); }
  catch { return null; }
}

function installNavigationPatches() {
  const targets = [
    [safeRequire('./moduleAdminPanels'), 'handleModuleAdminInteraction'],
    [safeRequire('../../../modules/embed/embedPanel'), 'handleInteraction'],
    [safeRequire('../../../modules/stats/statsPanel'), 'handleStatsAdminInteraction'],
    [safeRequire('../../../modules/suggestions/suggestionsAdminPanel'), 'handleSuggestionsAdminInteraction'],
    [safeRequire('../../../modules/giveaways/giveawaysAdminPanel'), 'handleGiveawaysAdminInteraction'],
    [safeRequire('../../../modules/forms/formsAdminPanel'), 'handleFormsAdminInteraction'],
    [safeRequire('../../../modules/polls/pollsPanel'), 'handlePollsAdminInteraction'],
    [safeRequire('../../../modules/starboard/starboardAdminPanel'), 'handleStarboardAdminInteraction'],
    [safeRequire('../../../modules/sticky/stickyAdminPanel'), 'handleStickyAdminInteraction'],
    [safeRequire('../../../modules/leveling/levelingAdminPanel'), 'handleLevelingAdminInteraction'],
    [safeRequire('../../../modules/social/socialPanel'), 'handleSocialAdminInteraction'],
    [safeRequire('../../../modules/verification/verificationPanel'), 'handleVerificationAdminInteraction'],
    [safeRequire('../../../modules/autoroles/autorolesPanel'), 'handleAutoRolesInteraction'],
    [safeRequire('../../../modules/timedroles/timedRolesPanel'), 'handleTimedRolesInteraction'],
    [safeRequire('../../../modules/welcome/welcomePanel'), 'handleWelcomeInteraction'],
    [safeRequire('../../../modules/goodbye/goodbyePanel'), 'handleGoodbyeInteraction'],
  ];

  for (const [target, method] of targets) wrapHandler(target, method);

  const invites = safeRequire('../../../modules/invites/invitesAdminPanel');
  if (invites && typeof invites.buildInviteStudioPayload === 'function' && !invites.buildInviteStudioPayload.__goliathAdminNavigationWrapped) {
    const original = invites.buildInviteStudioPayload;
    const wrapped = function buildInviteStudioPayloadWithNavigation(interaction, ...args) {
      return ensureNavigation(original.call(this, interaction, ...args), interaction);
    };
    wrapped.__goliathAdminNavigationWrapped = true;
    invites.buildInviteStudioPayload = wrapped;
  }
}

function install(moduleAdminPanels = safeRequire('./moduleAdminPanels')) {
  installRegistry(moduleAdminPanels);
  installNavigationPatches();
  return true;
}

module.exports = {
  FULL_SERVER_MODULES,
  ensureNavigation,
  install,
};
