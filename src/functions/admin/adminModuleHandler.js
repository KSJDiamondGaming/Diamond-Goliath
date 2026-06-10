'use strict';

// src/functions/admin/adminModuleHandler.js

const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

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
      'giveaway:createModal',
      'starboard:configure',
      'starboard:refresh',
      'starboard:configureModal',
      'tempvoice:create',
      'tempvoice:refresh',
      'tempvoice:createModal',
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
      .setMaxLength(options.maxLength || (style === TextInputStyle.Paragraph ? 1000 : 100))
  );
}

function getModalValue(interaction, id, fallback = '') {
  return interaction.fields?.getTextInputValue(id)?.trim() || fallback;
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

function buildGiveawayCreateModal(channelId) {
  return new ModalBuilder()
    .setCustomId('giveaway:createModal')
    .setTitle('Create Giveaway')
    .addComponents(
      modalInput('prize', 'Prize', TextInputStyle.Short, {
        placeholder: 'Nitro, game key, VIP role...',
        maxLength: 100,
      }),
      modalInput('duration', 'Duration', TextInputStyle.Short, {
        placeholder: '10m, 2h, 1d',
        value: '1h',
        maxLength: 20,
      }),
      modalInput('winnerCount', 'Winners', TextInputStyle.Short, {
        placeholder: '1',
        value: '1',
        maxLength: 3,
      }),
      modalInput('channelId', 'Channel ID / mention', TextInputStyle.Short, {
        placeholder: 'Leave as current channel or paste channel ID',
        value: channelId || '',
        required: false,
        maxLength: 40,
      }),
      modalInput('description', 'Description', TextInputStyle.Paragraph, {
        placeholder: 'React with 🎉 to enter.',
        required: false,
        maxLength: 800,
      })
    );
}

function buildStarboardConfigModal() {
  return new ModalBuilder()
    .setCustomId('starboard:configureModal')
    .setTitle('Configure Starboard')
    .addComponents(
      modalInput('channelId', 'Starboard channel ID / mention', TextInputStyle.Short, {
        placeholder: '#starboard or channel ID',
        maxLength: 40,
      }),
      modalInput('threshold', 'Star threshold', TextInputStyle.Short, {
        placeholder: '3',
        value: '3',
        maxLength: 3,
      }),
      modalInput('emoji', 'Emoji', TextInputStyle.Short, {
        placeholder: '⭐',
        value: '⭐',
        required: false,
        maxLength: 40,
      })
    );
}

function buildTempVoiceCreateModal(channelId) {
  return new ModalBuilder()
    .setCustomId('tempvoice:createModal')
    .setTitle('Create Temp Voice Hub')
    .addComponents(
      modalInput('joinChannelId', 'Join channel ID / mention', TextInputStyle.Short, {
        placeholder: 'Voice channel users join to create rooms',
        value: channelId || '',
        maxLength: 40,
      }),
      modalInput('categoryId', 'Category ID / mention', TextInputStyle.Short, {
        placeholder: 'Optional category for created rooms',
        required: false,
        maxLength: 40,
      }),
      modalInput('nameTemplate', 'Room name template', TextInputStyle.Short, {
        placeholder: "{username}'s Channel",
        value: "{username}'s Channel",
        maxLength: 80,
      }),
      modalInput('userLimit', 'User limit', TextInputStyle.Short, {
        placeholder: '0 = unlimited',
        value: '0',
        maxLength: 3,
      })
    );
}

async function getChannel(interaction, channelId) {
  return interaction.guild?.channels?.cache?.get(channelId) ||
    await interaction.guild?.channels?.fetch(channelId).catch(() => null);
}

async function handleGiveawayCreateModal(interaction) {
  const giveawayManager = require('../../modules/giveaways/giveawayManager');
  const channelId = cleanDiscordId(getModalValue(interaction, 'channelId')) || interaction.channelId;
  const channel = await getChannel(interaction, channelId);

  if (!channel?.send) {
    return updateOrReply(interaction, {
      content: '❌ Could not find a text channel for the giveaway.',
      flags: MessageFlags.Ephemeral,
    }).then(() => true);
  }

  const giveaway = await giveawayManager.createGiveaway(channel, {
    prize: getModalValue(interaction, 'prize', 'Giveaway Prize'),
    duration: getModalValue(interaction, 'duration', '1h'),
    winnerCount: numberOr(getModalValue(interaction, 'winnerCount'), 1, 1, 25),
    description: getModalValue(interaction, 'description', 'React with 🎉 to enter.'),
    hostId: interaction.user.id,
  });

  return updateOrReply(interaction, {
    content: giveaway
      ? `✅ Giveaway created in <#${channel.id}>.`
      : '❌ Giveaway could not be created.',
    flags: MessageFlags.Ephemeral,
  }).then(() => true);
}

async function handleStarboardConfigModal(interaction) {
  const starboardManager = require('../../modules/starboard/starboardManager');
  const channelId = cleanDiscordId(getModalValue(interaction, 'channelId'));

  if (!channelId) {
    return updateOrReply(interaction, {
      content: '❌ Please provide a valid starboard channel ID or mention.',
      flags: MessageFlags.Ephemeral,
    }).then(() => true);
  }

  starboardManager.configureStarboard(interaction.guildId, {
    enabled: true,
    channelId,
    threshold: numberOr(getModalValue(interaction, 'threshold'), 3, 1, 50),
    emoji: getModalValue(interaction, 'emoji', '⭐'),
  });

  return updateOrReply(interaction, buildStarboardPayload(interaction)).then(() => true);
}

async function handleTempVoiceCreateModal(interaction) {
  const tempVoiceManager = require('../../modules/tempvoice/tempVoiceManager');
  const joinChannelId = cleanDiscordId(getModalValue(interaction, 'joinChannelId'));

  if (!joinChannelId) {
    return updateOrReply(interaction, {
      content: '❌ Please provide a valid voice channel ID or mention.',
      flags: MessageFlags.Ephemeral,
    }).then(() => true);
  }

  tempVoiceManager.createHub(interaction.guildId, {
    joinChannelId,
    categoryId: cleanDiscordId(getModalValue(interaction, 'categoryId')),
    nameTemplate: getModalValue(interaction, 'nameTemplate', "{username}'s Channel"),
    userLimit: numberOr(getModalValue(interaction, 'userLimit'), 0, 0, 99),
    createdBy: interaction.user.id,
  });

  return updateOrReply(interaction, buildTempVoicePayload(interaction)).then(() => true);
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

  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'giveaway:createModal') return handleGiveawayCreateModal(interaction);
    if (interaction.customId === 'starboard:configureModal') return handleStarboardConfigModal(interaction);
    if (interaction.customId === 'tempvoice:createModal') return handleTempVoiceCreateModal(interaction);
  }

  if (interaction.customId === 'admin:back' || interaction.customId === 'suggestions:back') {
    return updateOrReply(interaction, buildModulesPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'admin:giveaways' || interaction.customId === 'giveaway:refresh') {
    return updateOrReply(interaction, buildGiveawaysPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'giveaway:create') {
    await interaction.showModal(buildGiveawayCreateModal(interaction.channelId));
    return true;
  }

  if (interaction.customId === 'admin:starboard' || interaction.customId === 'starboard:refresh') {
    return updateOrReply(interaction, buildStarboardPayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'starboard:configure') {
    await interaction.showModal(buildStarboardConfigModal());
    return true;
  }

  if (interaction.customId === 'admin:tempvoice' || interaction.customId === 'tempvoice:refresh') {
    return updateOrReply(interaction, buildTempVoicePayload(interaction)).then(() => true);
  }

  if (interaction.customId === 'tempvoice:create') {
    await interaction.showModal(buildTempVoiceCreateModal(interaction.channelId));
    return true;
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
