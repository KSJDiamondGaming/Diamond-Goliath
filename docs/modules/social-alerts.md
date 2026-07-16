# Social Studio

Social Studio is Goliath's zero-credential creator monitoring and notification platform. Server administrators only provide public usernames, handles, channel names, channel IDs or profile URLs. Provider credentials are owned and managed centrally by Goliath.

## Canonical files

- `src/modules/social/social.js` — canonical runtime entry
- `src/modules/social/socialPanel.js` — primary Discord Social Studio
- `src/modules/social/socialCreatorPanel.js` — Discord Creator Hub and simulator workspace
- `src/modules/social/socialRoute.js` — canonical API surface
- `src/modules/social/socialCreatorRoute.js` — Creator Hub and simulator API
- `src/modules/social/socialCreators.js` — unified creator profiles and account links
- `src/modules/social/socialSimulator.js` — provider-free notification simulation
- `src/modules/social/socialHealth.js` — health, repair, export and reset
- `src/modules/social/socialScheduler.js` — provider checks
- `src/modules/social/socialQueue.js` — restart-safe delivery queue and retries
- `src/modules/social/socialHistory.js` — operational history
- `src/modules/social/socialManager.js` — delivery, routing and account lifecycle
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Creator Hub

Creator Hub sits above the existing platform-account model. Existing account configuration, provider state, routing, delivery history and duplicate-suppression state remain intact.

A creator profile supports:

- Display name
- Notes
- Tags
- Group
- Enabled state
- Shared defaults
- Multiple linked platform accounts

Profiles can be created manually or rebuilt safely from existing accounts. Linking and unlinking never deletes a platform account.

## Discord Creator Hub

Administrators can open the native workspace with:

```text
/socialhub
```

The command requires `Manage Server` permission and opens an ephemeral session-based workspace.

The workspace supports:

- Creator profile creation and editing
- Notes, tags and groups
- Enable or disable profile
- Platform-account selection
- Link or unlink accounts
- Rebuild profiles from existing accounts
- Provider-free live, upload, short and post previews
- Routed simulation sends
- Quiet-hour visibility
- Profile deletion while preserving accounts
- Return to the primary Social Studio panel

The workspace remains within Discord's five-row component limit.

## Dashboard Creator Hub

The dashboard Social Studio now includes a dedicated `Creator Hub` tab alongside Overview, Accounts, Alert Studio, Providers, Operations and Health.

It supports:

- Profile creation, editing and deletion
- Notes, tags and groups
- Profile selection
- Linking and unlinking existing platform accounts
- Rebuilding profiles from configured accounts
- Selecting simulation type
- Previewing resolved templates and routes
- Sending a provider-free simulation
- Viewing routed channel and quiet-hour state

## Notification Simulator

The simulator never contacts external providers. It uses controlled sample content and the selected account's real:

- Alert template
- Variable replacement
- Per-type routing
- Default-channel fallback
- Mention mode and role
- Quiet-hour configuration

Preview mode does not post to Discord. Send mode posts through the resolved route. Quiet hours block normal simulation sends unless force mode is explicitly requested through the API. Sent and failed simulations are recorded in operational history.

## Runtime and operations

Social Studio runs an initial provider check when Discord becomes ready and starts idempotent provider and delivery-queue schedulers.

The operational layer includes:

- Per-type routing for live, upload, short and post alerts
- Global and account-level quiet hours
- Restart-safe delivery queue
- Exponential retry handling
- Duplicate suppression
- Alert and provider history
- Health and repair
- Export and reset

## API

The module is mounted at `/api/social`.

Creator Hub endpoints:

- `GET /:guildId/creator-hub`
- `POST /:guildId/creator-hub`
- `POST /:guildId/creator-hub/rebuild`
- `PATCH /:guildId/creator-hub/:creatorId`
- `DELETE /:guildId/creator-hub/:creatorId`
- `POST /:guildId/creator-hub/:creatorId/accounts/:accountId`
- `DELETE /:guildId/creator-hub/:creatorId/accounts/:accountId`
- `POST /:guildId/creator-hub/accounts/:accountId/simulate`

Operational endpoints:

- `GET /:guildId/history`
- `DELETE /:guildId/history`
- `GET /:guildId/queue`
- `POST /:guildId/queue/process`
- `POST /:guildId/queue/:queueId/retry`
- `DELETE /:guildId/queue/:queueId`
- `DELETE /:guildId/queue`

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. Twitch polling is currently implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are complete.

## Completion state

Social Studio remains `IN_PROGRESS`. Creator Hub and Notification Simulator now have API, Discord and dashboard parity. The remaining completion blocker is production provider coverage and the final Doctor/health consolidation pass.
