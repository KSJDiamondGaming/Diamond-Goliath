# Goliath Deployment

## Canonical deployment model

DEV is the source of truth for tracked application code.

A normal push to `dev` now performs the complete deployment chain automatically:

```text
LOCAL DEV
  -> local beta + production refs aligned by .githooks/pre-push
  -> origin/dev pushed
  -> Deploy Goliath validates and deploys VPS DEV
  -> Sync Goliath Environments aligns origin/beta + origin/production to the same DEV commit
  -> VPS BETA updated and restarted
  -> VPS PRODUCTION updated and restarted
  -> final commit/tree/PM2 verification
```

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

## Normal workflow

Work only on `dev`.

```bash
git add .
git commit -m "describe the change"
git push origin dev
```

Do not manually merge `dev -> beta -> production` during the normal workflow. The deployment pipeline now keeps the tracked source branches and VPS checkouts aligned automatically.

The tracked pre-push hook also moves the local `beta` and `production` refs to the exact DEV commit before the push. `package.json` configures `.githooks` through the npm `prepare` script.

If hooks are not active on a fresh clone, run once:

```bash
npm install
git config core.hooksPath .githooks
```

## What a successful push guarantees

For tracked source code, a completed automatic deployment verifies:

```text
origin/dev        = origin/beta        = origin/production
VPS dev HEAD      = VPS beta HEAD      = VPS production HEAD
VPS dev tree      = VPS beta tree      = VPS production tree
PM2 dev           = online / BOT_MODE=dev
PM2 beta          = online / BOT_MODE=beta
PM2 production    = online / BOT_MODE=production
```

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
