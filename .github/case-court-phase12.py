from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

changes = 0

def replace_once(old, new):
    global s, changes
    if old not in s:
        raise RuntimeError(f'Anchor not found: {old[:140]}')
    s = s.replace(old, new, 1)
    changes += 1

replace_once(
"court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'executing' ? (executionIsStale(court.sanctionExecution) ? '⚠️ Execution lock stale' : '⏳ Executing') : '❌ Failed'",
"court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'reversal_failed' ? '⚠️ Appeal reversal failed' : court.sanctionExecution.status === 'executing' ? (executionIsStale(court.sanctionExecution) ? '⚠️ Execution lock stale' : '⏳ Executing') : '❌ Failed'"
)

replace_once(
"${court.sanctionExecution.status === 'reversed' ? `\\nReversed by <@${court.sanctionExecution.reversedBy}> • ${discordTime(court.sanctionExecution.reversedAt)}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`",
"${court.sanctionExecution.status === 'reversed' ? `\\nReversed by <@${court.sanctionExecution.reversedBy}> • ${discordTime(court.sanctionExecution.reversedAt)}` : court.sanctionExecution.status === 'reversal_failed' ? `\\nAppeal approved, but sanction reversal still needs staff action.${court.sanctionExecution.reversalRemedy?.detail ? `\\n${cleanExcerpt(court.sanctionExecution.reversalRemedy.detail, 180)}` : ''}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`"
)

old_label = "court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Sanction Executing' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Sanction' : 'Execute Sanction'"
new_label = "court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'reversal_failed' ? 'Appeal Reversal Failed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Sanction Executing' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Sanction' : 'Execute Sanction'"
replace_once(old_label, new_label)

old_disabled = "['executed', 'reversed'].includes(court.sanctionExecution?.status)"
new_disabled = "['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status)"
count = s.count(old_disabled)
if count < 1:
    raise RuntimeError('Execution final-state guard anchor not found')
s = s.replace(old_disabled, new_disabled)
changes += count

old_guard = "if (court.sanctionExecution?.status === 'executed' || court.sanctionExecution?.status === 'reversed') { await interaction.reply({ content: '❌ This sanction has already been finalised. Duplicate execution is blocked.', flags: 64 }); return true; }"
new_guard = "if (['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status)) { await interaction.reply({ content: court.sanctionExecution?.status === 'reversal_failed' ? '❌ This sanction is under an approved appeal with a failed reversal. Do not re-execute it; resolve the reversal failure instead.' : '❌ This sanction has already been finalised. Duplicate execution is blocked.', flags: 64 }); return true; }"
count = s.count(old_guard)
if count < 1:
    raise RuntimeError('Execution handler final-state guard anchor not found')
s = s.replace(old_guard, new_guard)
changes += count

if 'reversal_failed' not in s:
    raise RuntimeError('Phase 12 did not add reversal_failed handling')
if changes < 5:
    raise RuntimeError(f'Expected at least 5 edits, got {changes}')

p.write_text(s)
print(f'Applied {changes} Court reversal-failure safety edits')
