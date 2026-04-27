const { ButtonBuilder, ButtonStyle } = require('discord.js');

// 🔘 Generic Button Creator
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

// 🔥 Danger Button
function dangerButton(id, label, emoji = '🔨', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Danger,
    emoji,
    disabled
  });
}

// ✅ Success Button
function successButton(id, label, emoji = '✅', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Success,
    emoji,
    disabled
  });
}

// ⚪ Secondary Button
function secondaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Secondary,
    emoji,
    disabled
  });
}

// 🔵 Primary Button
function primaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Primary,
    emoji,
    disabled
  });
}

module.exports = {
  createButton,
  dangerButton,
  successButton,
  secondaryButton,
  primaryButton
};