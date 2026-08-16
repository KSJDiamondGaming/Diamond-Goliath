# Welcome

Welcome sends configurable public and direct-message onboarding messages when a member joins a Discord server.

## Design and delivery model

Embed Studio owns the full visual message design. Welcome owns delivery.

```text
Embed Studio
→ save the customised message as a template
→ bind the template to Welcome / welcome
→ Welcome sends it automatically when a member joins
```

The same template can still be previewed or posted manually from Embed Studio. Editing the saved template updates future Welcome deliveries without creating a second copy.

## Storage

Configuration is stored through GuildManager under:

```text
guild.modules.welcome
```

Embed templates and bindings are stored through GuildManager under:

```text
guild.embedStudio.templates
guild.embedStudio.bindings.welcome.welcome
```

No standalone module JSON files are used.

Welcome role-notification settings are stored in the same module section:

```text
modules.welcome.allowRolePings
modules.welcome.mentionRoleIds
```

## Runtime

Welcome runs from the shared member join event. The current join order is:

```text
Verification
→ Auto Roles
→ Welcome
→ Admin join log
```

This means Auto Roles can assign an initial member role before the Welcome message is delivered.

Welcome supports:

- Public welcome messages
- Optional direct-message welcomes
- New-member mentions
- Configurable role notifications
- Bot filtering
- Embed Studio template bindings
- Member and server template variables
- Delivery analytics

Role notifications are restricted with Discord `allowedMentions`. Welcome never enables unrestricted role, `@everyone` or `@here` parsing. Only the configured new member and selected notification roles can generate a real ping.

Supported Welcome variables include:

```text
{user}
{userMention}
{username}
{userId}
{userAvatar}
{memberAvatar}
{guild}
{guildName}
{server}
{serverName}
{guildIcon}
{guildBanner}
{memberCount}
{createdAt}
{joinedAt}
{timestamp}
{welcomeRoles}
{welcomeRoleMentions}
{welcomeRolesNoPing}
```

`{welcomeRoles}` and `{welcomeRoleMentions}` resolve to the configured role mentions for public delivery. When pings are suppressed, including previews and DMs, they render as display-only role names instead.

## Auto Roles and Timed Roles workflow

Welcome does not duplicate role assignment or role timers.

The intended onboarding progression is:

```text
Member joins
→ Auto Roles optionally assigns an initial role
→ Welcome sends the public/DM welcome and optional role notifications
→ Timed Roles later evaluates the member's real guild join date
→ Timed Roles awards the configured milestone role
→ Timed Roles optionally removes the earlier role through its cleanup-role setting
```

This keeps responsibilities separate:

- Auto Roles: immediate join-time role assignment.
- Welcome: message delivery and safe notifications.
- Timed Roles: tenure progression and later role cleanup.

Welcome stores no duplicate Timed Roles rule, timer or schedule.

## Discord Admin panel

Open:

```text
/admin → Modules → Welcome
```

The panel provides:

- Enable and disable
- Welcome channel selector
- Embed Studio template selector and binding
- DM welcome toggle
- Mention settings sub-panel
- New-member ping toggle
- Native multi-role selector for welcome notification roles
- Role-notification enable/disable toggle
- Bot filtering toggle
- Preview delivery, including while the module is disabled
- Health repair
- JSON export
- Full reset

Up to 10 notification roles can be configured.

## Dashboard

The Welcome dashboard displays the active bound template, delivery settings, analytics and health. Selecting a template creates the same `welcome → welcome` binding used by Embed Studio.

The dashboard also supports:

- New-member ping enable/disable
- Role-notification enable/disable
- Multi-role notification selection
- Notification-role health visibility

## API

Base path:

```text
/api/welcome/:guildId
```

Endpoints:

- `GET /overview`
- `PUT /config`
- `PATCH /enabled`
- `POST /template`
- `POST /repair`
- `POST /test`
- `POST /reset`
- `GET /export`

`PUT /config` accepts the canonical Welcome settings, including `allowRolePings` and `mentionRoleIds`.

## Preview delivery

A preview welcome uses the selected channel and active Embed Studio template even when Welcome is currently disabled. Preview sends do not increase live delivery analytics.

Preview/ephemeral output suppresses real member and role pings while preserving display-only names.

## Startup recovery and health

Startup validates:

- Welcome enabled state
- Configured channel existence
- View Channel permission
- Send Messages permission
- Embed Links permission
- Active template existence
- Explicit Embed Studio binding
- Selected role-notification references
- Whether selected roles are mentionable, or Goliath has `Mention Everyone` in the welcome channel

Health reports deleted notification roles and roles that cannot actually be pinged with the bot's current channel permissions.

Repair:

- Clears missing/unusable welcome channels
- Clears invalid DM template references
- Removes deleted notification-role references
- Disables role notifications if no valid notification roles remain

## Doctor

```powershell
npm run audit:welcome
npm run doctor
```
