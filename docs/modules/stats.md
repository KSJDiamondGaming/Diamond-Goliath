# Stats

Stats is Goliath's user-facing server reporting and counter-channel module.

## Scope

Stats owns:

- Message activity totals
- Voice activity totals
- Member join and leave totals
- Top users and channels
- Stat counter channels
- Scheduled counter refresh
- Dashboard reporting
- Discord administration

Timeline does not duplicate this responsibility. Timeline is internal audit-history infrastructure used by modules to record administrative and system events. It remains under `src/features/timeline/` and is not a standalone configurable reporting module.

## Canonical files

- `src/modules/stats/stats.js` — canonical module entry
- `src/modules/stats/statsPanel.js` — Discord administration
- `src/modules/stats/statsManager.js` — event tracking and counter refresh runtime
- `src/modules/stats/statsStore.js` — guild configuration and activity data
- `src/modules/stats/statsCounters.js` — Discord counter-channel lifecycle

The API route remains temporarily under `src/server/routes/stats.js` until it is moved into `src/modules/stats/statsRoute.js` in the next consolidation pass.

## Runtime

Stats records configured message, voice and membership activity. Counter refreshes are queued after relevant activity and are also refreshed on a recurring schedule.

## Discord administration

The Stats panel supports:

- Enable and disable tracking
- Create the standard counter suite
- Refresh counter channels
- View activity totals
- List configured counters

## Completion state

Stats remains `IN_PROGRESS` until the route is module-owned and health, repair and export are added. Timeline remains internal infrastructure and should not be presented as a separate module in the completed module catalogue.