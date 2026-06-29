'use strict';

console.log('Goliath scripts CLI running');

const mode = process.env.BOT_MODE || 'dev';
const command = process.argv[2];

console.log('Mode:', mode);

const actions = {
  check: () => require('./check')(),
  audit: () => require('./audit')(),
  guilds: () => require('./guilds')(),
  runtime: () => require('./runtime')(),
};

if (!command) {
  console.log('Available commands: check | audit | guilds | runtime');
  process.exit(0);
}

if (!actions[command]) {
  console.error('Unknown command:', command);
  process.exit(1);
}

actions[command]();