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
- `src/modules/social/socialCreatorRoute.js` — Creator Hub and simulator API
- `src/modules/social/socialCreators.js` — unified creator profiles and platform-account links
- `src/modules/social/socialSimulator.js` — provider-free notification simulation
- `src/modules/social/socialHealth.js` — health, repair, export and reset
- `src/modules/social/socialScheduler.js` — recurring provider checks
- `src/modules/social/socialQueue.js` — restart-safe delivery queue and retries
- `src/modules/social/socialHistory.js` — delivery, suppression and provider history
- `src/modules/social/socialManager.js` — alert delivery, routing and account lifecycle
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Storage

Configuration is stored under `modules.social`. Each platform account stores its public identifier, destination, mention configuration, provider metadata and last-seen content state.

The module also stores:

- `creatorProfiles` — unified creator profiles linking one or more platform accounts
- `history` — the latest delivery and provider events
- `deliveryQueue` — pending and exhausted alert deliveries
- `settings.quietHours` — global quiet-hour configuration
- `account.metadata.routing` — optional per-content-type destination channels
- `account.metadata.quietHours` — optional account-level quiet-hour overrides
- `account.metadata.creatorId` — optional link to a Creator Hub profile

## Creator Hub

Creator Hub sits above the existing platform-account model, so no account migration or production rewrite is required.

A creator profile can contain:

- Display name
- Notes
- Tags
- Group
- Enabled state
- Shared defaults
- Multiple linked platform accounts

Existing accounts can be rebuilt into creator profiles safely. Linking and unlinking accounts does not delete their provider configuration or delivery state.

## Notification Simulator

The simulator does not contact Twitch, YouTube, TikTok, Kick, Instagram or X.

It uses controlled sample content and the selected account's real:

- Alert template
- Variable replacement
- Per-type routing
- Fallback channel
- Mention mode and role
- Quiet-hour state

A simulation can be previewed without posting, or sent to Discord. Quiet hours block simulation sends unless the administrator explicitly forces the test. Every sent or failed simulation is recorded in Social history.

## Runtime

The module runs an initial provider check when Discord becomes ready and starts two idempotent schedulers:

1. Provider checks
2. Delivery-queue processing

Disabled modules, accounts and providers are skipped. Provider failures are isolated per account and recorded in account metadata, analytics and history.

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

Delivery failures caused by an inaccessible channel or Discord send error enter the queue. Successful queued sends update duplicate-suppression state so they cannot be resent by the provider scheduler.

## Alert history

Social stores the latest 500 operational events, including sent alerts, simulations, provider failures, Discord delivery failures, manual checks, scheduler exceptions, duplicate suppression, quiet-hour queueing, retries and retry exhaustion.

History can be filtered by status, account, platform and alert type.

## Discord Social Studio

The Discord panel uses one session-based section selector so feature screens remain inside Discord's five-row component limit.

It currently exposes:

- Overview
- Creators
- Alert Studio
- Provider Centre
- Operations Centre
- Health

Creator Hub profile management and the expanded simulator are the next Discord parity layer.

## Dashboard Social Studio

The dashboard mirrors the six Discord sections and remains zero-credential. Creator Hub profile management and simulator controls are the next dashboard parity layer.

## API

The module is mounted at `/api/social`.

Operational endpoints include:

- `GET /:guildId/history`
- `DELETE /:guildId/history`
- `GET /:guildId/queue`
- `POST /:guildId/queue/process`
- `POST /:guildId/queue/:queueId/retry`
- `DELETE /:guildId/queue/:queueId`
- `DELETE /:guildId/queue`

Creator Hub endpoints include:

- `GET /:guildId/creator-hub`
- `POST /:guildId/creator-hub`
- `POST /:guildId/creator-hub/rebuild`
- `PATCH /:guildId/creator-hub/:creatorId`
- `DELETE /:guildId/creator-hub/:creatorId`
- `POST /:guildId/creator-hub/:creatorId/accounts/:accountId`
- `DELETE /:guildId/creator-hub/:creatorId/accounts/:accountId`
- `POST /:guildId/creator-hub/accounts/:accountId/simulate`

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. Twitch polling is currently implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are completed.

## Completion state

Social Studio remains `IN_PROGRESS`. Creator Hub storage, linking and simulation foundations are now present, but full Discord/dashboard profile management and production provider coverage are still incomplete.
