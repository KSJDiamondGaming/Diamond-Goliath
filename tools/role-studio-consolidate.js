'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const posix = (value) => value.split(path.sep).join('/');

const exactMoves = new Map([
  ['src/modules/roleStudio/autoRoles/autoRoles.js', 'src/modules/roleStudio/autoRoles/autoRoles.js'],
  ['src/modules/roleStudio/autoRoles/autoRolesPanel.js', 'src/modules/roleStudio/autoRoles/autoRolesPanel.js'],
  ['src/modules/roleStudio/autoRoles/autoRolesRoute.js', 'src/modules/roleStudio/autoRoles/autoRolesRoute.js'],
  ['src/modules/roleStudio/temporaryRoles/temporaryRoles.js', 'src/modules/roleStudio/temporaryRoles/temporaryRoles.js'],
  ['src/modules/roleStudio/temporaryRoles/temporaryRolesPanel.js', 'src/modules/roleStudio/temporaryRoles/temporaryRolesPanel.js'],
]);

const prefixMoves = [
  ['src/modules/roleStudio/reactionRoles/', 'src/modules/roleStudio/reactionRoles/'],
  ['src/modules/roleStudio/timedRoles/', 'src/modules/roleStudio/timedRoles/'],
  ['src/modules/roleStudio/verification/', 'src/modules/roleStudio/verification/'],
  ['src/modules/roleStudio/', 'src/modules/roleStudio/'],
  ['src/modules/autoroles/', 'src/modules/roleStudio/autoRoles/'],
];

function mapPath(file) {
  const normalized = posix(file);
  if (exactMoves.has(normalized)) return exactMoves.get(normalized);
  for (const [from, to] of prefixMoves) {
    if (normalized.startsWith(from)) return to + normalized.slice(from.length);
  }
  return normalized;
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function resolveOldTarget(importer, specifier, trackedSet) {
  if (!specifier.startsWith('.')) return null;

  const base = posix(path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  ));

  const candidates = [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.json`,
    `${base}/index.js`,
  ];

  return candidates.find((candidate) => trackedSet.has(candidate)) || null;
}

function relativeSpecifier(fromFile, targetFile, originalSpecifier) {
  let relative = path.posix.relative(path.posix.dirname(fromFile), targetFile);
  if (!relative.startsWith('.')) relative = `./${relative}`;

  const hadExtension = /\.(?:js|cjs|mjs|json)$/.test(originalSpecifier);
  if (!hadExtension) {
    relative = relative
      .replace(/\.(?:js|cjs|mjs|json)$/, '')
      .replace(/\/index$/, '');
  }

  return relative;
}

function rewriteSpecifiers(content, oldFile, newFile, trackedSet) {
  const patterns = [
    /(require\(\s*)(['"])([^'"]+)(\2\s*\))/g,
    /(from\s+)(['"])([^'"]+)(\2)/g,
    /(import\(\s*)(['"])([^'"]+)(\2\s*\))/g,
  ];

  let rewritten = content;
  for (const pattern of patterns) {
    rewritten = rewritten.replace(pattern, (full, lead, quote, specifier, tail) => {
      const oldTarget = resolveOldTarget(oldFile, specifier, trackedSet);
      if (!oldTarget) return full;

      const newTarget = mapPath(oldTarget);
      const newSpecifier = relativeSpecifier(newFile, newTarget, specifier);
      return `${lead}${quote}${newSpecifier}${tail}`;
    });
  }

  return rewritten;
}

function rewriteKnownPaths(content) {
  const replacements = [
    ['src/modules/roleStudio/temporaryRoles/temporaryRolesPanel', 'src/modules/roleStudio/temporaryRoles/temporaryRolesPanel'],
    ['src/modules/roleStudio/temporaryRoles/temporaryRoles', 'src/modules/roleStudio/temporaryRoles/temporaryRoles'],
    ['src/modules/roleStudio/autoRoles/autoRolesPanel', 'src/modules/roleStudio/autoRoles/autoRolesPanel'],
    ['src/modules/roleStudio/autoRoles/autoRolesRoute', 'src/modules/roleStudio/autoRoles/autoRolesRoute'],
    ['src/modules/roleStudio/autoRoles/autoRoles', 'src/modules/roleStudio/autoRoles/autoRoles'],
    ['src/modules/roleStudio/reactionRoles/', 'src/modules/roleStudio/reactionRoles/'],
    ['src/modules/roleStudio/timedRoles/', 'src/modules/roleStudio/timedRoles/'],
    ['src/modules/roleStudio/verification/', 'src/modules/roleStudio/verification/'],
    ['src/modules/roleStudio/', 'src/modules/roleStudio/'],
    ['src\\modules\\autoroles\\', 'src\\modules\\roleStudio\\autoRoles\\'],
    ['src\\modules\\reactionroles\\', 'src\\modules\\roleStudio\\reactionRoles\\'],
    ['src\\modules\\timedroles\\', 'src\\modules\\roleStudio\\timedRoles\\'],
    ['src\\modules\\verification\\', 'src\\modules\\roleStudio\\verification\\'],
    ['src\\modules\\rolestudio\\', 'src\\modules\\roleStudio\\'],
  ];

  let rewritten = content;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }
  return rewritten;
}

function assertExpectedSources(trackedSet) {
  const required = [
    'src/modules/roleStudio/autoRoles/autoRoles.js',
    'src/modules/roleStudio/reactionRoles/reactionRoles.js',
    'src/modules/roleStudio/timedRoles/timedRoles.js',
    'src/modules/roleStudio/roleStudioPanel.js',
    'src/modules/roleStudio/temporaryRoles/temporaryRoles.js',
    'src/modules/roleStudio/verification/verification.js',
  ];

  const missing = required.filter((file) => !trackedSet.has(file));
  if (missing.length) {
    throw new Error(`Expected source files are missing:\n${missing.join('\n')}`);
  }
}

function main() {
  const tracked = trackedFiles();
  const trackedSet = new Set(tracked);
  assertExpectedSources(trackedSet);

  const snapshots = new Map();
  for (const file of tracked) {
    const absolute = path.join(root, file);
    const buffer = fs.readFileSync(absolute);
    if (buffer.includes(0)) continue;
    snapshots.set(file, buffer.toString('utf8'));
  }

  const changed = [];
  for (const [oldFile, original] of snapshots) {
    const newFile = mapPath(oldFile);
    let content = rewriteSpecifiers(original, oldFile, newFile, trackedSet);
    content = rewriteKnownPaths(content);

    if (newFile !== oldFile || content !== original) {
      const destination = path.join(root, newFile);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
      changed.push(`${oldFile}${newFile === oldFile ? '' : ` -> ${newFile}`}`);
    }
  }

  for (const oldFile of tracked) {
    const newFile = mapPath(oldFile);
    const absolute = path.join(root, oldFile);
    if (newFile !== oldFile && fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  }

  console.log(`Role Studio consolidation completed (${changed.length} files written or updated).`);
  console.log('Next: npm run doctor');
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
