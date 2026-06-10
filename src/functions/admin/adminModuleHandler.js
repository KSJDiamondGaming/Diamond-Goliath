'use strict';

// src/functions/admin/adminModuleHandler.js

const { MessageFlags } = require('discord.js');

function isAdminModuleInteraction(interaction) {
  const customId = interaction?.customId || '';

  return (
    [
      'admin:giveaways',
      'admin:starboard',
      'admin:tempvoice',
      'admin:sticky',
      'admin:suggestions',
      'admin:back',
      'giveaway:create',
      'giveaway:refresh',
      'starboard:configure',
      'starboard:refresh',
      'tempvoice:create',
      'tempvoice:refresh',
      'suggestions:refresh',
      'suggestions:pending',
      'suggestions:back',
    ].includes(customId) ||
    customId.startsWith('sticky:')
  );
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

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function buildNotReadyPayload(title, description) {
  return {
    content: [
      `⚠️ **${title}**`,
      description,
      '',
      'The backend is loaded. The full setup flow will be wired next.',
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  };
}

function buildModulesPayload(interaction) {
  const adminPanel = require('./adminPanel');
  return adminPanel.buildModulesPanel(
    interaction.guild,
    getMemberDisplayName(interaction)
  );
}

function buildGiveawaysPayload(interaction) {
  const giveawayMenu = require('../../modules/giveaways/giveawayMenu');

  return {
    embeds: [giveawayMenu.buildGiveawayMenuEmbed(interaction.guildId)],
    components: giveawayMenu.buildGiveawayMenuRows(),
  };
}

function buildStarboardPayload(interaction) {
  const starboardMenu = require('../../modules/starboard/starboardMenu');

  return {
    embeds: [starboardMenu.buildStarboardEmbed(interaction.guildId)],
    components: starboardMenu.buildStarboardMenuRows(),
  };
}

function buildTempVoicePayload(interaction) {
  const tempVoiceMenu = require('../../modules/tempvoice/tempVoiceMenu');

  return {
    embeds: [tempVoiceMenu.buildTempVoiceEmbed(interaction.guildId)],
    components: tempVoiceMenu.buildTempVoiceMenuRows(),
  };
}

function buildStickyPayload(interaction, client) {
  const stickyMenu = require('../../modules/sticky/stickyMenu');

  return {
    embeds: [stickyMenu.buildStickyStatusEmbed(interaction.guildId, interaction.channelId, client)],
    components: stickyMenu.buildStickyMenuRows(interaction.channelId),
  };
}

function buildSuggestionsPayload(interaction, client, options = {}) {
  const suggestionMenu = require('../../modules/suggestions/suggestionMenu');

  return {
    embeds: [suggestionMenu.buildSuggestionListEmbed(interaction.guildId, client, options)],
    components: suggestionMenu.buildSuggestionMenuRows(),
  };
}

async function getChannel(interaction, channelId) {
  return interaction.guild?.channels?.cache?.get(channelId) ||
    await interaction.guild?.channels?.fetch(channelId).catch(() => null);
}

async function handleStickyAction(interaction, client) {
  const [, action, channelId] = String(interaction.customId || '').split(':');
  const channel = await getChannel(interaction, channelId || interaction.channelId);

  if (!channel) {
    return updateOrReply(interaction, {
      content: '❌ Could not find that channel.',
      flags: MessageFlags.Ephemeral,
    }).then(() => true);
  }

  const stickyManager = require('../../modules/sticky/stickyManager');
  const stickyStore = require('../../modules/sticky/stickyStore');
  const actor = getMemberDisplayName(interaction);

  if (action === 'repost') {
    const sticky = stickyStore.getChannelSticky(interaction.guildId, channel.id, client);

    if (!sticky) {
      return updateOrReply(interaction, {
        content: '❌ No sticky message is configured for this channel.',
        flags: MessageFlags.Ephemeral,
      }).then(() => true);
    }

    await stickyManager.repostSticky(channel, sticky, client, {
      actor,
      actorId: interaction.user.id,
      actorTag: interaction.user.tag,
      manual: true,
    });
  }

  if (action === 'pause') {
    await stickyManager.pauseSticky(channel, client, actor);
  }

  if (action === 'resume') {
    await stickyManager.resumeSticky(channel, client, actor);
  }

  if (action === 'delete') {
    await stickyManager.removeSticky(channel, client, actor);
  }

  return updateOrReply(interaction, buildStickyPayload(interaction, client)).then(() => true);
}

async function handleAdminModuleInteraction(interaction, client) {
  if (!interaction?.guildId || !isAdminModuleInteraction(interaction)) {
    return false;
  }

  if (interaction.customId === 'admin:back' || interaction.customId === 'suggestions:back') {
    return updateOrReply(interaction, buildModulesPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'admin:giveaways' || interaction.customId === 'giveaway:refresh') {
    return updateOrReply(interaction, buildGiveawaysPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'giveaway:create') {
    return updateOrReply(
      interaction,
      buildNotReadyPayload('Create Giveaway', 'Giveaway creation controls are not connected to a modal yet.')
    ).then(() => true);
  }

  if (interaction.customId === 'admin:starboard' || interaction.customId === 'starboard:refresh') {
    return updateOrReply(interaction, buildStarboardPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'starboard:configure') {
    return updateOrReply(
      interaction,
      buildNotReadyPayload('Configure Starboard', 'Starboard configuration controls are not connected to a setup modal yet.')
    ).then(() => true);
  }

  if (interaction.customId === 'admin:tempvoice' || interaction.customId === 'tempvoice:refresh') {
    return updateOrReply(interaction, buildTempVoicePayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'tempvoice:create') {
    return updateOrReply(
      interaction,
      buildNotReadyPayload('Create Temp Voice Hub', 'Temp Voice hub creation controls are not connected to a setup modal yet.')
    ).then(() => true);
  }

  if (interaction.customId === 'admin:sticky') {
    return updateOrReply(interaction, buildStickyPayload(interaction, client)).then(() => true);
  }

  if (interaction.customId?.startsWith('sticky:')) {
    return handleStickyAction(interaction, client);
  }

  if (interaction.customId === 'admin:suggestions' || interaction.customId === 'suggestions:refresh') {
    return updateOrReply(interaction, buildSuggestionsPayload(interaction, client)).then(() => true);
  }

  if (interaction.customId === 'suggestions:pending') {
    return updateOrReply(
      interaction,
      buildSuggestionsPayload(interaction, client, { status: 'pending' })
    ).then(() => true);
  }

  return false;
}

module.exports = {
  isAdminModuleInteraction,
  handleAdminModuleInteraction,
};
