from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
s = path.read_text()

old = "function buildRecordHistoryPage(modCase) {\n  const court = parseCourt(modCase);\n  const decisions = [...court.decisionHistory, ...(court.decision ? [court.decision] : [])].filter(Boolean);\n  const publications = [...court.publicationHistory, ...(court.publication ? [court.publication] : [])].filter(Boolean);"
new = "function uniqueHistoryItems(items, keyFn) {\n  const seen = new Set();\n  const result = [];\n  for (const item of items.filter(Boolean)) {\n    const key = String(keyFn(item) || '');\n    if (seen.has(key)) continue;\n    seen.add(key);\n    result.push(item);\n  }\n  return result;\n}\n\nfunction buildRecordHistoryPage(modCase) {\n  const court = parseCourt(modCase);\n  const decisions = uniqueHistoryItems(\n    [...court.decisionHistory, ...(court.decision ? [court.decision] : [])],\n    (item) => `${item.decidedAt || ''}:${item.action || ''}:${item.finding || ''}`,\n  );\n  const publications = uniqueHistoryItems(\n    [...court.publicationHistory, ...(court.publication ? [court.publication] : [])],\n    (item) => `${item.revision || ''}:${item.publishedAt || ''}:${item.summary || ''}`,\n  );"

if old not in s:
    raise SystemExit('record history anchor not found')

s = s.replace(old, new, 1)
path.write_text(s)
print('Applied Case Court record history dedupe hardening.')
