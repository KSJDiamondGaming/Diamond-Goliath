'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const guildManager = require('../../core/guild/guildManager');

const DEFAULT_POLLS = {
  enabled: true,
  settings: {
    defaultChannelId: null,
    allowMultipleVotes: false,
    anonymousVotes: false,
    autoCloseHours: 24,
  },
  polls: {},
  analytics: {
    created: 0,
    deployed: 0,
    closed: 0,
    votes: 0,
  },
};

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function id(prefix = 'poll') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function cleanSnowflake(value) {
  const idValue = String(value || '').replace(/[<#>]/g, '').trim();
  return /^\d{15,25}$/.test(idValue) ? idValue : null;
}

function normalizeOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option) => ({
      id: option.id || id('option'),
      label: cleanText(option.label || option.name || option.value, 80),
      votes: Array.isArray(option.votes) ? [...new Set(option.votes.map(String))] : [],
    }))
    .filter((option) => option.label)
    .slice(0, 10);
}

function normalizePolls(section = {}) {
  const source = section && typeof section === 'object' ? section : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const polls = source.polls && typeof source.polls === 'object' ? source.polls : {};
  const analytics = source.analytics && typeof source.analytics === 'object' ? source.analytics : {};

  const normalizedPolls = {};
  for (const [pollId, poll] of Object.entries(polls)) {
    if (!poll || typeof poll !== 'object') continue;
    const question = cleanText(poll.question, 256);
    if (!question) continue;
    normalizedPolls[pollId] = {
      id: poll.id || pollId,
      question,
      description: cleanText(poll.description, 1000),
      status: ['draft', 'active', 'closed'].includes(poll.status) ? poll.status : 'draft',
      channelId: cleanSnowflake(poll.channelId),
      messageId: cleanSnowflake(poll.messageId),
      allowMultipleVotes: poll.allowMultipleVotes === true,
      anonymousVotes: poll.anonymousVotes === true,
      createdBy: String(poll.createdBy || '').trim() || null,
      createdAt: poll.createdAt || now(),
      updatedAt: poll.updatedAt || poll.createdAt || now(),
      closedAt: poll.closedAt || null,
      options: normalizeOptions(poll.options),
    };
  }

  return {
    ...DEFAULT_POLLS,
    ...source,
    enabled: source.enabled !== false,
    settings: {
      ...DEFAULT_POLLS.settings,
      ...settings,
      defaultChannelId: cleanSnowflake(settings.defaultChannelId),
      allowMultipleVotes: settings.allowMultipleVotes === true,
      anonymousVotes: settings.anonymousVotes === true,
      autoCloseHours: Number(settings.autoCloseHours || DEFAULT_POLLS.settings.autoCloseHours),
    },
    polls: normalizedPolls,
    analytics: {
      ...DEFAULT_POLLS.analytics,
      ...analytics,
      created: Number(analytics.created || 0),
      deployed: Number(analytics.deployed || 0),
      closed: Number(analytics.closed || 0),
      votes: Number(analytics.votes || 0),
    },
  };
}

function getSection(guildId) {
  return normalizePolls(guildManager.getGuildSection(guildId, 'polls', DEFAULT_POLLS));
}

function saveSection(guildId, section, meta = {}) {
  return guildManager.saveGuildSection(guildId, 'polls', normalizePolls(section), meta);
}

function getPoll(guildId, pollId) {
  const section = getSection(guildId);
  return section.polls[String(pollId)] || null;
}

function createPoll(guildId, payload = {}, meta = {}) {
  const section = getSection(guildId);
  const question = cleanText(payload.question, 256);
  if (!question) throw new Error('Poll question is required.');

  const options = normalizeOptions(payload.options);
  if (options.length < 2) throw new Error('A poll needs at least 2 options.');

  const pollId = id('poll');
  const poll = {
    id: pollId,
    question,
    description: cleanText(payload.description, 1000),
    status: 'draft',
    channelId: cleanSnowflake(payload.channelId) || section.settings.defaultChannelId,
    messageId: null,
    allowMultipleVotes: payload.allowMultipleVotes === true || section.settings.allowMultipleVotes === true,
    anonymousVotes: payload.anonymousVotes === true || section.settings.anonymousVotes === true,
    createdBy: meta.actorId || payload.createdBy || null,
    createdAt: now(),
    updatedAt: now(),
    closedAt: null,
    options,
  };

  section.polls[pollId] = poll;
  section.analytics.created += 1;
  return { section: saveSection(guildId, section, meta), poll };
}

function updatePoll(guildId, pollId, payload = {}, meta = {}) {
  const section = getSection(guildId);
  const poll = section.polls[String(pollId)];
  if (!poll) throw new Error('Poll not found.');
  if (poll.status === 'closed') throw new Error('Closed polls cannot be edited.');

  if (payload.question !== undefined) {
    const question = cleanText(payload.question, 256);
    if (!question) throw new Error('Poll question is required.');
    poll.question = question;
  }

  if (payload.description !== undefined) poll.description = cleanText(payload.description, 1000);
  if (payload.channelId !== undefined) poll.channelId = cleanSnowflake(payload.channelId);
  if (payload.allowMultipleVotes !== undefined) poll.allowMultipleVotes = payload.allowMultipleVotes === true;
  if (payload.anonymousVotes !== undefined) poll.anonymousVotes = payload.anonymousVotes === true;
  if (payload.options !== undefined) {
    const options = normalizeOptions(payload.options);
    if (options.length < 2) throw new Error('A poll needs at least 2 options.');
    poll.options = options.map((option) => ({ ...option, votes: [] }));
  }

  poll.updatedAt = now();
  section.polls[poll.id] = poll;
  return { section: saveSection(guildId, section, meta), poll };
}

function setPollStatus(guildId, pollId, status, meta = {}) {
  const section = getSection(guildId);
  const poll = section.polls[String(pollId)];
  if (!poll) throw new Error('Poll not found.');
  if (!['draft', 'active', 'closed'].includes(status)) throw new Error('Invalid poll status.');

  poll.status = status;
  poll.updatedAt = now();
  if (status === 'closed' && !poll.closedAt) {
    poll.closedAt = now();
    section.analytics.closed += 1;
  }

  section.polls[poll.id] = poll;
  return { section: saveSection(guildId, section, meta), poll };
}

function deletePoll(guildId, pollId, meta = {}) {
  const section = getSection(guildId);
  if (!section.polls[String(pollId)]) throw new Error('Poll not found.');
  delete section.polls[String(pollId)];
  return saveSection(guildId, section, meta);
}

function summarizePoll(poll) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
  return {
    ...poll,
    totalVotes,
    options: poll.options.map((option) => ({
      ...option,
      count: option.votes.length,
      percent: totalVotes ? Math.round((option.votes.length / totalVotes) * 100) : 0,
      votes: poll.anonymousVotes ? [] : option.votes,
    })),
  };
}

function buildPollEmbed(poll) {
  const summary = summarizePoll(poll);
  const lines = summary.options.map((option, index) => {
    const bar = '█'.repeat(Math.max(0, Math.round(option.percent / 10))).padEnd(10, '░');
    return `**${index + 1}. ${option.label}**\n${bar} ${option.count} vote${option.count === 1 ? '' : 's'} · ${option.percent}%`;
  });

  return new EmbedBuilder()
    .setColor(poll.status === 'closed' ? '#64748B' : '#3B82F6')
    .setTitle(`${poll.status === 'closed' ? 'Closed Poll' : 'Poll'} · ${poll.question}`.slice(0, 256))
    .setDescription([poll.description, ...lines].filter(Boolean).join('\n\n').slice(0, 4096))
    .setFooter({ text: `Poll ID: ${poll.id} · ${summary.totalVotes} total vote${summary.totalVotes === 1 ? '' : 's'}` })
    .setTimestamp(new Date(poll.updatedAt || poll.createdAt || Date.now()));
}

function buildPollComponents(poll) {
  if (poll.status === 'closed') return [];

  const buttons = poll.options.slice(0, 10).map((option, index) => new ButtonBuilder()
    .setCustomId(`poll_vote:${poll.id}:${option.id}`)
    .setLabel(`${index + 1}. ${option.label}`.slice(0, 80))
    .setStyle(ButtonStyle.Primary));

  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }
  return rows;
}

async function deployPoll(guild, pollId, channelId, meta = {}) {
  const guildId = guild.id;
  const section = getSection(guildId);
  const poll = section.polls[String(pollId)];
  if (!poll) throw new Error('Poll not found.');

  const targetChannelId = cleanSnowflake(channelId) || poll.channelId || section.settings.defaultChannelId;
  if (!targetChannelId) throw new Error('Select a text channel before deploying the poll.');

  const channel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Selected channel is not sendable.');

  poll.channelId = targetChannelId;
  poll.status = 'active';
  poll.updatedAt = now();

  const message = await channel.send({
    embeds: [buildPollEmbed(poll)],
    components: buildPollComponents(poll),
  });

  poll.messageId = message.id;
  section.polls[poll.id] = poll;
  section.analytics.deployed += 1;
  return { section: saveSection(guildId, section, meta), poll, messageId: message.id };
}

async function refreshPollMessage(guild, poll) {
  if (!poll.channelId || !poll.messageId) return false;
  const channel = guild.channels.cache.get(poll.channelId) || await guild.channels.fetch(poll.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (!message?.edit) return false;
  await message.edit({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) });
  return true;
}

async function vote(interaction) {
  const match = String(interaction.customId || '').match(/^poll_vote:([^:]+):([^:]+)$/);
  if (!match) return false;

  const [, pollId, optionId] = match;
  const guildId = interaction.guildId;
  const userId = interaction.user?.id;
  if (!guildId || !userId) return true;

  const section = getSection(guildId);
  const poll = section.polls[pollId];
  if (!poll) {
    await interaction.reply({ content: 'This poll no longer exists.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (poll.status !== 'active') {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const option = poll.options.find((item) => item.id === optionId);
  if (!option) {
    await interaction.reply({ content: 'That poll option no longer exists.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (!poll.allowMultipleVotes) {
    for (const candidate of poll.options) {
      candidate.votes = candidate.votes.filter((idValue) => idValue !== userId);
    }
  }

  const alreadyVoted = option.votes.includes(userId);
  if (alreadyVoted) {
    option.votes = option.votes.filter((idValue) => idValue !== userId);
  } else {
    option.votes.push(userId);
    section.analytics.votes += 1;
  }

  poll.updatedAt = now();
  section.polls[poll.id] = poll;
  saveSection(guildId, section, { actorId: userId });

  await refreshPollMessage(interaction.guild, poll).catch(() => null);
  await interaction.reply({
    content: alreadyVoted ? `Removed your vote from **${option.label}**.` : `Vote counted for **${option.label}**.`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
  return true;
}

module.exports = {
  DEFAULT_POLLS,
  getSection,
  saveSection,
  getPoll,
  createPoll,
  updatePoll,
  setPollStatus,
  deletePoll,
  deployPoll,
  summarizePoll,
  buildPollEmbed,
  buildPollComponents,
  vote,
};
