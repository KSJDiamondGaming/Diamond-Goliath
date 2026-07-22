# Social Studio

Social Studio is Goliath's zero-credential creator monitoring and Discord notification platform.

Server administrators only enter public creator information: a username, handle, channel ID, channel name, or public profile URL. Provider credentials are owned and managed centrally by Goliath and are never requested from server administrators or creators.

## Canonical structure

Social Studio is being consolidated into one five-file module under `src/modules/socialStudio/`:

- `social.js` — canonical module entry
- `socialStore.js` — storage, defaults, migrations, analytics, queue state, and history state
- `socialRuntime.js` — providers, polling, creators, simulation, delivery, queue, history, diagnostics, health, repair, export, and reset
- `socialPanel.js` — the single Discord Social Studio administration surface
- `socialRoute.js` — the single Social Studio API route

The storage key remains `social`. Runtime helper files, duplicate Creator Hub panels/routes, compatibility wrappers, and the legacy `providers/` folder are absorbed into the five canonical files rather than retained as parallel implementations.

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

## Supported production providers

### Twitch

Twitch live polling is production-ready when Goliath's global Twitch credentials are configured.

### YouTube

YouTube polling is production-ready when Goliath's global `YOUTUBE_API_KEY` is configured. It resolves public handles, legacy usernames, channel IDs, and public channel URLs, then classifies the latest content as live, upload, or Short.

### Kick

Kick live polling is production-ready when Goliath's global `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` are configured. Administrators only enter a public Kick username or profile URL.

### X

X public-post polling is production-ready when Goliath's global app-only credentials are configured. Administrators only enter a public X handle or profile URL. Protected accounts cannot be monitored through public app-only access.

## Intentionally unavailable providers

TikTok and Instagram are visible for product transparency but are not part of the Social Studio v1 production scope.

Their official monitored-account APIs require authorization from the creator or professional account being monitored. That conflicts with Goliath's locked rule that server administrators must not need to request credentials, OAuth approval, or private access from every creator.

These providers report:

```text
authorization_required
```

They are not reported as broken or unfinished. They may be added later only when a compliant public monitoring path exists.

## Safe baseline behaviour

The first content item discovered for a newly configured account becomes its baseline and is not announced. This prevents old uploads, existing live streams, or previous posts from creating false alerts during setup or restart recovery.

## Creator profiles

Creator profiles group multiple platform accounts under one creator. Profiles support:

- Display names
- Notes
- Tags
- Groups
- Shared defaults
- Enabled state
- Account linking and unlinking
- Safe profile rebuilding
- Provider-free simulation

Discord access is available through `/socialhub`, which opens the canonical Social Studio panel for members with Manage Server permission.

## Alert delivery

Every supported content type follows one canonical path:

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

## Flagship management surfaces

Discord and dashboard management include:

- Overview
- Account library
- Creator profiles
- Alert Studio
- Provider Centre
- Operations Centre
- Health and diagnostics
- Routing
- Global and per-account quiet hours
- Restart-safe delivery queue
- Retry-now, remove, process, and clear controls
- Alert and provider history
- Notification Simulator
- Export and reset

## Health scores

Accounts, creator profiles, and the module receive scores based on identifiers, destinations, provider readiness, check freshness, provider errors, and failed deliveries.

- 90–100: Excellent
- 75–89: Healthy
- 50–74: Warning
- 0–49: Critical

## Doctor

`npm run doctor` runs the main repository Doctor and the Social Studio checks.

The final Social Studio Doctor contract validates:

- The module lives at `src/modules/socialStudio/`
- Exactly five canonical module files exist
- No legacy `src/modules/social/` implementation remains
- No duplicate Creator Hub panel or route remains
- No helper wrapper or nested provider implementation remains
- The canonical panel, route, runtime, and store import successfully
- The dashboard surface and module registry remain connected
- The storage key remains `social`
- Documentation matches the deployed architecture

## Completion state

The supported zero-credential production scope is:

```text
Twitch   ✅
YouTube  ✅
Kick     ✅
X        ✅
```

TikTok and Instagram are intentionally excluded because their official access model does not satisfy Goliath's zero-credential creator-monitoring rule. Their exclusion does not reduce Social Studio v1 maturity.

Live provider acceptance still depends on Goliath's global credentials being configured correctly in each deployment. Missing owner credentials are reported through Provider Centre, health, diagnostics, and Doctor-facing operational checks rather than being requested from guild administrators.