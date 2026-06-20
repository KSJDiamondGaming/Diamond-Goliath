'use strict';

// src/modules/social/providers/tiktokProvider.js

const { createPlaceholderProvider } = require('./baseProvider');

module.exports = createPlaceholderProvider({
  id: 'tiktok',
  label: 'TikTok',
  supportedAlertTypes: ['post', 'live'],
  requiredEnv: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
  notes: 'Clients provide a TikTok username or profile URL. Goliath owner configures platform access globally if supported.',
});
