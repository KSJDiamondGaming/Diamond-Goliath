# Social Alerts

Social Alerts monitors configured creator accounts and sends Discord notifications when supported providers report new live or published content.

## Zero-credential setup

Server administrators and creators never provide API keys, client secrets, OAuth tokens or developer credentials.

They only enter public information:

- Platform
- Public username, handle, channel name, channel ID or profile URL
- Display name
- Discord destination channel
- Optional mention role
- Alert types

Provider credentials are owned and managed centrally by Goliath. Provider readiness is read-only inside the module.

## Canonical files

- `src/modules/social/social.js` — canonical runtime entry
- `src/modules/social/socialPanel.js` — Discord Social Studio
- `src/modules/social/socialRoute.js` — dashboard/API surface
- `src/modules/social/socialHealth.js` — health, repair, export and reset
- `src/modules/social/socialScheduler.js` — recurring provider checks
- `src/modules/social/socialManager.js` — alert delivery and account lifecycle
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Storage

Configuration is stored under `modules.social`. Each account stores its platform, public identifier, alert channel, mention configuration, provider metadata and last-seen content state.

## Runtime

The module runs an initial provider check when Discord becomes ready and starts one idempotent scheduler. Disabled modules, disabled accounts and disabled providers are skipped. Provider failures are isolated per account and recorded in account metadata and analytics.

## Discord Social Studio

The Discord panel follows the same session-based navigation style as Embed Studio and is divided into five screens:

### Overview

- Module status
- Creator and provider summary
- Alerts, errors and attention count
- Quick setup guidance
- Add creator
- Check all
- Export

### Creators

- Stored creator-account selector
- Public identifier editor
- Per-account alert channel
- Optional mention role
- Alert-type configuration
- Enable/disable
- Provider check
- Test alert
- Delete confirmation

### Alert Studio

- Live, upload, short and post templates
- Title, description and button-label editor
- Bound-creator preview
- Variable helper
- Test preview delivery
- Template reset

Supported variables include `{creator}`, `{platform}`, `{title}`, `{game}`, `{viewers}`, `{thumbnail}`, `{streamUrl}`, `{videoUrl}`, `{uploadTime}`, `{duration}` and `{category}`.

### Provider Centre

- Read-only provider readiness
- Supported alert types
- Goliath-managed credential status
- Provider enable/disable controls
- Manual provider checks

No credential input fields are exposed.

### Health

- Account and provider diagnostics
- Missing-channel and identifier checks
- Previous provider failures
- Repair
- Check all
- Export
- Confirmed reset

## Dashboard Social Studio

The dashboard mirrors the five Discord sections:

- Overview with module analytics and quick actions
- Creator library with public-identifier setup, editing, checking, test alerts and removal
- Alert Studio with template editing, variables and live preview
- Provider Centre with honest readiness and enable/disable controls
- Health with diagnostics, repair, export and confirmed reset

The dashboard setup remains zero-credential. It never asks administrators for API keys, tokens or private creator access.

## API

The module is mounted at `/api/social` and supports provider discovery, overview, configuration, account create/update/delete, provider checks, test alerts, manual guild scans, health, repair, export and reset.

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. Twitch polling is currently implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are completed. Accounts for unavailable providers remain configurable, but health and Provider Centre expose the real provider state.

## Completion state

Social Alerts remains `IN_PROGRESS` because provider coverage is not complete. Discord administration, dashboard administration, storage, API, scheduler, health, repair, export, reset and documentation are present. The server-route compatibility shim also remains until `server.js` is switched directly to `src/modules/social/socialRoute.js`.
