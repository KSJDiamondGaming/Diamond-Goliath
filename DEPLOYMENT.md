# Goliath Deployment

## Canonical deployment model

GitHub `dev` is the central source of truth for tracked application code.

DEV now uses a safe two-way Git workflow:

```text
LOCAL DEV
  <-> origin/dev
        -> Deploy Goliath validates and deploys VPS DEV
        -> Sync Goliath Environments aligns origin/beta + origin/production to the same validated DEV commit
        -> VPS BETA updated and restarted
        -> VPS PRODUCTION updated and restarted
        -> final commit/tree/PM2 verification
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

The automated deployment reloads the correct PM2 process after the checkout is updated and verifies that the process is online, has the correct working directory and is running the correct `BOT_MODE`.

## Sync local DEV before working

Run this from the local Windows `dev` branch with a clean working tree:

```bash
npm run sync:dev
```

The command safely synchronises local DEV and GitHub DEV in either fast-forward direction:

- if GitHub DEV is ahead, local DEV fast-forwards to it;
- if local DEV is ahead, the command pushes DEV through the normal pre-push validation hook;
- if both sides diverged, it stops rather than overwriting either side;
- after a successful DEV sync, local `beta` and `production` refs are moved to the same DEV commit.

This means automated commits made on GitHub DEV can be pulled back into local DEV, while ordinary local DEV commits can be pushed outward through the same command.

## Normal workflow

Work only on `dev`.

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

A normal `git push origin dev` remains supported. The tracked pre-push hook moves the local `beta` and `production` refs to the exact DEV commit before the push and runs the required validation checks.

Do not manually merge `dev -> beta -> production` during the normal workflow. The deployment pipeline keeps the tracked GitHub branches and VPS checkouts aligned automatically after DEV validates successfully.

`package.json` configures `.githooks` through the npm `prepare` script.

If hooks are not active on a fresh clone, run once:

```bash
npm install
git config core.hooksPath .githooks
```

## What a successful deployment proves

For tracked source code, a completed automatic deployment verifies:

```text
origin/dev        = origin/beta        = origin/production
VPS dev HEAD      = VPS beta HEAD      = VPS production HEAD
VPS dev tree      = VPS beta tree      = VPS production tree
PM2 dev           = online / BOT_MODE=dev
PM2 beta          = online / BOT_MODE=beta
PM2 production    = online / BOT_MODE=production
```

Running `npm run sync:dev` additionally verifies local DEV equals `origin/dev` at that moment and aligns the local `beta` and `production` refs to that same DEV commit.

The environments can and should still have different runtime data, Discord guilds, tokens, `.env` files and moderation databases.

## Dependency and dashboard handling

The deployment checks whether `package.json` / `package-lock.json` changed and runs `npm ci` when required. It runs the Goliath doctor checks, rebuilds the dashboard, synchronises Discord commands and reloads PM2 before verification.

## Manual promotion commands

These remain available for recovery or deliberate manual operation:

```bash
npm run promote:beta
npm run promote:production
```

They are no longer required after an ordinary DEV push.

## Important

Never copy one environment's runtime directory into another to make source code appear synchronised. Runtime data is deployment-local by design.
