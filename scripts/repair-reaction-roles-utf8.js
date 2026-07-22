'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'src/modules/roleStudio/reactionRoles/reactionRolesPanel.js');
const WRITE = process.argv.includes('--write');
const KEEP_BACKUP = process.argv.includes('--keep-backup');

const CP1252_REVERSE = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const MOJIBAKE_MARKERS = /[ÃÂâðï�]/g;

function markerScore(value) {
  return (String(value).match(MOJIBAKE_MARKERS) || []).length;
}

function encodeWindows1252(value) {
  const bytes = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xFF) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = CP1252_REVERSE.get(codePoint);
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }

  return Buffer.from(bytes);
}

function decodeOnePass(value) {
  const encoded = encodeWindows1252(value);
  if (!encoded) return null;

  const decoded = encoded.toString('utf8');
  if (decoded.includes('\uFFFD')) return null;
  return decoded;
}

function repairMojibake(source) {
  let current = source.replace(/^\uFEFF/, '');
  const passes = [];

  for (let pass = 1; pass <= 4; pass += 1) {
    const before = markerScore(current);
    if (before === 0) break;

    const decoded = decodeOnePass(current);
    if (!decoded) break;

    const after = markerScore(decoded);
    if (after >= before) break;

    passes.push({ pass, before, after });
    current = decoded;
  }

  return {
    content: current,
    passes,
    remainingMarkers: markerScore(current),
  };
}

function runNodeCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || 'Unknown syntax error').trim();
    throw new Error(`Syntax verification failed:\n${detail}`);
  }
}

function main() {
  if (!fs.existsSync(TARGET)) {
    throw new Error(`Reaction Roles panel not found: ${path.relative(ROOT, TARGET)}`);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  const originalScore = markerScore(original);
  const repaired = repairMojibake(original);

  console.log('Reaction Roles UTF-8 repair');
  console.log(`Target: ${path.relative(ROOT, TARGET)}`);
  console.log(`Original marker score: ${originalScore}`);
  for (const pass of repaired.passes) {
    console.log(`Pass ${pass.pass}: ${pass.before} -> ${pass.after}`);
  }
  console.log(`Remaining marker score: ${repaired.remainingMarkers}`);

  if (originalScore === 0) {
    console.log('No repair required.');
    return;
  }

  if (!repaired.passes.length || repaired.remainingMarkers !== 0) {
    throw new Error('Repair was incomplete. No file was changed.');
  }

  if (!WRITE) {
    console.log('Dry run complete. Re-run with --write to apply the verified repair.');
    return;
  }

  const backup = `${TARGET}.utf8-backup`;
  fs.writeFileSync(backup, original, 'utf8');
  fs.writeFileSync(TARGET, repaired.content, 'utf8');

  try {
    runNodeCheck(TARGET);
  } catch (error) {
    fs.writeFileSync(TARGET, original, 'utf8');
    throw error;
  } finally {
    if (!KEEP_BACKUP && fs.existsSync(backup)) fs.rmSync(backup);
  }

  console.log('Repair applied and syntax verification passed.');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
