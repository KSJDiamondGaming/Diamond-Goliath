const express = require('express');
const path = require('path');
const readJson = require('../utils/readJson');
const writeJson = require('../utils/writeJson');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', 'data');
const EMBED_CONFIG_PATH = path.join(DATA_PATH, 'embedConfigs.json');
const WELCOME_CHANNELS_PATH = path.join(DATA_PATH, 'welcomeChannels.json');
const WELCOME_MESSAGES_PATH = path.join(DATA_PATH, 'welcomeMessages.json');
const WELCOME_TITLES_PATH = path.join(DATA_PATH, 'welcomeTitles.json');
const LEAVE_CHANNELS_PATH = path.join(DATA_PATH, 'leaveChannels.json');
const LEAVE_MESSAGES_PATH = path.join(DATA_PATH, 'leaveMessages.json');
const LEAVE_TITLES_PATH = path.join(DATA_PATH, 'leaveTitles.json');
const GUILD_CONFIGS_PATH = path.join(DATA_PATH, 'guildConfigs.json');

function getDefaultGuildConfig() {
  return {
    logsChannelId: null,
    modLogChannelId: null,
    adminLogChannelId: null,
    automodLogChannelId: null,
    adminActionLoggerEnabled: false,
  };
}

function getGuildConfigs() {
  const data = readJson(GUILD_CONFIGS_PATH);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function getGuildConfig(guildId) {
  const configs = getGuildConfigs();
  return {
    ...getDefaultGuildConfig(),
    ...(configs[guildId] || {}),
  };
}

function saveGuildConfig(guildId, partialConfig = {}) {
  const configs = getGuildConfigs();

  configs[guildId] = {
    ...getDefaultGuildConfig(),
    ...(configs[guildId] || {}),
    ...partialConfig,
    guildId,
    updatedAt: new Date().toISOString(),
  };

  writeJson(GUILD_CONFIGS_PATH, configs);
  return configs[guildId];
}

router.get('/embeds', (req, res) => {
  res.json(readJson(EMBED_CONFIG_PATH));
});

router.post('/embeds/:guildId', (req, res) => {
  const { guildId } = req.params;
  const { defaultTitle, footerText, footerIcon, color } = req.body;

  const data = readJson(EMBED_CONFIG_PATH);

  if (!data[guildId]) {
    data[guildId] = {};
  }

  data[guildId] = {
    ...data[guildId],
    defaultTitle: defaultTitle ?? data[guildId].defaultTitle ?? '',
    footerText: footerText ?? data[guildId].footerText ?? '',
    footerIcon: footerIcon ?? data[guildId].footerIcon ?? '',
    color: color ?? data[guildId].color ?? '',
  };

  writeJson(EMBED_CONFIG_PATH, data);

  res.json({
    ok: true,
    guildId,
    config: data[guildId],
  });
});

router.get('/messages', (req, res) => {
  res.json({
    welcome: {
      channels: readJson(WELCOME_CHANNELS_PATH),
      messages: readJson(WELCOME_MESSAGES_PATH),
      titles: readJson(WELCOME_TITLES_PATH),
    },
    leave: {
      channels: readJson(LEAVE_CHANNELS_PATH),
      messages: readJson(LEAVE_MESSAGES_PATH),
      titles: readJson(LEAVE_TITLES_PATH),
    },
  });
});

router.post('/messages/:guildId', (req, res) => {
  const { guildId } = req.params;
  const {
    welcomeTitle,
    welcomeMessage,
    leaveTitle,
    leaveMessage,
  } = req.body;

  const welcomeTitles = readJson(WELCOME_TITLES_PATH);
  const welcomeMessages = readJson(WELCOME_MESSAGES_PATH);
  const leaveTitles = readJson(LEAVE_TITLES_PATH);
  const leaveMessages = readJson(LEAVE_MESSAGES_PATH);

  if (welcomeTitle !== undefined) welcomeTitles[guildId] = welcomeTitle;
  if (welcomeMessage !== undefined) welcomeMessages[guildId] = welcomeMessage;
  if (leaveTitle !== undefined) leaveTitles[guildId] = leaveTitle;
  if (leaveMessage !== undefined) leaveMessages[guildId] = leaveMessage;

  writeJson(WELCOME_TITLES_PATH, welcomeTitles);
  writeJson(WELCOME_MESSAGES_PATH, welcomeMessages);
  writeJson(LEAVE_TITLES_PATH, leaveTitles);
  writeJson(LEAVE_MESSAGES_PATH, leaveMessages);

  res.json({
    ok: true,
    guildId,
    data: {
      welcomeTitle: welcomeTitles[guildId] || '',
      welcomeMessage: welcomeMessages[guildId] || '',
      leaveTitle: leaveTitles[guildId] || '',
      leaveMessage: leaveMessages[guildId] || '',
    },
  });
});

router.get('/logs', (req, res) => {
  const configs = getGuildConfigs();
  const response = {};

  for (const [guildId, config] of Object.entries(configs)) {
    response[guildId] = {
      logsChannelId: config.logsChannelId || null,
      modLogChannelId: config.modLogChannelId || null,
      adminLogChannelId: config.adminLogChannelId || null,
      automodLogChannelId: config.automodLogChannelId || null,
      adminActionLoggerEnabled: config.adminActionLoggerEnabled === true,
      updatedAt: config.updatedAt || null,
    };
  }

  res.json(response);
});

router.get('/logs/:guildId', (req, res) => {
  const { guildId } = req.params;

  res.json({
    ok: true,
    guildId,
    config: getGuildConfig(guildId),
  });
});

router.post('/logs/:guildId', (req, res) => {
  const { guildId } = req.params;
  const {
    logsChannelId,
    modLogChannelId,
    adminLogChannelId,
    automodLogChannelId,
    adminActionLoggerEnabled,
  } = req.body;

  const nextConfig = {};

  if (logsChannelId !== undefined) nextConfig.logsChannelId = logsChannelId || null;
  if (modLogChannelId !== undefined) nextConfig.modLogChannelId = modLogChannelId || null;
  if (adminLogChannelId !== undefined) nextConfig.adminLogChannelId = adminLogChannelId || null;
  if (automodLogChannelId !== undefined) nextConfig.automodLogChannelId = automodLogChannelId || null;
  if (adminActionLoggerEnabled !== undefined) {
    nextConfig.adminActionLoggerEnabled = adminActionLoggerEnabled === true;
  }

  const config = saveGuildConfig(guildId, nextConfig);

  res.json({
    ok: true,
    guildId,
    config,
  });
});

module.exports = router;