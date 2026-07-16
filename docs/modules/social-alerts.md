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
- `src/modules/social/socialHistory.js` — durable delivery, failure and suppression history
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Storage

Configuration is stored under `modules.social`. Each account stores its platform, public identifier, alert channel, mention configuration, provider metadata and last-seen content state.

The same section stores a bounded operational history of the most recent 500 Social events. History is preserved across restarts and records successful sends, tests, provider checks, duplicate suppression, skipped checks and delivery failures.

## Runtime

The module runs an initial provider check when Discord becomes ready and starts one idempotent scheduler. Disabled modules, disabled accounts and disabled providers are skipped. Provider failures are isolated per account and recorded in account metadata, analytics and operational history.

## Alert history

Every meaningful Social operation records:

- Status: sent, failed, skipped, suppressed, queued, retried or test
- Creator and account
- Platform and alert type
- Provider status
- Content ID and title when available
- Discord channel and message IDs for delivered alerts
- Failure or suppression reason
- Timestamp

History can be filtered by status, creator account, platform and alert type. It can also be cleared independently without resetting creator configuration.

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

History endpoints:

- `GET /api/social/:guildId/history`
- `DELETE /api/social/:guildId/history`

The history query supports `limit`, `status`, `accountId`, `platform` and `alertType` filters.

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. Twitch polling is currently implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are completed. Accounts for unavailable providers remain configurable, but health and Provider Centre expose the real provider state.

## Completion state

Social Alerts remains `IN_PROGRESS` because provider coverage, notification routing, quiet hours, queue/retry behaviour and full alert-history controls in both management surfaces are not complete. Canonical routing, Discord administration, dashboard administration, storage, API, scheduler, health, repair, export, reset and durable operational history are present.