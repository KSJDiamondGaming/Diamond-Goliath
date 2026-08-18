'use strict';

const { Events, MessageFlags } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const privateRooms = require('../../modules/utilityStudio/privateRooms/privateRooms');
const panel = require('../../modules/utilityStudio/privateRooms/privateRoomsPanel');

function componentId(component) {
  return component?.customId || component?.custom_id || component?.data?.custom_id || null;
}

async function appendNavigationButton(interaction, customId, label, emoji = '🔒') {
  let message = null;
  if (typeof interaction.fetchReply === 'function') message = await interaction.fetchReply().catch(() => null);
  if (!message && interaction.message?.id && interaction.channel?.messages?.fetch) {
    message = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
  }
  if (!message) return false;

  const rows = (message.components || []).map((actionRow) => actionRow.toJSON());
  if (rows.some((actionRow) => (actionRow.components || []).some((component) => componentId(component) === customId))) return true;
  const component = { type: 2, style: 2, custom_id: customId, label, emoji: { name: emoji } };
  let target = rows.find((actionRow) => actionRow.type === 1 && (actionRow.components || []).length < 5 && !(actionRow.components || []).some((item) => item.type === 3 || item.type === 5 || item.type === 6 || item.type === 7 || item.type === 8));
  if (!target && rows.length < 5) {
    target = { type: 1, components: [] };
    rows.push(target);
  }
  if (!target) return false;
  target.components.push(component);

  if ((interaction.deferred || interaction.replied) && typeof interaction.editReply === 'function') {
    await interaction.editReply({ components: rows }).catch(() => null);
    return true;
  }
  if (message.editable) {
    await message.edit({ components: rows }).catch(() => null);
    return true;
  }
  return false;
}

async function safeError(interaction, error) {
  const content = `❌ Private Rooms action failed: ${String(error?.message || error || 'Unknown error').slice(0, 500)}`;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch {}
}

async function disabledReply(interaction) {
  const content = '❌ Private Rooms is currently disabled for this server.';
  if (interaction.deferred || interaction.replied) return interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
  return interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
}

function startsNewRoomFlow(id) {
  return id === 'user:privateRooms:request'
    || id === 'privateRooms:staff:create'
    || id.startsWith('privateRooms:wizard:');
}

module.exports = [
  {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
      await privateRooms.startup(client);
    },
  },
  {
    name: Events.InteractionCreate,
    async execute(interaction) {
      if (!interaction?.guildId || !interaction.customId) return;
      const id = String(interaction.customId);
      try {
        // These navigation interactions are handled by the canonical panels first.
        // This late-loading bridge appends Private Rooms without widening those central routers.
        if (id === 'admin:studio:utilityStudio') {
          await appendNavigationButton(interaction, 'admin:privateRooms', 'Private Rooms');
          return;
        }
        if (id === 'user:category:utility') {
          await appendNavigationButton(interaction, 'privateRooms:user:open', 'Private Rooms');
          return;
        }
        if ((id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) && id.split(':')[2] === 'tools') {
          await appendNavigationButton(interaction, 'privateRooms:mod:open', 'Private Rooms');
          return;
        }
        if (id === 'privateRooms:user:open') {
          await interaction.update(panel.buildUserPanel(interaction));
          return;
        }
        if (id.startsWith('admin:privateRooms')) {
          await panel.handleAdminInteraction(interaction);
          return;
        }
        if (id === 'user:module:privateRooms' || id.startsWith('user:privateRooms:')) {
          if (!guildManager.isModuleEnabled(interaction.guildId, privateRooms.SECTION) && id === 'user:privateRooms:request') {
            await disabledReply(interaction);
            return;
          }
          await panel.handleUserInteraction(interaction);
          return;
        }
        if (id.startsWith('privateRooms:')) {
          if (!guildManager.isModuleEnabled(interaction.guildId, privateRooms.SECTION) && startsNewRoomFlow(id)) {
            await disabledReply(interaction);
            return;
          }
          await panel.handleInteraction(interaction);
        }
      } catch (error) {
        console.error('[PrivateRooms] Interaction failed:', error);
        await safeError(interaction, error);
      }
    },
  },
];
