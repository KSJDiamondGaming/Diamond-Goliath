const path = require('path');
const dotenv = require('dotenv');

const { normalizeBotMode, isValidBotMode } = require('./botModes');

function loadEnvironment() {
  const cwd = process.cwd().toLowerCase();

const fallbackMode =
  cwd.includes('/production') ? 'PRODUCTION'
  : cwd.includes('/beta') ? 'BETA'
  : 'DEV';

const requestedMode = normalizeBotMode(
  process.env.BOT_MODE || fallbackMode
);

  if (!isValidBotMode(requestedMode)) {
    console.error(`❌ Invalid BOT_MODE: ${requestedMode}`);
    console.error('✅ Valid modes: DEV, BETA, PRODUCTION');
    process.exit(1);
  }

  const envFile = `.env.${requestedMode.toLowerCase()}`;
  const envPath = path.resolve(process.cwd(), envFile);

  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error(`❌ Failed to load ${envFile}`);
    console.error(`Expected path: ${envPath}`);
    console.error(result.error.message);
    process.exit(1);
  }

  process.env.BOT_MODE = requestedMode;

  return {
    mode: requestedMode,
    envFile,
    envPath,
  };
}

module.exports = {
  loadEnvironment,
};
