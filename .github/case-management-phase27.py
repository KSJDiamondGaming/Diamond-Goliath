from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
text = path.read_text()
old = """        return { label: cleanExcerpt(court.title, 92), description: `Case #${entry.caseId} • ${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${SEVERITY[court.severity]}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };"""
new = """        const memberName = target.displayName || target.user?.globalName || target.user?.username || 'Unknown Member';
        return { label: cleanExcerpt(memberName, 92), description: `Case #${entry.caseId} • ${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${SEVERITY[court.severity]}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };"""
if new in text:
    print('Already applied')
elif old not in text:
    raise SystemExit('case selector anchor not found')
else:
    path.write_text(text.replace(old, new, 1))
    print('Phase 27 patch applied')
