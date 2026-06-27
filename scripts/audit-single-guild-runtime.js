#!/usr/bin/env node
'use strict';

/**
 * Audits Goliath source for persistent runtime writes that may bypass the
 * per-mode, per-guild JSON source of truth.
 *
 * Target architecture:
 *   src/runtime/<mode>/guilds/<guildId>.json
 *
 * Allowed separate runtime folders:
 *   backups, exports, cache, logs, transcripts, recovery
 */

const fs = require('fs');
const path = require('path');

const { printHeader, readJson, relative, resolveRoot, walk } = require('./lib/scriptUtils');

const SRC_DIR = resolveRoot('src');
const ALLOWED_RUNTIME_FOLDERS = new Set(['backups', 'exports', 'cache', 'logs', 'transcripts', 'recovery']);
const IGNORE_FILES = new Set([
  'src/dashboard/js/services/apiClient.js',
  'src/dashboard/js/storage.js',
  'src/functions/moderation/modModalRouter.js',
  'src/helpers/ui/panelNavigation.js',
  'src/modules/translation/providers/openaiProvider.js',
]);
const KNOWN_GUILD_STORE_FILES = new Set([
  'src/guild/guildManager.js',
  'src/guild/moduleSectionManager.js',
  'src/guild/fileStore.js',
]);

function lineNumberFor(content, index) {
  return content.slice(0, index).split('\n').length;
}

function findMatches(content, patterns) {
  const matches = [];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

    while ((match = regex.exec(content)) !== null) {
      matches.push({
        pattern: pattern.toString(),
        index: match.index,
        text: match[0].slice(0, 180),
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function hasApprovedSeparateRuntimePath(content) {
  return [...ALLOWED_RUNTIME_FOLDERS].some((folder) => {
    return content.includes(`.${folder}`) ||
      content.includes(`/${folder}/`) ||
      content.includes(`\\${folder}\\`) ||
      content.includes(`'${folder}'`) ||
      content.includes(`"${folder}"`);
  });
}

function isAllowedSeparateRuntimeUse(relativePath, content) {
  if (KNOWN_GUILD_STORE_FILES.has(relativePath)) return true;
  if (IGNORE_FILES.has(relativePath)) return true;

  if (!content.includes('runtimePaths') && !content.includes('src/runtime') && !content.includes('getRuntimePaths')) {
    return false;
  }

  return hasApprovedSeparateRuntimePath(content);
}

function usesGuildStorage(content) {
  return content.includes("require('../../guild/guildManager')") ||
    content.includes("require('../guild/guildManager')") ||
    content.includes('moduleSectionManager') ||
    content.includes('getGuildSection') ||
    content.includes('updateGuildSection') ||
    content.includes('saveGuildSection');
}

function auditSource() {
  const files = walk(SRC_DIR);
  const findings = [];

  const suspiciousPatterns = [
    /fs\.writeFileSync\s*\(/g,
    /fs\.promises\.writeFile\s*\(/g,
    /writeFile\s*\(/g,
    /path\.join\([^\n]*(?:runtime|guilds|data|store)[^\n]*\)/g,
  ];

  for (const file of files) {
    const relativePath = relative(file);
    const content = fs.readFileSync(file, 'utf8');
    const matches = findMatches(content, suspiciousPatterns);

    if (!matches.length) continue;
    if (isAllowedSeparateRuntimeUse(relativePath, content) || usesGuildStorage(content)) continue;

    findings.push({
      file: relativePath,
      matches: matches.slice(0, 8).map((match) => ({
        line: lineNumberFor(content, match.index),
        text: match.text.replace(/\s+/g, ' '),
      })),
    });
  }

  return findings;
}

function auditGuildJson(mode, guildId) {
  if (!mode || !guildId) return null;

  const guildFile = resolveRoot('src', 'runtime', mode, 'guilds', `${guildId}.json`);
  const result = readJson(guildFile);

  if (!result.ok) {
    return {
      exists: fs.existsSync(guildFile),
      path: relative(guildFile),
      error: result.error,
      sections: [],
      modules: [],
    };
  }

  const data = result.data;
  return {
    exists: true,
    path: relative(guildFile),
    sections: Object.keys(data).sort(),
    modules: Object.keys(data.modules || {}).sort(),
  };
}

function main() {
  const mode = String(process.argv[2] || process.env.BOT_MODE || 'dev').toLowerCase();
  const guildId = process.argv[3] || process.env.GUILD_ID || process.env.DEV_GUILD_ID || '';
  const findings = auditSource();
  const guildAudit = auditGuildJson(mode, guildId);

  printHeader('Goliath single guild runtime audit', {
    Mode: mode,
    Guild: guildId || '(not supplied)',
  });

  if (guildAudit) {
    console.log(`Guild JSON: ${guildAudit.path}`);
    console.log(`Exists: ${guildAudit.exists ? 'yes' : 'no'}`);
    if (guildAudit.error) console.log(`Error: ${guildAudit.error}`);
    console.log(`Top-level sections: ${guildAudit.sections.join(', ') || '(none)'}`);
    console.log(`Module sections: ${guildAudit.modules.join(', ') || '(none)'}`);
  }

  console.log('\nSuspicious persistent runtime/data writes outside approved guild storage:');

  if (!findings.length) {
    console.log('✅ None found by static scan.');
    return;
  }

  for (const finding of findings) {
    console.log(`\n⚠️  ${finding.file}`);
    for (const match of finding.matches) {
      console.log(`   L${match.line}: ${match.text}`);
    }
  }

  console.log('\nReview these files before claiming full single-JSON compliance.');
  process.exitCode = 1;
}

main();
