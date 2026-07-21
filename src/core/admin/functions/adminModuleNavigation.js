'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const WRAPPED = Symbol.for('goliath.adminNavigationWrapped');
const PANEL_COLOR = '#5865F2';
const MODULES_PER_PAGE = 10;
const MODULES_PER_ROW = 4;

function componentData(component) {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}

function customIdOf(component) {
  const data = componentData(component);
  return data?.custom_id || data?.customId || null;
}

function isButtonComponent(component) {
  return componentData(component)?.type === 2;
}

function navigationButton(customId, label) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
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
    components.push(row(...additions));
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

function memberDisplayName(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function buildCanonicalModuleList(serverModules, page, who) {
  const totalPages = Math.max(1, Math.ceil(serverModules.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const pageItems = serverModules.slice(
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
    pageItems.map(([customId, label]) => new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)),
    MODULES_PER_ROW
  ).map((buttons) => row(...buttons));

  const navigation = [navigationButton('admin:modules:back', '⬅️ Back')];
  if (currentPage > 0) {
    navigation.push(navigationButton(`admin:modules:page:${currentPage - 1}`, '◀ Previous'));
  }
  if (currentPage < totalPages - 1) {
    navigation.push(navigationButton(`admin:modules:page:${currentPage + 1}`, 'Next ▶'));
  }
  navigation.push(navigationButton('admin:home', '🏠 Admin Home'));

  return {
    embeds: [embed],
    components: [...moduleRows, row(...navigation)],
  };
}

function installCanonicalModuleList() {
  const moduleAdminPanels = require('./moduleAdminPanels');
  const adminPanel = require('./adminPanel');
  const original = moduleAdminPanels.handleModuleAdminInteraction;
  if (typeof original !== 'function' || original[WRAPPED]) return;

  const wrapped = async function canonicalModuleHandler(interaction, ...args) {
    const customId = String(interaction?.customId || '');

    if (customId === 'admin:modules:back') {
      wrapInteraction(interaction);
      const payload = adminPanel.buildAdminPanel(interaction.guild, memberDisplayName(interaction));
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.update(payload);
      }
      return true;
    }

    if (customId === 'admin:modules' || /^admin:modules:page:\d+$/.test(customId)) {
      wrapInteraction(interaction);
      const pageMatch = customId.match(/^admin:modules:page:(\d+)$/);
      const payload = buildCanonicalModuleList(
        moduleAdminPanels.SERVER_MODULES,
        pageMatch ? Number(pageMatch[1]) : 0,
        memberDisplayName(interaction)
      );
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.update(payload);
      }
      return true;
    }

    wrapInteraction(interaction);
    return original.call(this, interaction, ...args);
  };

  wrapped[WRAPPED] = true;
  moduleAdminPanels.handleModuleAdminInteraction = wrapped;
  moduleAdminPanels.buildModuleListPanel = (page = 0, who = 'Unknown User') =>
    buildCanonicalModuleList(moduleAdminPanels.SERVER_MODULES, page, who);
}

function installAdminModuleNavigation() {
  installCanonicalModuleList();

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
  buildCanonicalModuleList,
  ensureAdminModuleNavigation,
  installAdminModuleNavigation,
  wrapInteraction,
};
