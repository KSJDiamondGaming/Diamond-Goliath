from pathlib import Path


def replace_between(text, start_marker, end_marker, replacement=''):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'Missing start marker: {start_marker}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'Missing end marker: {end_marker}')
    return text[:start] + replacement + text[end:]


# ---- cases.js: remove superseded analytics/search blocks and compact controls ----
cases = Path('src/core/administration/mod/cases.js')
text = cases.read_text()
text = text.replace("const TRACKED_ACTIONS = Object.freeze(['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout']);\n", '')

# Legacy analytics helpers are one contiguous block and have been superseded by panel.js analytics.
text = replace_between(text, 'function countCasesByAction(', 'function buildCaseFilterButtons(')

# Compact Cases pagination + filters into a single row so dropdown + controls + nav + Back stay <= 5 rows.
compact_controls = '''function buildCaseFilterButtons() { return []; }
function buildCasesPageButtons(targetId, page, totalPages, actionFilter = 'all', statusFilter = 'all') {
  const actionOrder = ['all', 'warn', 'timeout', 'kick', 'ban', 'note'];
  const statusOrder = ['all', 'active', 'reversed', 'expired'];
  const actionIndex = Math.max(0, actionOrder.indexOf(actionFilter));
  const statusIndex = Math.max(0, statusOrder.indexOf(statusFilter));
  const nextAction = actionOrder[(actionIndex + 1) % actionOrder.length];
  const nextStatus = statusOrder[(statusIndex + 1) % statusOrder.length];
  const actionLabel = actionFilter === 'all' ? 'All' : actionFilter[0].toUpperCase() + actionFilter.slice(1);
  const statusLabel = statusFilter === 'all' ? 'All' : statusFilter[0].toUpperCase() + statusFilter.slice(1);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page - 1}`).setLabel(`${EMOJIS.BACK} Prev`).setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:${nextAction}:${statusFilter}:0`).setLabel(`Action: ${actionLabel}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:${nextStatus}:0`).setLabel(`Status: ${statusLabel}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page + 1}`).setLabel(`Next ${EMOJIS.NEXT}`).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  )];
}

'''
text = replace_between(text, 'function buildCaseFilterButtons(', 'function getCaseAppeals(', compact_controls)

# Old cases.js search implementation is superseded by dedicated caseSearch.js.
text = replace_between(text, 'function buildCaseSearchModal(', 'function buildCaseIdModal(')

legacy_open_variants = [
    "  if (id === 'mod_search_cases') {\n    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));\n    await interaction.showModal(buildCaseSearchModal()); return true;\n  }\n",
    "  if (id === 'mod_search_cases') {\n    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));\n    await interaction.showModal(buildCaseSearchModal());\n    return true;\n  }\n",
]
removed_open = False
for block in legacy_open_variants:
    if block in text:
        text = text.replace(block, '')
        removed_open = True
        break
if not removed_open:
    raise SystemExit('Legacy mod_search_cases branch not found')

text = replace_between(
    text,
    "  if (id.startsWith('mod_submit_case_search')) {",
    "  if (id.startsWith('mod_submit_case_note:'))",
)

text = text.replace('  searchCases,\n', '')
for export_name in [
    '  getModerationAnalytics,\n', '  buildCaseSearchModal,\n', '  parseCaseSearchInput,\n',
    '  buildCaseSearchResultsEmbed,\n', '  buildCaseSearchResultButtons,\n',
    '  buildCaseSearchPaginationButtons,\n',
]:
    text = text.replace(export_name, '')
cases.write_text(text)


# ---- panel.js: keep the safer interactions.js preset editor as the only editor path ----
panel = Path('src/core/administration/mod/panel.js')
text = panel.read_text()
text = replace_between(text, 'function buildPresetEditorModal(', 'function buildPresetExecutionModal(')

for branch_start in ["  if (id.startsWith('mod_preset_create:')) {", "  if (id.startsWith('mod_preset_edit:')) {"]:
    start = text.find(branch_start)
    if start < 0:
        raise SystemExit(f'Expected duplicate preset branch not found: {branch_start}')
    end = text.find('\n', start)
    if end < 0:
        raise SystemExit(f'Could not remove preset branch: {branch_start}')
    text = text[:start] + text[end + 1:]
panel.write_text(text)


# ---- Dead-route / duplicate guards ----
checks = {
    'src/core/administration/mod/cases.js': [
        'function getModerationAnalytics(', 'function buildCaseSearchModal(',
        "id === 'mod_search_cases'", "id.startsWith('mod_submit_case_search')",
    ],
    'src/core/administration/mod/panel.js': [
        'function buildPresetEditorModal(', "id.startsWith('mod_preset_create:')",
        "id.startsWith('mod_preset_edit:')", ':management',
    ],
    'src/core/administration/mod/interactions.js': [
        'handleActionSelectMenu', 'handleSelectUserButton', 'handleManagementSelect',
    ],
}
for path, forbidden in checks.items():
    source = Path(path).read_text()
    remaining = [item for item in forbidden if item in source]
    if remaining:
        raise SystemExit(f'Dead/duplicate references remain in {path}: {remaining}')

print('Moderation duplicate cleanup applied.')
