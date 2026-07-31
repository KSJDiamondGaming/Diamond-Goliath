// functions/moderation/modPanel.js

const Discord = require('discord.js');

const {
  buildDashboardPayload,
  refreshDashboard,
} = require('./dashboardService');
const { handleModInteraction } = require('./modInteractions');
const { hasModPermission } = require('./permissions');

const panelNav = require('../../../core/ui/panelNavigation');

const DEFAULT_VIEW = 'overview';

function canOpenModPanel(interaction) {
  return Boolean(
    interaction?.guild &&
    interaction?.member &&
    hasModPermission(interaction.member)
  );
}

function noAccessPayload() {
  return {
    content: '❌ You do not have permission to use the moderation panel.',
    flags: 64,
  };
}

function createModState(view = DEFAULT_VIEW) {
  return panelNav.createState(`mod:${view}`);
}

function pushModView(navState, view = DEFAULT_VIEW) {
  return panelNav.push(
    navState || panelNav.createState('mod:overview'),
    `mod:${view}`
  );
}

function getViewFromState(navState) {
  const current = panelNav.current(
    navState || panelNav.createState('mod:overview')
  );

  if (!current || !current.startsWith('mod:')) {
    return DEFAULT_VIEW;
  }

  return current.replace('mod:', '') || DEFAULT_VIEW;
}

function applyModNavigation(payload) {
  return {
    ...payload,
    components: (payload.components || []).slice(0, 5),
  };
}

async function openModPanel(interaction, options = {}) {
  if (!canOpenModPanel(interaction)) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(noAccessPayload());
    }

    return interaction.reply(noAccessPayload());
  }

  const view = options.view || DEFAULT_VIEW;
  const target = options.target || null;
  const navState = options.navState || createModState(view);

  const payload = await buildDashboardPayload(
    Discord,
    interaction,
    target,
    view,
    {
      actionFilter: options.actionFilter || 'all',
      statusFilter: options.statusFilter || 'all',
      page: options.page || 0,
    }
  );

  const finalPayload = {
    ...applyModNavigation(payload, navState),
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(finalPayload);
  }

  return interaction.reply(finalPayload);
}

async function handleInteraction(interaction, navState = null) {
  return handleModInteraction(interaction, navState);
}

function buildModPanel(guild, memberDisplayName = 'Unknown User', navState = null) {
  return {
    embeds: [
      new Discord.EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔐 Mod Panel')
        .setDescription('Use `/mod` to open the full moderation dashboard.')
        .setFooter({ text: `Requested by ${memberDisplayName}` })
        .setTimestamp(),
    ],
    components: [
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('mod:overview')
          .setLabel('🔐 Open Mod Dashboard')
          .setStyle(Discord.ButtonStyle.Primary),

        new Discord.ButtonBuilder()
          .setCustomId(
            panelNav.buildCustomId(
              navState || panelNav.createState('admin:home'),
              'back'
            )
          )
          .setLabel('⬅️ Back')
          .setStyle(Discord.ButtonStyle.Secondary)
      ),
    ],
  };
}

const handleModPanelInteraction = handleInteraction;
const handleModPanelModal = handleInteraction;
const handleModButton = handleInteraction;
const handleModModal = handleInteraction;

module.exports = {
  openModPanel,
  refreshDashboard,
  handleInteraction,
  buildModPanel,
  handleModPanelInteraction,
  handleModPanelModal,
  handleModButton,
  handleModModal,
  createModState,
  pushModView,
  getViewFromState,
};
