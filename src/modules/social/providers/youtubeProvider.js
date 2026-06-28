'use strict';

// src/modules/social/providers/youtubeProvider.js

const { createPlaceholderProvider } = require('./baseProvider');

module.exports = createPlaceholderProvider({
  id: 'youtube',
  label: 'YouTube',
  supportedAlertTypes: ['upload', 'short', 'live'],
  requiredEnv: ['YOUTUBE_API_KEY'],
  notes: 'Clients provide a channel ID, handle, or channel URL. Goliath owner configures YouTube globally.',
});
