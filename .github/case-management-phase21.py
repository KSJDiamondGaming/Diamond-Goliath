from pathlib import Path
import re

ROOT = Path('.')

def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise RuntimeError(f'Anchor not found: {label}')

# ---- Case management UI language + severity UX
court_path = ROOT / 'src/core/administration/mod/caseCourt.js'
text = court_path.read_text()

old_severity = """const SEVERITY = Object.freeze({\n  1: 'Informational',\n  2: 'Minor',\n  3: 'Moderate',\n  4: 'Severe',\n  5: 'Critical',\n});"""
new_severity = """const SEVERITY = Object.freeze({\n  1: 'Low',\n  2: 'Medium',\n  3: 'High',\n  4: 'Severe',\n  5: 'Critical',\n});"""
text = replace_once(text, old_severity, new_severity, 'severity labels')

old_helper = "function severityText(value) { const n = Math.min(5, Math.max(1, Number(value) || 1)); return `${n}/5 — ${SEVERITY[n]}`; }\n"
new_helper = """function severityText(value) { const n = Math.min(5, Math.max(1, Number(value) || 1)); return SEVERITY[n]; }\nfunction parseSeverityInput(value) {\n  const raw = String(value || '').trim().toLowerCase();\n  const aliases = { '1': 1, low: 1, '2': 2, medium: 2, moderate: 2, '3': 3, high: 3, '4': 4, severe: 4, '5': 5, critical: 5 };\n  return aliases[raw] || null;\n}\n"""
text = replace_once(text, old_helper, new_helper, 'severity helper')

old_new_modal = """function newCaseModal(targetId) {\n  return new ModalBuilder().setCustomId(`mod_court_new_submit:${targetId}`).setTitle('Open Court Case').addComponents(\n    modalInput('allegations', 'Allegations / concerns', TextInputStyle.Paragraph, true, 2000, 'Describe what is being investigated.'),\n    modalInput('severity', 'Initial severity (1-5)', TextInputStyle.Short, true, 1, '1'),\n    modalInput('recommendation', 'Initial recommendation (optional)', TextInputStyle.Paragraph, false, 800, 'What should staff consider at this stage?'),\n  );\n}"""
new_new_modal = """function newCaseModal(targetId) {\n  return new ModalBuilder().setCustomId(`mod_court_new_submit:${targetId}`).setTitle('Open New Case').addComponents(\n    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),\n    modalInput('severity', 'Initial severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical'),\n    modalInput('recommendation', 'Recommended action (optional)', TextInputStyle.Paragraph, false, 800, 'What action or next step should the review team consider?'),\n  );\n}"""
text = replace_once(text, old_new_modal, new_new_modal, 'new case modal')

old_sev_modal = """function severityModal(caseId, court) {\n  return new ModalBuilder().setCustomId(`mod_court_severity_submit:${caseId}`).setTitle('Change Case Severity').addComponents(\n    modalInput('severity', 'Severity (1-5)', TextInputStyle.Short, true, 1, String(court.severity)),\n    modalInput('reason', 'Reason for severity change', TextInputStyle.Paragraph, true, 1000, 'Explain why severity is being increased or decreased.'),\n"""
new_sev_modal = """function severityModal(caseId, court) {\n  return new ModalBuilder().setCustomId(`mod_court_severity_submit:${caseId}`).setTitle('Change Case Severity').addComponents(\n    modalInput('severity', 'Severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical', SEVERITY[court.severity]),\n    modalInput('reason', 'Reason for severity change', TextInputStyle.Paragraph, true, 1000, 'Explain why the case impact or risk level has changed.'),\n"""
text = replace_once(text, old_sev_modal, new_sev_modal, 'severity modal')

old_new_submit = """    const severity = Number(field(interaction, 'severity'));\n    if (!Number.isInteger(severity) || severity < 1 || severity > 5) { await interaction.reply({ content: '❌ Severity must be a whole number from 1 to 5.', flags: 64 }); return true; }"""
new_new_submit = """    const severity = parseSeverityInput(field(interaction, 'severity'));\n    if (!severity) { await interaction.reply({ content: '❌ Severity must be Low, Medium, High, Severe, or Critical.', flags: 64 }); return true; }"""
text = replace_once(text, old_new_submit, new_new_submit, 'new case severity parser')

# Replace the second numeric severity parser used by severity-change modal.
if old_new_submit in text:
    text = text.replace(old_new_submit, new_new_submit, 1)

# Human-facing terminology. Internal ids, metadata keys and permission keys remain unchanged for compatibility.
replacements = {
    '⚖️ Case Court': '📂 Case Management',
    'Select a member to open their court case workspace.': 'Select a member to open their case-management workspace.',
    'Court Workflow': 'Case Workflow',
    'No appeal submitted for this court case.': 'No appeal submitted for this case.',
    '**Judge:**': '**Decision by:**',
    'Court case-management authority is required to open a case.': 'Case-management authority is required to open a case.',
    'Court publishing authority is required to publish a record.': 'Case publishing authority is required to publish a record.',
    'Court closure authority is required.': 'Case closure authority is required.',
    'Court Case #': 'Case #',
    'Court decision': 'Case decision',
    'court decision': 'case decision',
    'Court sanction': 'Sanction',
    'court sanction': 'sanction',
    'Court appeal': 'Appeal',
    'court appeal': 'appeal',
    'Court record': 'Case record',
    'court record': 'case record',
    'Court-ordered': 'Case-approved',
    'court-ordered': 'case-approved',
    'another judge': 'another reviewer',
    'Judge authority': 'Reviewer authority',
    'judge authority': 'reviewer authority',
}
for old, new in replacements.items():
    text = text.replace(old, new)

# Remove numeric-only severity presentation from dashboard summaries.
text = text.replace("Severity **${court.severity}/5**", "Severity **${severityText(court.severity)}**")

court_path.write_text(text)

# ---- Appeal/member-visible language
cases_path = ROOT / 'src/core/administration/mod/cases.js'
cases = cases_path.read_text()
case_replacements = {
    'Court cases become appealable only after an official decision is published.': 'Cases become appealable only after an official decision is published.',
    'Court appeal approved for Case #': 'Appeal approved for Case #',
    'Court case reversed; no published sanction was available to undo.': 'Case reversed; no published sanction was available to undo.',
    'Published court decision reversed.': 'Published case decision reversed.',
    'Court-ordered timeout cleared.': 'Timeout cleared following the approved appeal.',
    'Court-ordered ban removed.': 'Ban removed following the approved appeal.',
    'Court-ordered ban was already absent.': 'Ban was already absent; the approved appeal outcome is satisfied.',
    'Kick cannot be automatically undone; the court decision has been reversed.': 'Kick cannot be automatically undone; the case decision has been reversed.',
    'Court finding reversed; there was no sanction to undo.': 'Finding reversed; there was no sanction to undo.',
    'Court case could not be found.': 'Case could not be found.',
    'Only an approved Court appeal can retry its remedy.': 'Only an approved appeal can retry its remedy.',
    'This Court sanction is not awaiting reversal recovery.': 'This sanction is not awaiting reversal recovery.',
}
for old, new in case_replacements.items():
    cases = cases.replace(old, new)
cases_path.write_text(cases)

# ---- Authority labels shown in /admin
admin_path = ROOT / 'src/core/administration/admin/panel.js'
admin = admin_path.read_text()
admin = admin.replace("label: 'Build Court Case Files'", "label: 'Build Detailed Case Files'")
admin = admin.replace("label: 'Review & Decide Court Cases'", "label: 'Review & Decide Cases'")
admin = admin.replace("label: 'Publish Court Decisions'", "label: 'Publish Case Decisions'")
admin = admin.replace("label: 'Close / Reopen Court Cases'", "label: 'Close / Reopen Cases'")
admin_path.write_text(admin)

print('Phase 21 case language and severity UX patched.')
