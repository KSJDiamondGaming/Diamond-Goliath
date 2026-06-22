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
 *   backups, exports, cache, logs, transcripts
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const ALLOWED_RUNTIME_FOLDERS = new Set(['backups', 'exports', 'cache', 'logs', 'transcripts']);
const KNOWN_GUILD_STORE_FILES = new Set([
  'src/guild/guildManager.js',
  'src/guild/moduleSectionManager.js',
  'src/guild/fileStore.js',
]);

function toPosix(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

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

function isAllowedSeparateRuntimeUse(relativePath, content) {
  if (KNOWN_GUILD_STORE_FILES.has(relativePath)) return true;

  if (!content.includes('runtimePaths') && !content.includes('src/runtime') && !content.includes('getRuntimePaths')) {
    return false;
  }

  return [...ALLOWED_RUNTIME_FOLDERS].some((folder) => {
    return content.includes(`.${folder}`) || content.includes(`/${folder}/`) || content.includes(`'${folder}'`) || content.includes(`"${folder}"`);
  });
}

function auditSource() {
  const files = walk(SRC_DIR);
  const findings = [];

  const suspiciousPatterns = [
    /fs\.writeFileSync\s*\(/g,
    /fs\.promises\.writeFile\s*\(/g,
    /writeFile\s*\(/g,
    /JSON\.stringify\s*\(/g,
    /getRuntimePaths\s*\(/g,
    /runtimePaths\.[a-zA-Z0-9_]+/g,
    /path\.join\([^\n]*(?:runtime|guilds|data|store)[^\n]*\)/g,
  ];

  for (const file of files) {
    const relativePath = toPosix(file);
    const content = fs.readFileSync(file, 'utf8');
    const matches = findMatches(content, suspiciousPatterns);

    if (!matches.length) continue;

    const allowed = isAllowedSeparateRuntimeUse(relativePath, content);
    const usesGuildManager = content.includes("require('../../guild/guildManager')") ||
      content.includes("require('../guild/guildManager')") ||
      content.includes('moduleSectionManager') ||
      content.includes('getGuildSection') ||
      content.includes('updateGuildSection') ||
      content.includes('saveGuildSection');

    if (allowed || usesGuildManager) continue;

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

  const guildFile = path.join(ROOT, 'src', 'runtime', mode, 'guilds', `${guildId}.json`);
  if (!fs.existsSync(guildFile)) {
    return {
      exists: false,
      path: toPosix(guildFile),
      sections: [],
      modules: [],
    };
  }

  const data = JSON.parse(fs.readFileSync(guildFile, 'utf8'));
  return {
    exists: true,
    path: toPosix(guildFile),
    sections: Object.keys(data).sort(),
    modules: Object.keys(data.modules || {}).sort(),
  };
}

function main() {
  const mode = process.argv[2] || process.env.BOT_MODE || 'dev';
  const guildId = process.argv[3] || process.env.GUILD_ID || process.env.DEV_GUILD_ID || '';
  const findings = auditSource();
  const guildAudit = auditGuildJson(String(mode).toLowerCase(), guildId);

  console.log('\nGoliath single guild runtime audit');
  console.log('==================================');
  console.log(`Mode: ${String(mode).toLowerCase()}`);
  console.log(`Guild: ${guildId || '(not supplied)'}`);

  if (guildAudit) {
    console.log(`Guild JSON: ${guildAudit.path}`);
    console.log(`Exists: ${guildAudit.exists ? 'yes' : 'no'}`);
    console.log(`Top-level sections: ${guildAudit.sections.join(', ') || '(none)'}`);
    console.log(`Module sections: ${guildAudit.modules.join(', ') || '(none)'}`);
  }

  console.log('\nSuspicious persistent runtime writes outside approved guild storage:');

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
