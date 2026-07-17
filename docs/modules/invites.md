# Invite Studio

Invite Studio creates Discord-style invite links with optional roles, tracks which invite a member used, maintains inviter totals, applies leave corrections, grants reward roles and provides managed invite health.

## Storage

All data is stored in the canonical guild document under:

```text
guild.modules.invites
```

Invite-specific link configuration is stored in:

```text
guild.modules.invites.inviteLinks[inviteCode]
```

No standalone Invite Studio JSON files are used.

## Discord administration

Open Invite Studio with:

```text
/invites
```

Manage Server permission is required.

The Discord workspace provides a Discord-style invite creator with:

- Invite channel
- Expire after
- Maximum uses
- Optional multi-role selection
- Temporary membership toggle
- Generate invite action
- Active invite-link view
- Invite deletion

It also provides module controls, synchronization, settings, managed invite creation, reward milestones, leaderboard, health and repair.

## Invite roles

Each Invite Studio link can store up to 25 role IDs. The Discord workspace role selector exposes up to 10 roles per creation action because of Discord component limits; the dashboard supports the full stored limit.

When a member joins:

1. Invite Studio detects the invite code whose use count increased.
2. It loads the configuration stored for that exact code.
3. It validates each configured role.
4. It grants every assignable role to the new member.
5. It records granted and failed roles in history and analytics.

Goliath refuses to create a role-bearing invite when a selected role is missing, managed by an integration, or positioned at or above Goliath's highest role.

This is intentionally invite-specific. Roles selected for one invite are never applied to members joining through another invite.

## Temporary membership

The temporary membership option is passed directly to Discord when the invite is created.

Discord temporary membership removes a temporary member when they disconnect unless a role has been assigned. Because Invite Studio can assign roles immediately after joining, selecting both temporary membership and invite roles normally causes the member to become permanent once those roles are granted. This matches Discord's native behavior.

## Dashboard

Dashboard route:

```text
/invites
```

Dashboard features include:

- Discord-style invite-link creator
- Optional multi-role selection
- Expiry and maximum-use controls
- Temporary membership
- Active invite-link table
- Role display per invite
- Invite deletion
- Enable and disable
- Invite cache synchronization
- Managed invite channel and log channel
- Tracking, leave-credit and bot settings
- Reward-role milestones
- Manual bonus adjustments
- Leaderboard
- Join, leave, role-grant and invite-link history
- Health, repair, export and reset

## Attribution

Invite Studio caches the guild invite-use counters. When a member joins, it fetches the latest counters and identifies the invite whose use count increased.

Attribution can be:

- `invite` — a public guild invite with a known inviter
- `unknown` — no reliable public invite delta was available

Discord does not always expose enough information to identify vanity URL joins or deleted/expired single-use invites with certainty. Invite Studio records these honestly as unknown rather than inventing an inviter.

## Inviter totals

Each inviter stores total joins, active referrals, departed referrals, new-account warnings, manual bonus, granted reward roles and the last invite timestamp.

Leaderboard score is:

```text
active referrals + bonus
```

When `removeOnLeave` is enabled, a departing referred member reduces the inviter's active count and increases the departed count.

## Reward roles

Reward roles are separate from invite roles.

- Invite roles are granted to the member who joins through a configured link.
- Reward roles are granted to the inviter when their active referral count reaches a configured threshold.

Reward roles must exist, be assignable and remain below Goliath's highest role.

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
GET    /:guildId/links
POST   /:guildId/links
DELETE /:guildId/links/:code
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

Create-link body:

```json
{
  "channelId": "123456789012345678",
  "maxAge": 2592000,
  "maxUses": 0,
  "roleIds": ["123456789012345679"],
  "temporary": false
}
```

## Runtime events

Invite Studio handles client-ready synchronization, invite creation, invite deletion, member joins and member departures.

## Health

Health verifies required guild permissions, invite creation permission, Manage Roles when invite links grant roles, role existence and hierarchy, log channel availability, managed invite validity and cache synchronization.

## Doctor

Run:

```bash
node scripts/invites-doctor.js
```

The acceptance Doctor validates the runtime, Discord workspace, role-link creation flow, command, interaction routing, lifecycle events, API mount, dashboard route, module registry, manifest and documentation.
