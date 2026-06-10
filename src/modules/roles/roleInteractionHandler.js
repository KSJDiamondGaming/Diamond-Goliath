'use strict';

// src/modules/roles/roleInteractionHandler.js

const { MessageFlags } = require('discord.js');

const roleManager = require('./roleManager');
const roleMenu = require('./roleMenu');

function alreadyHandled(interaction) {
  return interaction.deferred || interaction.replied;
}

function ephemeralPayload(payload = {}) {
  return {
    ...payload,
    flags: MessageFlags.Ephemeral,
  };
}

async function safeReply(interaction, payload = {}) {
  try {
    if (alreadyHandled(interaction)) {
      return interaction.followUp(payload).catch(() => null);
    }

    return interaction.reply(payload).catch(() => null);
  } catch {
    return null;
  }
}

async function safeUpdateOrReply(interaction, payload = {}) {
  try {
    if (typeof interaction.update === 'function' && !alreadyHandled(interaction)) {
      return interaction.update(payload).catch(() => null);
    }

    if (alreadyHandled(interaction)) {
      return interaction.editReply(payload).catch(() => null);
    }

    return interaction.reply(ephemeralPayload(payload)).catch(() => null);
  } catch {
    return null;
  }
}

function isRoleInteraction(interaction) {
  const customId = interaction?.customId || '';

  return (
    customId.startsWith(`${roleManager.CUSTOM_ID_PREFIX}:`) ||
    customId.startsWith('role_menu:')
  );
}

async function handleToggle(interaction) {
  const parsed = roleManager.parseToggleCustomId(interaction.customId);

  if (!parsed) {
    return false;
  }

  const result = await roleManager.applyRoleToggle(
    interaction,
    parsed.panelId,
    parsed.roleKey
  );

  return safeReply(
    interaction,
    ephemeralPayload({
      content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
    })
  );
}

async function handleMenu(interaction) {
  const customId = interaction.customId || '';

  if (customId === 'role_menu:home') {
    return safeUpdateOrReply(interaction, roleMenu.buildRoleMenuPayload(interaction.guildId));
  }

  if (customId === 'role_menu:panels') {
    return safeUpdateOrReply(interaction, roleMenu.buildPanelsPayload(interaction.guildId));
  }

  if (customId === 'role_menu:timed') {
    return safeUpdateOrReply(interaction, roleMenu.buildTimedRolesPayload(interaction.guildId));
  }

  if (customId === 'role_menu:settings') {
    return safeUpdateOrReply(interaction, roleMenu.buildSettingsPayload(interaction.guildId));
  }

  return false;
}

async function handleRoleInteraction(interaction) {
  try {
    if (!interaction?.guildId || !interaction?.customId) {
      return false;
    }

    if (!isRoleInteraction(interaction)) {
      return false;
    }

    if (interaction.isButton?.() && interaction.customId.startsWith(`${roleManager.CUSTOM_ID_PREFIX}:`)) {
      return handleToggle(interaction);
    }

    if (interaction.isButton?.() && interaction.customId.startsWith('role_menu:')) {
      return handleMenu(interaction);
    }

    return false;
  } catch (error) {
    console.error('[RoleInteractionHandler] Failed:', error);

    await safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Role interaction failed. Check VPS logs for details.',
      })
    );

    return true;
  }
}

module.exports = {
  isRoleInteraction,
  handleRoleInteraction,
};
