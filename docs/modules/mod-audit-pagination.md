# Moderation Audit Timeline Pagination

The moderation case-detail audit timeline uses the canonical `getCaseAudit(guildId, caseId, options)` storage API.

## Contract

- `guildId` is mandatory and scopes every query.
- `caseId` is mandatory and scopes the timeline to one case.
- `page` is zero-based.
- `pageSize` controls the number of events returned.
- Results are ordered newest first by audit ID.
- The response exposes `results`, `page`, `pageSize`, `total` and `totalPages`.

## Current UI boundary

Case Search opens Case Detail through the existing `caseSearch.js` interaction boundary. Case Detail requests the first audit page and renders the most recent events with actor, relative timestamp and before/after values.

Long-history pagination remains the next UI enhancement. It must use the same guild-scoped storage API and must not introduce a second audit store or alter the existing Case Search token contract.

## Acceptance checks

- [x] Persistent audit records are stored in `case_audit`.
- [x] Queries are guild-scoped.
- [x] Queries are case-scoped.
- [x] Newest audit events are returned first.
- [x] Pagination metadata is available from storage.
- [x] Case Detail renders the latest audit page.
- [ ] Case Detail exposes Previous/Next audit-page controls.
- [ ] End-to-end pagination is validated against a case with more than one page of events.

## Implementation guardrails

Audit-page controls must be rendered only when the case has more than one audit page. Previous and Next actions must clamp to the valid page range, preserve the case-search token, re-check guild-scoped permissions, and query the canonical audit storage API. The controls must not mutate the case or create audit records merely by navigating history.
