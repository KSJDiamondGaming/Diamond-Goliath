'use strict';

const { ButtonBuilder, ButtonStyle } = require('discord.js');

const CATEGORY_NAVIGATION = Object.freeze({
  community: { label: '🏘️ Community' },
  feedback: { label: '💬 Feedback' },
  messages: { label: '✉️ Messages' },
  roles: { label: '🎭 Roles' },
  security: { label: '🛡️ Security' },
  social: { label: '📣 Social' },
  utility: { label: '🧰 Utility' },
});

function navigationButton(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function categoryButton(key, customId, style = ButtonStyle.Secondary, disabled = false) {
  const definition = CATEGORY_NAVIGATION[key];
  if (!definition) throw new Error(`Unknown navigation category: ${key}`);
  return navigationButton(customId, definition.label, style, disabled);
}

function backButton(customId, label = '⬅️ Back', style = ButtonStyle.Secondary) {
  return navigationButton(customId, label, style);
}

function homeButton(customId, label, style = ButtonStyle.Secondary) {
  return navigationButton(customId, label, style);
}

function refreshButton(customId, label = '🔄 Refresh', style = ButtonStyle.Success) {
  return navigationButton(customId, label, style);
}

function nextButton(customId, label = '➡️ Next', style = ButtonStyle.Primary) {
  return navigationButton(customId, label, style);
}

function previousButton(customId, label = '⬅️ Previous', style = ButtonStyle.Secondary) {
  return navigationButton(customId, label, style);
}

module.exports = {
  CATEGORY_NAVIGATION,
  navigationButton,
  categoryButton,
  backButton,
  homeButton,
  refreshButton,
  nextButton,
  previousButton,
};
