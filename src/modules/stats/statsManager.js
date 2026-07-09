'use strict';

const statsStore = require('./statsStore');

const activeVoiceSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function handleMessageCreate(message) {
  try {
    if (!message?.guild || !message.member) return;
    statsStore.addMessage(message);
  } catch (error) {
    console.error('[statsManager] Failed to track message:', error);
  }
}

async function handleVoiceStateUpdate(oldState, newState) {
  try {
    const guild = newState?.guild || oldState?.guild;
    const member = newState?.member || oldState?.member;
    if (!guild?.id || !member?.id) return;

    const key = sessionKey(guild.id, member.id);
    const oldChannelId = oldState?.channelId || null;
    const newChannelId = newState?.channelId || null;

    if (oldChannelId && oldChannelId !== newChannelId) {
      const session = activeVoiceSessions.get(key);
      if (session?.joinedAt && session.channelId) {
        const minutes = (Date.now() - session.joinedAt) / 60000;
        statsStore.addVoiceMinutes(member, session.channelId, minutes);
      }
      activeVoiceSessions.delete(key);
    }

    if (newChannelId && oldChannelId !== newChannelId) {
      activeVoiceSessions.set(key, {
        guildId: guild.id,
        userId: member.id,
        channelId: newChannelId,
        joinedAt: Date.now(),
      });
    }
  } catch (error) {
    console.error('[statsManager] Failed to track voice state:', error);
  }
}

async function handleGuildMemberAdd(member) {
  try {
    statsStore.addMemberEvent(member, 'join');
  } catch (error) {
    console.error('[statsManager] Failed to track member join:', error);
  }
}

async function handleGuildMemberRemove(member) {
  try {
    statsStore.addMemberEvent(member, 'leave');
  } catch (error) {
    console.error('[statsManager] Failed to track member leave:', error);
  }
}

module.exports = {
  handleMessageCreate,
  handleVoiceStateUpdate,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
};
