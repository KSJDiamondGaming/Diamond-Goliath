'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mode = process.env.BOT_MODE || 'dev';

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function section(title) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  return result.status === 0;
}

function printHelp() {
  console.log('Goliath scripts CLI');
  console.log('===================');
  console.log(`Mode: ${mode}`);
  console.log('');
  console.log('Commands:');
  console.log('  check             Run safe local checks');
  console.log('  audit             Run all audits');
  console.log('  dashboard         Run dashboard file + route audits');
  console.log('  dashboard:files   Run dashboard file audit only');
  console.log('  dashboard:routes  Run dashboard route audit only');
  console.log('  runtime           Inspect runtime folders for current BOT_MODE');
  console.log('  guilds            List runtime guild config files for current BOT_MODE');
}

function checkProjectShape() {
  section('Project shape');

  const expected = [
    'server.js',
    'package.json',
    'src/commands',
    'src/core',
    'src/dashboard',
    'src/events',
    'src/modules',
    'src/runtime',
    'src/server',
  ];

  const missing = expected.filter((item) => !exists(item));

  for (const item of expected) {
    console.log(`${missing.includes(item) ? '❌' : '✅'} ${item}`);
  }

  return missing.length === 0;
}

function inspectRuntime() {
  section('Runtime');

  const runtimeRoot = path.join(root, 'src', 'runtime');
  const modeRoot = path.join(runtimeRoot, mode);
  const folders = ['guilds', 'logs', 'database', 'data', 'backups'];

  console.log(`BOT_MODE: ${mode}`);
  console.log(`Runtime path: ${rel(modeRoot)}`);

  if (!fs.existsSync(modeRoot)) {
    console.log('❌ Runtime mode folder missing.');
    return false;
  }

  for (const folder of folders) {
    const fullPath = path.join(modeRoot, folder);
    const count = fs.existsSync(fullPath) ? fs.readdirSync(fullPath).length : 0;
    console.log(`${fs.existsSync(fullPath) ? '✅' : '⚠️'} ${rel(fullPath)} (${count})`);
  }

  return true;
}

function inspectGuilds() {
  section('Guild configs');

  const guildsDir = path.join(root, 'src', 'runtime', mode, 'guilds');
  if (!fs.existsSync(guildsDir)) {
    console.log(`❌ Missing ${rel(guildsDir)}`);
    return false;
  }

  const files = fs.readdirSync(guildsDir).filter((file) => file.endsWith('.json')).sort();
  console.log(`Found guild config files: ${files.length}`);

  for (const file of files) {
    console.log(`- ${file}`);
  }

  return true;
}

function runDashboard(modeName = 'all') {
  return require('./dashboard-audit').run(modeName);
}

function runCheck() {
  const results = [];
  results.push(checkProjectShape());
  results.push(runDashboard('all'));
  results.push(inspectRuntime());

  const ok = results.every(Boolean);
  if (!ok) process.exitCode = 1;
  return ok;
}

function runAudit() {
  const results = [];
  results.push(runCheck());
  results.push(inspectGuilds());

  const ok = results.every(Boolean);
  if (!ok) process.exitCode = 1;
  return ok;
}

const command = process.argv[2] || 'help';

const commands = {
  help: printHelp,
  check: runCheck,
  audit: runAudit,
  dashboard: () => runDashboard('all'),
  'dashboard:files': () => runDashboard('files'),
  'dashboard:routes': () => runDashboard('routes'),
  runtime: inspectRuntime,
  guilds: inspectGuilds,
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const result = commands[command]();
if (result === false) process.exit(1);
