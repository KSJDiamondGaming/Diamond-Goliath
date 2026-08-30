from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected source block not found in {path}')
    p.write_text(text.replace(old, new, 1))


panel = 'src/core/administration/mod/panel.js'
replace_once(
    panel,
    """function buildManagementRows(targetId, member, guild) {
  const id = targetId || 'none'; const rows = []; const first = [];
  if (canUseModAction(member, guild, 'manage_presets')) first.push(createPrimaryButton(`mod_presets:${id}`, 'Presets', '📋'));
  if (canUseModAction(member, guild, 'view_analytics')) first.push(createSecondaryButton(`mod_dashboard:${id}:analytics`, 'Analytics', '📊'));
  if (canUseModAction(member, guild, 'view_case_detail')) first.push(createSecondaryButton('mod_case_search', 'Search Cases', '🔎'));
  if (canUseModAction(member, guild, 'export_cases')) first.push(createSecondaryButton(`mod_export_cases:${id}`, 'Export', '📤'));
  const bulk = [];
  if (canUseModAction(member, guild, 'bulk_warn')) bulk.push(createSecondaryButton('mod_bulk_warn', 'Bulk Warn', '⚠️'));
  if (canUseModAction(member, guild, 'bulk_timeout')) bulk.push(createSecondaryButton('mod_bulk_timeout', 'Bulk Timeout', '⏳'));
  if (canUseModAction(member, guild, 'bulk_kick')) bulk.push(createDangerButton('mod_bulk_kick', 'Bulk Kick', '👢'));
  if (canUseModAction(member, guild, 'bulk_ban')) bulk.push(createDangerButton('mod_bulk_ban', 'Bulk Ban', '🔨'));
  for (const row of [buttonRow(first), buttonRow(bulk)]) if (row) rows.push(row);
  return rows;
}""",
    """function buildManagementRows(targetId, member, guild) {
  const id = targetId || 'none';
  const rows = [];
  const tools = [];
  if (canUseModAction(member, guild, 'manage_presets')) tools.push({ label: 'Presets', value: 'presets', description: 'Create and manage reusable moderation presets', emoji: '📋' });
  if (canUseModAction(member, guild, 'view_analytics')) tools.push({ label: 'Analytics', value: 'analytics', description: 'Review server and moderator activity', emoji: '📊' });
  if (canUseModAction(member, guild, 'view_case_detail')) tools.push({ label: 'Search Cases', value: 'search', description: 'Find moderation cases and case history', emoji: '🔎' });
  if (canUseModAction(member, guild, 'export_cases')) tools.push({ label: 'Export', value: 'export', description: 'Export authorized moderation case data', emoji: '📤' });
  if (tools.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_management_tool:${id}`).setPlaceholder('🛠️ Choose a management tool').addOptions(tools)));
  const bulk = [];
  if (canUseModAction(member, guild, 'bulk_warn')) bulk.push({ label: 'Bulk Warn', value: 'warn', description: 'Apply warnings to multiple members', emoji: '⚠️' });
  if (canUseModAction(member, guild, 'bulk_timeout')) bulk.push({ label: 'Bulk Timeout', value: 'timeout', description: 'Timeout multiple members', emoji: '⏳' });
  if (canUseModAction(member, guild, 'bulk_kick')) bulk.push({ label: 'Bulk Kick', value: 'kick', description: 'Kick multiple members with safety checks', emoji: '👢' });
  if (canUseModAction(member, guild, 'bulk_ban')) bulk.push({ label: 'Bulk Ban', value: 'ban', description: 'Ban multiple members with confirmation', emoji: '🔨' });
  if (bulk.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_management_bulk:${id}`).setPlaceholder('⚠️ Choose a bulk moderation action').addOptions(bulk)));
  return rows;
}"""
)
replace_once(
    panel,
    "function buildManagementEmbed(interaction) { return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('🛠️ Moderation Management').setDescription(['Administrative moderation tools are grouped here so the main member workflow stays clean.', '', 'Only controls granted to your authority profile are shown.', '', '• Presets — reusable action templates', '• Analytics — server and moderator activity', '• Search / Export — case investigation and data', '• Bulk Actions — permission-gated mass moderation'].join('\\n')); }",
    "function buildManagementEmbed(interaction) { return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('🛠️ Moderation Management').setDescription(['Choose a management area below.', '', 'Routine member moderation stays in **Actions**. This workspace is reserved for administration, case tools, reporting and bulk operations.', '', 'Only options granted to your Goliath authority profile are shown.'].join('\\n')); }"
)
replace_once(
    panel,
    "async function handleSelectUserButton(interaction) { if (interaction.customId !== 'mod_select_user') return false; return safeReply(interaction, { content: '👤 Select a member:', components: [buildUserSelectRow()], flags: 64 }); }",
    """async function handleSelectUserButton(interaction) { if (interaction.customId !== 'mod_select_user') return false; return safeReply(interaction, { content: '👤 Select a member:', components: [buildUserSelectRow()], flags: 64 }); }
async function openPresetManager(interaction, targetId = 'none') {
  if (!canUseModAction(interaction.member, interaction.guild, 'manage_presets')) return safeReply(interaction, ephemeralError('No permission to manage moderation presets.'));
  return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 });
}
async function openExportModal(interaction, targetId = 'none') {
  if (!canUseModAction(interaction.member, interaction.guild, 'export_cases')) return safeReply(interaction, ephemeralError('No permission to export moderation data.'));
  await interaction.showModal(buildExportModal(targetId));
  return true;
}"""
)
replace_once(
    panel,
    "module.exports = {\n  openModPanel,",
    "module.exports = {\n  openModPanel,\n  renderDashboard,\n  openPresetManager,\n  openExportModal,"
)

interactions = 'src/core/administration/mod/interactions.js'
replace_once(
    interactions,
    """const {
  refreshDashboard,
  refreshCasesDashboard,""",
    """const {
  renderDashboard,
  openPresetManager,
  openExportModal,
  refreshDashboard,
  refreshCasesDashboard,"""
)
replace_once(
    interactions,
    "async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }",
    """async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }
async function handleManagementSelect(i) {
  const id = String(i.customId || '');
  const targetId = getTargetIdFromCustomId(id);
  const selection = String(i.values?.[0] || '');
  if (id.startsWith('mod_management_tool:')) {
    if (selection === 'presets') return openPresetManager(i, targetId);
    if (selection === 'analytics') return renderDashboard(i, targetId, 'analytics', { analyticsWindow: '30d', analyticsMode: 'overview' });
    if (selection === 'search') return openCaseSearch(i);
    if (selection === 'export') return openExportModal(i, targetId);
    return safeReply(i, { content: '❌ Unknown management tool.', flags: 64 });
  }
  if (id.startsWith('mod_management_bulk:')) {
    if (!BULK_ACTIONS.has(selection)) return safeReply(i, { content: '❌ Unknown bulk moderation action.', flags: 64 });
    const allowed = await ensureActionAccess(i, `bulk_${selection}`, `❌ No permission to use bulk ${selection}.`);
    if (!allowed) return true;
    await i.showModal(buildBulkModal(selection));
    return true;
  }
  return false;
}"""
)
replace_once(
    interactions,
    "if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);",
    "if (i.isStringSelectMenu?.()) return routeHandlers(i, [handleManagementSelect, handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);"
)
