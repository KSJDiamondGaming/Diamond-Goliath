'use strict';

// scripts/verify-guild-modules.js
// Quick read-only checker for consolidated guild module data.

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../src/config/runtimePaths');
const guildManager = require('../src/guild/guildManager');

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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __error: error.message };
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkGuildFile(filePath) {
  const raw = readJson(filePath);
  const guildId = path.basename(filePath, '.json');

  if (raw.__error) {
    return {
      guildId,
      ok: false,
      errors: [`Invalid JSON: ${raw.__error}`],
      warnings: [],
    };
  }

  // getGuildData intentionally goes through the real guild manager path.
  // It auto-initializes missing module defaults and rewrites this guild JSON when needed.
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

function run() {
  console.log('============================================================');
  console.log('🧪 Goliath Guild Module Verification');
  console.log(`Mode: ${mode}`);
  console.log(`Guilds Dir: ${guildsDir}`);
  console.log('============================================================');

  if (!fs.existsSync(guildsDir)) {
    console.log('No guilds directory found. Nothing to verify.');
    return;
  }

  const files = fs
    .readdirSync(guildsDir)
    .filter((file) => /^\d{16,25}\.json$/.test(file))
    .map((file) => path.join(guildsDir, file));

  if (!files.length) {
    console.log('No guild JSON files found.');
    return;
  }

  let failed = 0;

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
  }

  console.log('\n============================================================');
  console.log(failed ? `❌ Verification complete. Guilds needing attention: ${failed}` : '✅ Verification complete. All guild files passed.');
  console.log('============================================================');

  if (failed) process.exitCode = 1;
}

run();
