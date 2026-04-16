const path = require('path');

// Root of your project (Diamond Goliath)
const rootDir = path.resolve(__dirname, '..', '..', '..');

// Dashboard server data folder
const dataDir = path.join(rootDir, 'dashboard', 'server', 'data');

// Specific files
const statsFile = path.join(dataDir, 'stats.json');

const logsDir = path.join(dataDir, 'logs');

const ticketsDir = path.join(dataDir, 'tickets');

module.exports = {
  rootDir,
  dataDir,
  statsFile
};