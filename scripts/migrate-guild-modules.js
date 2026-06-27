'use strict';

// Moves legacy top-level guild config into src/runtime/{mode}/guilds/{guildId}.json -> modules{}.
// Also removes empty legacy nested runtime files/folders once the guild JSON is consolidated.

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../src/config/runtimePaths');
const { isPlainObject, printHeader, readJson, relative } = require('./lib/scriptUtils');

const mode = String(process.env.BOT_MODE || process.argv[2] || 'dev').toLowerCase();
const runtimePaths = getRuntimePaths(mode);
const guildsDir = runtimePaths.guilds;

const MODULE_KEYS = [
  'autoRoles',
  'giveaways',
  'tempVoice',
  'starboard',
  'sticky',
  'roles',
  'timeline',
  'suggestions',
  'forms',
  'translation',
  'verification',
  'tickets',
  'security',
  'serverBackups',
  'logs',
  'generalSettings',
  'embedBuilder',
  'embedDefaults',
  'embedPresets',
];

const LEGACY_NESTED_FILES = [
  'sticky.json',
  'timeline.json',
];

const LEGACY_RUNTIME_DIRS = [
  'sticky',
  'timeline',
  'roles',
  'autoRoles',
  'giveaways',
  'tempVoice',
  'starboard',
];

function writeJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function removeFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);
    console.log(`🧹 Removed legacy file: ${relative(filePath)}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not remove legacy file: ${relative(filePath)}`);
    console.warn(error.message);
    return false;
  }
}

function removeDirIfEmpty(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return false;

    const entries = fs.readdirSync(dirPath);
    if (entries.length) return false;

    fs.rmdirSync(dirPath);
    console.log(`🧹 Removed empty legacy folder: ${relative(dirPath)}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not remove folder: ${relative(dirPath)}`);
    console.warn(error.message);
    return false;
  }
}

function removeLegacyGuildRuntime(guildId) {
  const nestedGuildDir = path.join(guildsDir, guildId);

  for (const fileName of LEGACY_NESTED_FILES) {
    removeFileIfExists(path.join(nestedGuildDir, fileName));
  }

  for (const dirName of LEGACY_RUNTIME_DIRS) {
    removeDirIfEmpty(path.join(nestedGuildDir, dirName));
  }

  removeDirIfEmpty(nestedGuildDir);
}

function moveSectionToModules(data, modules, key, guildId) {
  if (!isPlainObject(data[key])) return false;

  modules[key] = isPlainObject(modules[key])
    ? { ...data[key], ...modules[key] }
    : data[key];

  delete data[key];
  console.log(`✅ Moved ${key} -> modules.${key} for guild ${guildId}`);
  return true;
}

function migrateGuildFile(filePath) {
  const result = readJson(filePath);

  if (!result.ok) {
    console.warn(`⚠️ Skipped ${relative(filePath)}: ${result.error}`);
    return false;
  }

  const data = result.data;
  if (!isPlainObject(data)) return false;

  const guildId = String(data.guildId || path.basename(filePath, '.json'));
  const modules = isPlainObject(data.modules) ? { ...data.modules } : {};
  let changed = false;

  for (const key of MODULE_KEYS) {
    if (moveSectionToModules(data, modules, key, guildId)) {
      changed = true;
    }
  }

  data.modules = modules;

  if (changed) {
    data.updatedAt = new Date().toISOString();
    writeJson(filePath, data);
  }

  removeLegacyGuildRuntime(guildId);

  return changed;
}

function getGuildFiles() {
  if (!fs.existsSync(guildsDir)) return [];

  return fs
    .readdirSync(guildsDir)
    .filter((file) => /^\d{16,25}\.json$/.test(file))
    .map((file) => path.join(guildsDir, file));
}

function run() {
  printHeader('🧩 Goliath Guild Module Migration', {
    Mode: mode,
    'Guilds Dir': relative(guildsDir),
  });

  const files = getGuildFiles();

  if (!files.length) {
    console.log('No guild JSON files found. Nothing to migrate.');
    return;
  }

  let migrated = 0;

  for (const filePath of files) {
    if (migrateGuildFile(filePath)) migrated += 1;
  }

  printHeader('✅ Migration complete', {
    'Guild files scanned': files.length,
    'Guild files updated': migrated,
  });
}

run();
