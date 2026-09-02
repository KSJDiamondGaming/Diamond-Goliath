# Moderation Workspace

The Discord moderation UI uses one canonical selected-member workspace.

## Flow

1. Select a member from the user dropdown.
2. Apply direct moderation actions: Warn, Timeout, Kick, or Ban.
3. Use reversal controls only when state permits: Remove Warn or Clear Timeout.
4. Open Intelligence or Cases for deeper member context.
5. Back is always isolated on the final navigation row and exits to Administration.

## Selected-member panel

When a member is selected, the main Moderation panel carries the member context directly rather than routing through separate Member and Actions panels. It includes identity, account/server age, highest role, timeout state, warning/case counts, latest case, authority context, safety information, and the member avatar.

Legacy `member` and `overview` moderation routes normalize to the canonical `actions` workspace for compatibility. There is no separate Member navigation button.

## Member Intelligence network

Member Intelligence is evidence-led and only uses information Goliath can legitimately observe or has explicitly verified. It must never claim Discord-wide server history, private messages, IP/device identifiers, Discord internal enforcement history, or ownership of suspected alternate accounts.

The intelligence layer persists member observations across Goliath-managed guilds, including first/last seen state, joins/leaves, identity changes, role and elevated-permission changes, timeout/boost/screening state, and scan snapshots. The scan combines this history with moderation cases, warnings, appeals/evidence, cross-guild moderation records, investigation state, and verified identity links.

Goliath Watchlist states are `Clear`, `Watchlisted`, `Restricted`, and `Blacklisted`. Every non-clear decision requires a reason and may carry a category/review date. Changes are audited, and sensitive watchlist transitions are reported to Sentinel. Suspected-account heuristics remain investigation signals and never automatically create blacklist state or increase risk without verified evidence.

The intelligence scan exposes drill-down views for Guild History, Watchlist, Risk Details, Identity History, and Behaviour. Risk scoring is explainable and lists the verified factors that contributed points. Behaviour summaries compare 7/30/90-day activity and recent escalation patterns while retaining the main scan as the compact overview.
