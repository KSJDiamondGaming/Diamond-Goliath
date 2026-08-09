'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('deployment sources each environment from its own protected branch', () => {
  const workflow = read('.github/workflows/deploy-dev.yml');
  assert.match(workflow, /beta\)\s+[\s\S]*?SOURCE_BRANCH="beta"; TARGET_BRANCH="beta"/);
  assert.match(workflow, /production\)\s+[\s\S]*?SOURCE_BRANCH="production"; TARGET_BRANCH="production"/);
  assert.doesNotMatch(workflow, /SOURCE_BRANCH="dev"; TARGET_BRANCH="(?:beta|production)"/);
  assert.match(workflow, /statuses:\s*write/);
  assert.match(workflow, /context\":\"goliath\/preflight\"/);
});

test('Creator Overrides button is not claimed by the user routing compatibility layer', () => {
  const source = read('src/modules/socialStudio/socialAlerts/socialStudioUserChannelRouting.js');
  assert.doesNotMatch(source, /id === 'social:channel:creator:open'/);
  assert.match(source, /id === `\$\{P\}open`/);
});

test('user routing preview includes server platform overrides before content/default fallback', () => {
  const source = read('src/modules/socialStudio/socialAlerts/socialStudioUserChannelRouting.js');
  assert.match(source, /config\.platformChannels\?\.\[platform\]/);
  assert.match(source, /Server .*Platform Override/);
  assert.match(source, /User content route → User All Content → Server Platform Override → Server Dedicated route → Server Default channel/);
});
