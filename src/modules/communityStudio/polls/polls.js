'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../../core/guild/moduleSectionManager');

const MODULE_KEY = 'polls';
const DEFAULT_POLLS = {
  defaultChannelId: null,
  resultsChannelId: null,
  managerRoleIds: [],
  anonymousVoting: false,
  allowMultipleChoice: true,
  showResultsLive: true,
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
    removed: 0,
    switched: 0,
  },
};

const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));
const createId = (prefix = 'poll') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const cleanText = (value, max = 4000) => String(value || '').trim().slice(0, max);
function cleanSnowflake(value) {
  const cleaned = String(value || '').replace(/[<#@&!>]/g, '').trim();
  return /^\d{15,25}$/.test(cleaned) ? cleaned : null;
}
function cleanSnowflakeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanSnowflake).filter(Boolean))];
}
function normalizeOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map((option) => ({
      id: option.id || createId('option'),
      label: cleanText(option.label || option.name || option.value, 80),
      votes: Array.isArray(option.votes) ? [...new Set(option.votes.map(String))] : [],
    }))
    .filter((option) => option.label)
    .slice(0, 10);
}
function normalizeSection(section = {}) {
  const source = section && typeof section === 'object' ? section : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const polls = source.polls && typeof source.polls === 'object' ? source.polls : {};
  const analytics = source.analytics && typeof source.analytics === 'object' ? source.analytics : {};
  const defaultChannelId = cleanSnowflake(source.defaultChannelId || settings.defaultChannelId);
  const allowMultipleVotes = source.allowMultipleChoice === true || settings.allowMultipleVotes === true;
  const anonymousVotes = source.anonymousVoting === true || settings.anonymousVotes === true;
  const normalizedPolls = {};

  for (const [pollId, poll] of Object.entries(polls)) {
    if (!poll || typeof poll !== 'object') continue;
    const question = cleanText(poll.question, 256);
    if (!question) continue;
    const id = String(poll.id || pollId);
    normalizedPolls[id] = {
      id,
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

  const normalized = {
    ...DEFAULT_POLLS,
    ...source,
    defaultChannelId,
    resultsChannelId: cleanSnowflake(source.resultsChannelId),
    managerRoleIds: cleanSnowflakeArray(source.managerRoleIds),
    anonymousVoting: anonymousVotes,
    allowMultipleChoice: allowMultipleVotes,
    showResultsLive: source.showResultsLive !== false,
    settings: {
      ...DEFAULT_POLLS.settings,
      ...settings,
      defaultChannelId,
      allowMultipleVotes,
      anonymousVotes,
      autoCloseHours: Number(settings.autoCloseHours ?? DEFAULT_POLLS.settings.autoCloseHours),
    },
    polls: normalizedPolls,
    analytics: {
      ...DEFAULT_POLLS.analytics,
      ...analytics,
      created: Math.max(0, Number(analytics.created || 0)),
      deployed: Math.max(0, Number(analytics.deployed || 0)),
      closed: Math.max(0, Number(analytics.closed || 0)),
      votes: Math.max(0, Number(analytics.votes || 0)),
      removed: Math.max(0, Number(analytics.removed || 0)),
      switched: Math.max(0, Number(analytics.switched || 0)),
    },
  };

  delete normalized.enabled;
  return normalized;
}
function getSection(guildId) {
  return normalizeSection(getModuleSection(guildId, MODULE_KEY, DEFAULT_POLLS));
}
function saveSection(guildId, section, meta = {}) {
  return normalizeSection(saveModuleSection(
    guildId,
    MODULE_KEY,
    normalizeSection(section),
    meta,
  ));
}
function updateSection(guildId, updater, meta = {}) {
  return normalizeSection(updateModuleSection(
    guildId,
    MODULE_KEY,
    (current) => {
      const normalized = normalizeSection(current);
      const next = typeof updater === 'function' ? updater(normalized) : updater;
      return normalizeSection(next);
    },
    DEFAULT_POLLS,
    meta,
  ));
}
function getPoll(guildId, pollId) {
  return getSection(guildId).polls[String(pollId)] || null;
}
function createPoll(guildId, payload = {}, meta = {}) {
  const section = getSection(guildId);
  if (!guildManager.isModuleEnabled(guildId, MODULE_KEY)) throw new Error('Polls are disabled.');
  const question = cleanText(payload.question, 256);
  if (!question) throw new Error('Poll question is required.');
  const options = normalizeOptions(payload.options);
  if (options.length < 2) throw new Error('A poll needs at least 2 options.');
  const pollId = createId('poll');
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
function deletePollRecord(guildId, pollId, meta = {}) {
  const section = getSection(guildId);
  if (!section.polls[String(pollId)]) throw new Error('Poll not found.');
  delete section.polls[String(pollId)];
  return saveSection(guildId, section, meta);
}
function summarizePoll(poll) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
  return {
    ...clone(poll),
    totalVotes,
    options: poll.options.map((option) => ({
      ...option,
      count: option.votes.length,
      percent: totalVotes ? Math.round((option.votes.length / totalVotes) * 100) : 0,
      votes: poll.anonymousVotes ? [] : [...option.votes],
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
  if (poll.status !== 'active') return [];
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

module.exports = {
  MODULE_KEY,
  DEFAULT_POLLS,
  now,
  cleanSnowflake,
  normalizeSection,
  getSection,
  saveSection,
  updateSection,
  getPoll,
  createPoll,
  updatePoll,
  deletePollRecord,
  summarizePoll,
  buildPollEmbed,
  buildPollComponents,
};
