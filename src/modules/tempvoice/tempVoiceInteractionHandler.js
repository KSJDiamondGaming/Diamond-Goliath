'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const tempVoiceStore = require('./tempVoiceStore');
const tempVoiceManager = require('./tempVoiceManager');

const PREFIX = 'tempvoice:';

function isTempVoiceCustomId(customId = '') {
  return String(customId || '').startsWith(PREFIX);
}

function buildControlRows(channelId, tempChannel = {}) {
  const locked = tempChannel.locked === true;
  const hidden = tempChannel.hidden === true;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}claim:${channelId}`).setLabel('Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PREFIX}lock:${channelId}`).setLabel(locked ? 'Unlock' : 'Lock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PREFIX}hide:${channelId}`).setLabel(hidden ? 'Show' : 'Hide').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PREFIX}limit:${channelId}:0`).setLabel('No Limit').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}limit:${channelId}:2`).setLabel('Limit 2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PREFIX}limit:${channelId}:5`).setLabel('Limit 5').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PREFIX}limit:${channelId}:10`).setLabel('Limit 10').setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function buildPanelContent(tempChannel = {}) {
  return [
    '🎙️ **Temp Voice Controls**',
    `Owner: <@${tempChannel.ownerId}>`,
    `State: ${tempChannel.locked ? 'Locked' : 'Unlocked'} · ${tempChannel.hidden ? 'Hidden' : 'Visible'} · Limit: ${tempChannel.userLimit || 'None'}`,
    '',
    'Use these buttons to manage this temporary voice channel.',
  ].join('\n');
}

async function refreshControlMessage(interaction, tempChannel) {
  if (!interaction.message?.editable) return;
  await interaction.message.edit({
    content: buildPanelContent(tempChannel),
    components: buildControlRows(tempChannel.channelId, tempChannel),
  }).catch(() => null);
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function handleTempVoiceInteraction(interaction) {
  if (!interaction?.isButton?.() || !isTempVoiceCustomId(interaction.customId)) return false;

  const [, action, channelId, value] = String(interaction.customId).split(':');
  const guild = interaction.guild;
  const actorId = interaction.user?.id;

  if (!guild?.id || !channelId || !actorId) {
    await replyEphemeral(interaction, '❌ Temp Voice context was not available.');
    return true;
  }

  let tempChannel = tempVoiceStore.getTempChannel(guild.id, channelId);
  if (!tempChannel) {
    await replyEphemeral(interaction, '❌ This temporary voice channel is no longer tracked.');
    return true;
  }

  if (action === 'claim') {
    tempChannel = await tempVoiceManager.claimTempChannel(guild, channelId, actorId);
    await refreshControlMessage(interaction, tempChannel);
    await replyEphemeral(interaction, '✅ Channel ownership claimed.');
    return true;
  }

  if (action === 'lock') {
    tempChannel = await tempVoiceManager.updateTempChannelControls(guild, channelId, actorId, { locked: !tempChannel.locked });
    await refreshControlMessage(interaction, tempChannel);
    await replyEphemeral(interaction, tempChannel.locked ? '✅ Channel locked.' : '✅ Channel unlocked.');
    return true;
  }

  if (action === 'hide') {
    tempChannel = await tempVoiceManager.updateTempChannelControls(guild, channelId, actorId, { hidden: !tempChannel.hidden });
    await refreshControlMessage(interaction, tempChannel);
    await replyEphemeral(interaction, tempChannel.hidden ? '✅ Channel hidden.' : '✅ Channel visible.');
    return true;
  }

  if (action === 'limit') {
    const userLimit = Math.max(0, Math.min(99, Number(value || 0)));
    tempChannel = await tempVoiceManager.updateTempChannelControls(guild, channelId, actorId, { userLimit });
    await refreshControlMessage(interaction, tempChannel);
    await replyEphemeral(interaction, userLimit ? `✅ User limit set to ${userLimit}.` : '✅ User limit removed.');
    return true;
  }

  await replyEphemeral(interaction, '❌ Unknown Temp Voice action.');
  return true;
}

module.exports = {
  PREFIX,
  isTempVoiceCustomId,
  buildControlRows,
  buildPanelContent,
  handleTempVoiceInteraction,
};
