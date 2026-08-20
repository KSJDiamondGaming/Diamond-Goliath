'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const gitDir = path.join(ROOT, '.git');
const hooksDir = path.join(ROOT, '.githooks');
const prePush = path.join(hooksDir, 'pre-push');

function runGit(args) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function installGitHooks() {
  if (!fs.existsSync(gitDir) || !fs.existsSync(prePush)) return false;

  const result = runGit(['config', 'core.hooksPath', '.githooks']);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Could not configure Git hooks${detail ? `: ${detail}` : '.'}`);
  }

  try {
    fs.chmodSync(prePush, 0o755);
  } catch (_) {
    // Git for Windows can execute the hook without a POSIX chmod bit.
  }

  return true;
}

if (require.main === module) {
  try {
    const installed = installGitHooks();
    console.log(installed ? '✅ Goliath Git hooks installed.' : 'ℹ️ Goliath Git hooks skipped (not a Git checkout).');
  } catch (error) {
    console.error(`❌ Git hook setup failed: ${error.message || error}`);
    process.exitCode = 1;
  }
}

module.exports = { installGitHooks };
