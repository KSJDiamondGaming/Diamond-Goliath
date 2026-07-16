# Social Alerts

Social Alerts monitors configured creator accounts and sends Discord notifications when supported providers report new live content.

## Canonical files

- `src/modules/social/social.js` — canonical runtime entry
- `src/modules/social/socialPanel.js` — Discord administration
- `src/modules/social/socialRoute.js` — dashboard/API surface
- `src/modules/social/socialHealth.js` — health, repair, export and reset
- `src/modules/social/socialScheduler.js` — recurring provider checks
- `src/modules/social/socialManager.js` — alert delivery and account lifecycle
- `src/modules/social/socialStore.js` — guild configuration normalization
- `src/modules/social/providerRegistry.js` — provider discovery and checks

## Storage

Configuration is stored under `modules.social`. Each account stores its platform, identifier, alert channel, mention configuration, provider metadata and last-seen content state.

## Runtime

The module runs an initial provider check when Discord becomes ready and starts one idempotent scheduler. Disabled modules, disabled accounts and disabled providers are skipped. Provider failures are isolated per account and recorded in account metadata and analytics.

## Discord administration

Discord administration supports native account creation, account selection, enable/disable, provider checks, test alerts, deletion, default alert-channel selection, manager-role selection, health, repair, export and confirmed reset.

## API

The module is mounted at `/api/social` and supports provider discovery, overview, configuration, account create/update/delete, provider checks, test alerts, manual guild scans, health, repair, export and reset.

## Provider status

Provider readiness is reported honestly by `providerRegistry.js`. At the time of this module pass, Twitch polling is implemented. Other providers may report `not_configured` or `not_implemented` until their production integrations are completed. Accounts for unavailable providers remain configurable but health reports surface the provider state.

## Health and repair

Health validates enabled account identifiers, alert channels, provider availability and previous provider failures. Repair rechecks enabled accounts and refreshes stored provider metadata without sending duplicate alerts.

## Completion state

Social Alerts remains `IN_PROGRESS` until dashboard parity is verified, the temporary server route shim is removed, and provider support decisions are finalised without pretending unavailable provider integrations are complete.
