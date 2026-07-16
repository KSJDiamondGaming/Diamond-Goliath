# Polls

Polls provides stored, deployable Discord community polls with button voting, automatic closing, lifecycle recovery, health, repair, export, and reset.

## Canonical files

- `src/modules/polls/polls.js` — runtime and deployment lifecycle
- `src/modules/polls/pollsPanel.js` — Discord administration
- `src/modules/polls/pollsRoute.js` — dashboard/API surface
- `src/modules/polls/pollsHealth.js` — health, repair, export, and reset
- `src/modules/polls/pollsManager.js` — existing storage and message builders pending final consolidation

## Storage

Polls are stored under `modules.polls`. Legacy top-level `polls` data remains readable while guild data is normalised into the canonical module section on the next save.

## Lifecycle

A poll is created as a draft, deployed to a configured Discord channel, activated for voting, and closed manually or automatically. Redeployment reuses the tracked message when possible. New messages are removed if persistence fails, and edited messages are restored when a lifecycle save fails.

## Voting

Votes are serialized per guild and poll to prevent concurrent updates from overwriting each other. Interaction IDs are deduplicated, single-choice vote switches are tracked separately, and live message refreshes respect `showResultsLive`.

## Automatic closing

`settings.autoCloseHours` controls automatic closing. The module scans when Discord becomes ready and once per minute afterwards. The deployed message creation timestamp is used as the start time, so the close schedule survives process restarts.

## Health and repair

Health checks validate configured channels and every active poll deployment. Repair refreshes accessible messages and redeploys missing active poll messages when a valid channel remains available.

## API

The module is mounted at `/api/polls` and provides configuration, creation, update, deployment, status, deletion, health, repair, export, and reset operations.

## Discord administration

Discord administration supports channel selectors, manager-role selection, module settings, health, repair, export, and confirmed reset. Real poll creation and editing remain dashboard-first until the Discord-native creation workflow is completed.

## Remaining completion work

- Replace sample-only Discord creation with native modal/select workflows for real polls.
- Consolidate `pollsManager.js` into the canonical runtime when doing so does not increase complexity.
- Add dashboard controls for health, repair, export, reset, and auto-close configuration.
- Remove the temporary `src/server/routes/polls.js` compatibility shim after `server.js` points directly to `pollsRoute.js`.
