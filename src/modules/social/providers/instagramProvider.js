'use strict';

// src/modules/social/providers/instagramProvider.js

const { createPlaceholderProvider } = require('./baseProvider');

module.exports = createPlaceholderProvider({
  id: 'instagram',
  label: 'Instagram',
  supportedAlertTypes: ['post'],
  requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  notes: 'Clients provide an Instagram username or profile URL. Goliath owner configures platform access globally if supported.',
});
