'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const fromRoot = (...parts) => path.join(root, ...parts);

test('Social Studio has one canonical backend module root', () => {
  const canonicalRoot = fromRoot('src', 'modules', 'social');
  const duplicateRoots = [
    fromRoot('src', 'modules', 'socialStudio'),
    fromRoot('src', 'modules', 'social-studio'),
  ];

  assert.equal(fs.existsSync(canonicalRoot), true, 'Missing canonical src/modules/social module root.');
  for (const duplicateRoot of duplicateRoots) {
    assert.equal(
      fs.existsSync(duplicateRoot),
      false,
      `Duplicate Social Studio module root remains: ${path.relative(root, duplicateRoot)}`,
    );
  }
});

test('server mounts the canonical Social route exactly once', () => {
  const serverSource = fs.readFileSync(fromRoot('server.js'), 'utf8');
  const routeImport = "./src/modules/social/socialRoute";
  const routeMount = "['/api/social', socialRoutes]";

  assert.equal(serverSource.split(routeImport).length - 1, 1, 'Canonical Social route import must appear exactly once.');
  assert.equal(serverSource.split(routeMount).length - 1, 1, 'Canonical Social route mount must appear exactly once.');
});
