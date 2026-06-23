'use strict';

const { ModalBuilder, TextInputStyle, MessageFlags } = require('discord.js');

const {
  getChannel,
  getMemberDisplayName,
  getModalValue,
  modalInput,
  numberOr,
  showModalSafe,
  updateOrReply,
} = require('./adminHandlerUtils');

const {
  buildStickyPayload,
} = require('../adminRegisteredModulePayloads');

function buildStickySetupModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`sticky:setupModal:${channelId}`)
    .setTitle('Set Sticky Message')
    .addComponents(
      modalInput('content', 'Sticky message', TextInputStyle.Paragraph, {
        placeholder: 'Write the message Goliath should keep at the bottom.',
        maxLength: 1800,
      }),
      modalInput('repostEvery', 'Repost after how many messages?', TextInputStyle.Short, {
        placeholder: '10',
        value: '10',
        maxLength: 3,
      }),
      modalInput('cooldownSeconds', 'Cooldown seconds', TextInputStyle.Short, {
        placeholder: '60',
        value: '60',
        maxLength: 4,
      })
    );
}

async function handleStickySetupModal(interaction, client) {
  const stickyManager = require('../../../modules/sticky/stickyManager');
  const [, , channelId] = String(interaction.customId || '').split(':');
  const channel = await getChannel(interaction, channelId || interaction.channelId);

  if (!channel?.send) {
    await updateOrReply(interaction, {
      content: '❌ Could not find that text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await stickyManager.createSticky(channel, {
    type: 'text',
    content: getModalValue(interaction, 'content'),
    repostEvery: numberOr(getModalValue(interaction, 'repostEvery'), 10, 1, 100),
    cooldownSeconds: numberOr(getModalValue(interaction, 'cooldownSeconds'), 60, 10, 3600),
    updatedBy: interaction.user.id,
    actor: getMemberDisplayName(interaction),
  }, client);

  await updateOrReply(interaction, buildStickyPayload(interaction, client));
  return true;
}

async function handleStickyAction(interaction, client) {
  const [, action, channelId] = String(interaction.customId || '').split(':');
  const channel = await getChannel(interaction, channelId || interaction.channelId);

  if (action === 'setup') {
    return showModalSafe(interaction, buildStickySetupModal(channelId || interaction.channelId));
  }

  if (!channel) {
    await updateOrReply(interaction, {
      content: '❌ Could not find that channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const stickyManager = require('../../../modules/sticky/stickyManager');
  const stickyStore = require('../../../sticky/stickyGuildStore');
  const actor = getMemberDisplayName(interaction);

  if (action === 'repost') {
    const sticky = stickyStore.getChannelSticky(interaction.guildId, channel.id, client);

    if (!sticky) {
      await updateOrReply(interaction, {
        content: '❌ No sticky message is configured for this channel.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await stickyManager.repostSticky(channel, sticky, client, {
      actor,
      actorId: interaction.user.id,
      actorTag: interaction.user.tag,
      manual: true,
    });
  }

  if (action === 'pause') await stickyManager.pauseSticky(channel, client, actor);
  if (action === 'resume') await stickyManager.resumeSticky(channel, client, actor);
  if (action === 'delete') await stickyManager.removeSticky(channel, client, actor);

  await updateOrReply(interaction, buildStickyPayload(interaction, client));
  return true;
}

module.exports = {
  buildStickySetupModal,
  handleStickyAction,
  handleStickySetupModal,
};
