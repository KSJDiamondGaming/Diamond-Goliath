'use strict';

function assertFunction(moduleName, mod, name) {
  if (typeof mod?.[name] !== 'function') {
    throw new Error(`${moduleName}.${name} must be a function`);
  }
}

function assertObject(moduleName, mod, name) {
  if (!mod?.[name] || typeof mod[name] !== 'object') {
    throw new Error(`${moduleName}.${name} must be an object`);
  }
}

const core = require('../src/owner/dev/duplicator/core');
const selective = require('../src/owner/dev/duplicator/selective');
const duplicator = require('../src/owner/dev/duplicator');

for (const name of ['run', 'handleInteraction', 'assertAccess', 'snapshot', 'initializeBridge', 'getGuildDirectory']) {
  assertFunction('duplicator/core', core, name);
}

for (const name of ['startCopy', 'handleInteraction']) {
  assertFunction('duplicator/selective', selective, name);
}

for (const name of ['run', 'handleInteraction', 'initializeBridge', 'getGuildDirectory']) {
  assertFunction('duplicator', duplicator, name);
}
assertObject('duplicator', duplicator, 'selective');

console.log('✅ Runtime integrity: Duplicator modules load and expose required contracts');
