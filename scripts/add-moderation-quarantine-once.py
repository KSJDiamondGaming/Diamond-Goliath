from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"{label} not found in {path}")
    path.write_text(text.replace(old, new, 1))


panel = Path('src/core/administration/mod/panel.js')
permissions = Path('src/core/administration/mod/permissions.js')
interactions = Path('src/core/administration/mod/interactions.js')
docs = Path('docs/architecture/moderation-workspace.md')

# PANEL: import quarantine state and expose button availability.
replace_once(
    panel,
    "const { canUseModAction, getStaffDisplay, hasModPermission, fetchTarget } = require('./permissions');",
    "const { canUseModAction, getStaffDisplay, hasModPermission, fetchTarget } = require('./permissions');\nconst { getQuarantineState } = require('../../security/protection/quarantine');",
    'panel quarantine import',
)
replace_once(
    panel,
    "function targetHasActiveTimeout(target) { return Number(target?.communicationDisabledUntilTimestamp || 0) > Date.now(); }",
    "function targetHasActiveTimeout(target) { return Number(target?.communicationDisabledUntilTimestamp || 0) > Date.now(); }\nfunction targetIsQuarantined(guild, target) { return Boolean(guild?.id && target?.id && getQuarantineState(guild.id)?.users?.[target.id]); }",
    'quarantine state helper',
)
replace_once(
    panel,
    "if (normalized === 'actions') return canUseModAction(member, guild, 'view_dashboard') || hasAny(member, guild, ['warn', 'timeout', 'remove_timeout', 'kick', 'ban', 'remove_warning']);",
    "if (normalized === 'actions') return canUseModAction(member, guild, 'view_dashboard') || hasAny(member, guild, ['warn', 'timeout', 'remove_timeout', 'kick', 'quarantine', 'remove_quarantine', 'ban', 'remove_warning']);",
    'actions visibility',
)

old_permissions = "function actionPermissions(member, guild) { return { warn: canUseModAction(member, guild, 'warn'), timeout: canUseModAction(member, guild, 'timeout'), kick: canUseModAction(member, guild, 'kick'), ban: canUseModAction(member, guild, 'ban'), removeWarning: canUseModAction(member, guild, 'remove_warning'), removeTimeout: canUseModAction(member, guild, 'remove_timeout') }; }"
new_permissions = "function actionPermissions(member, guild) { return { warn: canUseModAction(member, guild, 'warn'), timeout: canUseModAction(member, guild, 'timeout'), kick: canUseModAction(member, guild, 'kick'), quarantine: canUseModAction(member, guild, 'quarantine'), ban: canUseModAction(member, guild, 'ban'), removeWarning: canUseModAction(member, guild, 'remove_warning'), removeTimeout: canUseModAction(member, guild, 'remove_timeout'), removeQuarantine: canUseModAction(member, guild, 'remove_quarantine') }; }"
replace_once(panel, old_permissions, new_permissions, 'action permissions')

old_rows = """function buildActionRows(target, stats, member, guild) {
  const id = target?.id || 'none';
  const p = actionPermissions(member, guild);
  const disabled = !target;
  const row1 = [];
  if (canViewDashboardSection(member, guild, 'intelligence')) row1.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:intelligence`).setLabel('🧠 Intelligence').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
  if (canViewDashboardSection(member, guild, 'cases')) row1.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:cases`).setLabel('📁 Cases').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
  if (p.timeout) row1.push(createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳')).setDisabled(disabled));
  if (p.warn) row1.push(createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️')).setDisabled(disabled));
  const row2 = [];
  if (p.kick) row2.push(createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢')).setDisabled(disabled));
  if (p.ban) row2.push(createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨')).setDisabled(disabled));
  if (p.removeTimeout) row2.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')).setDisabled(disabled || !targetHasActiveTimeout(target)));
  if (p.removeWarning) row2.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')).setDisabled(disabled || Number(stats?.warningCount || 0) <= 0));
  return [buttonRow(row1), buttonRow(row2)].filter(Boolean);
}"""
new_rows = """function buildActionRows(target, stats, member, guild) {
  const id = target?.id || 'none';
  const p = actionPermissions(member, guild);
  const disabled = !target;
  const quarantined = targetIsQuarantined(guild, target);

  const row1 = [];
  if (canViewDashboardSection(member, guild, 'intelligence')) row1.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:intelligence`).setLabel('🧠 Intelligence').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
  if (canViewDashboardSection(member, guild, 'cases')) row1.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:cases`).setLabel('📁 Cases').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
  if (p.timeout) row1.push(createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳')).setDisabled(disabled));
  if (p.warn) row1.push(createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️')).setDisabled(disabled));

  const row2 = [];
  if (p.kick) row2.push(createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢')).setDisabled(disabled));
  if (p.quarantine) row2.push(createDangerButton(`mod_open_quarantine:${id}`, 'Quarantine', '🚫').setDisabled(disabled || quarantined));
  if (p.ban) row2.push(createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨')).setDisabled(disabled));

  const row3 = [];
  if (p.removeTimeout) row3.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')).setDisabled(disabled || !targetHasActiveTimeout(target)));
  if (p.removeQuarantine) row3.push(createSecondaryButton(`mod_remove_quarantine:${id}`, 'Remove Quarantine', '🔓').setDisabled(disabled || !quarantined));
  if (p.removeWarning) row3.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')).setDisabled(disabled || Number(stats?.warningCount || 0) <= 0));

  return [buttonRow(row1), buttonRow(row2), buttonRow(row3)].filter(Boolean);
}"""
replace_once(panel, old_rows, new_rows, 'moderation button rows')

# PERMISSIONS: quarantine sits between kick and ban, with Manage Roles required.
replace_once(
    permissions,
    "  kick: STAFF_LEVELS.MOD,\n  ban: STAFF_LEVELS.ADMIN,",
    "  kick: STAFF_LEVELS.MOD,\n  quarantine: STAFF_LEVELS.MOD,\n  remove_quarantine: STAFF_LEVELS.MOD,\n  ban: STAFF_LEVELS.ADMIN,",
    'permission levels',
)
replace_once(
    permissions,
    "  kick: PermissionFlagsBits.KickMembers,\n  ban: PermissionFlagsBits.BanMembers,",
    "  kick: PermissionFlagsBits.KickMembers,\n  quarantine: PermissionFlagsBits.ManageRoles,\n  remove_quarantine: PermissionFlagsBits.ManageRoles,\n  ban: PermissionFlagsBits.BanMembers,",
    'native permissions',
)
replace_once(
    permissions,
    "  kick: { key: 'mod.kick' },\n  ban: { key: 'mod.ban' },",
    "  kick: { key: 'mod.kick' },\n  quarantine: { key: 'mod.quarantine', fallback: 'mod.kick' },\n  remove_quarantine: { key: 'mod.quarantine.remove', fallback: 'mod.kick' },\n  ban: { key: 'mod.ban' },",
    'authority permissions',
)

# INTERACTIONS: wire quarantine system into moderation panel.
replace_once(
    interactions,
    "const memberIntelligence = require('./intelligence');",
    "const memberIntelligence = require('./intelligence');\nconst { quarantineMember, restoreQuarantinedMember, getQuarantineState } = require('../../security/protection/quarantine');",
    'interaction quarantine import',
)
replace_once(
    interactions,
    "const OPEN_ACTIONS = new Set(['warn', ...PUNISHMENT_ACTIONS]);",
    "const OPEN_ACTIONS = new Set(['warn', 'quarantine', ...PUNISHMENT_ACTIONS]);",
    'open quarantine action',
)

insert_after_note_modal = """function buildInvestigationNoteModal(targetId) {
  return new Discord.ModalBuilder().setCustomId(`mod_scan_note_submit:${targetId}`).setTitle('Add Investigation Note').addComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.TextInputBuilder().setCustomId('note').setLabel('Investigation note').setStyle(Discord.TextInputStyle.Paragraph).setRequired(true).setMinLength(2).setMaxLength(1000).setPlaceholder('Record relevant context, observations, or why this account needs review.')
    )
  );
}"""
quarantine_modal = insert_after_note_modal + """
function buildQuarantineModal(targetId) {
  return new Discord.ModalBuilder().setCustomId(`mod_submit_quarantine:${targetId}`).setTitle('Quarantine Member').addComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(Discord.TextInputStyle.Paragraph).setRequired(true).setMinLength(2).setMaxLength(500).setPlaceholder('Why is this member being quarantined?')
    )
  );
}"""
replace_once(interactions, insert_after_note_modal, quarantine_modal, 'quarantine modal')

old_action_routing = """async function requestRemoveTimeout(i, targetId) { const target = await requireModeratableTarget(i, targetId, 'remove_timeout'); if (!target) return true; return createConfirmation(i, target.id, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`); }
async function routeActionRequest(i, action, targetId) { if (action === 'warn') return showWarningModal(i, targetId); if (action === 'remove-warning') return showRemoveWarningModal(i, targetId); if (action === 'remove-timeout') return requestRemoveTimeout(i, targetId); if (PUNISHMENT_ACTIONS.has(action)) return showPunishmentModal(i, action, targetId); return false; }"""
new_action_routing = """async function requestRemoveTimeout(i, targetId) { const target = await requireModeratableTarget(i, targetId, 'remove_timeout'); if (!target) return true; return createConfirmation(i, target.id, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`); }
async function showQuarantineModal(i, targetId) {
  const target = await requireModeratableTarget(i, targetId, 'quarantine');
  if (!target) return true;
  if (getQuarantineState(i.guild.id)?.users?.[target.id]) return safeReply(i, { content: `⚠️ **${target.user.tag}** is already quarantined.`, flags: 64 });
  await i.showModal(buildQuarantineModal(target.id));
  return true;
}
async function removeQuarantine(i, targetId) {
  const target = await requireModeratableTarget(i, targetId, 'remove_quarantine');
  if (!target) return true;
  if (!getQuarantineState(i.guild.id)?.users?.[target.id]) return safeReply(i, { content: `⚠️ **${target.user.tag}** is not currently quarantined.`, flags: 64 });
  const result = await restoreQuarantinedMember(i.guild, target, { reason: `Quarantine removed by ${i.user?.tag || i.user?.id || 'moderator'}` });
  recordModerationSystemEvent({ interaction: i, event: result.success ? 'moderation.quarantine.removed' : 'moderation.quarantine.remove_failed', action: 'remove_quarantine', targetId: target.id, after: result });
  if (!result.success) return safeReply(i, { content: `❌ Failed to remove quarantine from **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`, flags: 64 });
  await safeReply(i, { content: `🔓 Quarantine removed from **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s).`, flags: 64 });
  await refreshDashboard(Discord, i, target, { view: 'actions' });
  return true;
}
async function routeActionRequest(i, action, targetId) { if (action === 'warn') return showWarningModal(i, targetId); if (action === 'quarantine') return showQuarantineModal(i, targetId); if (action === 'remove-warning') return showRemoveWarningModal(i, targetId); if (action === 'remove-timeout') return requestRemoveTimeout(i, targetId); if (PUNISHMENT_ACTIONS.has(action)) return showPunishmentModal(i, action, targetId); return false; }"""
replace_once(interactions, old_action_routing, new_action_routing, 'quarantine action routing')

replace_once(
    interactions,
    "async function handleCaseToolButton(i) { const caseResult = await openCaseTool(i); if (caseResult) return caseResult; const searchResult = await handleCaseSearchAction(i); if (searchResult) return searchResult; const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id); if (id.startsWith('mod_remove_warning:')) return routeActionRequest(i, 'remove-warning', targetId); if (id.startsWith('mod_remove_timeout:')) return routeActionRequest(i, 'remove-timeout', targetId); return false; }",
    "async function handleCaseToolButton(i) { const caseResult = await openCaseTool(i); if (caseResult) return caseResult; const searchResult = await handleCaseSearchAction(i); if (searchResult) return searchResult; const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id); if (id.startsWith('mod_remove_warning:')) return routeActionRequest(i, 'remove-warning', targetId); if (id.startsWith('mod_remove_timeout:')) return routeActionRequest(i, 'remove-timeout', targetId); if (id.startsWith('mod_remove_quarantine:')) return removeQuarantine(i, targetId); return false; }",
    'remove quarantine button route',
)

old_modal_start = """async function handleActionModal(i) {
  const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_submit_warn:')) {"""
new_modal_start = """async function handleActionModal(i) {
  const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_submit_quarantine:')) {
    const target = await requireModeratableTarget(i, targetId, 'quarantine');
    if (!target) return true;
    const reason = fieldValue(i, 'reason');
    const result = await quarantineMember(i.guild, target, { reason, quarantinedBy: i.user?.id || null });
    recordModerationSystemEvent({ interaction: i, event: result.success ? 'moderation.quarantine.applied' : 'moderation.quarantine.failed', action: 'quarantine', targetId: target.id, reason, after: result });
    if (!result.success) return safeReply(i, { content: `❌ Failed to quarantine **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`, flags: 64 });
    await safeReply(i, { content: result.dryRun ? `🧪 Quarantine dry-run completed for **${target.user.tag}**.` : `🚫 **${target.user.tag}** has been quarantined.`, flags: 64 });
    await refreshDashboard(Discord, i, target, { view: 'actions' });
    return true;
  }
  if (id.startsWith('mod_submit_warn:')) {"""
replace_once(interactions, old_modal_start, new_modal_start, 'quarantine modal submit')

# DOCS: keep the visible workspace specification accurate.
text = docs.read_text()
text = text.replace('Apply direct moderation actions: Warn, Timeout, Kick, or Ban.', 'Apply direct moderation actions: Warn, Timeout, Kick, Quarantine, or Ban.')
text = text.replace('Use reversal controls only when state permits: Remove Warn or Clear Timeout.', 'Use reversal controls only when state permits: Clear Timeout, Remove Quarantine, or Remove Warn.')
docs.write_text(text)
