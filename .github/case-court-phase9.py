from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()


def replace_once(old, new):
    global s
    if old not in s:
        raise RuntimeError(f'Anchor not found: {old[:120]}')
    s = s.replace(old, new, 1)

# Centralize court permissions.
replace_once(
"function isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_review', interaction); }\nfunction canPublishCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_publish', interaction); }\nfunction canCloseCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_close', interaction); }\n",
"function canManageCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_manage', interaction); }\nfunction isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_review', interaction); }\nfunction canPublishCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_publish', interaction); }\nfunction canCloseCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_close', interaction); }\n"
)

# Dashboard should not offer case creation to users without court-manage authority.
replace_once(
"      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary),\n",
"      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),\n"
)

# Case file action authority and stage safety.
replace_once(
"  const canManage = canUseModAction(interaction.member, interaction.guild, 'court_manage', interaction);\n  const isAssignedJudge = canManage && court.reviewingAdminId === interaction.user.id;\n  const canDecide = isAssignedJudge && ['review', 'decided'].includes(court.stage);\n",
"  const canManage = canManageCourt(interaction);\n  const judgeAuthority = isJudge(interaction);\n  const isAssignedJudge = judgeAuthority && court.reviewingAdminId === interaction.user.id;\n  const canDecide = isAssignedJudge && ['review', 'decided'].includes(court.stage);\n"
)
for old, new in [
("      button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary),", "      button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary, !canManage || isClosed),"),
("      button(`mod_court_note:${modCase.caseId}`, 'Case Note', '📝'),", "      button(`mod_court_note:${modCase.caseId}`, 'Case Note', '📝', ButtonStyle.Secondary, !canManage || isClosed),"),
("      button(`mod_court_import:${modCase.caseId}`, 'Import Records', '🔗'),", "      button(`mod_court_import:${modCase.caseId}`, 'Import Records', '🔗', ButtonStyle.Secondary, !canManage || isClosed),"),
("      button(`mod_court_severity:${modCase.caseId}`, 'Severity', '⚖️'),", "      button(`mod_court_severity:${modCase.caseId}`, 'Severity', '⚖️', ButtonStyle.Secondary, !canManage || isClosed),"),
("      button(`mod_court_recommend:${modCase.caseId}`, 'Recommendation', '📋'),", "      button(`mod_court_recommend:${modCase.caseId}`, 'Recommendation', '📋', ButtonStyle.Secondary, !canManage || isClosed),"),
("      button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '👨‍⚖️', ButtonStyle.Primary, court.stage !== 'investigation'),", "      button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '👨‍⚖️', ButtonStyle.Primary, !canManage || court.stage !== 'investigation'),"),
("      button(`mod_court_decide:${modCase.caseId}`, 'Decision', '⚖️', canManage ? ButtonStyle.Danger : ButtonStyle.Secondary, !canDecide),", "      button(`mod_court_decide:${modCase.caseId}`, 'Decision', '⚖️', judgeAuthority ? ButtonStyle.Danger : ButtonStyle.Secondary, !canDecide),"),
("      button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !canManage || court.decision?.action !== 'ban' || court.sanctionReview?.status === 'approved' || court.decision?.decidedBy === interaction.user.id),", "      button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !judgeAuthority || court.decision?.action !== 'ban' || court.sanctionReview?.status === 'approved' || court.decision?.decidedBy === interaction.user.id),"),
("      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),", "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !judgeAuthority || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),"),
]:
    replace_once(old, new)

# Review brief claim authority must be judge authority, not case-building authority.
replace_once(
"  const canManage = canUseModAction(interaction.member, interaction.guild, 'court_manage', interaction);\n  const assignedToOther = court.reviewingAdminId && court.reviewingAdminId !== interaction.user.id;\n",
"  const judgeAuthority = isJudge(interaction);\n  const assignedToOther = court.reviewingAdminId && court.reviewingAdminId !== interaction.user.id;\n"
)
replace_once(
"  if (court.stage === 'review' && !court.reviewingAdminId) controls.push(button(`mod_court_claim_review:${modCase.caseId}`, 'Claim Review', '✋', ButtonStyle.Primary, !canManage));\n",
"  if (court.stage === 'review' && !court.reviewingAdminId) controls.push(button(`mod_court_claim_review:${modCase.caseId}`, 'Claim Review', '✋', ButtonStyle.Primary, !judgeAuthority));\n"
)

# Button route hard guards for all court-file mutations.
replace_once(
"  if (key === 'mod_court_new') { await interaction.showModal(newCaseModal(value)); return true; }\n",
"  if (key === 'mod_court_new') { if (!canManageCourt(interaction)) { await interaction.reply({ content: '❌ Court case-management authority is required to open a case.', flags: 64 }); return true; } await interaction.showModal(newCaseModal(value)); return true; }\n"
)
replace_once(
"  if (key === 'mod_court_recommend') { await interaction.showModal(recommendationModal(caseId, court)); return true; }\n",
"  if (key === 'mod_court_recommend') { if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; } await interaction.showModal(recommendationModal(caseId, court)); return true; }\n"
)
for route, modal in [('mod_court_evidence','evidenceModal(caseId)'),('mod_court_note','noteModal(caseId)'),('mod_court_severity','severityModal(caseId, court)')]:
    old = f"  if (key === '{route}') {{ await interaction.showModal({modal}); return true; }}\n"
    new = f"  if (key === '{route}') {{ if (!canManageCourt(interaction) || court.stage === 'closed') {{ await interaction.reply({{ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }}); return true; }} await interaction.showModal({modal}); return true; }}\n"
    replace_once(old, new)

replace_once(
"  if (key === 'mod_court_import') {\n    const before = court;\n",
"  if (key === 'mod_court_import') {\n    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ Court case-management authority is required to import records into an open case.', flags: 64 }); return true; }\n    const before = court;\n"
)
replace_once(
"  if (key === 'mod_court_submit_review') {\n    if (!court.evidence.some((item) => item.status === 'verified')) {\n",
"  if (key === 'mod_court_submit_review') {\n    if (!canManageCourt(interaction) || court.stage !== 'investigation') { await interaction.reply({ content: '❌ Only an authorised open investigation can be submitted for review.', flags: 64 }); return true; }\n    if (!court.evidence.some((item) => item.status === 'verified')) {\n"
)

# Dedicated close authority should be sufficient; do not secretly require court-review too.
replace_once(
"  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; } if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to close a case.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }\n",
"  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }\n"
)
replace_once(
"    if (!isJudge(interaction) || court.stage !== 'closed') { await interaction.reply({ content: '❌ This case cannot be reopened.', flags: 64 }); return true; }\n",
"    if (court.stage !== 'closed') { await interaction.reply({ content: '❌ This case cannot be reopened.', flags: 64 }); return true; }\n"
)

# Modal routes must repeat the permission checks so stale/manually-crafted component IDs cannot bypass UI controls.
replace_once(
"  if (key === 'mod_court_new_submit') {\n    const severity = Number(field(interaction, 'severity'));\n",
"  if (key === 'mod_court_new_submit') {\n    if (!canManageCourt(interaction)) { await interaction.reply({ content: '❌ Court case-management authority is required to open a case.', flags: 64 }); return true; }\n    const severity = Number(field(interaction, 'severity'));\n"
)
for key in ['mod_court_recommend_submit','mod_court_evidence_submit','mod_court_note_submit','mod_court_severity_submit']:
    anchor = f"  if (key === '{key}') {{\n"
    replacement = anchor + "    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; }\n"
    replace_once(anchor, replacement)

replace_once(
"  if (key === 'mod_court_close_submit') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; }\n    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to close a case.', flags: 64 }); return true; }\n",
"  if (key === 'mod_court_close_submit') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; }\n"
)

p.write_text(s)
