'use strict';

// src/modules/social/providers/kickProvider.js

const { createPlaceholderProvider } = require('./baseProvider');

module.exports = createPlaceholderProvider({
  id: 'kick',
  label: 'Kick',
  supportedAlertTypes: ['live'],
  requiredEnv: [],
  notes: 'Clients provide a Kick username or profile URL. Provider implementation will use the safest available public/provider method.',
});
