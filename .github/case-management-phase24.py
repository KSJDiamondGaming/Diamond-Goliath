from pathlib import Path

ROOT = Path('.')

def replace(path, old, new, count=1):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:100]!r}')
    text = text.replace(old, new, count)
    p.write_text(text)

# caseCourt.js: preserve internal court metadata keys for compatibility, improve visible case UX.
path = 'src/core/administration/mod/caseCourt.js'

replace(path,
"""    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),
    allegations: String(court.allegations || modCase.reason || '').slice(0, 3000),
""",
"""    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),
    title: String(court.title || court.allegations || modCase.reason || `Case #${modCase.caseId || '?'}`).replace(/\\s+/g, ' ').trim().slice(0, 100),
    allegations: String(court.allegations || modCase.reason || '').slice(0, 3000),
""")

replace(path,
"""function staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }
function caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }
""",
"""function staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }
function caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }
function canDeleteCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_delete', interaction); }
function caseFileNavigationRow(interaction, modCase) {
  const items = [button(`mod_court_back:${modCase.userId}`, 'Back', '⬅️')];
  if (canDeleteCourt(interaction)) items.push(button(`mod_court_delete:${modCase.caseId}`, 'Delete Case', '🗑️', ButtonStyle.Danger));
  return row(...items);
}
""")

replace(path,
"""  if (latest.length) embed.addFields({
    name: 'Recent Case Files',
    value: latest.map((entry) => {
      const court = parseCourt(entry);
      return `**#${entry.caseId}** • ${stageText(court.stage)} • Severity **${severityText(court.severity)}**\\n${cleanExcerpt(court.allegations || entry.reason, 120)}`;
    }).join('\\n\\n').slice(0, 1024),
    inline: false,
  });

  const components = [];
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
""",
"""  if (latest.length) embed.addFields({
    name: 'Recent Case Files',
    value: latest.map((entry) => {
      const court = parseCourt(entry);
      return `**#${entry.caseId} • ${cleanExcerpt(court.title, 72)}**\\n${stageText(court.stage)} • Severity **${severityText(court.severity)}**`;
    }).join('\\n\\n').slice(0, 1024),
    inline: false,
  });

  const components = [];
  if (target) {
    if (cases.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`mod_court_open:${target.id}`)
      .setPlaceholder('📂 Open a case file')
      .addOptions(cases.slice(0, 25).map((entry) => {
        const court = parseCourt(entry);
        return { label: `#${entry.caseId} • ${cleanExcerpt(court.title, 72)}`, description: `${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${SEVERITY[court.severity]}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };
      }))));
    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
  }
""")

replace(path,
"""    .setTitle(`📂 Case #${modCase.caseId} • ${stageText(court.stage)}`)
    .setDescription(`**Subject:** <@${modCase.userId}> • \\`${modCase.userId}\\`\\n**Severity:** **${severityText(court.severity)}**\\n**Lead:** <@${court.leadModeratorId}>`)
""",
"""    .setTitle(`📂 #${modCase.caseId} • ${cleanExcerpt(court.title, 75)}`)
    .setDescription(`**Status:** ${stageText(court.stage)}\\n**Subject:** <@${modCase.userId}> • \\`${modCase.userId}\\`\\n**Severity:** **${severityText(court.severity)}**\\n**Lead:** <@${court.leadModeratorId}>`)
""")

replace(path,
"""    staffBackRow(modCase.userId),
  ];
""",
"""    caseFileNavigationRow(interaction, modCase),
  ];
""")

replace(path,
"""function newCaseModal(targetId) {
  return new ModalBuilder().setCustomId(`mod_case_new_named_submit:${targetId}`).setTitle('Open New Case').addComponents(
    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),
    modalInput('severity', 'Initial severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical'),
    modalInput('recommendation', 'Recommended action (optional)', TextInputStyle.Paragraph, false, 800, 'What action or next step should the review team consider?'),
  );
}
""",
"""function newCaseModal(targetId) {
  return new ModalBuilder().setCustomId(`mod_case_new_named_submit:${targetId}`).setTitle('Open New Case').addComponents(
    modalInput('caseTitle', 'Case title / short summary', TextInputStyle.Short, true, 100, 'Example: Repeated harassment in #general'),
    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),
    modalInput('severity', 'Initial severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical'),
    modalInput('recommendation', 'Recommended action (optional)', TextInputStyle.Paragraph, false, 800, 'What action or next step should the review team consider?'),
  );
}
function deleteCaseModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_delete_submit:${caseId}`).setTitle(`Delete Case #${caseId}`).addComponents(
    modalInput('confirmation', 'Type DELETE to confirm', TextInputStyle.Short, true, 6, 'DELETE'),
    modalInput('reason', 'Deletion reason', TextInputStyle.Paragraph, true, 500, 'Why is this case being permanently deleted?'),
  );
}
""")

replace(path,
"""  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }
""",
"""  if (key === 'mod_court_delete') {
    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }
    await interaction.showModal(deleteCaseModal(caseId));
    return true;
  }
  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }
""")

replace(path,
"""    const allegations = field(interaction, 'allegations');
    const recommendation = field(interaction, 'recommendation');
    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });
""",
"""    const caseTitle = field(interaction, 'caseTitle');
    const allegations = field(interaction, 'allegations');
    const recommendation = field(interaction, 'recommendation');
    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, title: caseTitle, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });
""")

# Insert delete modal handling before recommendation updates.
replace(path,
"""  const court = parseCourt(modCase);
  if (key === 'mod_court_recommend_submit') {
""",
"""  const court = parseCourt(modCase);
  if (key === 'mod_court_delete_submit') {
    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }
    if (field(interaction, 'confirmation').toUpperCase() !== 'DELETE') { await interaction.reply({ content: '❌ Deletion cancelled. Type DELETE exactly to confirm.', flags: 64 }); return true; }
    const reason = field(interaction, 'reason');
    recordCaseAudit({ guildId: interaction.guildId, caseId, actorId: interaction.user.id, event: 'case.management.deleted', before: modCase, after: null, metadata: { permanent: true, reason } });
    const deleted = db.prepare('DELETE FROM cases WHERE guild_id = ? AND case_id = ?').run(String(interaction.guildId), Number(caseId));
    if (!deleted.changes) { await interaction.reply({ content: '❌ Case could not be deleted.', flags: 64 }); return true; }
    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);
    if (!target) { await interaction.update({ content: `✅ Case #${caseId} permanently deleted.`, embeds: [], components: [] }); return true; }
    const built = buildCourtDashboard(interaction, target);
    await interaction.update({ content: null, embeds: [built.embed], components: built.components });
    return true;
  }
  if (key === 'mod_court_recommend_submit') {
""")

# permissions.js: dedicated deletion permission, admin/owner only in legacy mode.
path = 'src/core/administration/mod/permissions.js'
replace(path, "  court_close: STAFF_LEVELS.ADMIN,\n", "  court_close: STAFF_LEVELS.ADMIN,\n  court_delete: STAFF_LEVELS.ADMIN,\n")
replace(path, "  court_close: { key: 'mod.court.close', fallback: 'mod.cases.manage' },\n", "  court_close: { key: 'mod.court.close', fallback: 'mod.cases.manage' },\n  court_delete: { key: 'mod.court.delete' },\n")

# admin panel: expose dedicated permission and default it off for moderator/junior; admins inherit true.
path = 'src/core/administration/admin/panel.js'
replace(path, "const AUTHORITY_VERSION = 4;", "const AUTHORITY_VERSION = 5;")
replace(path,
"""  { key: 'mod.court.close', label: 'Close / Reopen Cases', group: 'Cases' },
  { key: 'mod.evidence.manage', label: 'Manage Evidence', group: 'Cases' },
""",
"""  { key: 'mod.court.close', label: 'Close / Reopen Cases', group: 'Cases' },
  { key: 'mod.court.delete', label: 'Permanently Delete Cases', group: 'Cases' },
  { key: 'mod.evidence.manage', label: 'Manage Evidence', group: 'Cases' },
""")
replace(path,
"""  'mod.cases.manage': true, 'mod.court.manage': true, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,
""",
"""  'mod.cases.manage': true, 'mod.court.manage': true, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.court.delete': false, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,
""")
replace(path,
"""  'mod.cases.manage': false, 'mod.court.manage': false, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,
""",
"""  'mod.cases.manage': false, 'mod.court.manage': false, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.court.delete': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,
""")

print('Phase 24 patch applied')
