'use strict';

const path = require('path');

const ROOT_DIR = process.cwd();
const MEDIA_ROOT = process.env.GOLIATH_MEDIA_ROOT || path.join(ROOT_DIR, 'data', 'guilds');

const DISCORD_LIMITS = {
  emoji: {
    maxBytes: 256 * 1024,
    recommendedSize: 128,
    formats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  },
  roleIcon: {
    maxBytes: 256 * 1024,
    recommendedSize: 64,
    formats: ['png', 'jpg', 'jpeg', 'webp'],
  },
  sticker: {
    maxBytes: 512 * 1024,
    recommendedSize: 320,
    formats: ['png', 'apng', 'json'],
  },
  gif: {
    maxBytes: 8 * 1024 * 1024,
    recommendedWidth: 480,
    maxDurationSeconds: 15,
  },
};

const TOOL_PRESETS = {
  gif: {
    fps: [8, 12, 15, 20, 24],
    quality: ['small', 'balanced', 'high'],
    defaultFps: 12,
    defaultWidth: 480,
  },
  emoji: {
    sizes: [64, 96, 128],
    defaultSize: 128,
    roleIconSize: 64,
    outputFormats: ['png', 'webp'],
  },
};

module.exports = {
  ROOT_DIR,
  MEDIA_ROOT,
  DISCORD_LIMITS,
  TOOL_PRESETS,
};
