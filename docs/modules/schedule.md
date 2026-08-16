# Schedule

Schedule is Goliath's timezone-aware event planning and attendance module. Its reference experience is the Sesh Discord bot, adapted to Goliath's three-command architecture.

Schedule does **not** register `/schedule`, `/event`, `/create`, `/list` or other module-specific slash commands. Administration lives under `/admin -> Utility Studio -> Schedule`; members interact with deployed event messages. Future personal event views belong under `/user`.

## Canonical implementation

The module remains in the existing seven-file folder:

```text
src/modules/utilityStudio/schedule/
├── schedule.js
├── scheduleDeployment.js
├── scheduleHealth.js
├── scheduleInteractions.js
├── schedulePanel.js
├── scheduleStartup.js
└── scheduleTracking.js
```

`guild.modules.schedule` is the only configuration/data source of truth. The normal runtime environment selects the correct guild JSON for dev, beta or production.

`schedule.js` is canonical for event state, recurrence, RSVP state, reminders and processing. `scheduleTracking.js` delegates to it rather than maintaining a second processor. `scheduleInteractions.js` is a compatibility surface that delegates to `scheduleDeployment.js`.

## Sesh-style event model

An event supports:

- Title, description and configurable embed colour
- IANA timezone
- Start/end time and duration
- Announcement/event channel
- Optional voice or stage channel
- Optional location
- Host
- Roles mentioned on deployment
- Roles allowed or blocked from RSVP
- Capacity and waitlist
- Custom RSVP options
- Optional attendee role per RSVP option
- RSVP close time
- Member personal reminder offsets
- Event/channel reminders
- Custom event notifications
- Hourly, daily, weekly, monthly and yearly recurrence
- Repeat interval, occurrence limit and end date
- Optional weekly day selection
- Auto Join Next for recurring attendees
- Optional event thread
- Optional Discord native scheduled-event mirror
- Cancellation, duplication and completion state
- Reusable event templates

## RSVP behaviour

The default options are Going, Maybe and Decline, but admins can define custom options. Each option can be marked as an attendee option and can optionally grant a Discord role.

Only attendee options consume capacity. When an attendee tries to join a full event and waitlisting is enabled, that member is placed on the waitlist. When an attendee place becomes available, the oldest waitlisted member is promoted automatically.

Role restrictions can allow only selected roles or explicitly block selected roles from RSVPing.

Members can manage their RSVP from the deployed event message, including:

- Change or clear RSVP
- View attendees
- Configure personal reminders
- Enable/disable Auto Join Next on repeating events
- Add the event to Google Calendar through a generated calendar link

When overlap warnings are enabled, Goliath warns a member if an attendee RSVP overlaps another event they are already attending.

## Recurrence and timezone handling

Supported repeat types:

- None
- Hourly
- Daily
- Weekly
- Monthly
- Yearly

Recurrence stores the event timezone and advances the event using local-time parts, preserving the intended wall-clock time across daylight-saving changes where the IANA timezone applies.

Repeating events may define:

- Interval
- Occurrence count
- End date
- Weekly day selection
- Auto Join Next permission

Members who enabled Auto Join Next carry their RSVP and personal reminder configuration to the next occurrence. Other RSVP state is reset.

## Reminders and notifications

The processor runs every minute and immediately after Discord becomes ready.

Schedule supports three notification layers:

1. Server/channel reminder offsets stored on the event.
2. Per-member reminder offsets delivered by DM to members who RSVP.
3. Custom event notifications with configurable fire time, title, description, channel and mention roles.

Sent reminder/notification state is persisted so restarts do not intentionally send the same reminder again.

Notification placeholders include:

```text
{event}
{relative}
{time}
{host}
```

## Event threads

Events can create a Discord thread from the deployed event message. Configuration includes:

- Custom thread title with `{event}` placeholder
- Auto-add attendees when they RSVP
- Auto-archive duration
- Stored thread ID for recovery/health checks

## Discord native event mirroring

An event can optionally mirror to Discord's native Scheduled Events system. The module creates or updates the native event when the Goliath event is deployed/updated, provided Goliath has `Manage Events`.

Voice/stage events bind to the selected voice channel. Events without a voice channel use an external event location.

The Goliath RSVP post remains canonical for Goliath attendance state.

## Event templates

Admins can save an event as a reusable template and create a fresh event from that template. New events reset runtime state such as RSVPs, reminder delivery state, deployment IDs, native-event IDs and event-thread IDs.

## Discord admin

Open:

```text
/admin -> Utility Studio -> Schedule
```

The Schedule Studio contains:

- Home/event selector
- Create/Edit event
- Event Setup
- RSVP & Roles
- Repeat & Reminders
- Templates
- Deploy/update event post
- Native event sync
- Cancel/duplicate
- Health

No standalone Schedule slash command is registered.

## Dashboard

Dashboard route:

```text
/schedule
```

The dashboard provides server defaults plus a multi-section event editor for:

- Basics
- RSVP & Roles
- Repeat & Reminders
- Threads & Native Events
- Templates
- Deployment and operations

API base:

```text
/api/schedule/:guildId
```

The API supports module settings, event CRUD, deployments, native sync, RSVP management, member reminders, templates, processing, health/repair, export and reset.

## Health and repair

Health validates:

- Event and voice channels
- Timezones
- Send Messages / Embed Links
- Referenced roles
- Attendee role hierarchy/manageability
- Manage Events when native mirroring is enabled
- Create Public Threads when event threads are enabled
- Stored native-event references
- Stored thread references
- Previous processing errors

Repair removes dead resource references, clears stale event errors and preserves valid event configuration.

## External Sesh features

Goliath now matches the core Discord event/RSVP experience being used as the Sesh reference. Full OAuth-based Google Calendar bidirectional account synchronisation is not implemented by this module build; Goliath currently provides a member-facing Add to Calendar link instead. Polls/time-finder functionality belongs in Goliath's existing Polls/other modules rather than being duplicated inside Schedule.

## Acceptance state

Repository-side Sesh parity is implemented. Do not mark Schedule as fully working/locked until live-guild tests cover event creation/editing, deployment, custom RSVP options, attendee roles, role restrictions, capacity/waitlist promotion, personal reminders, recurrence/Auto Join Next, event threads, native event mirroring, templates, dashboard editing, restart recovery and health/repair.
