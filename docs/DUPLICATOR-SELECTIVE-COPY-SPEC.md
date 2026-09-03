# Server Duplicator — Selective Copy & Transfer Manifest

Status: Locked specification. User chooses implementation priority.

## Goal
Allow Server Duplicator to copy only selected categories/channels instead of requiring a full server copy, while preserving the permissions those selected items depend on and keeping a permanent audit/transfer record of exactly what was moved.

## Selective Scan / Selection Flow
- Copy mode must be able to scan the selected source guild and list its categories and channels before execution.
- User can select individual categories and/or individual channels to copy.
- Selecting a category should offer an obvious option to include all child channels, while still allowing child channels to be individually included/excluded.
- Full-server copy remains available as a separate option.
- Dry-run/analyse must use the exact current selection, not the whole source guild.

## Permission-Preserving Dependency Sync
When selected categories/channels are copied, Duplicator must inspect every permission overwrite on those selected targets and determine the dependencies required to reproduce them.

For each selected category/channel:
- Preserve exact @everyone allow/deny overwrites.
- Preserve exact role allow/deny overwrites.
- Preserve member-specific overwrites only where the same member exists in the destination; otherwise record them as not transferable.
- Detect every source role referenced by the selected targets.
- Build an explicit source-role -> destination-role map before applying channel/category permissions.

## Role Carry / Sync Behaviour
Duplicator must not lose permissions because a source role ID does not exist in the destination.

For each referenced source role, Duplicator must use a clear role-transfer decision and record the result:
- Reuse an existing destination role only when it is intentionally matched.
- Otherwise create/carry the source role into the destination so the selected category/channel permissions can be recreated.
- Preserve the role's base/advanced Discord permission bitfield when Discord permits it.
- Preserve role name, colour, hoist, mentionable state and intended hierarchy position where possible.
- Map every copied/reused role to its new destination role ID before permission overwrites are written.
- Never silently drop a role overwrite because the role was not mapped.
- If Discord hierarchy/permissions prevent an exact role transfer, fail or warn explicitly and list exactly what could not be preserved.

The user may later rename, edit or reorganise roles in the destination. The purpose of automatic role carry is to preserve channel/category access faithfully at transfer time.

## Transfer Manifest — Permanent Record
Every real copy operation must create a permanent transfer manifest/history entry.

Each manifest should retain at minimum:
- Copy/transfer ID.
- Timestamp.
- Initiating user.
- Source guild ID + name + environment.
- Destination guild ID + name + environment.
- Conflict mode and copy options.
- Whether operation was full copy or selective copy.
- Exact selected source category IDs/names.
- Exact selected source channel IDs/names/types and original parents.
- Source category/channel -> destination category/channel ID mapping.
- Every permission overwrite encountered for the selection.
- Every source role required by those overwrites.
- Source role -> destination role mapping.
- Whether each role was created, reused, renamed, skipped, failed, or could not be reproduced exactly.
- Original source role base/advanced permissions.
- Destination role permissions actually verified after transfer.
- Permission overwrites expected vs permission overwrites actually verified on destination channels/categories.
- Member overwrites copied or skipped and why.
- Items created, reused, renamed, skipped, failed or deleted.
- Warnings/errors.
- Rollback/backup ID when available.
- Final verification status.

## User-Facing Permanent List
Duplicator must expose a persistent history/list rather than only a temporary result embed.

The history must let the user open a previous transfer and see clearly:
- What categories/channels were transferred.
- What roles were carried/reused and what they became in the destination.
- What channel/category permissions were transferred.
- What could not be copied and why.
- Destination IDs for copied objects so later edits can be traced.

The result embed for a completed copy should link/point to the permanent transfer record by transfer ID.

## Verification Rules
A selective copy is not successful merely because create API calls returned successfully.

Before reporting success, Duplicator must refetch the exact destination guild and verify:
- Selected categories/channels exist in the intended destination.
- Required role mappings exist.
- Copied role base permissions match the intended source permissions where Discord allows them.
- Category/channel permission overwrites match the source after source-role IDs are translated to destination-role IDs.
- Counts displayed to the user are based on verified destination state.

Any mismatch must be recorded in the permanent manifest and reflected in the final status.

## Relationship to Permissions Studio
This feature remains part of Server Duplicator and is required independently of the future Permissions Studio.
Permissions Studio may later reuse the same role/overwrite mapping and verification engine, but selective copying must work on its own first.
