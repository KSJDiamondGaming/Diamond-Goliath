from pathlib import Path
import re

root = Path.cwd()
base = root / "src/modules/feedbackStudio/tickets"

groups = {
    "tickets.js": ["ticketDefaults.js", "ticketStore.js"],
    "ticketsLifecycle.js": ["ticketManager.js"],
    "ticketsChannels.js": ["ticketNaming.js", "ticketPermissions.js", "ticketChannelManager.js", "ticketGuard.js"],
    "ticketsPanel.js": ["ticketChannelButtons.js", "ticketPanelManager.js", "ticketSetupPanel.js"],
    "ticketsTranscripts.js": ["ticketTranscriptManager.js"],
    "ticketsTracking.js": ["ticketSocketEvents.js", "ticketAnalytics.js", "ticketTimeline.js", "ticketRecovery.js", "ticketStartup.js"],
    "ticketsInteractions.js": ["ticketActions.js", "ticketInteractionHandler.js"],
    "ticketsHealth.js": ["ticketsHealth.js"],
}

namespaces = {
    "tickets.js": "core",
    "ticketsLifecycle.js": "lifecycle",
    "ticketsChannels.js": "channels",
    "ticketsPanel.js": "panel",
    "ticketsTranscripts.js": "transcripts",
    "ticketsTracking.js": "tracking",
    "ticketsInteractions.js": "interactions",
    "ticketsHealth.js": "health",
}

source_target = {}
source_api = {}
for target, sources in groups.items():
    for source in sources:
        stem = Path(source).stem
        source_target[stem] = target
        source_api[stem] = f"{stem}Api"

local_require = re.compile(r"require\((['\"])\./([^'\"]+)\1\)")


def clean_source(source_name, target_name):
    text = (base / source_name).read_text(encoding="utf-8")
    text = re.sub(r"^\s*['\"]use strict['\"];\s*\n", "", text, count=1)
    text = re.sub(r"^//\s*src/modules/feedbackStudio/tickets/[^\n]+\n?", "", text, count=1)

    def replace_require(match):
        stem = match.group(2)
        if stem not in source_target:
            return match.group(0)
        target = source_target[stem]
        if target == target_name:
            return source_api[stem]
        return f"require('./{Path(target).stem}')"

    text = local_require.sub(replace_require, text)
    text = text.replace("module.exports =", f"{source_api[Path(source_name).stem]} =", 1)
    return text.strip()


def render_target(target, sources):
    output = [
        "'use strict';",
        "",
        "/**",
        f" * Canonical Tickets {namespaces[target]} layer.",
        " *",
        " * This file is the single source of truth for the responsibilities",
        " * consolidated below. Legacy ticket implementation files were removed.",
        " */",
        "",
    ]
    output.extend(f"let {source_api[Path(source).stem]};" for source in sources)
    output.append("")

    for source in sources:
        output.extend([
            "// ============================================================================",
            f"// {Path(source).stem}",
            "// ============================================================================",
            "{",
        ])
        output.extend(f"  {line}" if line else "" for line in clean_source(source, target).splitlines())
        output.extend(["}", ""])

    output.append("module.exports = {")
    output.extend(f"  ...{source_api[Path(source).stem]}," for source in sources)
    output.extend(f"  {Path(source).stem}: {source_api[Path(source).stem]}," for source in sources)
    output.extend(["};", ""])
    return "\n".join(output)


for target, sources in groups.items():
    (base / target).write_text(render_target(target, sources), encoding="utf-8", newline="\n")

# Break the recovery/lifecycle/panel loading cycle by deferring cross-layer access.
tracking_path = base / "ticketsTracking.js"
tracking = tracking_path.read_text(encoding="utf-8")
tracking = tracking.replace(
    "  const ticketChannelManager = require('./ticketsChannels');\n  const { sendTicketControlMessage } = require('./ticketsPanel');",
    "  const ticketChannelManager = new Proxy({}, {\n"
    "    get(_target, property) {\n"
    "      return require('./ticketsChannels')[property];\n"
    "    },\n"
    "  });\n"
    "  const sendTicketControlMessage = (...args) =>\n"
    "    require('./ticketsPanel').sendTicketControlMessage(...args);",
)
tracking_path.write_text(tracking, encoding="utf-8", newline="\n")

# Publish core data immediately, then expose the complete public module API.
tickets_path = base / "tickets.js"
text = tickets_path.read_text(encoding="utf-8")
marker = "module.exports = {"
index = text.rfind(marker)
if index < 0:
    raise RuntimeError("tickets.js export marker missing")
core_prefix = text[:index]
core_object = text[index:].replace(marker, "const coreApi = {", 1).rstrip() + "\n\n"
public_tail = """// Publish persistence/defaults before loading dependent layers.
module.exports = coreApi;

const lifecycle = require('./ticketsLifecycle');
const channels = require('./ticketsChannels');
const panel = require('./ticketsPanel');
const transcripts = require('./ticketsTranscripts');
const tracking = require('./ticketsTracking');
const interactions = require('./ticketsInteractions');
const health = require('./ticketsHealth');

function getOverview(guildId) {
  const ticketList = typeof lifecycle.getGuildTickets === 'function'
    ? lifecycle.getGuildTickets(guildId)
    : typeof coreApi.getAllTickets === 'function'
      ? coreApi.getAllTickets(guildId)
      : [];
  const panelData = typeof coreApi.getPanels === 'function' ? coreApi.getPanels(guildId) : { panels: [] };
  const panelList = Array.isArray(panelData?.panels) ? panelData.panels : [];
  const statusCounts = ticketList.reduce((counts, ticket) => {
    const status = String(ticket?.status || 'open').toLowerCase();
    counts[status] = Number(counts[status] || 0) + 1;
    return counts;
  }, {});

  return {
    enabled: true,
    tickets: {
      total: ticketList.length,
      open: statusCounts.open || 0,
      claimed: statusCounts.claimed || 0,
      closed: statusCounts.closed || 0,
      archived: statusCounts.archived || 0,
      deleted: statusCounts.deleted || 0,
    },
    panels: {
      total: panelList.length,
      deployed: panelList.filter((item) => Boolean(
        item?.deployed
        || (item?.deployChannelId && item?.deployMessageId)
        || (item?.channelId && item?.messageId)
      )).length,
    },
    settings: typeof coreApi.getTicketSettings === 'function' ? coreApi.getTicketSettings(guildId) : {},
  };
}

Object.assign(module.exports, lifecycle, {
  getOverview,
  buildHealthReport: health.buildHealthReport,
  repairPanel: health.repairPanel,
  repairAll: health.repairAll,
  handleTicketInteraction: interactions.handleTicketInteraction,
  core: coreApi,
  lifecycle,
  channels,
  panel,
  transcripts,
  tracking,
  interactions,
  health,
  startup: tracking,
});
"""
tickets_path.write_text(core_prefix + core_object + public_tail, encoding="utf-8", newline="\n")

# Supply the timeline event contract that the legacy timeline implementation expected.
text = tickets_path.read_text(encoding="utf-8")
source_anchor = "  const TICKET_SOURCE = {\n    DISCORD_PANEL: 'discord_panel',\n    DISCORD_COMMAND: 'discord_command',\n    WEB_PORTAL: 'web_portal',\n    FORM_SUBMISSION: 'form_submission',\n    API: 'api',\n    AUTOMATION: 'automation',\n  };\n"
events = source_anchor + """
  const TICKET_TIMELINE_EVENTS = Object.freeze({
    CREATED: 'ticket_created', CLAIMED: 'ticket_claimed', CLOSED: 'ticket_closed',
    REOPENED: 'ticket_reopened', ARCHIVED: 'ticket_archived', DELETED: 'ticket_deleted',
    STATUS_CHANGED: 'ticket_status_changed', PRIORITY_CHANGED: 'ticket_priority_changed',
    ASSIGNED: 'ticket_assigned', USER_ADDED: 'ticket_user_added', USER_REMOVED: 'ticket_user_removed',
    NOTE_ADDED: 'ticket_note_added', STAFF_ACTIVITY: 'ticket_staff_activity',
    DISCORD_CHANNEL_CREATED: 'discord_channel_created', DISCORD_CHANNEL_CLOSED: 'discord_channel_closed',
    DISCORD_CHANNEL_REOPENED: 'discord_channel_reopened', DISCORD_CHANNEL_ARCHIVED: 'discord_channel_archived',
    DISCORD_CHANNEL_DELETED: 'discord_channel_deleted', TRANSCRIPT_CREATED: 'ticket_transcript_created',
    TRANSCRIPT_UPLOADED: 'ticket_transcript_uploaded', SYSTEM: 'ticket_system',
  });
"""
if source_anchor not in text:
    raise RuntimeError("ticket source anchor missing")
text = text.replace(source_anchor, events, 1)
text = text.replace("    TICKET_SOURCE,\n", "    TICKET_SOURCE,\n    TICKET_TIMELINE_EVENTS,\n", 1)
tickets_path.write_text(text, encoding="utf-8", newline="\n")

path_map = {
    "ticketDefaults": "tickets", "ticketStore": "tickets", "ticketManager": "ticketsLifecycle",
    "ticketNaming": "ticketsChannels", "ticketPermissions": "ticketsChannels",
    "ticketChannelManager": "ticketsChannels", "ticketGuard": "ticketsChannels",
    "ticketChannelButtons": "ticketsPanel", "ticketPanelManager": "ticketsPanel",
    "ticketSetupPanel": "ticketsPanel", "ticketTranscriptManager": "ticketsTranscripts",
    "ticketSocketEvents": "ticketsTracking", "ticketAnalytics": "ticketsTracking",
    "ticketTimeline": "ticketsTracking", "ticketRecovery": "ticketsTracking",
    "ticketStartup": "ticketsTracking", "ticketActions": "ticketsInteractions",
    "ticketInteractionHandler": "ticketsInteractions", "ticketsHealth": "ticketsHealth",
}

for path in root.rglob("*.js"):
    if ".git" in path.parts or ".goliath" in path.parts:
        continue
    if path.parent == base and path.name not in groups:
        continue
    data = path.read_text(encoding="utf-8")
    original = data
    for old, new in path_map.items():
        data = data.replace(f"/tickets/{old}", f"/tickets/{new}")
        data = data.replace(f"./{old}'", f"./{new}'").replace(f'./{old}"', f'./{new}"')
        data = data.replace(f"../tickets/{old}'", f"../tickets/{new}'").replace(f'../tickets/{old}"', f'../tickets/{new}"')
    if data != original:
        path.write_text(data, encoding="utf-8", newline="\n")

interaction_path = root / "src/events/interactions/interactionCreate.js"
interaction = interaction_path.read_text(encoding="utf-8")
interaction = interaction.replace(
    "optionalRequire('tickets', '../../modules/feedbackStudio/tickets/tickets')",
    "optionalRequire('tickets', '../../modules/feedbackStudio/tickets/ticketsInteractions')",
)
interaction_path.write_text(interaction, encoding="utf-8", newline="\n")

admin_path = root / "src/core/admin/functions/adminPanel.js"
admin = admin_path.read_text(encoding="utf-8")
admin = admin.replace(
    "require('../../modules/feedbackStudio/tickets/ticketsPanel')",
    "require('../../../modules/feedbackStudio/tickets/ticketsPanel')",
)
admin_path.write_text(admin, encoding="utf-8", newline="\n")

server_path = root / "server.js"
server = server_path.read_text(encoding="utf-8").replace(
    "./src/modules/feedbackStudio/tickets/ticketsRoute",
    "./src/server/routes/tickets",
)
server_path.write_text(server, encoding="utf-8", newline="\n")

route_path = root / "src/server/routes/tickets.js"
route = route_path.read_text(encoding="utf-8")
if 'router.get("/:guildId/health"' not in route:
    health_routes = """
router.get("/:guildId/health", async (req, res) => {
  try {
    const guild = await fetchGuild(req, req.params.guildId);
    if (!guild) return res.status(404).json({ success: false, error: "Guild is unavailable." });
    const health = await require("../../modules/feedbackStudio/tickets/ticketsHealth").buildHealthReport(guild);
    return res.json({ success: true, health });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to check Tickets health." });
  }
});

router.post("/:guildId/health/repair", async (req, res) => {
  try {
    const guild = await fetchGuild(req, req.params.guildId);
    if (!guild) return res.status(404).json({ success: false, error: "Guild is unavailable." });
    const result = await require("../../modules/feedbackStudio/tickets/ticketsHealth").repairAll(guild, req.body?.actorId || null);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "Unable to repair Tickets." });
  }
});

router.post("/:guildId/panels/:panelId/repair", async (req, res) => {
  try {
    const guild = await fetchGuild(req, req.params.guildId);
    if (!guild) return res.status(404).json({ success: false, error: "Guild is unavailable." });
    const panel = await require("../../modules/feedbackStudio/tickets/ticketsHealth").repairPanel(guild, req.params.panelId, req.body?.actorId || null);
    return res.json({ success: true, panel });
  } catch (error) {
    const status = /not found/i.test(String(error.message || "")) ? 404 : 500;
    return res.status(status).json({ success: false, error: error.message || "Unable to repair ticket panel." });
  }
});
"""
    route = route.replace("\nmodule.exports = router;", health_routes + "\nmodule.exports = router;")
    route_path.write_text(route, encoding="utf-8", newline="\n")

for path in base.glob("*.js"):
    if path.name not in groups:
        path.unlink()

(root / "docs/modules/tickets.md").write_text("""# Tickets

Tickets is a flagship Goliath module. Its implementation is consolidated into eight canonical files, with one source of truth for each responsibility.

## Canonical structure

```text
src/modules/feedbackStudio/tickets/
├── tickets.js
├── ticketsPanel.js
├── ticketsInteractions.js
├── ticketsLifecycle.js
├── ticketsChannels.js
├── ticketsTranscripts.js
├── ticketsTracking.js
└── ticketsHealth.js
```

- `tickets.js` — defaults, persistence, normalisation, public API and module overview.
- `ticketsPanel.js` — embeds, buttons, menus, modals, setup UI and panel deployment.
- `ticketsInteractions.js` — Discord interaction routing and ticket actions.
- `ticketsLifecycle.js` — create, claim, assign, close, reopen, archive and delete workflows.
- `ticketsChannels.js` — channel creation, naming, Discord permissions and ticket guards.
- `ticketsTranscripts.js` — transcript creation, storage, reading and upload.
- `ticketsTracking.js` — socket events, timeline, analytics, recovery and startup recovery.
- `ticketsHealth.js` — diagnostics and repair operations.

The dashboard/API router lives at `src/server/routes/tickets.js`; it is not a module implementation file.

## Architecture rules

- External consumers import the canonical file that owns the required responsibility.
- Visible Discord UI belongs in `ticketsPanel.js`.
- No compatibility layers, bridge files or duplicate ticket implementations.
- Guild configuration remains in the established guild data store.
- Discord and dashboard behaviour must remain aligned.
- Doctor and Audit must pass before Tickets is considered complete.
""", encoding="utf-8", newline="\n")

for temporary in [
    root / ".github/workflows/tickets-refactor-export.yml",
    root / ".github/workflows/tickets-refactor-export-refresh.yml",
    root / ".github/workflows/tickets-refactor-build.yml",
    root / ".goliath/export-artifact-id.txt",
    root / ".goliath/export-artifact-refresh-id.txt",
    root / ".goliath/tickets_refactor.py",
]:
    temporary.unlink(missing_ok=True)
