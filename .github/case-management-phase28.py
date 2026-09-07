from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
text = p.read_text()
replacements = {
"button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '📥', ButtonStyle.Primary, !canManage || court.stage !== 'investigation')": "button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Pending' : 'Review', '📥', ButtonStyle.Primary, !canManage || court.stage !== 'investigation')",
"button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !reviewerAuthority || !court.evidence.length || isClosed)": "button(`mod_court_verify:${modCase.caseId}`, 'Verify', '✅', ButtonStyle.Secondary, !reviewerAuthority || !court.evidence.length || isClosed)",
"button(`mod_court_decide:${modCase.caseId}`, 'Record Decision', '🧾', canDecide ? ButtonStyle.Primary : ButtonStyle.Secondary, !canDecide)": "button(`mod_court_decide:${modCase.caseId}`, 'Decide', '🧾', canDecide ? ButtonStyle.Primary : ButtonStyle.Secondary, !canDecide)",
"button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update Record' : 'Publish Record', '📜', ButtonStyle.Success, !canPublishCourt(interaction) || !court.decision || isClosed || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved'))": "button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update' : 'Publish', '📜', ButtonStyle.Success, !canPublishCourt(interaction) || !court.decision || isClosed || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved'))",
"button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Action Completed' : court.sanctionExecution?.status === 'reversed' ? 'Action Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Action Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Action' : 'Execute Action'": "button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Done' : court.sanctionExecution?.status === 'reversed' ? 'Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry' : 'Execute'",
"button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary, !canManage || isClosed)": "button(`mod_court_evidence:${modCase.caseId}`, 'Evidence', '➕', ButtonStyle.Primary, !canManage || isClosed)",
"button(`mod_court_note:${modCase.caseId}`, 'Add Note', '📝', ButtonStyle.Secondary, !canManage || isClosed)": "button(`mod_court_note:${modCase.caseId}`, 'Note', '📝', ButtonStyle.Secondary, !canManage || isClosed)",
"button(`mod_court_import:${modCase.caseId}`, 'Import Records', '🔗', ButtonStyle.Secondary, !canManage || isClosed)": "button(`mod_court_import:${modCase.caseId}`, 'Import', '🔗', ButtonStyle.Secondary, !canManage || isClosed)",
"button(`mod_court_severity:${modCase.caseId}`, 'Change Severity', '📊', ButtonStyle.Secondary, !canManage || isClosed)": "button(`mod_court_severity:${modCase.caseId}`, 'Severity', '📊', ButtonStyle.Secondary, !canManage || isClosed)",
"button(`mod_court_recommend:${modCase.caseId}`, 'Recommendation', '📋', ButtonStyle.Secondary, !canManage || isClosed)": "button(`mod_court_recommend:${modCase.caseId}`, 'Recommend', '📋', ButtonStyle.Secondary, !canManage || isClosed)",
"button('mod_case_appeal_queue:0', 'Appeal Queue', '📥')": "button('mod_case_appeal_queue:0', 'Appeals', '📥')",
"button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen Case' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canCloseCourt(interaction))": "button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canCloseCourt(interaction))",
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'anchor not found: {old[:120]}')
    text = text.replace(old, new, 1)
p.write_text(text)
print('Phase 28 compact labels applied')
