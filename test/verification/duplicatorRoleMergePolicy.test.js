'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/owner/dev/duplicator/core.js', 'utf8');

test('same-name role policy is merge-or-refuse and never duplicate-by-default', () => {
  assert.match(source, /function sameNameRoles\(/);
  assert.match(source, /refuses to guess or create another duplicate/);
  assert.match(source, /Merged source role into existing destination role without creating a duplicate/);
  assert.match(source, /already matches exactly; reused without duplication/);
});

test('protected hierarchy conflicts refuse instead of moving or duplicating roles', () => {
  assert.match(source, /Exact overwrite reproduction is impossible while preserving hierarchy/);
  assert.match(source, /refuses the transfer instead of duplicating or moving the role/);
});

test('existingRole only resolves a unique same-name role', () => {
  assert.match(source, /function existingRole\(guild, name\) \{ const matches = sameNameRoles\(guild, name\); return matches.length === 1 \? matches\[0\] : null; \}/);
});
