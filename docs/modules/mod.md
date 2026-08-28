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

Mutation callers must pass the Discord user ID of the moderator performing the action. The original case moderator must not be substituted for the actor performing a later edit or reversal.

### Case detail timeline

Case detail can present the audit records with:

- Event/action
- Actor
- Timestamp
- Before value
- After value
- Relevant metadata

The audit record is guild-scoped and must never expose events from another guild.

### Acceptance checklist

- [x] Persistent `case_audit` storage
- [x] Guild/case and guild/actor indexes
- [x] Case creation audit
- [x] Reason-change audit
- [x] Status-change audit
- [x] Note add/edit/clear audit
- [x] Warning reversal audit
- [x] Timeout reversal audit
- [x] Actor attribution on supported mutation paths
- [x] Before/after values
- [x] Case-detail audit presentation
- [ ] Full end-to-end runtime/deployment validation
- [ ] Audit pagination for long histories

### Next implementation stage

The next implementation stage is to expose paginated audit history through the existing case-detail interaction flow. The timeline must retain guild/case scoping, preserve actor attribution and avoid changing the existing case search contract.

### Future extensions

The same audit contract is intended to support later moderation features such as evidence changes, case relationships, merge/split operations, appeals, bulk operations and escalation actions without creating separate history systems for each feature.
