'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const wrapperPath = path.join(root, 'src/dashboard/js/pages/modules/SocialWithRuntime.jsx');
const layoutPath = path.join(root, 'src/dashboard/js/ui/layout.js');

function source(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('Social Studio dashboard is routed through the runtime health wrapper', () => {
  const layout = source(layoutPath);

  assert.match(layout, /import\('\.\.\/pages\/modules\/SocialWithRuntime'\)/);
  assert.match(layout, /key: 'social'.*component: Social/);
});

test('runtime health card consumes the canonical diagnostics runtime snapshot', () => {
  const wrapper = source(wrapperPath);

  assert.match(wrapper, /\/creator-hub\/diagnostics/);
  assert.match(wrapper, /result\.diagnostics\?\.runtime/);
  assert.match(wrapper, /data-testid="social-runtime-health"/);
  assert.match(wrapper, /Scheduler/);
  assert.match(wrapper, /Delivery Queue/);
  assert.match(wrapper, /Incident Monitor/);
});

test('runtime health refresh is bounded and cleaned up', () => {
  const wrapper = source(wrapperPath);

  assert.match(wrapper, /const REFRESH_INTERVAL_MS = 30000/);
  assert.match(wrapper, /setInterval\(refreshRuntime, REFRESH_INTERVAL_MS\)/);
  assert.match(wrapper, /clearInterval\(timer\)/);
});

test('existing Social Studio implementation remains the wrapped source of truth', () => {
  const wrapper = source(wrapperPath);

  assert.match(wrapper, /import Social from '\.\/Social\.jsx'/);
  assert.match(wrapper, /<Social \{\.\.\.props\} \/>/);
});
