'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const tempVoiceStore = require('./tempVoiceStore');
const { isModuleEnabled, setModuleEnabled } = require('../../core/guild/guildManager');

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

function safeStatus(value) {
  return String(value || '')
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function cleanLimit(value, fallback = 0) {
  const number = Number(value);
  return Math.max(0, Math.min(99, Math.floor(Number.isFinite(number) ? number : fallback)));
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

function canControlTempChannel(member, tempChannel) {
  return Boolean(
    member?.id === tempChannel?.ownerId ||
    member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

async function applyBaseTempPermissions(channel, hub = {}) {
  const everyoneId = channel.guild?.roles?.everyone?.id;
  if (!everyoneId) return;

  const deny = {};
  if (hub.lockedByDefault) deny.Connect = true;
  if (hub.hiddenByDefault) deny.ViewChannel = true;

  if (Object.keys(deny).length) {
    await channel.permissionOverwrites.edit(everyoneId, { deny }).catch(() => null);
  }
}

async function applyOwnerPermission(channel, ownerId) {
  if (!ownerId) return;

  await channel.permissionOverwrites.edit(ownerId, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
  }).catch(() => null);
}

async function createTempChannel(newState, hub) {
  const guild = newState.guild;
  const member = newState.member;

  if (!guild || !member || !hub?.joinChannelId) return null;
  if (!isModuleEnabled(guild.id, 'tempVoice')) return null;
  if (!canManageVoice(guild)) return null;

  if (member.voice?.channelId !== hub.joinChannelId) return null;

  const section = tempVoiceStore.getTempVoiceSection(guild.id);
  const parent = hub.categoryId || newState.channel?.parentId || null;
  const name = buildChannelName(hub.nameTemplate, member);
  const userLimit = hub.userLimit > 0 ? hub.userLimit : section.settings?.defaultUserLimit || 0;

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent,
    bitrate: hub.bitrate > 0 ? hub.bitrate : undefined,
    userLimit: userLimit > 0 ? userLimit : undefined,
    reason: `Goliath temp voice created for ${member.user?.tag || member.id}`,
  }).catch(() => null);

  if (!channel) return null;

  await applyBaseTempPermissions(channel, hub);
  await applyOwnerPermission(channel, member.id);

  tempVoiceStore.saveTempChannel(guild.id, {
    channelId: channel.id,
    ownerId: member.id,
    hubId: hub.hubId || hub.id,
    name,
    userLimit,
    locked: hub.lockedByDefault === true,
    hidden: hub.hiddenByDefault === true,
  });

  await member.voice.setChannel(channel, 'Goliath temp voice join-to-create').catch(() => null);

  return channel;
}

async function cleanupTempChannel(oldState) {
  const guild = oldState.guild;
  const oldChannel = oldState.channel;

  if (!guild || !oldChannel) return null;

  const section = tempVoiceStore.getTempVoiceSection(guild.id);
  const tempChannel = section.channels?.[oldChannel.id] || null;
  if (!tempChannel) return null;

  if ((oldChannel.members?.size || 0) > 0) return null;

  tempVoiceStore.deleteTempChannel(guild.id, oldChannel.id);

  if (section.settings?.deleteWhenEmpty !== false && oldChannel.deletable) {
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

async function deployHub(guild, input = {}) {
  if (!guild?.id) throw new Error('Guild is required to deploy Temp Voice.');

  if (input.enabled === true) {
    setModuleEnabled(guild.id, 'tempVoice', true);
  }

  assertTempVoiceModuleEnabled(guild.id);

  if (!canManageVoice(guild)) {
    throw new Error('Goliath needs Manage Channels and Move Members to deploy Temp Voice.');
  }

  let categoryId = tempVoiceStore.cleanDiscordId(input.categoryId);

  if (!categoryId && input.createCategory !== false) {
    const category = await guild.channels.create({
      name: safeChannelName(input.categoryName || 'Temporary Voice Channels'),
      type: ChannelType.GuildCategory,
      reason: 'Goliath Temp Voice dashboard deployment',
    });
    categoryId = category.id;
  }

  let joinChannelId = tempVoiceStore.cleanDiscordId(input.joinChannelId);

  if (!joinChannelId) {
    const joinChannel = await guild.channels.create({
      name: safeChannelName(input.joinChannelName || '➕ Create Temp Voice'),
      type: ChannelType.GuildVoice,
      parent: categoryId || undefined,
      userLimit: 1,
      reason: 'Goliath Temp Voice hub deployment',
    });
    joinChannelId = joinChannel.id;
  }

  return tempVoiceStore.saveHub(guild.id, {
    ...input,
    joinChannelId,
    categoryId,
  }, { actorId: input.actorId });
}

function createHub(guildId, input = {}) {
  if (input.enabled === true) {
    setModuleEnabled(guildId, 'tempVoice', true);
  }

  assertTempVoiceModuleEnabled(guildId);

  return tempVoiceStore.saveHub(guildId, {
    joinChannelId: input.joinChannelId,
    joinChannelName: input.joinChannelName,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    nameTemplate: input.nameTemplate,
    userLimit: input.userLimit,
    bitrate: input.bitrate,
    lockedByDefault: input.lockedByDefault,
    hiddenByDefault: input.hiddenByDefault,
    ownerControlsEnabled: input.ownerControlsEnabled,
    createdBy: input.createdBy,
  });
}

function getHubs(guildId) {
  return tempVoiceStore.getHubs(guildId);
}

async function updateTempChannelControls(guild, channelId, actorId, input = {}) {
  if (!guild?.id) throw new Error('Guild is required.');
  assertTempVoiceModuleEnabled(guild.id);

  const tempChannel = tempVoiceStore.getTempChannel(guild.id, channelId);
  if (!tempChannel) throw new Error('Temporary voice channel is not tracked.');

  const actor = actorId
    ? guild.members.cache.get(actorId) || await guild.members.fetch(actorId).catch(() => null)
    : null;

  if (!canControlTempChannel(actor, tempChannel)) {
    throw new Error('You do not own this temporary voice channel.');
  }

  const section = tempVoiceStore.getTempVoiceSection(guild.id);
  const settings = section.settings || {};
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) throw new Error('Temporary voice channel no longer exists in Discord.');

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    if (!settings.allowOwnerRename && actorId === tempChannel.ownerId) throw new Error('Channel rename is disabled.');
    const name = safeChannelName(input.name);
    await channel.setName(name, 'Temp Voice owner rename').catch(() => null);
    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'activityStatus')) {
    if (!settings.allowOwnerStatus && actorId === tempChannel.ownerId) throw new Error('Activity status changes are disabled.');
    const activityStatus = safeStatus(input.activityStatus);
    if (typeof channel.setStatus === 'function') {
      await channel.setStatus(activityStatus || null, 'Temp Voice owner status').catch(() => null);
    }
    updates.activityStatus = activityStatus;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'userLimit')) {
    if (!settings.allowOwnerLimit && actorId === tempChannel.ownerId) throw new Error('User limit changes are disabled.');
    const userLimit = cleanLimit(input.userLimit, tempChannel.userLimit || 0);
    await channel.setUserLimit(userLimit, 'Temp Voice owner limit').catch(() => null);
    updates.userLimit = userLimit;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'locked')) {
    if (!settings.allowOwnerLock && actorId === tempChannel.ownerId) throw new Error('Lock controls are disabled.');
    const locked = input.locked === true;
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: locked ? false : null }).catch(() => null);
    updates.locked = locked;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'hidden')) {
    if (!settings.allowOwnerHide && actorId === tempChannel.ownerId) throw new Error('Hide controls are disabled.');
    const hidden = input.hidden === true;
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: hidden ? false : null }).catch(() => null);
    updates.hidden = hidden;
  }

  if (settings.allowOwnerPermits !== false) {
    for (const [field, permissionValue] of [
      ['allowedUserIds', true],
      ['allowedRoleIds', true],
      ['blockedUserIds', false],
      ['blockedRoleIds', false],
    ]) {
      if (!Object.prototype.hasOwnProperty.call(input, field) || !Array.isArray(input[field])) continue;
      const ids = [...new Set(input[field].map(tempVoiceStore.cleanDiscordId).filter(Boolean))];
      for (const id of ids) {
        await channel.permissionOverwrites.edit(id, { ViewChannel: true, Connect: permissionValue }).catch(() => null);
      }
      updates[field] = ids;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'ownerId')) {
    if (!settings.allowOwnerTransfer && actorId === tempChannel.ownerId) throw new Error('Ownership transfer is disabled.');
    const ownerId = tempVoiceStore.cleanDiscordId(input.ownerId);
    if (ownerId) {
      await applyOwnerPermission(channel, ownerId);
      updates.ownerId = ownerId;
    }
  }

  return tempVoiceStore.updateTempChannel(guild.id, channelId, updates, { actorId });
}

async function deleteOwnedTempChannel(guild, channelId, actorId) {
  const tempChannel = tempVoiceStore.getTempChannel(guild.id, channelId);
  if (!tempChannel) throw new Error('Temporary voice channel is not tracked.');

  const actor = actorId
    ? guild.members.cache.get(actorId) || await guild.members.fetch(actorId).catch(() => null)
    : null;

  if (!canControlTempChannel(actor, tempChannel)) {
    throw new Error('You do not own this temporary voice channel.');
  }

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  tempVoiceStore.deleteTempChannel(guild.id, channelId, { actorId });

  if (channel?.deletable) {
    await channel.delete('Temp Voice owner delete').catch(() => null);
  }

  return tempChannel;
}

module.exports = {
  handleVoiceStateUpdate,
  deployHub,
  createHub,
  getHubs,
  createTempChannel,
  cleanupTempChannel,
  updateTempChannelControls,
  deleteOwnedTempChannel,
};
