from pathlib import Path


def find_function_span(text, name):
    markers = [f'function {name}(', f'async function {name}(']
    starts = [text.find(marker) for marker in markers]
    starts = [value for value in starts if value >= 0]
    if not starts:
        return None
    start = min(starts)
    paren = text.find('(', start)
    depth = 0
    quote = None
    escape = False
    i = paren
    signature_end = None
    while i < len(text):
        ch = text[i]
        if quote:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in "'\"`":
            quote = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                signature_end = i
                break
        i += 1
    if signature_end is None:
        raise SystemExit(f'Could not parse signature for {name}')
    brace = text.find('{', signature_end)
    if brace < 0:
        raise SystemExit(f'Could not find body for {name}')
    depth = 0
    quote = None
    escape = False
    i = brace
    while i < len(text):
        ch = text[i]
        if quote:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in "'\"`":
            quote = ch
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(text) and text[end] in ' \t':
                    end += 1
                if end < len(text) and text[end] == '\n':
                    end += 1
                return start, end
        i += 1
    raise SystemExit(f'Could not find closing brace for {name}')


def remove_function(text, name):
    span = find_function_span(text, name)
    if not span:
        return text, False
    start, end = span
    return text[:start] + text[end:], True


# ---- cases.js: remove superseded search/analytics code and compact controls ----
cases = Path('src/core/administration/mod/cases.js')
text = cases.read_text()
text = text.replace("const TRACKED_ACTIONS = Object.freeze(['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout']);\n", '')

for name in [
    'countCasesByAction', 'countCasesByStatus', 'buildTopList', 'incrementCount',
    'getRecentCases', 'getActionCounts', 'getModerationAnalytics',
    'buildCaseSearchModal', 'parseCaseSearchInput', 'buildCaseSearchResultsEmbed',
    'buildCaseSearchResultButtons', 'buildCaseSearchPaginationButtons',
]:
    text, removed = remove_function(text, name)
    if not removed:
        raise SystemExit(f'Expected legacy function {name} in cases.js')

legacy_open = "  if (id === 'mod_search_cases') {\n    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));\n    await interaction.showModal(buildCaseSearchModal()); return true;\n  }\n"
if legacy_open not in text:
    legacy_open = "  if (id === 'mod_search_cases') {\n    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));\n    await interaction.showModal(buildCaseSearchModal());\n    return true;\n  }\n"
if legacy_open not in text:
    raise SystemExit('Legacy mod_search_cases branch not found')
text = text.replace(legacy_open, '')

start = text.find("  if (id.startsWith('mod_submit_case_search')) {")
if start < 0:
    raise SystemExit('Legacy mod_submit_case_search branch not found')
next_branch = text.find("  if (id.startsWith('mod_submit_case_note:'))", start)
if next_branch < 0:
    raise SystemExit('Could not locate branch after legacy case search submit')
text = text[:start] + text[next_branch:]

text = text.replace('  searchCases,\n', '')
for export_name in [
    '  getModerationAnalytics,\n', '  buildCaseSearchModal,\n', '  parseCaseSearchInput,\n',
    '  buildCaseSearchResultsEmbed,\n', '  buildCaseSearchResultButtons,\n',
    '  buildCaseSearchPaginationButtons,\n',
]:
    text = text.replace(export_name, '')

for name in ['buildCaseFilterButtons', 'buildCasesPageButtons']:
    text, removed = remove_function(text, name)
    if not removed:
        raise SystemExit(f'Missing {name}')
insert_at = text.find('function getCaseAppeals(')
if insert_at < 0:
    raise SystemExit('Could not locate getCaseAppeals insertion point')
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
text = text[:insert_at] + compact_controls + text[insert_at:]
cases.write_text(text)

# ---- panel.js: remove duplicate/unreachable preset editor implementation ----
panel = Path('src/core/administration/mod/panel.js')
text = panel.read_text()
text, removed = remove_function(text, 'buildPresetEditorModal')
if not removed:
    raise SystemExit('Duplicate buildPresetEditorModal not found in panel.js')
for branch_start in ["  if (id.startsWith('mod_preset_create:')) {", "  if (id.startsWith('mod_preset_edit:')) {"]:
    start = text.find(branch_start)
    if start < 0:
        raise SystemExit(f'Expected duplicate preset branch not found: {branch_start}')
    end = text.find('\n', start)
    if end < 0:
        end = len(text)
    text = text[:start] + text[end + 1:]
panel.write_text(text)

# ---- Final dead-route guards ----
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
