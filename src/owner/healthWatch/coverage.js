'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../config/runtimePaths');

const MODULE_ROOT = path.join(PROJECT_ROOT, 'src', 'modules');
const CURRENT_MODULES = Object.freeze([
  'autoRoles', 'birthdays', 'embed', 'forms', 'giveaways', 'goodbye', 'invites', 'leveling', 'notes', 'polls', 'privateRooms', 'reactionRoles', 'roleSelector', 'schedule', 'social', 'starboard', 'stats', 'sticky', 'suggestions', 'temporaryRoles', 'tempVoice', 'tickets', 'timedRoles', 'translation', 'verification', 'welcome',
]);

function walk(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, output);
    else if (predicate(full, entry.name)) output.push(full);
  }
  return output;
}
function healthAdapters() { return walk(MODULE_ROOT, (_full, name) => /Health\.js$/i.test(name)).map((file) => ({ file, relative: path.relative(PROJECT_ROOT, file).replace(/\\/g, '/') })); }
function discoveredModuleFolders() {
  if (!fs.existsSync(MODULE_ROOT)) return [];
  const names = new Set();
  for (const studio of fs.readdirSync(MODULE_ROOT, { withFileTypes: true })) {
    if (!studio.isDirectory()) continue;
    const studioPath = path.join(MODULE_ROOT, studio.name);
    for (const entry of fs.readdirSync(studioPath, { withFileTypes: true })) if (entry.isDirectory()) names.add(entry.name);
  }
  if (fs.existsSync(path.join(MODULE_ROOT, 'securityStudio', 'verification.js'))) names.add('verification');
  return [...names].sort();
}
function coverageReport() {
  const discovered = discoveredModuleFolders();
  const adapters = healthAdapters();
  const known = new Set(CURRENT_MODULES);
  const futureUnregistered = discovered.filter((name) => !known.has(name));
  return { generatedAt: new Date().toISOString(), currentModules: [...CURRENT_MODULES], discovered, adapterFiles: adapters.map((item) => item.relative), futureUnregistered, complete: futureUnregistered.length === 0 };
}
module.exports = { CURRENT_MODULES, healthAdapters, discoveredModuleFolders, coverageReport };
