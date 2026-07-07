'use strict';

const statsStore = require('./statsStore');

function cleanCounter(input = {}) {
  const type = String(input.type || '').trim().toLowerCase();
  const channelId = String(input.channelId || '').trim();
  const template = String(input.template || '').trim().slice(0, 80);

  if (!['members', 'messages', 'voice'].includes(type)) throw new Error('Counter type must be members, messages, or voice.');
  if (!/^\d{15,25}$/.test(channelId)) throw new Error('A valid counter channel ID is required.');

  return {
    type,
    channelId,
    template: template || defaultTemplate(type),
    updatedAt: new Date().toISOString(),
  };
}

function defaultTemplate(type) {
  if (type === 'members') return 'Members: {count}';
  if (type === 'voice') return 'Voice: {count} mins';
  return 'Messages: {count}';
}

function listCounters(guildId) {
  return statsStore.getStats(guildId).counters || [];
}

function addCounter(guildId, input = {}, guildOrMeta = {}) {
  const counter = cleanCounter(input);
  return statsStore.updateStats(guildId, (stats) => ({
    ...stats,
    counters: [
      ...(Array.isArray(stats.counters) ? stats.counters.filter((item) => item.channelId !== counter.channelId) : []),
      counter,
    ],
  }), guildOrMeta);
}

function removeCounter(guildId, channelId, guildOrMeta = {}) {
  const cleanChannelId = String(channelId || '').trim();
  return statsStore.updateStats(guildId, (stats) => ({
    ...stats,
    counters: (Array.isArray(stats.counters) ? stats.counters : []).filter((item) => item.channelId !== cleanChannelId),
  }), guildOrMeta);
}

async function refreshCounters(guild) {
  if (!guild?.id) return [];
  const summary = statsStore.getSummary(guild.id);
  const counters = listCounters(guild.id);
  const results = [];

  for (const counter of counters) {
    const channel = guild.channels.cache.get(counter.channelId) || await guild.channels.fetch(counter.channelId).catch(() => null);
    if (!channel?.setName) continue;

    const count = counter.type === 'members'
      ? guild.memberCount || 0
      : counter.type === 'voice'
        ? summary.totals.voiceMinutes
        : summary.totals.messages;

    const name = String(counter.template || defaultTemplate(counter.type)).replace('{count}', count);
    await channel.setName(name.slice(0, 100)).catch(() => null);
    results.push({ channelId: counter.channelId, type: counter.type, name });
  }

  return results;
}

module.exports = {
  cleanCounter,
  listCounters,
  addCounter,
  removeCounter,
  refreshCounters,
};
