'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const { ROOT, printHeader, relative, resolveRoot, walk } = require('./lib/scriptUtils');

function checkFile(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Syntax check failed: ${relative(filePath)}\n${result.stderr || result.stdout}`);
  }
}

function requireSmoke(relativePath) {
  const fullPath = resolveRoot(relativePath);

  try {
    require(fullPath);
  } catch (error) {
    throw new Error(`Require smoke test failed: ${relativePath}\n${error.stack || error.message}`);
  }
}

function main() {
  const files = [
    resolveRoot('server.js'),
    ...walk(resolveRoot('src')),
    ...walk(resolveRoot('scripts')),
  ];

  const uniqueFiles = [...new Set(files)].filter((file) => !file.includes(`${path.sep}dashboard${path.sep}`));

  for (const file of uniqueFiles) {
    checkFile(file);
  }

  requireSmoke('src/modules/tempvoice/tempVoiceManager.js');
  requireSmoke('src/modules/tempvoice/tempVoiceStore.js');
  requireSmoke('src/server/routes/tempVoice.js');
  requireSmoke('src/server/routes/modules.js');
  requireSmoke('src/server/routes/ownerDiagnostics.js');

  printHeader('✅ Server syntax OK', {
    'Files checked': uniqueFiles.length,
  });
}

main();
