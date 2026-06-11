'use strict';

// scripts/migrate-guild-modules.js
// Moves old top-level module config into src/runtime/{mode}/guilds/{guildId}.json -> modules{}

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../src/config/runtimePaths');

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
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`❌ Failed to read JSON: ${filePath}`);
    console.error(error);
    return null;
  }
}

function writeJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function removeFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Removed legacy file: ${filePath}`);
    }
  } catch (error) {
    console.warn(`⚠️ Could not remove legacy file: ${filePath}`);
    console.warn(error.message);
  }
}

function removeDirIfEmpty(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      fs.rmdirSync(dirPath);
      console.log(`🧹 Removed empty legacy folder: ${dirPath}`);
    }
  } catch (error) {
    console.warn(`⚠️ Could not remove folder: ${dirPath}`);
    console.warn(error.message);
  }
}

function migrateGuildFile(filePath) {
  const data = readJson(filePath);
  if (!isPlainObject(data)) return false;

  const guildId = String(data.guildId || path.basename(filePath, '.json'));
  const modules = isPlainObject(data.modules) ? { ...data.modules } : {};
  let changed = false;

  for (const key of MODULE_KEYS) {
    if (isPlainObject(data[key])) {
      modules[key] = isPlainObject(modules[key])
        ? { ...data[key], ...modules[key] }
        : data[key];

      delete data[key];
      changed = true;
      console.log(`✅ Moved ${key} -> modules.${key} for guild ${guildId}`);
    }
  }

  data.modules = modules;
  data.updatedAt = new Date().toISOString();

  if (changed) {
    writeJson(filePath, data);
  }

  const legacyNestedSticky = path.join(guildsDir, guildId, 'sticky.json');
  removeFileIfExists(legacyNestedSticky);
  removeDirIfEmpty(path.dirname(legacyNestedSticky));

  return changed;
}

function run() {
  console.log('============================================================');
  console.log('🧩 Goliath Guild Module Migration');
  console.log(`Mode: ${mode}`);
  console.log(`Guilds Dir: ${guildsDir}`);
  console.log('============================================================');

  if (!fs.existsSync(guildsDir)) {
    console.log('No guilds directory found. Nothing to migrate.');
    return;
  }

  const files = fs
    .readdirSync(guildsDir)
    .filter((file) => /^\d{16,25}\.json$/.test(file))
    .map((file) => path.join(guildsDir, file));

  let migrated = 0;

  for (const filePath of files) {
    if (migrateGuildFile(filePath)) migrated += 1;
  }

  console.log('============================================================');
  console.log(`✅ Migration complete. Updated guild files: ${migrated}`);
  console.log('============================================================');
}

run();
