'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const ROOTS = ['server.js', 'scripts', 'src'];
const EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'runtime']);

function collect(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return EXTENSIONS.has(path.extname(absolute)) ? [absolute] : [];

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) return [];
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) return collect(path.relative(ROOT, child));
    return entry.isFile() && EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
  });
}

function isDashboardModule(file) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  return relative.startsWith('src/dashboard/');
}

test('all active server-side JavaScript parses successfully', () => {
  // The dashboard is a Vite/React ESM application. `node --check` inherits the
  // root CommonJS package mode and therefore reports valid dashboard `import`,
  // `export`, and `import.meta` syntax as errors. Vite validates those sources
  // in the separate dashboard build step, so this test intentionally checks
  // only Node/server-side JavaScript.
  const files = ROOTS.flatMap(collect).filter((file) => !isDashboardModule(file));
  const failures = [];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 15000,
    });

    if (result.status !== 0) {
      failures.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}: ${String(result.stderr || result.stdout).trim()}`);
    }
  }

  assert.equal(
    failures.length,
    0,
    `JavaScript syntax validation failed:\n${failures.join('\n\n')}`,
  );
});
