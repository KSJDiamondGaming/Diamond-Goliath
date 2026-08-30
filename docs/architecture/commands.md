# Canonical Discord command architecture

Goliath exposes five public Discord entry commands:

- `/admin` — administration and Studio navigation
- `/mod` — moderation tools
- `/user` — member-facing tools and profile features
- `/emoji` — member-facing Emoji Studio browser and emoji lookup
- `/e` — short alias for quick Emoji Studio lookup

Command definitions are owned by their systems:

- `src/core/administration/admin/command.js`
- `src/core/administration/mod/command.js`
- `src/core/administration/user/command.js`
- `src/core/administration/user/emojiCommand.js`
- `src/core/administration/user/emojiAliasCommand.js`

Platform command loading, access control and Discord reconciliation live under `src/core/commands/`.

Feature-specific slash commands remain retired by default. `/emoji` and `/e` are intentional member-facing exceptions because Emoji Studio is designed for frequent conversational use rather than administration-only panel navigation.

The private owner `/commandcenter` command is preserved only in its configured owner guild and is not part of the public command surface.
