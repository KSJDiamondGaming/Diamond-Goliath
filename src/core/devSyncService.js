'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const intervalMs = Math.max(10000, Number(process.env.GOLIATH_DEV_SYNC_INTERVAL_MS || 30000));
let running = false;
let lastState = '';

function git(args, capture = true) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  return {
    ok: result.status === 0,
    out: String(result.stdout || '').trim(),
    err: String(result.stderr || '').trim(),
  };
}

function sayOnce(state, message) {
  if (state === lastState) return;
  lastState = state;
  console.log(`${new Date().toISOString()} ${message}`);
}

function syncOnce() {
  if (running) return;
  running = true;
  try {
    const branch = git(['branch', '--show-current']);
    if (!branch.ok || branch.out !== 'dev') {
      sayOnce('not-dev', `⏸️ DEV auto-sync paused: local branch is ${branch.out || '(unknown)'}.`);
      return;
    }

    const dirty = git(['status', '--porcelain']);
    if (!dirty.ok) {
      sayOnce('status-error', '⚠️ DEV auto-sync could not read git status.');
      return;
    }
    if (dirty.out) {
      sayOnce('dirty', '⏸️ DEV auto-sync paused while local files have uncommitted changes.');
      return;
    }

    const fetch = git(['fetch', 'origin', 'dev', '--prune']);
    if (!fetch.ok) {
      sayOnce('fetch-error', `⚠️ DEV auto-sync fetch failed: ${fetch.err || 'unknown error'}`);
      return;
    }

    const local = git(['rev-parse', 'HEAD']);
    const remote = git(['rev-parse', 'origin/dev']);
    if (!local.ok || !remote.ok) {
      sayOnce('sha-error', '⚠️ DEV auto-sync could not resolve local or GitHub DEV.');
      return;
    }

    if (local.out === remote.out) {
      sayOnce(`equal:${local.out}`, `✅ DEV aligned: ${local.out}`);
      return;
    }

    const remoteAncestor = git(['merge-base', '--is-ancestor', 'origin/dev', 'HEAD']);
    const localAncestor = git(['merge-base', '--is-ancestor', 'HEAD', 'origin/dev']);

    if (localAncestor.ok) {
      const ff = git(['merge', '--ff-only', 'origin/dev'], false);
      if (!ff.ok) {
        sayOnce('ff-error', '⚠️ DEV auto-sync fast-forward failed.');
        return;
      }
      const now = git(['rev-parse', 'HEAD']);
      sayOnce(`pulled:${now.out}`, `⬇️ Local DEV fast-forwarded to GitHub DEV: ${now.out}`);
      return;
    }

    if (remoteAncestor.ok) {
      sayOnce(`ahead:${local.out}`, '⬆️ Local DEV is ahead; pushing automatically...');
      const push = git(['push', 'origin', 'dev'], false);
      if (!push.ok) {
        sayOnce('push-error', '⚠️ DEV auto-sync push failed.');
        return;
      }
      const refresh = git(['fetch', 'origin', 'dev']);
      const nowRemote = git(['rev-parse', 'origin/dev']);
      if (refresh.ok && nowRemote.ok && nowRemote.out === local.out) {
        sayOnce(`pushed:${local.out}`, `✅ Local DEV pushed to GitHub DEV: ${local.out}`);
      }
      return;
    }

    sayOnce('diverged', '❌ DEV auto-sync paused: local DEV and GitHub DEV diverged. Resolve manually; neither side was overwritten.');
  } finally {
    running = false;
  }
}

console.log(`Goliath DEV auto-sync service started. Interval: ${intervalMs / 1000}s`);
syncOnce();
setInterval(syncOnce, intervalMs).unref();
process.stdin.resume();
