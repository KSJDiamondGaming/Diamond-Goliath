'use strict';

const { ChannelType, ModalBuilder, TextInputStyle, MessageFlags } = require('discord.js');

const {
  cleanDiscordId,
  getChannel,
  getModalValue,
  modalInput,
  numberOr,
  showModalSafe,
  updateOrReply,
} = require('./adminHandlerUtils');

const {
  buildTempVoicePayload,
} = require('../adminRegisteredModulePayloads');

function buildTempVoiceCreateModal(channelId) {
  return new ModalBuilder()
    .setCustomId('tempvoice:createModal')
    .setTitle('Configure Temp Voice Hub')
    .addComponents(
      modalInput('joinChannelId', 'Join voice channel ID / mention', TextInputStyle.Short, {
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

async function handleTempVoiceCreateButton(interaction) {
  return showModalSafe(interaction, buildTempVoiceCreateModal(interaction.channelId));
}

async function handleTempVoiceCreateModal(interaction) {
  const tempVoiceManager = require('../../../modules/tempvoice/tempVoiceManager');
  const joinChannelId = cleanDiscordId(getModalValue(interaction, 'joinChannelId'));

  if (!joinChannelId) {
    await updateOrReply(interaction, {
      content: '❌ Please provide a valid voice channel ID or mention.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const joinChannel = await getChannel(interaction, joinChannelId);

  if (!joinChannel || joinChannel.type !== ChannelType.GuildVoice) {
    await updateOrReply(interaction, {
      content: '❌ Temp Voice needs a real voice channel, not a text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  tempVoiceManager.createHub(interaction.guildId, {
    joinChannelId,
    categoryId: cleanDiscordId(getModalValue(interaction, 'categoryId')),
    nameTemplate: getModalValue(interaction, 'nameTemplate', "{username}'s Channel"),
    userLimit: numberOr(getModalValue(interaction, 'userLimit'), 0, 0, 99),
    createdBy: interaction.user.id,
  });

  await updateOrReply(interaction, buildTempVoicePayload(interaction));
  return true;
}

module.exports = {
  buildTempVoiceCreateModal,
  handleTempVoiceCreateButton,
  handleTempVoiceCreateModal,
};
