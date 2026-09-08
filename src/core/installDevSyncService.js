'use strict';

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') {
  console.log('DEV auto-sync installer is only required on Windows local development machines.');
  process.exit(0);
}

const root = path.resolve(__dirname, '..', '..');
const service = path.join(root, 'src', 'core', 'devSyncService.js');
const taskName = 'Goliath DEV Auto Sync';

if (!fs.existsSync(service)) {
  console.error(`Missing DEV sync service: ${service}`);
  process.exit(1);
}

const taskCommand = `\"${process.execPath}\" \"${service}\"`;
const create = spawnSync('schtasks', [
  '/Create',
  '/TN', taskName,
  '/SC', 'ONLOGON',
  '/TR', taskCommand,
  '/F',
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (create.status !== 0) {
  console.error('❌ Could not create the Windows logon task for DEV auto-sync.');
  process.exit(create.status || 1);
}

const child = spawn(process.execPath, [service], {
  cwd: root,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();

console.log('✅ Goliath DEV auto-sync installed.');
console.log('   - starts automatically whenever you sign in to Windows');
console.log('   - checks local DEV against GitHub DEV every 30 seconds');
console.log('   - GitHub DEV pushes continue to deploy VPS DEV automatically');
console.log('   - BETA and PRODUCTION are not touched');
