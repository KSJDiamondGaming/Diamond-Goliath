from pathlib import Path
p=Path('src/core/administration/mod/caseCourt.js')
s=p.read_text()
old="""        const memberName = target.displayName || target.user?.globalName || target.user?.username || 'Unknown Member';
        return { label: cleanExcerpt(memberName, 92), description: `Case #${entry.caseId} • ${stageText(court.stage).replace(/^\\S+\\s/, '')} • ${SEVERITY[court.severity]}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };
"""
new="""        const memberName = target.displayName || target.user?.globalName || target.user?.username || 'Unknown Member';
        const caseTitle = cleanExcerpt(court.title || court.allegations || entry.reason || 'Untitled Case', 42);
        return {
          label: cleanExcerpt(`${memberName} • ${target.id} • ${caseTitle}`, 100),
          description: cleanExcerpt(`Case #${entry.caseId} • ${stageText(court.stage).replace(/^\\S+\\s/, '')} • Severity ${severityText(court.severity)}`, 100),
          value: String(entry.caseId),
          emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂',
        };
"""
if old not in s: raise SystemExit('selector anchor not found')
s=s.replace(old,new,1)
p.write_text(s)
