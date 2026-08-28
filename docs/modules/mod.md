# Moderation Case Management

## Persistent audit timeline

Moderation cases maintain a persistent audit timeline alongside the canonical case record.

Each audit event is scoped to the guild and case and records the acting moderator when the mutation path provides an actor ID. Audit records retain the event type, timestamp, before/after values and operation metadata so case history can be reviewed without relying on transient socket events.

The audit surface currently covers:

- Case creation
- Case reason changes
- Case status changes
- Case note add/edit/clear operations
- Warning reversals
- Timeout reversals

Live case socket events remain separate from the persistent audit record. They are notification mechanisms, not the source of truth for case history.

### Actor attribution

Mutation callers should pass the Discord user ID of the moderator performing the action. The original case moderator must not be substituted for the actor performing a later edit or reversal.

### Case detail timeline

Case detail can present the audit records with:

- Event/action
- Actor
- Timestamp
- Before value
- After value
- Relevant metadata

The audit record is guild-scoped and must never expose events from another guild.

### Future extensions

The same audit contract is intended to support later moderation features such as evidence changes, case relationships, merge/split operations, appeals, bulk operations and escalation actions without creating separate history systems for each feature.
