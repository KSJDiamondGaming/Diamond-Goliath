'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const relative = path.relative(ROOT, filePath);
    throw new Error(`Syntax check failed: ${relative}\n${result.stderr || result.stdout}`);
  }
}

function requireSmoke(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  try {
    require(fullPath);
  } catch (error) {
    throw new Error(`Require smoke test failed: ${relativePath}\n${error.stack || error.message}`);
  }
}

function main() {
  const files = [path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))];
  const uniqueFiles = [...new Set(files)].filter((file) => !file.includes(`${path.sep}dashboard${path.sep}`));

  for (const file of uniqueFiles) {
    checkFile(file);
  }

  requireSmoke('src/modules/tempvoice/tempVoiceManager.js');
  requireSmoke('src/modules/tempvoice/tempVoiceStore.js');
  requireSmoke('src/server/routes/tempVoice.js');
  requireSmoke('src/server/routes/modules.js');
  requireSmoke('src/server/routes/ownerDiagnostics.js');

  console.log(`✅ Server syntax OK (${uniqueFiles.length} files checked)`);
}

main();
