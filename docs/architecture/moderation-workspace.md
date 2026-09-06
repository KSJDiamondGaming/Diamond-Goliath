# Moderation Workspace

The Discord moderation UI uses one canonical selected-member workspace.

## Flow

1. Select a member from the user dropdown.
2. Apply direct moderation actions: Warn, Timeout, Kick, Quarantine, or Ban.
3. Use reversal controls only when state permits: Clear Timeout, Clear Quarantine, or Clear Warn.
4. Open Intelligence or Cases for deeper member context.
5. Back is always isolated on the final navigation row and exits to Administration.

## Selected-member panel

When a member is selected, the main Moderation panel carries the member context directly rather than routing through separate Member and Actions panels. It includes identity, account/server age, highest role, timeout state, warning/case counts, latest case, authority context, safety information, and the member avatar.

Legacy `member` and `overview` moderation routes normalize to the canonical `actions` workspace for compatibility. There is no separate Member navigation button.

## Member appeals

`/mod` is management-only and does not expose a member-facing appeal option. Members who are still in the guild submit and review appeals through `/user` → Account → Appeals.

The User Panel appeal view is scoped to the signed-in Discord user and only exposes that user's moderation cases and appeal state. Appeal submission reuses the moderation case eligibility rules and feeds the same management Appeal Queue used by the Moderation Hub.

Banned or otherwise external users are not routed through `/mod`. External appeal entry points are handled separately through Goliath DM and web flows while linking back to the same Discord user ID, moderation case and management Appeal Queue.

## Member Intelligence network

Member Intelligence is evidence-led and only uses information Goliath can legitimately observe or has explicitly verified. It must never claim Discord-wide server history, private messages, IP/device identifiers, Discord internal enforcement history, or ownership of suspected alternate accounts.

The intelligence layer persists member observations across Goliath-managed guilds, including first/last seen state, joins/leaves, identity changes, role and elevated-permission changes, timeout/boost/screening state, and scan snapshots. The scan combines this history with moderation cases, warnings, appeals/evidence, cross-guild moderation records, investigation state, and verified identity links.

Goliath Watchlist states are `Clear`, `Watchlisted`, `Restricted`, and `Blacklisted`. Every non-clear decision requires a reason and may carry a category/review date. Changes are audited, and sensitive watchlist transitions are reported to Sentinel. Suspected-account heuristics remain investigation signals and never automatically create blacklist state or increase risk without verified evidence.

The main intelligence scan is the compact investigation workspace. Risk Details, Identity History and Behaviour are no longer separate main-workspace buttons: their useful summaries are rendered directly in the scan. Network Reputation remains a dedicated drill-down because it can contain substantial cross-guild and external evidence records. Existing legacy component routes may remain available for compatibility with already-rendered messages, but new workspaces do not render the removed buttons.

The main scan information layout is intentionally grouped as follows:

- `🚦 Status & Risk` — risk score/label, Watchlist state, active cases/warnings and verified contributing risk factors, or `No verified risk factors` when none exist.
- `👤 Member` — username/display name, created/joined time, roles/elevated permissions, timeout state and a compact identity-history status.
- `⚖️ Moderation` — cases, warnings, timeouts, bans and latest moderation case.
- `🔎 Investigation` — Investigation Watch, notes, stored link evidence and verified identity links.
- `🌐 Network & Behaviour` — observed/current/former Goliath guilds, cross-guild cases, external intelligence counts and the current 30-day behaviour trend.

There is no separate `🧠 Intelligence Summary` field. Network and behaviour information is consolidated into `🌐 Network & Behaviour`, while identity and risk details are surfaced in their relevant sections.

Member Intelligence is a single unified workspace: selecting Intelligence for an active member opens the live intelligence scan directly rather than a separate landing panel. The member selector remains at the top of that same message, followed by the scan summary, action controls, and the final Back/Export navigation row. Opening the workspace does not create a scan-history snapshot; changing member or explicitly choosing Rescan performs the scan flow, while Rescan remains the explicit snapshot-producing action.

The normal workspace controls are grouped by purpose:

- Core investigation row: `🔄 Rescan | 🕘 Scan History | 🌐 Network Reputation`.
- Investigation actions row: `🔗 Link Evidence | 📝 Add Note | 👁️ Investigation Watch | 🛡️ Watchlist`, subject to the moderator's granted capabilities.
- Final navigation row: `⬅️ Back | 📤 Export`, with Export shown only when permitted.

Rescan deliberately creates a new snapshot. Scan History handles historical snapshots and comparison. Network Reputation opens deeper cross-guild/external evidence. Link Evidence and Add Note create investigation data. Investigation Watch and Goliath Watchlist remain separate state systems even though their controls are grouped visually.

Member Intelligence component navigation reuses the current ephemeral interaction message wherever Discord permits. Scan History, comparison, evidence, Network Reputation, Watchlist and Back-to-Scan transitions edit the existing panel instead of creating a chain of new ephemeral messages. Returning from a drill-down does not create a new stored scan snapshot unless the moderator explicitly runs Rescan.

Scan History preserves where it was opened from. When opened from the Intelligence workspace, Back returns to the current Member Intelligence scan. Comparison, delete confirmation and clear-history confirmation preserve the same origin so nested Back/Cancel controls always return one logical level up.

Scan History supports deleting an individual stored scan snapshot or clearing all stored scan snapshots for the selected member, with an explicit confirmation before deletion. These operations remove only `moderation.member_scan.completed` snapshot records. Cases, warnings, evidence, investigation notes, watchlist records and non-scan moderation audit history are retained. Snapshot deletion and history clearing are themselves recorded as moderation system audit events.

Account comparison is entered only from Scan History. The main Intelligence scan does not expose a separate Compare Member button. The comparison selector and comparison result both provide a Back to Scan History control and reuse the same ephemeral panel.

Investigation Watch is distinct from the persistent Goliath Watchlist. Opening Investigation Watch first shows a dedicated status view; it does not immediately change state. Enable/Remove is performed from that status view, audited separately, and returns to the same watch view. Returning to the scan after an investigation-state or note change refreshes the display without recording another scan snapshot.

## Network Reputation

Member Intelligence keeps Goliath-observed guild history separate from external reputation information. The Network Reputation view combines current/former Goliath guild observations and cross-guild moderation cases with manually supplied external records classified as `Verified External`, `Evidence Submitted`, or `Reported / Unverified`.

A `Verified External` record requires a traceable evidence/reference value. Submitted and unverified reports remain visible for investigation but do not contribute to the automated risk score. Verified external ban/blacklist records may contribute bounded risk points, but no external record automatically changes the Goliath Watchlist state; Watchlisted, Restricted and Blacklisted remain explicit audited management decisions. Sensitive verified external ban/blacklist additions are reported to Sentinel.

Goliath never claims Discord-wide guild or ban history. A missing external record means `No Data`, not that the member has a clean global history.
