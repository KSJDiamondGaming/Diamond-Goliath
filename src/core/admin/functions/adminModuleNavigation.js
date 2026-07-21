'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const WRAPPED = Symbol.for('goliath.adminNavigationWrapped');

function componentData(component) {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}

function customIdOf(component) {
  const data = componentData(component);
  return data?.custom_id || data?.customId || null;
}

function isButtonComponent(component) {
  const data = componentData(component);
  return data?.type === 2;
}

function navigationButton(customId, label) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

function ensureAdminModuleNavigation(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.components)) return payload;
  if (!Array.isArray(payload.embeds) || !payload.embeds.length) return payload;

  const components = [...payload.components];
  const ids = new Set();
  for (const actionRow of components) {
    const rowData = componentData(actionRow);
    for (const component of rowData?.components || []) {
      const customId = customIdOf(component);
      if (customId) ids.add(customId);
    }
  }

  const additions = [];
  if (!ids.has('admin:modules') && !ids.has('admin:modules:back')) {
    additions.push(navigationButton('admin:modules', '⬅️ Back'));
  }
  if (!ids.has('admin:home')) {
    additions.push(navigationButton('admin:home', '🏠 Admin Home'));
  }
  if (!additions.length) return payload;

  for (let index = components.length - 1; index >= 0; index -= 1) {
    const actionRow = components[index];
    const data = componentData(actionRow);
    const rowComponents = data?.components || [];
    if (!rowComponents.length || !rowComponents.every(isButtonComponent)) continue;
    if (rowComponents.length + additions.length > 5) continue;

    const builder = ActionRowBuilder.from(actionRow);
    builder.addComponents(...additions);
    components[index] = builder;
    return { ...payload, components };
  }

  if (components.length < 5) {
    components.push(new ActionRowBuilder().addComponents(...additions));
    return { ...payload, components };
  }

  return payload;
}

function wrapInteraction(interaction) {
  if (!interaction || interaction[WRAPPED]) return;
  interaction[WRAPPED] = true;

  for (const methodName of ['update', 'editReply', 'reply', 'followUp']) {
    if (typeof interaction[methodName] !== 'function') continue;
    const original = interaction[methodName].bind(interaction);
    interaction[methodName] = (payload, ...args) => original(ensureAdminModuleNavigation(payload), ...args);
  }
}

function wrapHandler(target, methodName) {
  const original = target?.[methodName];
  if (typeof original !== 'function' || original[WRAPPED]) return;

  const wrapped = async function wrappedAdminHandler(interaction, ...args) {
    wrapInteraction(interaction);
    return original.call(this, interaction, ...args);
  };
  wrapped[WRAPPED] = true;
  target[methodName] = wrapped;
}

function installAdminModuleNavigation() {
  const targets = [
    ['../../../modules/embed/embedPanel', ['handleInteraction']],
    ['../../../modules/forms/formsAdminPanel', ['handleFormsAdminInteraction']],
    ['../../../modules/giveaways/giveawaysAdminPanel', ['handleGiveawaysAdminInteraction']],
    ['../../../modules/goodbye/goodbyePanel', ['handleGoodbyeInteraction']],
    ['../../../modules/invites/invitesAdminPanel', ['handleInviteStudioInteraction']],
    ['../../../modules/leveling/levelingAdminPanel', ['handleLevelingAdminInteraction']],
    ['../../../modules/polls/pollsPanel', ['handlePollsAdminInteraction']],
    ['../../../modules/social/socialPanel', ['handleSocialAdminInteraction']],
    ['../../../modules/starboard/starboardAdminPanel', ['handleStarboardAdminInteraction']],
    ['../../../modules/stats/statsPanel', ['handleStatsAdminInteraction']],
    ['../../../modules/sticky/stickyAdminPanel', ['handleStickyAdminInteraction']],
    ['../../../modules/suggestions/suggestionsAdminPanel', ['handleSuggestionsAdminInteraction']],
    ['../../../modules/verification/verificationPanel', ['handleVerificationAdminInteraction']],
    ['../../../modules/welcome/welcomePanel', ['handleWelcomeInteraction']],
    ['../../../modules/autoroles/autorolesPanel', ['handleAutoRolesInteraction']],
    ['../../../modules/timedroles/timedRolesPanel', ['handleTimedRolesInteraction']],
  ];

  for (const [modulePath, methods] of targets) {
    try {
      const target = require(modulePath);
      for (const method of methods) wrapHandler(target, method);
    } catch (error) {
      console.warn(`[AdminNavigation] Could not decorate ${modulePath}: ${error?.message || error}`);
    }
  }
}

module.exports = {
  ensureAdminModuleNavigation,
  installAdminModuleNavigation,
  wrapInteraction,
};
