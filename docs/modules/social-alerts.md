# Social Studio

Social Studio monitors configured creator accounts and sends Discord notifications when supported providers report new live or published content.

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
- `src/modules/social/socialQueue.js` — restart-safe delivery queue and retries
- `src/modules/social/socialHistory.js` — delivery, suppression and provider history
- `src/modules/social/socialManager.js` — alert delivery, routing and account lifecycle
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Storage

Configuration is stored under `modules.social`. Each account stores its platform, public identifier, destination, mention configuration, provider metadata and last-seen content state.

The module also stores:

- `history` — the latest delivery and provider events
- `deliveryQueue` — pending and exhausted alert deliveries
- `settings.quietHours` — global quiet-hour configuration
- `account.metadata.routing` — optional per-content-type destination channels
- `account.metadata.quietHours` — optional account-level quiet-hour overrides

## Runtime

The module runs an initial provider check when Discord becomes ready and starts two idempotent schedulers:

1. Provider checks
2. Delivery-queue processing

Disabled modules, disabled accounts and disabled providers are skipped. Provider failures are isolated per account and recorded in account metadata, analytics and history.

## Notification routing

Every account has a normal fallback alert channel. Optional account routing can override that destination for:

- Live streams
- Uploads
- Shorts
- Social posts

Routing is stored inside `account.metadata.routing`. A routed channel is used when available; otherwise the normal account alert channel is used.

## Quiet hours

Quiet hours can be configured globally and optionally overridden per account.

Configuration supports:

- Enabled, disabled or inherited account state
- Start time
- End time
- IANA timezone

Alerts detected during quiet hours are queued rather than discarded. Overnight windows such as `23:00` to `08:00` are supported.

## Delivery queue

The delivery queue is persistent and survives restarts.

It provides:

- Content-ID deduplication
- Automatic processing every minute
- Immediate startup processing
- Exponential retry delays
- Five delivery attempts before permanent failure
- Manual retry-now
- Manual processing
- Individual removal
- Full queue clearing
- Queue health summary

Delivery failures caused by an inaccessible channel or Discord send error enter the queue. Successful queued sends update the normal duplicate-suppression state so they cannot be resent by the provider scheduler.

## Alert history

Social stores the latest 500 operational events, including:

- Sent alerts
- Test alerts
- Provider failures
- Discord delivery failures
- Manual provider checks
- Scheduler exceptions
- No-new-content checks
- Duplicate suppression
- Quiet-hour queueing
- Retry scheduling
- Successful retries
- Retry exhaustion

History can be filtered by status, account, platform and alert type.

## Discord Social Studio

The Discord panel uses one session-based section selector so feature screens remain inside Discord's five-row component limit.

### Overview

- Module status
- Creator and provider summary
- Queue and history summary
- Add creator
- Check all
- Enable or disable
- Export

### Creators

- Stored creator-account selector
- Public identifier editor
- Default alert channel
- Optional mention role
- Alert-type configuration
- Enable or disable
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
- Provider enable or disable controls
- Manual provider checks

No credential input fields are exposed.

### Operations Centre

- Per-creator live, upload, short and post routing
- Global quiet hours
- Optional creator quiet-hour overrides
- Alert-history summary and recent entries
- Delivery-queue selector
- Retry-now
- Individual queue removal
- Manual queue processing
- Confirmed queue clearing
- Confirmed history clearing

### Health

- Account and provider diagnostics
- Routed-channel checks
- Quiet-hour validation
- Failed delivery queue checks
- Previous provider failures
- Repair
- Check all
- Export
- Confirmed reset

## Dashboard Social Studio

The dashboard mirrors all six Discord sections:

- Overview with module, queue and history analytics
- Creator library with public-identifier setup, per-type routing, editing, checking, test alerts and removal
- Alert Studio with template editing, variables and live preview
- Provider Centre with honest readiness and enable or disable controls
- Operations Centre with quiet hours, delivery queue, retry controls and alert history
- Health with diagnostics, repair, export and confirmed reset

The dashboard setup remains zero-credential. It never asks administrators for API keys, tokens or private creator access.

## API

The module is mounted at `/api/social` and supports provider discovery, overview, configuration, account create/update/delete, provider checks, test alerts, manual guild scans, health, repair, export and reset.

Operational endpoints include:

- `GET /:guildId/history`
- `DELETE /:guildId/history`
- `GET /:guildId/queue`
- `POST /:guildId/queue/process`
- `POST /:guildId/queue/:queueId/retry`
- `DELETE /:guildId/queue/:queueId`
- `DELETE /:guildId/queue`

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. Twitch polling is currently implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are completed. Accounts for unavailable providers remain configurable, but health and Provider Centre expose the real provider state.

## Completion state

Social Studio remains `IN_PROGRESS` because production provider coverage is not complete. The flagship Discord and dashboard management surfaces, canonical runtime, route, storage, provider scheduler, restart-safe queue, history, routing, quiet hours, health, repair, export, reset and documentation are present.
