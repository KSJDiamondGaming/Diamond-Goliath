# Canonical Discord command architecture

Goliath exposes three public Discord entry commands:

- `/admin` — administration and Studio navigation
- `/mod` — moderation tools
- `/user` — member-facing tools and profile features

Command definitions are owned by their systems:

- `src/core/systems/admin/command.js`
- `src/core/systems/mod/command.js`
- `src/core/systems/user/command.js`

Platform command loading, access control and Discord reconciliation live under `src/core/commands/`.

Feature-specific slash commands and prefix commands are retired. Features should be reached from the appropriate interactive panel rather than creating a parallel command implementation.

The private owner `/commandcenter` command is preserved only in its configured owner guild and is not part of the public command surface.
