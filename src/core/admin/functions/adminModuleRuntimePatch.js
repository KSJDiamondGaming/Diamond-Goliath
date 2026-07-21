'use strict';

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');

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

const MODULE_META = {
  embed: { title: 'Embed Studio', route: 'admin:embed' },
  forms: { title: 'Forms', route: 'admin:forms' },
  fun: { title: 'Fun', route: 'admin:fun' },
  giveaways: { title: 'Giveaways', route: 'admin:giveaways' },
  goodbye: { title: 'Goodbye', route: 'admin:goodbye' },
  invites: { title: 'Invite Studio', route: 'admin:invites' },
  leveling: { title: 'Leveling', route: 'admin:leveling' },
  polls: { title: 'Polls', route: 'admin:polls' },
  reactionRoles: { title: 'Role Studio', route: 'admin:reactionRoles' },
  autoRoles: { title: 'Auto Roles', route: 'admin:autoRoles' },
  timedRoles: { title: 'Timed Roles', route: 'admin:timedRoles' },
  temporaryRoles: { title: 'Temporary Roles', route: 'admin:reactionRoles:temporary' },
  stats: { title: 'Server Stats', route: 'admin:stats' },
  social: { title: 'Social Alerts', route: 'admin:social' },
  starboard: { title: 'Starboard', route: 'admin:starboard' },
  sticky: { title: 'Sticky Messages', route: 'admin:sticky' },
  suggestions: { title: 'Suggestions', route: 'admin:suggestions' },
  tempVoice: { title: 'Temp Voice', route: 'admin:tempVoice' },
  tickets: { title: 'Tickets', route: 'admin:tickets' },
  translation: { title: 'Translation', route: 'admin:translation' },
  verification: { title: 'Verification', route: 'admin:verification' },
  welcome: { title: 'Welcome', route: 'admin:welcome' },
};

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components.filter(Boolean));
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function componentData(component) {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}

function componentId(component) {
  const data = componentData(component);
  return data?.custom_id || data?.customId || null;
}

function componentType(component) {
  return componentData(component)?.type;
}

function getComponents(actionRow) {
  const data = componentData(actionRow);
  return Array.isArray(data?.components) ? data.components : [];
}

function memberDisplayName(interaction) {
  return interaction?.member?.displayName || interaction?.user?.displayName || interaction?.user?.username || 'Unknown User';
}

function moduleKeyFromCustomId(customId = '') {
  const id = String(customId);
  const generic = id.match(/^admin:module:([a-zA-Z0-9_-]+):/);
  if (generic) return generic[1];
  const config = id.match(/^admin:config:([a-zA-Z0-9_-]+)(?::|$)/);
  if (config) return config[1];
  if (id.startsWith('embed:') || id === 'admin:embed') return 'embed';
  if (id.startsWith('invites:') || id === 'admin:invites') return 'invites';
  if (id.startsWith('admin:autoRoles')) return 'autoRoles';
  if (id.startsWith('admin:timedRoles')) return 'timedRoles';
  if (id.startsWith('admin:reactionRoles:temporary')) return 'temporaryRoles';
  for (const [key, meta] of Object.entries(MODULE_META)) {
    if (id === meta.route || id.startsWith(`${meta.route}:`)) return key;
  }
  return null;
}

function isStandardChromeId(id) {
  return id === 'admin:modules' || id === 'admin:modules:back' || id === 'admin:home' || /^admin:config:/.test(id);
}

function isLegacyMaintenanceId(id) {
  return /(?:^|:)(settings|health|repair|export|restore|reset)$/.test(String(id || ''));
}

function buildModuleListPanel(page = 0, who = 'Unknown User') {
  const totalPages = Math.max(1, Math.ceil(FULL_SERVER_MODULES.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const pageItems = FULL_SERVER_MODULES.slice(currentPage * MODULES_PER_PAGE, (currentPage + 1) * MODULES_PER_PAGE);
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🧩 Goliath Modules')
    .setDescription(`Select a module to configure.\n\nPage ${currentPage + 1}/${totalPages}`)
    .setFooter({ text: `Requested by ${who}` })
    .setTimestamp();
  const moduleRows = chunk(pageItems.map(([customId, label]) => button(customId, label, ButtonStyle.Primary)), MODULES_PER_ROW)
    .map((buttons) => row(...buttons));
  const navigation = [];
  if (currentPage > 0) navigation.push(button(`admin:modules:page:${currentPage - 1}`, '◀ Previous'));
  if (currentPage < totalPages - 1) navigation.push(button(`admin:modules:page:${currentPage + 1}`, 'Next ▶'));
  navigation.push(button('admin:home', '🏠 Admin Home'));
  return { embeds: [embed], components: [...moduleRows, row(...navigation)] };
}

function standardizeModuleChrome(payload, interaction, explicitModuleKey = null) {
  if (!payload || !Array.isArray(payload.components)) return payload;
  const customId = String(interaction?.customId || '');
  if (customId === 'admin:home' || customId === 'admin:modules' || customId.startsWith('admin:modules:page:')) return payload;
  const moduleKey = explicitModuleKey || moduleKeyFromCustomId(customId);
  if (!moduleKey) return payload;

  const cleanedRows = [];
  for (const actionRow of payload.components) {
    const components = getComponents(actionRow);
    if (!components.length) continue;
    const isButtonRow = components.every((component) => componentType(component) === 2);
    if (!isButtonRow) {
      cleanedRows.push(actionRow);
      continue;
    }
    const kept = components.filter((component) => {
      const id = componentId(component);
      return !isStandardChromeId(id) && !isLegacyMaintenanceId(id);
    });
    if (kept.length) cleanedRows.push(row(...kept.map((component) => ButtonBuilder.from(component))));
  }

  const chrome = row(
    button('admin:modules', '⬅️ Modules'),
    button('admin:home', '🏠 Admin Home'),
    button(`admin:config:${moduleKey}`, '⚙️ Config', ButtonStyle.Primary),
  );

  if (cleanedRows.length < 5) cleanedRows.push(chrome);
  else {
    const last = cleanedRows[cleanedRows.length - 1];
    const existing = getComponents(last);
    if (existing.every((component) => componentType(component) === 2) && existing.length <= 2) {
      cleanedRows[cleanedRows.length - 1] = row(
        ...existing.map((component) => ButtonBuilder.from(component)),
        ...getComponents(chrome).map((component) => ButtonBuilder.from(component)),
      );
    } else {
      cleanedRows[cleanedRows.length - 1] = chrome;
    }
  }

  return { ...payload, components: cleanedRows.slice(0, 5) };
}

function getRawModuleConfig(guildId, moduleKey) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return modules?.[moduleKey];
}

function saveRawModuleConfig(guild, moduleKey, value) {
  guildManager.updateGuildSection(guild.id, 'modules', (modules = {}) => ({ ...modules, [moduleKey]: value }), {}, guild);
}

function defaultsFor(moduleAdminPanels, moduleKey) {
  return moduleAdminPanels?.MODULE_PANEL_REGISTRY?.[moduleKey]?.defaults || null;
}

function normalizedConfig(raw, defaults = null) {
  const base = defaults && typeof defaults === 'object' ? { ...defaults } : {};
  if (raw === false) return { ...base, enabled: false };
  if (!raw || raw === true || typeof raw !== 'object' || Array.isArray(raw)) return { ...base, enabled: true };
  return { ...base, ...raw, enabled: raw.enabled !== false };
}

function configHealth(raw) {
  const issues = [];
  if (raw === undefined) issues.push('No saved configuration exists yet.');
  else if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) issues.push('Configuration is not stored as an object.');
  else {
    if (typeof raw.enabled !== 'boolean') issues.push('The enabled state is missing or invalid.');
    try { JSON.stringify(raw); } catch { issues.push('Configuration cannot be exported as JSON.'); }
  }
  return issues;
}

function buildConfigPanel(interaction, moduleKey, notice = null) {
  const meta = MODULE_META[moduleKey] || { title: moduleKey, route: `admin:${moduleKey}` };
  const raw = getRawModuleConfig(interaction.guildId, moduleKey);
  const issues = configHealth(raw);
  const status = issues.length ? `⚠️ ${issues.length} issue${issues.length === 1 ? '' : 's'} detected` : '✅ Healthy';
  const description = [
    `Maintenance and configuration tools for **${meta.title}**.`,
    '',
    `**Status:** ${status}`,
    `**Saved Config:** ${raw === undefined ? 'Not created' : 'Available'}`,
    notice ? `\n${notice}` : '',
  ].filter(Boolean).join('\n');
  return {
    embeds: [new EmbedBuilder()
      .setColor(issues.length ? 0xfee75c : 0x57f287)
      .setTitle(`⚙️ ${meta.title} Config`)
      .setDescription(description)
      .setFooter({ text: `Requested by ${memberDisplayName(interaction)}` })
      .setTimestamp()],
    components: [
      row(
        button(meta.route, '⚙️ Settings', ButtonStyle.Primary),
        button(`admin:config:${moduleKey}:health`, '🩺 Health'),
        button(`admin:config:${moduleKey}:repair`, '🛠️ Repair'),
        button(`admin:config:${moduleKey}:export`, '📤 Export'),
        button(`admin:config:${moduleKey}:reset`, '♻️ Reset', ButtonStyle.Danger),
      ),
      row(
        button('admin:modules', '⬅️ Modules'),
        button('admin:home', '🏠 Admin Home'),
      ),
    ],
  };
}

function buildHealthPanel(interaction, moduleKey) {
  const raw = getRawModuleConfig(interaction.guildId, moduleKey);
  const issues = configHealth(raw);
  const meta = MODULE_META[moduleKey] || { title: moduleKey };
  return {
    embeds: [new EmbedBuilder()
      .setColor(issues.length ? 0xfee75c : 0x57f287)
      .setTitle(`🩺 ${meta.title} Health`)
      .setDescription(issues.length ? issues.map((issue) => `• ${issue}`).join('\n') : '✅ Configuration structure is healthy and exportable.')
      .setFooter({ text: `Requested by ${memberDisplayName(interaction)}` })
      .setTimestamp()],
    components: [row(
      button(`admin:config:${moduleKey}`, '⬅️ Config'),
      button('admin:modules', '🧩 Modules'),
      button('admin:home', '🏠 Admin Home'),
    )],
  };
}

function buildResetConfirmation(interaction, moduleKey) {
  const meta = MODULE_META[moduleKey] || { title: moduleKey };
  return {
    embeds: [new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`♻️ Reset ${meta.title}?`)
      .setDescription('This replaces the saved module configuration with its defaults. This cannot be undone unless you export the configuration first.')
      .setFooter({ text: `Requested by ${memberDisplayName(interaction)}` })],
    components: [
      row(
        button(`admin:config:${moduleKey}:reset:confirm`, 'Confirm Reset', ButtonStyle.Danger),
        button(`admin:config:${moduleKey}`, 'Cancel'),
      ),
      row(button('admin:modules', '⬅️ Modules'), button('admin:home', '🏠 Admin Home')),
    ],
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function handleConfigInteraction(interaction, moduleAdminPanels) {
  const match = String(interaction?.customId || '').match(/^admin:config:([a-zA-Z0-9_-]+)(?::(health|repair|export|reset)(?::(confirm))?)?$/);
  if (!match) return false;
  const [, moduleKey, action, confirmation] = match;
  if (!MODULE_META[moduleKey] && !moduleAdminPanels?.MODULE_PANEL_REGISTRY?.[moduleKey]) return false;

  if (!action) {
    await safeUpdate(interaction, buildConfigPanel(interaction, moduleKey));
    return true;
  }
  if (action === 'health') {
    await safeUpdate(interaction, buildHealthPanel(interaction, moduleKey));
    return true;
  }
  if (action === 'repair') {
    const raw = getRawModuleConfig(interaction.guildId, moduleKey);
    saveRawModuleConfig(interaction.guild, moduleKey, normalizedConfig(raw, defaultsFor(moduleAdminPanels, moduleKey)));
    await safeUpdate(interaction, buildConfigPanel(interaction, moduleKey, '✅ Configuration repaired and normalized.'));
    return true;
  }
  if (action === 'export') {
    const raw = normalizedConfig(getRawModuleConfig(interaction.guildId, moduleKey), defaultsFor(moduleAdminPanels, moduleKey));
    const attachment = new AttachmentBuilder(Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, 'utf8'), { name: `${moduleKey}-config.json` });
    await safeUpdate(interaction, { ...buildConfigPanel(interaction, moduleKey, '✅ Configuration exported.'), files: [attachment] });
    return true;
  }
  if (action === 'reset' && confirmation !== 'confirm') {
    await safeUpdate(interaction, buildResetConfirmation(interaction, moduleKey));
    return true;
  }
  if (action === 'reset' && confirmation === 'confirm') {
    const defaults = defaultsFor(moduleAdminPanels, moduleKey);
    saveRawModuleConfig(interaction.guild, moduleKey, normalizedConfig(defaults || {}, defaults));
    await safeUpdate(interaction, buildConfigPanel(interaction, moduleKey, '✅ Configuration reset to defaults.'));
    return true;
  }
  return false;
}

function wrapInteractionMethod(interaction, methodName, moduleKey) {
  const original = interaction?.[methodName];
  if (typeof original !== 'function') return null;
  interaction[methodName] = function patchedAdminResponse(payload, ...args) {
    return original.call(this, standardizeModuleChrome(payload, interaction, moduleKey), ...args);
  };
  return () => { interaction[methodName] = original; };
}

function wrapHandler(target, methodName, moduleKey = null) {
  const original = target?.[methodName];
  if (typeof original !== 'function' || original.__goliathAdminNavigationWrapped) return;
  async function wrapped(interaction, ...args) {
    const resolvedKey = moduleKey || moduleKeyFromCustomId(interaction?.customId);
    const restores = ['reply', 'update', 'editReply', 'followUp']
      .map((method) => wrapInteractionMethod(interaction, method, resolvedKey))
      .filter(Boolean);
    try { return await original.call(this, interaction, ...args); }
    finally { for (const restore of restores.reverse()) restore(); }
  }
  wrapped.__goliathAdminNavigationWrapped = true;
  target[methodName] = wrapped;
}

function installRegistry(moduleAdminPanels) {
  if (!Array.isArray(moduleAdminPanels?.SERVER_MODULES)) return;
  moduleAdminPanels.SERVER_MODULES.splice(0, moduleAdminPanels.SERVER_MODULES.length, ...FULL_SERVER_MODULES.map((entry) => [...entry]));
}

function installModuleListHandler(moduleAdminPanels) {
  const original = moduleAdminPanels?.handleModuleAdminInteraction;
  if (typeof original !== 'function' || original.__goliathCanonicalModuleListWrapped) return;
  const adminPanel = safeRequire('./adminPanel');
  async function wrapped(interaction, ...args) {
    if (await handleConfigInteraction(interaction, moduleAdminPanels)) return true;
    const customId = String(interaction?.customId || '');
    if (customId === 'admin:modules:back') {
      const payload = adminPanel?.buildAdminPanel?.(interaction.guild, memberDisplayName(interaction));
      if (!payload) return false;
      await safeUpdate(interaction, payload);
      return true;
    }
    if (customId === 'admin:modules' || /^admin:modules:page:\d+$/.test(customId)) {
      const pageMatch = customId.match(/^admin:modules:page:(\d+)$/);
      await safeUpdate(interaction, buildModuleListPanel(pageMatch ? Number(pageMatch[1]) : 0, memberDisplayName(interaction)));
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
    [safeRequire('./moduleAdminPanels'), 'handleModuleAdminInteraction', null],
    [safeRequire('../../../modules/embed/embedPanel'), 'handleInteraction', 'embed'],
    [safeRequire('../../../modules/stats/statsPanel'), 'handleStatsAdminInteraction', 'stats'],
    [safeRequire('../../../modules/suggestions/suggestionsAdminPanel'), 'handleSuggestionsAdminInteraction', 'suggestions'],
    [safeRequire('../../../modules/giveaways/giveawaysAdminPanel'), 'handleGiveawaysAdminInteraction', 'giveaways'],
    [safeRequire('../../../modules/forms/formsAdminPanel'), 'handleFormsAdminInteraction', 'forms'],
    [safeRequire('../../../modules/polls/pollsPanel'), 'handlePollsAdminInteraction', 'polls'],
    [safeRequire('../../../modules/starboard/starboardAdminPanel'), 'handleStarboardAdminInteraction', 'starboard'],
    [safeRequire('../../../modules/sticky/stickyAdminPanel'), 'handleStickyAdminInteraction', 'sticky'],
    [safeRequire('../../../modules/leveling/levelingAdminPanel'), 'handleLevelingAdminInteraction', 'leveling'],
    [safeRequire('../../../modules/social/socialPanel'), 'handleSocialAdminInteraction', 'social'],
    [safeRequire('../../../modules/verification/verificationPanel'), 'handleVerificationAdminInteraction', 'verification'],
    [safeRequire('../../../modules/autoroles/autorolesPanel'), 'handleAutoRolesInteraction', 'autoRoles'],
    [safeRequire('../../../modules/timedroles/timedRolesPanel'), 'handleTimedRolesInteraction', 'timedRoles'],
    [safeRequire('../../../modules/welcome/welcomePanel'), 'handleWelcomeInteraction', 'welcome'],
    [safeRequire('../../../modules/goodbye/goodbyePanel'), 'handleGoodbyeInteraction', 'goodbye'],
  ];
  for (const [target, method, moduleKey] of targets) wrapHandler(target, method, moduleKey);

  const invites = safeRequire('../../../modules/invites/invitesAdminPanel');
  if (invites && typeof invites.buildInviteStudioPayload === 'function' && !invites.buildInviteStudioPayload.__goliathAdminNavigationWrapped) {
    const original = invites.buildInviteStudioPayload;
    const wrapped = function buildInviteStudioPayloadWithNavigation(interaction, ...args) {
      return standardizeModuleChrome(original.call(this, interaction, ...args), interaction, 'invites');
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
  standardizeModuleChrome,
  install,
};
