'use strict';

// src/functions/admin/adminModuleHandler.js

const { MessageFlags } = require('discord.js');

function isAdminModuleInteraction(interaction) {
  const customId = interaction?.customId || '';

  return [
    'admin:giveaways',
    'admin:starboard',
    'admin:tempvoice',
    'admin:sticky',
    'admin:suggestions',
  ].includes(customId);
}

async function updateOrReply(interaction, payload) {
  const finalPayload = {
    ...payload,
    flags: payload.flags || MessageFlags.Ephemeral,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(finalPayload).catch(() => null);
  }

  if (typeof interaction.update === 'function' && interaction.isButton?.()) {
    return interaction.update(payload).catch(() => interaction.reply(finalPayload).catch(() => null));
  }

  return interaction.reply(finalPayload).catch(() => null);
}

async function handleAdminModuleInteraction(interaction, client) {
  if (!interaction?.guildId || !isAdminModuleInteraction(interaction)) {
    return false;
  }

  if (interaction.customId === 'admin:giveaways') {
    const giveawayMenu = require('../../modules/giveaways/giveawayMenu');

    return updateOrReply(interaction, {
      embeds: [giveawayMenu.buildGiveawayMenuEmbed(interaction.guildId)],
      components: giveawayMenu.buildGiveawayMenuRows(),
    }).then(() => true);
  }

  if (interaction.customId === 'admin:starboard') {
    const starboardMenu = require('../../modules/starboard/starboardMenu');

    return updateOrReply(interaction, {
      embeds: [starboardMenu.buildStarboardEmbed(interaction.guildId)],
      components: starboardMenu.buildStarboardMenuRows(),
    }).then(() => true);
  }

  if (interaction.customId === 'admin:tempvoice') {
    const tempVoiceMenu = require('../../modules/tempvoice/tempVoiceMenu');

    return updateOrReply(interaction, {
      embeds: [tempVoiceMenu.buildTempVoiceEmbed(interaction.guildId)],
      components: tempVoiceMenu.buildTempVoiceMenuRows(),
    }).then(() => true);
  }

  if (interaction.customId === 'admin:sticky') {
    const stickyMenu = require('../../modules/sticky/stickyMenu');

    return updateOrReply(interaction, {
      embeds: [stickyMenu.buildStickyStatusEmbed(interaction.guildId, interaction.channelId, client)],
      components: stickyMenu.buildStickyMenuRows(interaction.channelId),
    }).then(() => true);
  }

  if (interaction.customId === 'admin:suggestions') {
    const suggestionMenu = require('../../modules/suggestions/suggestionMenu');

    return updateOrReply(interaction, {
      embeds: [suggestionMenu.buildSuggestionListEmbed(interaction.guildId, client)],
      components: suggestionMenu.buildSuggestionMenuRows(),
    }).then(() => true);
  }

  return false;
}

module.exports = {
  isAdminModuleInteraction,
  handleAdminModuleInteraction,
};
