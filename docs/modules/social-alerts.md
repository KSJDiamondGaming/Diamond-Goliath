# Social Studio

Social Studio is Goliath's zero-credential creator monitoring and Discord notification platform.

Server administrators only enter public creator information: a username, handle, channel ID, channel name, or public profile URL. Provider credentials are owned and managed centrally by Goliath and are never requested from server administrators or creators.

## Canonical structure

- `social.js` — canonical runtime entry
- `socialPanel.js` — Discord Social Studio
- `socialCreatorPanel.js` — Discord Creator Hub and simulator
- `socialRoute.js` — primary API route
- `socialCreatorRoute.js` — Creator Hub, diagnostics, and simulator API
- `socialManager.js` — account lifecycle and Twitch live delivery
- `socialDelivery.js` — generic upload, Short, and post delivery
- `socialScheduler.js` — provider polling and dispatch
- `socialQueue.js` — restart-safe retries
- `socialHistory.js` — operational ledger
- `socialHealth.js` — health, repair, export, and reset
- `socialDiagnostics.js` — provider, account, and creator health scores
- `socialCreators.js` — unified creator profiles
- `socialSimulator.js` — provider-free notification simulation
- `providerRegistry.js` — provider readiness and dispatch
- `providers/` — provider implementations

## Zero-credential setup

Users configure:

- Platform
- Public username, handle, channel ID, or profile URL
- Display name
- Discord destination channel
- Optional mention role
- Alert types
- Optional per-type routing

Users never configure API keys, OAuth tokens, client secrets, or developer credentials.

## Production providers

### Twitch

Twitch live polling is production-ready when Goliath's global Twitch credentials are configured.

### YouTube

YouTube polling is production-ready when Goliath's global `YOUTUBE_API_KEY` is configured.

The provider resolves public channel handles, legacy usernames, channel IDs, and public channel URLs. It monitors the channel uploads playlist and classifies the latest content as live, upload, or Short.

The first discovered content item becomes the account baseline and is not announced. This prevents an existing live stream or old upload from producing a false alert immediately after setup or restart.

### Kick

Kick live polling is production-ready when Goliath's global `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` are configured.

Server administrators only enter a public Kick username or profile URL. Goliath obtains and caches an app access token centrally, resolves the public channel by slug, and reads live state, title, category, viewers, thumbnail, start time, and mature-content state.

### X

X public-post polling is production-ready when Goliath has either:

- `X_BEARER_TOKEN`, or
- `X_API_KEY` and `X_API_KEY_SECRET`

The legacy `X_CLIENT_ID` and `X_CLIENT_SECRET` names are accepted as fallback aliases for existing deployments.

Server administrators only enter a public X handle or profile URL. Goliath resolves the public account, reads its latest original public post, excludes replies and reposts, resolves attached media, and sends the post through the normal Social template, routing, quiet-hours, queue, history, and duplicate-suppression pipeline.

Protected X accounts are detected but cannot be monitored through app-only public access. The first discovered public post is baselined and is not announced.

## Provider status

TikTok and Instagram remain visible but are reported honestly as `not_configured` or `not_implemented`. Their official monitored-account APIs require creator or business account authorization, which conflicts with Social Studio's locked zero-credential setup for server administrators and creators.

## Creator Hub

Creator Hub groups multiple platform accounts under one creator profile. Profiles support display names, notes, tags, groups, shared defaults, enabled state, account linking, rebuilding, and provider-free simulation.

Discord access is available through `/socialhub` for members with Manage Server permission.

## Alert delivery

Every content type uses the same platform rules:

1. Provider detects content.
2. Initial content is baselined safely.
3. Duplicate state is checked.
4. The configured alert type is checked.
5. Quiet hours are evaluated.
6. Per-type routing resolves the Discord channel.
7. The matching Social template is rendered.
8. Mentions and allowed mentions are applied.
9. Delivery succeeds or enters the restart-safe retry queue.
10. History and analytics are updated.

Supported routes are live, upload, short, and post, with fallback to the account's default alert channel.

## Operations

Social Studio includes:

- Global and per-account quiet hours
- Restart-safe delivery queue
- Exponential retries
- Duplicate suppression
- Alert and provider history
- Retry-now, remove, process, and clear controls
- Health and repair
- Export and reset
- Creator and provider diagnostics
- Notification Simulator

## Health scores

Accounts, creator profiles, and the module receive scores based on identifiers, destinations, provider readiness, check freshness, provider errors, and failed deliveries.

Grades:

- 90–100: Excellent
- 75–89: Healthy
- 50–74: Warning
- 0–49: Critical

## Doctor

`npm run doctor` runs the main repository Doctor and `scripts/social-doctor.js`.

The Social Doctor verifies the runtime, routes, Discord panels, Creator Hub, simulator, diagnostics, delivery service, Twitch, YouTube, Kick, and X providers, queue, history, dashboard, command, and documentation.

## Completion state

Social Studio remains `IN_PROGRESS` because TikTok and Instagram do not have a production monitoring path that preserves the locked zero-credential model. Twitch, YouTube, Kick, and X are production providers, and the flagship Discord, dashboard, Creator Hub, simulator, routing, quiet-hours, queue, history, diagnostics, health, repair, export, reset, and Doctor foundations are present.
