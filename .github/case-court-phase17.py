from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
source = path.read_text()

required = [
    "const executionAction = String(court.decision?.action || '');",
    "const canExecuteAction = !executionAction || executionAction === 'no_action'",
    "'No Sanction Authority'",
    "function buildNotesPage(interaction, modCase)",
    "buildNotesPage(interaction, modCase)",
]
missing = [item for item in required if item not in source]
if missing:
    raise RuntimeError('Phase 17 is not fully applied: ' + ', '.join(missing))

print('Phase 17 already applied; rerun is a safe no-op.')
