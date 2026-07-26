from pathlib import Path
root=Path('.')
target=root/'src/modules/feedbackStudio/forms'
target.mkdir(parents=True,exist_ok=True)
payload=Path('.goliath/forms_payload')
for src in payload.glob('*.js'):
    (target/src.name).write_bytes(src.read_bytes())
replacements={
    'formStore':'forms', 'formsStore':'forms',
    'formManager':'formsPanel', 'formsManager':'formsPanel',
    'formsAdminPanel':'formsInteractions', 'formsInteractionHandler':'formsInteractions',
    'formTicketBridge':'formsTracking', 'formWorkflowSummary':'formsTracking',
    'formWorkflowHelpers':'formsTracking', 'formSocketEvents':'forms',
}
for path in root.rglob('*.js'):
    if payload in path.parents or (target in path.parents and path.name in {'forms.js','formsPanel.js','formsInteractions.js','formsTracking.js'}):
        continue
    text=path.read_text(encoding='utf-8')
    original=text
    for old,new in replacements.items():
        text=text.replace(old,new)
    if text!=original:
        path.write_text(text,encoding='utf-8')
for name in ['formStore.js','formsStore.js','formManager.js','formsManager.js','formsAdminPanel.js','formsInteractionHandler.js','formSocketEvents.js','formTicketBridge.js','formWorkflowHelpers.js','formWorkflowSummary.js']:
    path=target/name
    if path.exists(): path.unlink()
