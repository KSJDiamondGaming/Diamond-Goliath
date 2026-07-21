'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const MODULES_PER_PAGE = 10;
const MODULES_PER_ROW = 4;
const PANEL_COLOR = '#5865F2';

const FULL_SERVER_MODULES = [
  ['admin:embed', '✨ Embed Studio', 'Embed Studio', 'Build and manage Discord embeds.'],
  ['admin:forms', '📝 Forms', 'Forms', 'Forms, submissions, review and response storage.'],
  ['admin:fun', '🎮 Fun', 'Fun', 'Fun commands and optional community extras.'],
  ['admin:giveaways', '🎉 Giveaways', 'Giveaways', 'Giveaway creation, entries, winners and rerolls.'],
  ['admin:goodbye', '👋 Goodbye', 'Goodbye', 'Public farewell messages and Embed Studio templates.'],
  ['admin:invites', '📨 Invite Studio', 'Invite Studio', 'Create invite links, attach roles and track member joins.'],
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

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function componentId(component) {
  const data = typeof component?.toJSON === 'function' ? component.toJSON() : component;
  return data?.custom_id || data?.customId || null;
}

function componentType(component) {
  const data = typeof component?.toJSON === 'function' ? component.toJSON() : component;
  return data?.type;
}

function getComponents(actionRow) {
  const data = typeof actionRow?.toJSON === 'function' ? actionRow.toJSON() : actionRow;
  return Array.isArray(data?.components) ? data.components : [];
}

function memberDisplayName(interaction) {
  return interaction?.member?.displayName
    || interaction?.user?.displayName
    || interaction?.user?.username
    || 'Unknown User';
}

function buildModuleListPanel(page = 0, who = 'Unknown User') {
  const totalPages = Math.max(1, Math.ceil(FULL_SERVER_MODULES.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const pageItems = FULL_SERVER_MODULES.slice(
    currentPage * MODULES_PER_PAGE,
    (currentPage + 1) * MODULES_PER_PAGE
  );

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🧩 Goliath Modules')
    .setDescription(`Select a module to configure.\n\nPage ${currentPage + 1}/${totalPages}`)
    .setFooter({ text: `Requested by ${who}` })
    .setTimestamp();

  const moduleRows = chunk(
    pageItems.map(([customId, label]) => button(customId, label, ButtonStyle.Primary)),
    MODULES_PER_ROW
  ).map((buttons) => row(...buttons));

  const navigation = [button('admin:modules:back', '⬅️ Back')];
  if (currentPage > 0) {
    navigation.push(button(`admin:modules:page:${currentPage - 1}`, '◀ Previous'));
  }
  if (currentPage < totalPages - 1) {
    navigation.push(button(`admin:modules:page:${currentPage + 1}`, 'Next ▶'));
  }
  navigation.push(button('admin:home', '🏠 Admin Home'));

  return {
    embeds: [embed],
    components: [...moduleRows, row(...navigation)],
  };
}

function ensureNavigation(payload, interaction) {
  if (!payload || !Array.isArray(payload.components)) return payload;

  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('admin:') && !customId.startsWith('embed:') && !customId.startsWith('invites:')) {
    return payload;
  }
  if (customId === 'admin:home' || customId === 'admin:modules' || customId.startsWith('admin:modules:page:')) {
    return payload;
  }

  const rows = [...payload.components];
  const ids = new Set();
  for (const actionRow of rows) {
    for (const component of getComponents(actionRow)) {
      const id = componentId(component);
      if (id) ids.add(id);
    }
  }

  const required = [];
  if (!ids.has('admin:modules') && !ids.has('admin:modules:back')) {
    required.push(button('admin:modules', '⬅️ Back'));
  }
  if (!ids.has('admin:home')) {
    required.push(button('admin:home', '🏠 Admin Home'));
  }
  if (!required.length) return payload;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const actionRow = rows[index];
    const existing = getComponents(actionRow);
    const isButtonRow = existing.length > 0 && existing.every((component) => componentType(component) === 2);
    if (!isButtonRow || existing.length + required.length > 5) continue;

    const builder = ActionRowBuilder.from(actionRow);
    builder.addComponents(...required);
    rows[index] = builder;
    return { ...payload, components: rows };
  }

  if (rows.length < 5) {
    rows.push(row(...required));
    return { ...payload, components: rows };
  }

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const actionRow = rows[index];
    const existing = getComponents(actionRow);
    const isButtonRow = existing.length > 0 && existing.every((component) => componentType(component) === 2);
    if (!isButtonRow || existing.length >= 5) continue;

    const available = 5 - existing.length;
    const builder = ActionRowBuilder.from(actionRow);
    builder.addComponents(...required.slice(0, available));
    rows[index] = builder;
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

function installModuleListHandler(moduleAdminPanels) {
  const original = moduleAdminPanels?.handleModuleAdminInteraction;
  if (typeof original !== 'function' || original.__goliathCanonicalModuleListWrapped) return;

  const adminPanel = safeRequire('./adminPanel');

  async function wrapped(interaction, ...args) {
    const customId = String(interaction?.customId || '');

    if (customId === 'admin:modules:back') {
      const payload = adminPanel?.buildAdminPanel?.(interaction.guild, memberDisplayName(interaction));
      if (!payload) return false;
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.update(payload);
      return true;
    }

    if (customId === 'admin:modules' || /^admin:modules:page:\d+$/.test(customId)) {
      const pageMatch = customId.match(/^admin:modules:page:(\d+)$/);
      const payload = buildModuleListPanel(pageMatch ? Number(pageMatch[1]) : 0, memberDisplayName(interaction));
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.update(payload);
      return true;
    }

    return original.call(this, interaction, ...args);
  }

  wrapped.__goliathCanonicalModuleListWrapped = true;
  moduleAdminPanels.handleModuleAdminInteraction = wrapped;
  moduleAdminPanels.buildModuleListPanel = buildModuleListPanel;
}

function safeRequire(modulePath) {
  try { return require(modulePath); }
  catch (error) {
    console.warn(`[AdminModules] Optional panel unavailable: ${modulePath} (${error?.message || error})`);
    return null;
  }
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
  installModuleListHandler(moduleAdminPanels);
  installNavigationPatches();
  return true;
}

module.exports = {
  FULL_SERVER_MODULES,
  buildModuleListPanel,
  ensureNavigation,
  install,
};
