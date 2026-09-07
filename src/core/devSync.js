'use strict';

const { spawnSync } = require('child_process');

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    return { ok: false, output: '' };
  }

  return {
    ok: result.status === 0,
    output: options.capture ? String(result.stdout || '').trim() : '',
  };
}

function output(args) {
  const result = git(args, { capture: true });
  return result.ok ? result.output : '';
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const branch = output(['branch', '--show-current']);
if (branch !== 'dev') fail(`DEV sync must be run from the local dev branch. Current branch: ${branch || '(detached)'}`);

const dirty = output(['status', '--porcelain']);
if (dirty) fail('Working tree is not clean. Commit or stash local changes before syncing DEV.');

console.log('🔄 Fetching origin...');
if (!git(['fetch', 'origin', '--prune']).ok) fail('git fetch origin failed.');

let localSha = output(['rev-parse', 'HEAD']);
let remoteSha = output(['rev-parse', 'origin/dev']);
if (!localSha || !remoteSha) fail('Could not resolve local DEV or origin/dev.');

if (localSha === remoteSha) {
  console.log(`✅ Local DEV already matches GitHub DEV: ${localSha}`);
} else {
  const remoteIsAncestor = git(['merge-base', '--is-ancestor', 'origin/dev', 'HEAD'], { capture: true }).ok;
  const localIsAncestor = git(['merge-base', '--is-ancestor', 'HEAD', 'origin/dev'], { capture: true }).ok;

  if (remoteIsAncestor) {
    console.log('⬆️ Local DEV is ahead of GitHub DEV. Pushing DEV...');
    if (!git(['push', 'origin', 'dev']).ok) fail('DEV push failed. No local refs were changed.');
  } else if (localIsAncestor) {
    console.log('⬇️ GitHub DEV is ahead of local DEV. Fast-forwarding local DEV...');
    if (!git(['merge', '--ff-only', 'origin/dev']).ok) fail('Fast-forward failed.');
  } else {
    fail('Local DEV and GitHub DEV have diverged. Automatic sync stopped to avoid overwriting either side.');
  }
}

localSha = output(['rev-parse', 'HEAD']);
remoteSha = output(['rev-parse', 'origin/dev']);
if (localSha !== remoteSha) {
  console.log('🔄 Refreshing origin/dev after push...');
  if (!git(['fetch', 'origin', 'dev']).ok) fail('Could not refresh origin/dev.');
  remoteSha = output(['rev-parse', 'origin/dev']);
}

if (localSha !== remoteSha) fail(`Local DEV (${localSha}) still does not match GitHub DEV (${remoteSha}).`);

console.log('🔄 Aligning local beta and production refs to DEV...');
if (!git(['update-ref', 'refs/heads/beta', localSha]).ok) fail('Could not align local beta ref.');
if (!git(['update-ref', 'refs/heads/production', localSha]).ok) fail('Could not align local production ref.');

const treeSha = output(['rev-parse', 'HEAD^{tree}']);
console.log('');
console.log('✅ DEV sync complete');
console.log(`   Local DEV:       ${localSha}`);
console.log(`   GitHub DEV:      ${remoteSha}`);
console.log(`   Local BETA ref:  ${output(['rev-parse', 'beta'])}`);
console.log(`   Local PROD ref:  ${output(['rev-parse', 'production'])}`);
console.log(`   Tracked tree:    ${treeSha}`);
console.log('');
console.log('GitHub Actions will deploy this DEV commit to VPS DEV, then promote the validated source to BETA and PRODUCTION.');
