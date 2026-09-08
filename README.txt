Goliath

Goliath is a full-featured Discord bot with a real-time web dashboard.
It combines moderation tools, automation, logging, and live configuration into one system.


**Features**

Auto Moderation
Spam protection
Moderation System
Cases & warnings
Action logging
History tracking
Logging System
Dashboard
Live configuration
Clean UI system
Real-Time Sync

Emoji & GIF Studio
Static and animated Discord application emojis
Static emojis are added through Add Emoji; all animated media is added through the dedicated Add GIF flow
Add GIF mirrors Add Emoji with Browse GIFs, Upload GIF and Add GIF Link options while keeping animated-only validation
GIF, animated WebP, APNG and AVIF intake where supported by the media decoder
Animated uploads are preserved when already Discord-ready and optimised without silently flattening animation when oversized
If an animation still cannot fit Discord's size limit, management can explicitly retry it as a static first-frame fallback; Goliath never flattens animation silently
Universal shortcode, embed and component resolution keeps static/animated handling central across Goliath modules
Animated emoji and GIF management filters, metadata, canonical CDN URLs and animation-aware duplicate detection
Emoji.gg catalogue browsing uses SSRF-safe pinned DNS resolution with Node all-mode lookup compatibility




above staff roles
above quarantine role
above roles it needs to remove
Manage Roles
Manage Channels
View Audit Log
Manage Webhooks
Ban/Kick/Timeout if used elsewhere

Quarantine hierarchy recovery
If a configured Goliath Quarantine role is managed or sits above the bot and cannot be edited, Goliath replaces it with an editable quarantine role below its own hierarchy before applying channel isolation.

Permission-safe quarantine isolation
Goliath uses View Channel as the quarantine containment boundary instead of attempting to deny unrelated permission bits that Discord may reject. Channels already inaccessible to the quarantine role are skipped. Channels that still require an isolation overwrite are checked for Goliath's effective Manage Roles and View Channel permissions before the overwrite is attempted. Investigation category and room overwrites use the same minimal permission model.

Quarantine overwrite bypass guard
Before a member is isolated, Goliath checks for member-specific View Channel allows because Discord applies member overwrites after role overwrites. If a personal allow would bypass the quarantine role, Goliath refuses to claim guaranteed isolation and reports the affected channel instead of silently leaving access open.

User appeal notices
Moderation appeal notices are sent as user-facing embeds. Members appeal through the case button or by DMing Goliath and using /appeal; internal /mod routes are never presented as user instructions. A secure web appeal route can be added later without changing the Discord case workflow.
