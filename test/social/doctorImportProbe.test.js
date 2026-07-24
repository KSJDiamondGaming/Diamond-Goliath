'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('runtime import probes terminate after a successful require', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/goliath.js'), 'utf8');

  assert.match(source, /require\(process\.argv\[1\]\);process\.exit\(0\)/);
  assert.match(source, /GOLIATH_IMPORT_AUDIT:\s*'true'/);
});
