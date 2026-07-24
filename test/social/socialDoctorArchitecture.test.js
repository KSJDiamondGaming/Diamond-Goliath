'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const doctorSource = fs.readFileSync(path.join(root, 'scripts/goliath.js'), 'utf8');
const packageJson = require('../../package.json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('social doctor checks retired module imports rather than internal consolidated identifiers', () => {
  assert.match(doctorSource, /imports retired/);
  assert.doesNotMatch(doctorSource, /read\(f\)\.includes\(n\)/);
  assert.match(read('src/modules/social/socialRuntime.js'), /const socialCreators/);
  assert.match(read('src/modules/social/socialRuntime.js'), /const socialDiagnostics/);
  assert.match(read('src/modules/social/socialRuntime.js'), /const socialSimulator/);
});

test('social doctor recognises all canonical runtime surfaces', () => {
  for (const surface of [
    'socialRuntimeDoctor.js',
    'socialRuntimeHealth.js',
    'socialProcessLifecycle.js',
    'SocialWithRuntime.jsx',
  ]) {
    assert.match(doctorSource, new RegExp(surface.replace('.', '\\.')));
  }

  for (const exportName of ['startup', 'shutdown', 'runtimeHealth']) {
    assert.match(doctorSource, new RegExp(`['\"]${exportName}['\"]`));
  }
});

test('social test and doctor commands are available', () => {
  assert.equal(packageJson.scripts['test:social'], 'node --test test/social/*.test.js');
  assert.match(packageJson.scripts['doctor:social'], /socialRuntimeDoctor\.js/);
});
