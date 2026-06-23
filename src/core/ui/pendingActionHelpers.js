const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EMOJIS } = require('./uiConfig');

function buildConfirmRow(confirmId, cancelId = 'mod_cancel_action') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(`${EMOJIS.WARNING} Confirm`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel(`${EMOJIS.ERROR} Cancel`)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function getDefaultDashboardContext() {
  return {
    view: 'overview',
    actionFilter: 'all',
    statusFilter: 'all',
    page: 0
  };
}

function normalizeDashboardContext(context = {}) {
  return {
    view: context.view || 'overview',
    actionFilter: context.actionFilter || 'all',
    statusFilter: context.statusFilter || 'all',
    page: Number.isInteger(context.page)
      ? context.page
      : Number(context.page) || 0
  };
}

function parseConfirmActionContext(customId) {
  const parts = String(customId || '').split(':');

  return {
    token: parts[1] || null,
    context: normalizeDashboardContext({
      view: parts[2] || 'overview',
      actionFilter: parts[3] || 'all',
      statusFilter: parts[4] || 'all',
      page: Number(parts[5]) || 0
    })
  };
}

function buildConfirmCustomId(token, context = {}) {
  const normalized = normalizeDashboardContext(context);

  return [
    'mod_confirm_action',
    token,
    normalized.view,
    normalized.actionFilter,
    normalized.statusFilter,
    normalized.page
  ].join(':');
}

module.exports = {
  buildConfirmRow,
  getDefaultDashboardContext,
  normalizeDashboardContext,
  parseConfirmActionContext,
  buildConfirmCustomId
};
