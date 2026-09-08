# Goliath Deployment

## Canonical deployment model

GitHub `dev` is the central source of truth for tracked application code.

DEV uses a safe two-way Git workflow:

```text
LOCAL DEV
  <-> origin/dev
        -> Deploy Goliath validates and deploys VPS DEV
```

BETA and PRODUCTION do **not** automatically follow DEV.

When a deliberate promotion is required, run the GitHub Actions workflow **Sync Goliath Environments** manually. That manual action takes the current `origin/dev` commit and applies it to:

```text
origin/beta
origin/production
VPS BETA
VPS PRODUCTION
```

Direct VPS DEV source edits are only persistent when they are committed and pushed back to `origin/dev`. Uncommitted VPS edits can be replaced by the deployment reset and must not be treated as canonical source.

Runtime data is intentionally NOT synchronised between environments.

```text
/home/goliath/dev/src/runtime/dev
/home/goliath/beta/src/runtime/beta
/home/goliath/production/src/runtime/production
```

This includes guild JSONs, SQLite databases, logs, backups, cache and other deployment-local state.

## VPS checkouts

```text
/home/goliath/dev
/home/goliath/beta
/home/goliath/production
```

## PM2 processes

```text
goliath-dev
goliath-beta
goliath-production
```

The deployment workflows reload the correct PM2 process after a checkout is updated and verify that the process is online, has the correct working directory and is running the correct `BOT_MODE`.

## Sync local DEV before working

Run this from the local Windows `dev` branch with a clean working tree:

```bash
npm run sync:dev
```

The command safely synchronises local DEV and GitHub DEV in either fast-forward direction:

- if GitHub DEV is ahead, local DEV fast-forwards to it;
- if local DEV is ahead, the command pushes DEV through the normal pre-push validation hook;
- if both sides diverged, it stops rather than overwriting either side.

It does not change local, GitHub, or VPS BETA/PRODUCTION.

## Normal DEV workflow

Work on `dev`.

Before starting or before pushing, synchronise DEV:

```bash
npm run sync:dev
```

Then work normally:

```bash
git add .
git commit -m "describe the change"
npm run sync:dev
```

A normal `git push origin dev` remains supported. The tracked pre-push hook runs validation only; it does not move BETA or PRODUCTION refs.

`package.json` configures `.githooks` through the npm `prepare` script.

If hooks are not active on a fresh clone, run once:

```bash
npm install
git config core.hooksPath .githooks
```

## Manual BETA + PRODUCTION promotion

Use **Actions -> Sync Goliath Environments -> Run workflow** only when BETA and PRODUCTION should receive the current DEV source.

The workflow deliberately:

1. resolves the current `origin/dev` commit;
2. aligns `origin/beta` and `origin/production` to that commit;
3. deploys the same commit to `/home/goliath/beta` and `/home/goliath/production`;
4. runs doctor/build/command sync;
5. reloads `goliath-beta` and `goliath-production`;
6. verifies the final commit/tree and PM2 environment.

## What each successful operation proves

A successful `npm run sync:dev` proves local DEV and `origin/dev` match at that moment.

A successful **Deploy Goliath** DEV run proves the selected DEV commit was validated and deployed to VPS DEV.

A successful manually triggered **Sync Goliath Environments** run proves BETA and PRODUCTION were deliberately aligned and deployed to the DEV snapshot selected at the start of that manual run.

The environments can and should still have different runtime data, Discord guilds, tokens, `.env` files and moderation databases.

## Manual promotion commands

These remain available for recovery or deliberate manual operation:

```bash
npm run promote:beta
npm run promote:production
```

The normal promotion path is the manually triggered **Sync Goliath Environments** workflow so GitHub refs, VPS deployments, dashboard, commands and PM2 are handled together.

## Important

Never copy one environment's runtime directory into another to make source code appear synchronised. Runtime data is deployment-local by design.
