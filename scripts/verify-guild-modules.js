'use strict';

// Read-only checker for consolidated guild module data.

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../src/config/runtimePaths');
const guildManager = require('../src/guild/guildManager');
const { isPlainObject, printHeader, readJson, relative } = require('./lib/scriptUtils');

const mode = String(process.env.BOT_MODE || process.argv[2] || 'dev').toLowerCase();
const runtimePaths = getRuntimePaths(mode);
const guildsDir = runtimePaths.guilds;
const EXPECTED_MODULES = Object.keys(guildManager.DEFAULT_MODULES || {});

const LEGACY_TOP_LEVEL_KEYS = [
  ...EXPECTED_MODULES,
  'autoRoles',
  'suggestions',
];

const LEGACY_NESTED_FILES = [
  'sticky.json',
  'timeline.json',
];

function checkGuildFile(filePath) {
  const rawResult = readJson(filePath);
  const guildId = path.basename(filePath, '.json');

  if (!rawResult.ok) {
    return {
      guildId,
      ok: false,
      errors: [`Invalid JSON: ${rawResult.error}`],
      warnings: [],
    };
  }

  const raw = rawResult.data;
  const data = guildManager.getGuildData(guildId, { forceReload: true });
  const errors = [];
  const warnings = [];
  const modules = isPlainObject(data.modules) ? data.modules : {};

  if (!isPlainObject(data.modules)) {
    errors.push('Missing modules object.');
  }

  for (const key of LEGACY_TOP_LEVEL_KEYS) {
    if (isPlainObject(raw[key])) {
      errors.push(`Legacy top-level module still present: ${key}`);
    }
  }

  for (const key of EXPECTED_MODULES) {
    if (!isPlainObject(modules[key])) {
      warnings.push(`modules.${key} is missing or not an object.`);
    }
  }

  const nestedDir = path.join(guildsDir, guildId);
  for (const fileName of LEGACY_NESTED_FILES) {
    const nestedFile = path.join(nestedDir, fileName);
    if (fs.existsSync(nestedFile)) {
      errors.push(`Legacy nested file still exists: ${path.relative(guildsDir, nestedFile)}`);
    }
  }

  return {
    guildId,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function getGuildFiles() {
  if (!fs.existsSync(guildsDir)) return [];

  return fs
    .readdirSync(guildsDir)
    .filter((file) => /^\d{16,25}\.json$/.test(file))
    .map((file) => path.join(guildsDir, file));
}

function run() {
  printHeader('🧪 Goliath Guild Module Verification', {
    Mode: mode,
    'Guilds Dir': relative(guildsDir),
  });

  const files = getGuildFiles();

  if (!files.length) {
    console.log('No guild JSON files found. Nothing to verify.');
    return;
  }

  let failed = 0;
  let warningCount = 0;

  for (const filePath of files) {
    const result = checkGuildFile(filePath);

    console.log(`\nGuild: ${result.guildId}`);
    console.log(result.ok ? '✅ OK' : '❌ Needs attention');

    for (const error of result.errors) {
      console.log(`  ❌ ${error}`);
    }

    for (const warning of result.warnings) {
      console.log(`  ⚠️ ${warning}`);
    }

    if (!result.ok) failed += 1;
    warningCount += result.warnings.length;
  }

  printHeader(failed ? '❌ Verification complete' : '✅ Verification complete', {
    'Guild files scanned': files.length,
    'Guilds needing attention': failed,
    Warnings: warningCount,
  });

  if (failed) process.exitCode = 1;
}

run();
