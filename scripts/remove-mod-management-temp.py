from pathlib import Path


def replace_between(path, start_marker, end_marker, replacement=''):
    p = Path(path)
    text = p.read_text()
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'Missing start marker in {path}: {start_marker}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'Missing end marker in {path}: {end_marker}')
    p.write_text(text[:start] + replacement + text[end:])


panel = Path('src/core/administration/mod/panel.js')
text = panel.read_text()
text = text.replace("const VIEW_ALIASES = Object.freeze({ overview: 'member', tools: 'management' });", "const VIEW_ALIASES = Object.freeze({ overview: 'member' });")
text = text.replace("const ALLOWED_VIEWS = new Set(['member', 'actions', 'intelligence', 'cases', 'management', 'analytics']);", "const ALLOWED_VIEWS = new Set(['member', 'actions', 'intelligence', 'cases', 'analytics']);")
text = text.replace("  if (normalized === 'management') return hasAny(member, guild, ['manage_presets', 'view_analytics', 'export_cases', 'edit_case', 'bulk_warn', 'bulk_timeout', 'bulk_kick', 'bulk_ban']);\n", "")
text = text.replace("  else if (safeView === 'management') { embeds.push(buildManagementEmbed(interaction)); components.push(...buildManagementRows(targetId, interaction.member, interaction.guild)); }\n", "")
panel.write_text(text)

replace_between(
    panel,
    "function buildDashboardNav(targetId, activeView, member, guild) {",
    "function buildUserSelectRow()",
    """function buildDashboardNav(targetId, activeView, member, guild) {
  const active = normalizeView(activeView);
  const id = targetId || 'none';
  const buttons = [];

  if (targetId) {
    const candidates = [
      ['member', '👤 Member'],
      ['actions', '⚡ Actions'],
      ['intelligence', '🧠 Intel'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => view !== active && canViewDashboardSection(member, guild, view));

    for (const [view, label] of candidates.slice(0, 4)) {
      buttons.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:${view}`).setLabel(label).setStyle(ButtonStyle.Secondary));
    }
  }

  buttons.push(new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
  return new ActionRowBuilder().addComponents(buttons);
}
"""
)

replace_between(panel, "function buildManagementRows(targetId, member, guild) {", "function validateDashboardComponents")
replace_between(panel, "function buildManagementEmbed(interaction) {", "function buildAnalyticsOverviewEmbed")

interactions = Path('src/core/administration/mod/interactions.js')
replace_between(interactions, "async function handleManagementSelect(i) {", "async function handleOpenActionButton")
text = interactions.read_text()
text = text.replace("routeHandlers(i, [handleManagementSelect, handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu])", "routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu])")
interactions.write_text(text)
