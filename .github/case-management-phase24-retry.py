from pathlib import Path

ROOT = Path('.')

def replace(path, old, new, count=1):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

path = 'src/core/administration/mod/caseCourt.js'

replace(path,
"    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),\n    allegations: String(court.allegations || modCase.reason || '').slice(0, 3000),\n",
"    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),\n    title: String(court.title || court.allegations || modCase.reason || `Case #${modCase.caseId || '?'}`).replace(/\\s+/g, ' ').trim().slice(0, 100),\n    allegations: String(court.allegations || modCase.reason || '').slice(0, 3000),\n")

replace(path,
"function caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }\n",
"function caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }\nfunction canDeleteCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_delete', interaction); }\nfunction caseFileNavigationRow(interaction, modCase) {\n  const items = [button(`mod_court_back:${modCase.userId}`, 'Back', '⬅️')];\n  if (canDeleteCourt(interaction)) items.push(button(`mod_court_delete:${modCase.caseId}`, 'Delete Case', '🗑️', ButtonStyle.Danger));\n  return row(...items);\n}\n")

old = """  const components = [];
  if (target) {
    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
    if (cases.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`mod_court_open:${target.id}`)
      .setPlaceholder('📂 Open a case file')
      .addOptions(cases.slice(0, 25).map((entry) => {
        const court = parseCourt(entry);
        return { label: `Case #${entry.caseId} • ${SEVERITY[court.severity]}`, description: `${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${cleanExcerpt(court.allegations || entry.reason, 65)}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };
      }))));
  }
"""
new = """  const components = [];
  if (target) {
    if (cases.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`mod_court_open:${target.id}`)
      .setPlaceholder('📂 Open a case file')
      .addOptions(cases.slice(0, 25).map((entry) => {
        const court = parseCourt(entry);
        return { label: cleanExcerpt(court.title, 92), description: `Case #${entry.caseId} • ${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${SEVERITY[court.severity]}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };
      }))));
    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
  }
"""
replace(path, old, new)

replace(path,
"      return `**#${entry.caseId}** • ${stageText(court.stage)} • Severity **${severityText(court.severity)}**\\n${cleanExcerpt(court.allegations || entry.reason, 120)}`;\n",
"      return `**${cleanExcerpt(court.title, 78)}** • Case #${entry.caseId}\\n${stageText(court.stage)} • Severity **${severityText(court.severity)}**`;\n")

replace(path,
"    .setTitle(`📂 Case #${modCase.caseId} • ${stageText(court.stage)}`)\n    .setDescription(`**Subject:** <@${modCase.userId}> • \\`${modCase.userId}\\`\\n**Severity:** **${severityText(court.severity)}**\\n**Lead:** <@${court.leadModeratorId}>`)\n",
"    .setTitle(`📂 ${cleanExcerpt(court.title, 75)} • #${modCase.caseId}`)\n    .setDescription(`**Status:** ${stageText(court.stage)}\\n**Subject:** <@${modCase.userId}> • \\`${modCase.userId}\\`\\n**Severity:** **${severityText(court.severity)}**\\n**Lead:** <@${court.leadModeratorId}>`)\n")

replace(path, "    staffBackRow(modCase.userId),\n  ];\n", "    caseFileNavigationRow(interaction, modCase),\n  ];\n")

replace(path,
"function newCaseModal(targetId) {\n  return new ModalBuilder().setCustomId(`mod_case_new_named_submit:${targetId}`).setTitle('Open New Case').addComponents(\n    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),\n",
"function newCaseModal(targetId) {\n  return new ModalBuilder().setCustomId(`mod_case_new_named_submit:${targetId}`).setTitle('Open New Case').addComponents(\n    modalInput('caseTitle', 'Case title / short summary', TextInputStyle.Short, true, 100, 'Example: Repeated harassment in #general'),\n    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),\n")

replace(path,
"function evidenceModal(caseId) {\n",
"function deleteCaseModal(caseId) {\n  return new ModalBuilder().setCustomId(`mod_court_delete_submit:${caseId}`).setTitle(`Delete Case #${caseId}`).addComponents(\n    modalInput('confirmation', 'Type DELETE to confirm', TextInputStyle.Short, true, 6, 'DELETE'),\n    modalInput('reason', 'Deletion reason', TextInputStyle.Paragraph, true, 500, 'Why is this case being permanently deleted?'),\n  );\n}\nfunction evidenceModal(caseId) {\n")

replace(path,
"  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }\n",
"  if (key === 'mod_court_delete') {\n    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }\n    await interaction.showModal(deleteCaseModal(caseId));\n    return true;\n  }\n  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }\n")

replace(path,
"    const allegations = field(interaction, 'allegations');\n    const recommendation = field(interaction, 'recommendation');\n    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });\n",
"    const caseTitle = field(interaction, 'caseTitle');\n    const allegations = field(interaction, 'allegations');\n    const recommendation = field(interaction, 'recommendation');\n    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, title: caseTitle, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });\n")

replace(path,
"  const court = parseCourt(modCase);\n  if (key === 'mod_court_recommend_submit') {\n",
"  const court = parseCourt(modCase);\n  if (key === 'mod_court_delete_submit') {\n    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }\n    if (field(interaction, 'confirmation').toUpperCase() !== 'DELETE') { await interaction.reply({ content: '❌ Deletion cancelled. Type DELETE exactly to confirm.', flags: 64 }); return true; }\n    const reason = field(interaction, 'reason');\n    recordCaseAudit({ guildId: interaction.guildId, caseId, actorId: interaction.user.id, event: 'case.management.deleted', before: modCase, after: null, metadata: { permanent: true, reason } });\n    const deleted = db.prepare('DELETE FROM cases WHERE guild_id = ? AND case_id = ?').run(String(interaction.guildId), Number(caseId));\n    if (!deleted.changes) { await interaction.reply({ content: '❌ Case could not be deleted.', flags: 64 }); return true; }\n    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);\n    if (!target) { await interaction.update({ content: `✅ Case #${caseId} permanently deleted.`, embeds: [], components: [] }); return true; }\n    const built = buildCourtDashboard(interaction, target);\n    await interaction.update({ content: null, embeds: [built.embed], components: built.components });\n    return true;\n  }\n  if (key === 'mod_court_recommend_submit') {\n")

path = 'src/core/administration/mod/permissions.js'
replace(path, "  court_close: STAFF_LEVELS.ADMIN,\n", "  court_close: STAFF_LEVELS.ADMIN,\n  court_delete: STAFF_LEVELS.ADMIN,\n")
replace(path, "  court_close: { key: 'mod.court.close', fallback: 'mod.cases.manage' },\n", "  court_close: { key: 'mod.court.close', fallback: 'mod.cases.manage' },\n  court_delete: { key: 'mod.court.delete' },\n")

path = 'src/core/administration/admin/panel.js'
replace(path, "const AUTHORITY_VERSION = 4;", "const AUTHORITY_VERSION = 5;")
replace(path,
"  { key: 'mod.court.close', label: 'Close / Reopen Cases', group: 'Cases' },\n",
"  { key: 'mod.court.close', label: 'Close / Reopen Cases', group: 'Cases' },\n  { key: 'mod.court.delete', label: 'Permanently Delete Cases', group: 'Cases' },\n")
replace(path,
"  'mod.cases.manage': true, 'mod.court.manage': true, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,\n",
"  'mod.cases.manage': true, 'mod.court.manage': true, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.court.delete': false, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,\n")
replace(path,
"  'mod.cases.manage': false, 'mod.court.manage': false, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,\n",
"  'mod.cases.manage': false, 'mod.court.manage': false, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.court.delete': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,\n")

print('Phase 24 retry patch applied')
