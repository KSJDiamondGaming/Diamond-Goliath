'use strict';

const pollsManager = require('./pollsManager');

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

async function resolvePollMessage(guild, poll) {
  if (!guild || !poll?.channelId || !poll?.messageId) return null;
  const channel = guild.channels.cache.get(poll.channelId)
    || await guild.channels.fetch(poll.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(poll.messageId).catch(() => null);
}

function pollPayload(poll) {
  return {
    embeds: [pollsManager.buildPollEmbed(poll)],
    components: poll.status === 'active' ? pollsManager.buildPollComponents(poll) : [],
  };
}

async function renderPoll(guild, poll, { required = false } = {}) {
  const message = await resolvePollMessage(guild, poll);
  if (!message?.edit) {
    if (required) throw new Error('The deployed poll message is missing or inaccessible.');
    return null;
  }
  await message.edit(pollPayload(poll));
  return message;
}

async function deployPoll(guild, pollId, channelId, meta = {}) {
  if (!guild) throw new Error('Guild is required.');
  const section = pollsManager.getSection(guild.id);
  if (section.enabled === false) throw new Error('Polls are disabled.');
  const poll = section.polls[String(pollId)];
  if (!poll) throw new Error('Poll not found.');
  if (poll.status === 'closed') throw new Error('Closed polls cannot be redeployed.');

  const previous = clone(poll);
  const existing = await resolvePollMessage(guild, poll);
  poll.status = 'active';
  poll.closedAt = null;
  poll.updatedAt = new Date().toISOString();

  if (existing?.edit) {
    await existing.edit(pollPayload(poll));
    section.polls[poll.id] = poll;
    try {
      return {
        section: pollsManager.saveSection(guild.id, section, meta),
        poll,
        messageId: existing.id,
        redeployed: true,
      };
    } catch (error) {
      await existing.edit(pollPayload(previous)).catch(() => null);
      throw error;
    }
  }

  const targetChannelId = String(channelId || poll.channelId || section.settings?.defaultChannelId || '').replace(/[<#>]/g, '').trim();
  if (!/^\d{15,25}$/.test(targetChannelId)) throw new Error('Select a text channel before deploying the poll.');
  const channel = guild.channels.cache.get(targetChannelId)
    || await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Selected channel is not sendable.');

  const message = await channel.send(pollPayload(poll));
  poll.channelId = channel.id;
  poll.messageId = message.id;
  section.polls[poll.id] = poll;
  section.analytics.deployed = Number(section.analytics.deployed || 0) + 1;

  try {
    const saved = pollsManager.saveSection(guild.id, section, meta);
    return { section: saved, poll, messageId: message.id, redeployed: false };
  } catch (error) {
    await message.delete().catch(() => null);
    throw error;
  }
}

async function setPollStatus(guild, pollId, status, meta = {}) {
  if (!guild) throw new Error('Guild is required.');
  const section = pollsManager.getSection(guild.id);
  const poll = section.polls[String(pollId)];
  if (!poll) throw new Error('Poll not found.');
  if (!['draft', 'active', 'closed'].includes(status)) throw new Error('Invalid poll status.');
  if (status === 'active' && !poll.messageId) throw new Error('Deploy the poll before activating it.');

  const previous = clone(poll);
  const wasClosed = poll.status === 'closed';
  poll.status = status;
  poll.updatedAt = new Date().toISOString();
  if (status === 'closed') {
    poll.closedAt = poll.closedAt || poll.updatedAt;
    if (!wasClosed) section.analytics.closed = Number(section.analytics.closed || 0) + 1;
  } else {
    poll.closedAt = null;
  }

  const message = poll.messageId ? await renderPoll(guild, poll, { required: true }) : null;
  section.polls[poll.id] = poll;
  try {
    const saved = pollsManager.saveSection(guild.id, section, meta);
    return { section: saved, poll };
  } catch (error) {
    if (message?.edit) await message.edit(pollPayload(previous)).catch(() => null);
    throw error;
  }
}

async function deletePoll(guild, pollId, meta = {}) {
  if (!guild) throw new Error('Guild is required.');
  const poll = pollsManager.getPoll(guild.id, pollId);
  if (!poll) throw new Error('Poll not found.');
  const message = await resolvePollMessage(guild, poll);
  const section = pollsManager.deletePoll(guild.id, pollId, meta);
  if (message?.delete) await message.delete().catch(() => null);
  return section;
}

module.exports = {
  ...pollsManager,
  resolvePollMessage,
  renderPoll,
  deployPoll,
  setPollStatus,
  deletePoll,
};
