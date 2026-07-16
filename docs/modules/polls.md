# Polls

Polls provides stored, deployable Discord community polls with button voting, automatic closing, lifecycle recovery, health, repair, export, and reset.

## Canonical files

- `src/modules/polls/polls.js` — runtime and deployment lifecycle
- `src/modules/polls/pollsPanel.js` — Discord administration
- `src/modules/polls/pollsRoute.js` — dashboard/API surface
- `src/modules/polls/pollsHealth.js` — health, repair, export, and reset
- `src/modules/polls/pollsManager.js` — storage normalization and Discord message builders

## Storage

Polls are stored under `modules.polls`. Legacy top-level `polls` data remains readable while guild data is normalized into the canonical module section on the next save.

## Lifecycle

A poll is created as a draft, deployed to a configured Discord channel, activated for voting, and closed manually or automatically. Redeployment reuses the tracked message when possible. New messages are removed if persistence fails, and edited messages are restored when a lifecycle save fails.

## Voting

Votes are serialized per guild and poll to prevent concurrent updates from overwriting each other. Interaction IDs are deduplicated, single-choice vote switches are tracked separately, and live message refreshes respect `showResultsLive`.

## Automatic closing

`settings.autoCloseHours` controls automatic closing. A dashboard value of `0` disables automatic closing. The module scans when Discord becomes ready and once per minute afterwards. The deployed message creation timestamp is used as the start time, so the close schedule survives process restarts.

## Startup recovery

When Discord becomes ready, Polls closes expired deployments and then runs deployment repair for every enabled guild. Existing messages are refreshed and missing active messages are redeployed when a valid channel is available.

## Health and repair

Health checks validate configured channels and every active poll deployment. Repair refreshes accessible messages and redeploys missing active poll messages when a valid channel remains available.

## API

The module is mounted at `/api/polls` and provides configuration, creation, update, deployment, status, deletion, health, repair, export, and reset operations.

## Discord administration

Discord administration supports:

- Native modal-based poll creation
- Stored-poll selection
- Deployment and message refresh
- Manual closing and deletion
- Channel and manager-role selectors
- Anonymous, multiple-choice and live-result settings
- Health and repair
- JSON export
- Confirmed reset

## Dashboard

The dashboard supports:

- Poll creation and deployment
- Message refresh, close and delete operations
- Default channel configuration
- Automatic-close configuration
- Anonymous, multiple-choice and live-result settings
- Health display and repair
- JSON export
- Confirmed reset

## Remaining repository cleanup

- Remove the temporary `src/server/routes/polls.js` compatibility shim after `server.js` points directly to `src/modules/polls/pollsRoute.js`.
- Run the live Discord acceptance checklist before changing module maturity from `IN_PROGRESS` to `COMPLETE`.
