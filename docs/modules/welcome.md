# Welcome

Welcome sends configurable public and direct-message onboarding messages when a member joins a Discord server.

## Storage

Configuration is stored through GuildManager under:

```text
guild.modules.welcome
```

No standalone module JSON files are used.

## Runtime

Welcome runs from the shared member join event. It supports:

- Public welcome messages
- Optional direct-message welcomes
- Member mentions
- Bot filtering
- Embed Studio template bindings
- Member and server template variables
- Delivery analytics

## Discord Admin panel

Open:

```text
/admin → Modules → Welcome
```

The panel provides:

- Enable and disable
- Welcome channel selector
- DM welcome toggle
- Member ping toggle
- Bot filtering toggle
- Test welcome
- Health repair
- JSON export
- Full reset

## API

Base path:

```text
/api/welcome/:guildId
```

Endpoints:

- `GET /overview`
- `PUT /config`
- `PATCH /enabled`
- `POST /repair`
- `POST /test`
- `POST /reset`
- `GET /export`

## Startup recovery and health

Startup validates the configured welcome channel and Goliath's permissions to view, send messages, and embed links. Missing or unusable channels are reported through health warnings and can be cleared with the repair action.

## Tests and Doctor

```powershell
npm run test:welcome
npm run audit:welcome
npm run doctor
```
