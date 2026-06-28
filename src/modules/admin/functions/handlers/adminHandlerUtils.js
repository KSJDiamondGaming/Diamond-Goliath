'use strict';

const {
  ActionRowBuilder,
  MessageFlags,
  TextInputBuilder,
} = require('discord.js');

function isExpiredInteraction(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function updateOrReply(interaction, payload) {
  const finalPayload = {
    ...payload,
    flags: payload.flags || MessageFlags.Ephemeral,
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(finalPayload);
      return true;
    }

    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      await interaction.update(payload);
      return true;
    }

    await interaction.reply(finalPayload);
    return true;
  } catch (error) {
    if (isExpiredInteraction(error)) return false;

    try {
      await interaction.reply(finalPayload);
      return true;
    } catch (replyError) {
      if (isExpiredInteraction(replyError)) return false;
      throw replyError;
    }
  }
}

async function showModalSafe(interaction, modal) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    if (isExpiredInteraction(error)) {
      console.warn(`⚠️ Modal interaction expired: ${interaction.customId}`);
      return true;
    }

    throw error;
  }
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<#>@!&]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function numberOr(value, fallback, min = 1, max = 999) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function modalInput(id, label, style, options = {}) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(options.required !== false)
      .setPlaceholder(options.placeholder || '')
      .setValue(options.value || '')
      .setMaxLength(options.maxLength || (style === 2 ? 1000 : 100))
  );
}

function getModalValue(interaction, id, fallback = '') {
  return interaction.fields?.getTextInputValue(id)?.trim() || fallback;
}

async function getChannel(interaction, channelId) {
  return interaction.guild?.channels?.cache?.get(channelId) ||
    await interaction.guild?.channels?.fetch(channelId).catch(() => null);
}

module.exports = {
  cleanDiscordId,
  getChannel,
  getMemberDisplayName,
  getModalValue,
  isExpiredInteraction,
  modalInput,
  numberOr,
  showModalSafe,
  updateOrReply,
};
