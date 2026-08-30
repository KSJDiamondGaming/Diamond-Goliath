from pathlib import Path


def replace_between(path, start_marker, end_marker, replacement):
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

# Main moderation navigation: detail nav row, then Back on its own final row.
replace_between(
    panel,
    'function buildDashboardNav(targetId, activeView, member, guild) {',
    'function buildUserSelectRow()',
    '''function buildDashboardNav(targetId, activeView, member, guild) {
  const active = normalizeView(activeView);
  const id = targetId || 'none';
  const rows = [];

  if (targetId) {
    const candidates = [
      ['member', '👤 Member'],
      ['actions', '⚡ Actions'],
      ['intelligence', '🧠 Intel'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => view !== active && canViewDashboardSection(member, guild, view));

    const buttons = candidates.slice(0, 4).map(([view, label]) => new ButtonBuilder()
      .setCustomId(`mod_dashboard:${id}:${view}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary));
    if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}
'''
)

# Keep the direct moderation actions visible directly below the member dropdown.
replace_between(
    panel,
    'function buildActionRows(target, stats, member, guild) {',
    'function buildIntelligenceRows',
    '''function buildActionRows(target, stats, member, guild) {
  const id = target?.id || 'none';
  const p = actionPermissions(member, guild);
  const disabled = !target;
  const apply = [];

  if (p.warn) apply.push(createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️')).setDisabled(disabled));
  if (p.timeout) apply.push(createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳')).setDisabled(disabled));
  if (p.kick) apply.push(createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢')).setDisabled(disabled));
  if (p.ban) apply.push(createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨')).setDisabled(disabled));

  const reverse = [];
  if (target && p.removeWarning && Number(stats?.warningCount || 0) > 0) reverse.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')));
  if (target && p.removeTimeout && targetHasActiveTimeout(target)) reverse.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')));

  return [buttonRow(apply), buttonRow(reverse)].filter(Boolean);
}
'''
)

text = panel.read_text()
text = text.replace(
    "'Select a member below to open their workspace, or use **Manage** for server-wide moderation tools.',",
    "'Select a member below. The moderation buttons underneath become available immediately.',"
)
text = text.replace(
    "if (safeView === 'member') embeds.push(buildMemberEmbed(interaction, target, stats, staffDisplay));",
    "if (safeView === 'member') { embeds.push(buildMemberEmbed(interaction, target, stats, staffDisplay)); components.push(...buildActionRows(target, stats, interaction.member, interaction.guild)); }"
)
text = text.replace(
    '  components.push(buildDashboardNav(targetId, safeView, interaction.member, interaction.guild));',
    '  components.push(...buildDashboardNav(targetId, safeView, interaction.member, interaction.guild));'
)

# Remove the now-dead secondary member selector button route.
text = text.replace("async function handleSelectUserButton(interaction) { if (interaction.customId !== 'mod_select_user') return false; return safeReply(interaction, { content: '👤 Select a member:', components: [buildUserSelectRow()], flags: 64 }); }\n", '')
text = text.replace('  handleSelectUserButton,\n', '')

# Presets must not route back to the removed Management workspace.
text = text.replace(
    "new ButtonBuilder().setCustomId(`mod_dashboard:${targetId}:management`).setLabel('← Management').setStyle(ButtonStyle.Secondary)",
    "new ButtonBuilder().setCustomId(targetId !== 'none' ? `mod_dashboard:${targetId}:actions` : 'mod:overview').setLabel(targetId !== 'none' ? '← Actions' : '← Moderation').setStyle(ButtonStyle.Secondary)"
)
panel.write_text(text)

interactions = Path('src/core/administration/mod/interactions.js')
text = interactions.read_text()
text = text.replace('  handleSelectUserButton,\n', '')
text = text.replace("async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }\n", '')
text = text.replace(
    'if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);',
    'if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect]);'
)
text = text.replace(', handleSelectUserButton, handleBulkButton', ', handleBulkButton')
interactions.write_text(text)

# Guard against Management leftovers in the active panel routing layer.
for path in [panel, interactions]:
    source = path.read_text()
    leftovers = [needle for needle in ['mod_dashboard:${targetId}:management', 'handleManagementSelect', 'buildManagementRows(', 'buildManagementEmbed('] if needle in source]
    if leftovers:
        raise SystemExit(f'Dead Management references remain in {path}: {leftovers}')

print('Moderation main flow cleanup applied.')
