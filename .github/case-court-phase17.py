from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
source = path.read_text()

old = """  const canManage = canManageCourt(interaction);\n  const judgeAuthority = isJudge(interaction);\n  const isAssignedJudge = judgeAuthority && court.reviewingAdminId === interaction.user.id;\n"""
new = """  const canManage = canManageCourt(interaction);\n  const judgeAuthority = isJudge(interaction);\n  const executionAction = String(court.decision?.action || '');\n  const canExecuteAction = !executionAction || executionAction === 'no_action'\n    ? false\n    : canUseModAction(interaction.member, interaction.guild, executionAction, interaction);\n  const isAssignedJudge = judgeAuthority && court.reviewingAdminId === interaction.user.id;\n"""
if old not in source:
    raise RuntimeError('Case-file authority anchor not found')
source = source.replace(old, new, 1)

old = """      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'reversal_failed' ? 'Appeal Reversal Failed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Sanction Executing' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !judgeAuthority || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n"""
new = """      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'reversal_failed' ? 'Appeal Reversal Failed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Sanction Executing' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Sanction' : !canExecuteAction && executionAction ? 'No Sanction Authority' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !judgeAuthority || !canExecuteAction || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n"""
if old not in source:
    raise RuntimeError('Execute button anchor not found')
source = source.replace(old, new, 1)

old = """function buildEvidencePage(interaction, modCase) {\n  const court = parseCourt(modCase);\n"""
new = """function buildEvidencePage(interaction, modCase) {\n  const court = parseCourt(modCase);\n  const canManage = canManageCourt(interaction) && court.stage !== 'closed';\n  const judgeAuthority = isJudge(interaction);\n"""
if old not in source:
    raise RuntimeError('Evidence-page anchor not found')
source = source.replace(old, new, 1)

old = """  return { embeds: [embed], components: [row(button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary), button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length)), caseFileBackRow(modCase.caseId)] };\n"""
new = """  return { embeds: [embed], components: [row(button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary, !canManage), button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !judgeAuthority || !court.evidence.length || court.stage === 'closed')), caseFileBackRow(modCase.caseId)] };\n"""
if old not in source:
    raise RuntimeError('Evidence controls anchor not found')
source = source.replace(old, new, 1)

old = """function buildNotesPage(modCase) {\n  const court = parseCourt(modCase);\n"""
new = """function buildNotesPage(interaction, modCase) {\n  const court = parseCourt(modCase);\n  const canManage = canManageCourt(interaction) && court.stage !== 'closed';\n"""
if old not in source:
    raise RuntimeError('Notes-page signature anchor not found')
source = source.replace(old, new, 1)

old = """  return { embeds: [embed], components: [row(button(`mod_court_note:${modCase.caseId}`, 'Add Case Note', '➕', ButtonStyle.Primary)), caseFileBackRow(modCase.caseId)] };\n"""
new = """  return { embeds: [embed], components: [row(button(`mod_court_note:${modCase.caseId}`, 'Add Case Note', '➕', ButtonStyle.Primary, !canManage)), caseFileBackRow(modCase.caseId)] };\n"""
if old not in source:
    raise RuntimeError('Notes controls anchor not found')
source = source.replace(old, new, 1)

old = """  if (key === 'mod_court_notes_view') { await interaction.update(buildNotesPage(modCase)); return true; }"""
new = """  if (key === 'mod_court_notes_view') { await interaction.update(buildNotesPage(interaction, modCase)); return true; }"""
if old not in source:
    raise RuntimeError('Notes route anchor not found')
source = source.replace(old, new, 1)

path.write_text(source)
print('Court execution authority UX applied.')
