'use strict';

// src/modules/social/providers/xProvider.js

const { createPlaceholderProvider } = require('./baseProvider');

module.exports = createPlaceholderProvider({
  id: 'x',
  label: 'X',
  supportedAlertTypes: ['post'],
  requiredEnv: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  notes: 'Clients provide an X username or profile URL. Goliath owner configures platform access globally if supported.',
});
