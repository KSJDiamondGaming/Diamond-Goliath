'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const tempVoiceStore = require('./tempVoiceStore');
const { isModuleEnabled } = require('../../guild/guildManager');

function assertTempVoiceModuleEnabled(guildId) {
  if (!isModuleEnabled(guildId, 'tempVoice')) {
    throw new Error('Temp Voice module is disabled for this server.');
  }
}

function safeChannelName(name) {
  return String(name || 'Temp Voice')
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Temp Voice';
}

function buildChannelName(template, member) {
  const username = member?.displayName || member?.user?.username || 'Member';
  return safeChannelName(String(template || '{username}\'s Channel').replaceAll('{username}', username));
}

function canManageVoice(guild) {
  const botMember = guild?.members?.me;
  return Boolean(
    botMember?.permissions?.has(PermissionFlagsBits.ManageChannels) &&
    botMember?.permissions?.has(PermissionFlagsBits.MoveMembers)
  );
}

async function createTempChannel(newState, hub) {
  const guild = newState.guild;
  const member = newState.member;

  if (!guild || !member || !hub?.joinChannelId) return null;
  if (!isModuleEnabled(guild.id, 'tempVoice')) return null;
  if (!canManageVoice(guild)) return null;

  if (member.voice?.channelId !== hub.joinChannelId) return null;

  const parent = hub.categoryId || newState.channel?.parentId || null;

  const channel = await guild.channels.create({
    name: buildChannelName(hub.nameTemplate, member),
    type: ChannelType.GuildVoice,
    parent,
    bitrate: hub.bitrate > 0 ? hub.bitrate : undefined,
    userLimit: hub.userLimit > 0 ? hub.userLimit : undefined,
    reason: `Goliath temp voice created for ${member.user?.tag || member.id}`,
  }).catch(() => null);

  if (!channel) return null;

  tempVoiceStore.saveTempChannel(guild.id, {
    channelId: channel.id,
    ownerId: member.id,
    hubId: hub.hubId || hub.id,
  });

  await member.voice.setChannel(channel, 'Goliath temp voice join-to-create').catch(() => null);

  return channel;
}

async function cleanupTempChannel(oldState) {
  const guild = oldState.guild;
  const oldChannel = oldState.channel;

  if (!guild || !oldChannel) return null;

  const tempChannel = tempVoiceStore.getTempChannel(guild.id, oldChannel.id);
  if (!tempChannel) return null;

  if ((oldChannel.members?.size || 0) > 0) return null;

  tempVoiceStore.deleteTempChannel(guild.id, oldChannel.id);

  if (oldChannel.deletable) {
    await oldChannel.delete('Goliath temp voice empty cleanup').catch(() => null);
  }

  return tempChannel;
}

async function handleVoiceStateUpdate(oldState, newState) {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild?.id) return null;

    if (newState.channelId && newState.channelId !== oldState.channelId) {
      const section = tempVoiceStore.getTempVoiceSection(guild.id);

      if (section.enabled !== false && isModuleEnabled(guild.id, 'tempVoice')) {
        const hub = tempVoiceStore.findHubByJoinChannel(guild.id, newState.channelId);

        if (hub) {
          await createTempChannel(newState, hub);
        }
      }
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await cleanupTempChannel(oldState);
    }

    return true;
  } catch (error) {
    console.error('[TempVoice] voiceStateUpdate failed:', error);
    return false;
  }
}

function createHub(guildId, input = {}) {
  assertTempVoiceModuleEnabled(guildId);

  return tempVoiceStore.saveHub(guildId, {
    joinChannelId: input.joinChannelId,
    categoryId: input.categoryId,
    nameTemplate: input.nameTemplate,
    userLimit: input.userLimit,
    bitrate: input.bitrate,
    createdBy: input.createdBy,
  });
}

function getHubs(guildId) {
  return tempVoiceStore.getHubs(guildId);
}

module.exports = {
  handleVoiceStateUpdate,
  createHub,
  getHubs,
  createTempChannel,
  cleanupTempChannel,
};