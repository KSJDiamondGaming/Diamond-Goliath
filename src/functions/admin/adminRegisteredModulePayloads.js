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

module.exports = {
  requireModuleMenu,
  buildVerificationPayload,
  buildAutoRolesPayload,
};
