'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function read(relativePathOrFilePath) {
  const filePath = path.isAbsolute(relativePathOrFilePath)
    ? relativePathOrFilePath
    : path.join(ROOT, relativePathOrFilePath);

  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, error: 'File does not exist.' };

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return { ok: false, error: 'File is empty.' };

    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function resolveRoot(...parts) {
  return path.join(ROOT, ...parts);
}

function walk(dir, options = {}, files = []) {
  const ignoreDirs = options.ignoreDirs || DEFAULT_IGNORE_DIRS;
  const extensions = options.extensions || ['.js'];
  const ignoreSuffixes = options.ignoreSuffixes || [];

  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, options, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
    if (ignoreSuffixes.some((suffix) => entry.name.endsWith(suffix))) continue;

    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function assertContains(file, needle, label) {
  const source = read(file);

  if (!source.includes(needle)) {
    throw new Error(`${label} missing in ${file}: ${needle}`);
  }
}

function printHeader(title, rows = {}) {
  console.log('============================================================');
  console.log(title);

  for (const [key, value] of Object.entries(rows)) {
    console.log(`${key}: ${value}`);
  }

  console.log('============================================================');
}

module.exports = {
  DEFAULT_IGNORE_DIRS,
  ROOT,
  assert,
  assertContains,
  isPlainObject,
  printHeader,
  read,
  readJson,
  relative,
  resolveRoot,
  walk,
};
