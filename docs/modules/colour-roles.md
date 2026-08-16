# Colour Roles

Colour Roles is Goliath's self-service cosmetic role system. It lives in Role Studio and stores all configuration in the normal environment-aware guild JSON source of truth under:

```text
guild.modules.colourRoles
```

The same canonical implementation is used in dev, beta and production. Runtime mode selects the correct guild JSON; Colour Roles does not use a standalone JSON file or database.

## Canonical module files

```text
src/modules/roleStudio/colourRoles/
├── colourRoles.js
├── colourRolesAppearance.js
├── colourRolesHealth.js
└── colourRolesPanel.js
```

- `colourRoles.js` owns configuration, palette definitions, HEX classification, dynamic-role lifecycle, hierarchy ordering, member selection and usage data.
- `colourRolesAppearance.js` owns safe appearance synchronisation for Goliath-managed colour roles.
- `colourRolesHealth.js` owns diagnostics and repair.
- `colourRolesPanel.js` owns the Discord admin and member-facing UI.

## Core design

Goliath stores the available palette internally and only creates physical Discord roles when a member actually selects a colour. This avoids permanently creating dozens of unused cosmetic roles.

Default palette order:

1. Red — `#E74C3C`
2. Orange — `#E67E22`
3. Yellow — `#F1C40F`
4. Green — `#2ECC71`
5. Blue — `#3498DB`
6. Purple — `#9B59B6`
7. Pink — `#E84393`
8. Black — `#23272A`
9. White — `#F5F5F5`
10. Custom HEX — optional

Admins can enable or disable individual built-in palette entries, but their logical order remains rainbow-first followed by black and white.

Custom HEX colours are classified by HSL hue into the closest rainbow family so their managed Discord roles can be grouped with the appropriate primary colour family. Black and white are handled separately.

## Dynamic Discord roles

When a member selects a colour:

1. Goliath validates the palette/HEX choice.
2. It checks whether a Goliath-managed role already exists for that HEX value.
3. If the role exists, it is reused.
4. If it does not exist, Goliath creates a cosmetic Discord role on demand.
5. Any previous Goliath Colour Role is removed from the member.
6. The selected role is assigned.

Goliath tracks the Discord role IDs it owns in `modules.colourRoles.managedRoles`. It does not remove or edit unrelated guild roles.

Managed colour roles are created with no permissions, are not hoisted and are not mentionable by default.

Unused managed roles can be removed after the configured grace period. The default is seven days. Colour Roles runs maintenance at startup and then hourly so cleanup does not depend on a bot restart.

## Guild role styling

Colour Roles supports server-specific role naming. The default format is:

```text
🎨 | {colour}
```

Admins can use formats such as:

```text
♥️ | {colour}
✦・{colour}
{colour}
```

Supported style placeholders:

```text
{icon}
{separator}
{colour}
```

The admin panel can scan existing guild role names and produce a suggested format. Scanning is advisory and does not automatically change the active Colour Roles format. The admin must explicitly choose **Apply Suggestion**. Existing Goliath-managed colour roles are safely renamed to the active format when the style changes.

## Divider / hierarchy placement

Admins can select an existing divider/anchor role or ask Goliath to create a cosmetic Colour Roles divider. They then choose whether managed Colour Roles sit above or below it.

Goliath only repositions roles recorded in `managedRoles`. Existing unrelated guild roles are not intentionally re-sorted by Colour Roles. Managed roles are ordered by rainbow family, then hue/lightness within that family, followed by black and white.

The module validates the bot's `Manage Roles` permission and Discord role hierarchy. Goliath cannot create/edit/move roles at or above its highest role.

A member's visible Discord name colour is still controlled by Discord's normal role-colour hierarchy behaviour, so a higher coloured staff/subscriber role can visually override a lower cosmetic Colour Role.

## Member picker

The admin can deploy or update a member-facing colour selector in a configured text channel. Members can:

- Choose one of the enabled default palette colours.
- Pick a custom `#RRGGBB` HEX colour when custom HEX is enabled.
- Remove their current Colour Role when removal is enabled.

Only one Goliath-managed Colour Role is retained per member.

## Stats and leaderboards

Colour Roles provides view-only engagement statistics. It does not contain giveaways, random draws or competition logic.

Current-state stats include:

- Number of members using Colour Roles.
- Colour popularity leaderboard.
- Bar/chart view of current colour usage.
- Members currently using each colour.
- Default and custom HEX colours in the same leaderboard.

Historical analytics include selections, switches, removals and managed-role creation/deletion counts.

Future `/user` integration may consume these canonical Colour Roles APIs/data, but user-profile work is intentionally separate from this module build.

## Discord admin

Open:

```text
Admin → Modules → Role Studio → Colour Roles
```

The panel provides:

- Enable / disable.
- Built-in palette enable/disable controls.
- Custom HEX enable/disable.
- Guild role-style scan and explicit Apply Suggestion.
- Custom role-name format.
- Existing divider/anchor selection.
- Create Divider.
- Above/below placement.
- Managed grouping toggle.
- Member picker deployment/update.
- Colour usage leaderboard.
- Members-by-colour view.
- Health / repair.

## Dashboard

Dashboard route:

```text
/colour-roles
```

API base:

```text
/api/colour-roles/:guildId
```

The dashboard mirrors the core controls: module state, palette, custom HEX, role format, advisory guild-style scan/apply, anchor/divider creation, placement, member-picker deployment, cleanup, leaderboard/member names, analytics and health.

API endpoints include overview, config, guild-style scan, apply-style-suggestion, create-divider, picker deployment, usage, cleanup and repair.

## Health and repair

Health checks:

- `Manage Roles` permission.
- Divider/anchor existence and hierarchy.
- Managed role existence.
- Managed role hierarchy.
- Managed role naming against the active format.
- Unexpected permissions on cosmetic roles.
- Hoisted/mentionable managed roles.
- Stale stored member selections that no longer match Discord state.

Repair removes dead managed-role references, clears a missing anchor, removes stale member-selection records, restores cosmetic-role safety/appearance, re-groups managed roles and runs unused-role cleanup.

## Verification

Run the repository-wide checks:

```powershell
npm run syntax
npm run imports
npm run audit
npm run doctor
```

Colour Roles should not be considered live-locked until the Discord member picker, dynamic role creation/reuse, switching, custom HEX family placement, divider/hierarchy placement, cleanup, leaderboard and dashboard have been tested in a real guild.
