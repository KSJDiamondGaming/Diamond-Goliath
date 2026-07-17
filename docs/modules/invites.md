# Invite Studio

Invite Studio tracks which Discord invite a member used, maintains inviter totals, applies leave corrections, grants reward roles and provides managed invite health.

## Storage

All data is stored in the canonical guild document under:

```text
guild.modules.invites
```

No standalone Invite Studio JSON files are used.

## Discord administration

Open Invite Studio with:

```text
/invites
```

Manage Server permission is required.

The Discord workspace provides module controls, invite synchronization, settings, channel selectors, managed invite creation and validation, reward-role configuration, leaderboard, health and repair.

## Dashboard

Dashboard route:

```text
/invites
```

Dashboard features include:

- Enable and disable
- Invite cache synchronization
- Managed invite channel and log channel
- Managed invite creation, regeneration and validation
- Tracking, leave-credit and bot settings
- Reward-role milestones
- Manual bonus adjustments
- Leaderboard
- Join, leave, invite-create and invite-delete history
- Health, repair, export and reset

## Attribution

Invite Studio caches the guild invite-use counters. When a member joins, it fetches the latest counters and identifies the invite whose use count increased.

Attribution can be:

- `invite` — a public guild invite with a known inviter
- `unknown` — no reliable public invite delta was available

Discord does not always expose enough information to identify vanity URL joins or deleted/expired single-use invites with certainty. Invite Studio records these honestly as unknown rather than inventing an inviter.

## Inviter totals

Each inviter stores:

- Total joins
- Active referrals
- Departed referrals
- New-account/fake warnings
- Manual bonus
- Granted reward roles
- Last invite timestamp

Leaderboard score is:

```text
active referrals + bonus
```

When `removeOnLeave` is enabled, a departing referred member reduces the inviter's active count and increases the departed count.

## Reward roles

Reward milestones contain:

```text
roleId
required invite count
```

Invite Studio grants a reward when active referrals plus bonus reaches the threshold. The role must exist, be assignable and remain below Goliath's highest role.

## Managed invite

Invite Studio can create one unlimited permanent invite in a selected channel. Auto-repair recreates the invite when it is missing and the configured channel is still available.

## API

Base route:

```text
/api/invites
```

Endpoints:

```text
GET    /:guildId
PATCH  /:guildId/enabled
PATCH  /:guildId/settings
POST   /:guildId/sync
POST   /:guildId/managed-invite
POST   /:guildId/managed-invite/validate
GET    /:guildId/leaderboard
PATCH  /:guildId/inviters/:userId/bonus
GET    /:guildId/history
GET    /:guildId/health
POST   /:guildId/repair
GET    /:guildId/export
POST   /:guildId/reset
```

## Runtime events

Invite Studio handles:

- Client ready cache synchronization
- Invite creation
- Invite deletion
- Member joins
- Member departures

## Health

Health verifies:

- Required guild permissions
- Invite creation permission when managed invites are enabled
- Log channel availability
- Managed invite validity
- Reward role existence and assignability
- Cache synchronization state

## Doctor

Run:

```bash
node scripts/invites-doctor.js
```

The acceptance Doctor validates the runtime, Discord workspace, command, interaction routing, lifecycle events, API mount, dashboard route, module registry, manifest and documentation.
