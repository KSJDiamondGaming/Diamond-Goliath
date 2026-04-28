const { ButtonBuilder, ButtonStyle } = require('discord.js');

/* ---------------- BASE ---------------- */

function createButton({
  id,
  label,
  style = ButtonStyle.Secondary,
  emoji = null,
  disabled = false
}) {
  const button = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}

/* ---------------- TYPES ---------------- */

function createPrimaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Primary,
    emoji,
    disabled
  });
}

function createSecondaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Secondary,
    emoji,
    disabled
  });
}

function createSuccessButton(id, label, emoji = '✅', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Success,
    emoji,
    disabled
  });
}

function createDangerButton(id, label, emoji = '⚠️', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Danger,
    emoji,
    disabled
  });
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  createButton,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton
};