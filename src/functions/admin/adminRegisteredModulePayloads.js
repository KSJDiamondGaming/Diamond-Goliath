'use strict';

// src/functions/admin/adminRegisteredModulePayloads.js

const {
  requireModuleDefinition,
} = require('../../modules/admin/moduleRouter');

function requireModuleMenu(moduleKey) {
  const definition = requireModuleDefinition(moduleKey);

  if (!definition.menu) {
    throw new Error(`Admin module ${moduleKey} does not expose a menu builder.`);
  }

  return definition.menu;
}

function buildVerificationPayload(interaction) {
  const verificationMenu = requireModuleMenu('verification');

  return {
    embeds: [verificationMenu.buildVerificationMenuEmbed(interaction.guildId)],
    components: verificationMenu.buildVerificationMenuRows(),
  };
}

function buildAutoRolesPayload(interaction) {
  const autoRoleMenu = requireModuleMenu('autoRoles');

  return {
    embeds: [autoRoleMenu.buildAutoRolesEmbed(interaction.guildId)],
    components: autoRoleMenu.buildAutoRolesMenuRows(),
  };
}

function buildGiveawaysPayload(interaction) {
  const giveawayMenu = requireModuleMenu('giveaways');

  return {
    embeds: [giveawayMenu.buildGiveawayMenuEmbed(interaction.guildId)],
    components: giveawayMenu.buildGiveawayMenuRows(),
  };
}

function buildStarboardPayload(interaction) {
  const starboardMenu = requireModuleMenu('starboard');

  return {
    embeds: [starboardMenu.buildStarboardEmbed(interaction.guildId)],
    components: starboardMenu.buildStarboardMenuRows(),
  };
}

function buildTempVoicePayload(interaction) {
  const tempVoiceMenu = requireModuleMenu('tempVoice');

  return {
    embeds: [tempVoiceMenu.buildTempVoiceEmbed(interaction.guildId)],
    components: tempVoiceMenu.buildTempVoiceMenuRows(),
  };
}

function buildStickyPayload(interaction, client) {
  const stickyMenu = requireModuleMenu('sticky');

  return {
    embeds: [stickyMenu.buildStickyStatusEmbed(interaction.guildId, interaction.channelId, client)],
    components: stickyMenu.buildStickyMenuRows(interaction.channelId),
  };
}

function buildSuggestionsPayload(interaction, client, options = {}) {
  const suggestionMenu = requireModuleMenu('suggestions');

  return {
    embeds: [suggestionMenu.buildSuggestionListEmbed(interaction.guildId, client, options)],
    components: suggestionMenu.buildSuggestionMenuRows(),
  };
}

module.exports = {
  requireModuleMenu,
  buildVerificationPayload,
  buildAutoRolesPayload,
  buildGiveawaysPayload,
  buildStarboardPayload,
  buildTempVoicePayload,
  buildStickyPayload,
  buildSuggestionsPayload,
};
