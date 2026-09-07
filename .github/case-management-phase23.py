from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

old = "return new ModalBuilder().setCustomId(`mod_court_new_submit:${targetId}`).setTitle('Open New Case').addComponents("
new = "return new ModalBuilder().setCustomId(`mod_case_new_submit_v2:${targetId}`).setTitle('Open New Case').addComponents("
assert old in s, 'new case modal custom id anchor missing'
s = s.replace(old, new, 1)

old = "  if (!id.startsWith('mod_court_') || !interaction.isModalSubmit?.()) return false;\n  const [key, raw] = id.split(':');\n  if (key === 'mod_court_new_submit') {"
new = "  if (!(id.startsWith('mod_court_') || id.startsWith('mod_case_new_submit_v2:')) || !interaction.isModalSubmit?.()) return false;\n  const [key, raw] = id.split(':');\n  if (key === 'mod_case_new_submit_v2') {"
assert old in s, 'modal router anchor missing'
s = s.replace(old, new, 1)

s = s.replace("❌ Failed to create the court case.", "❌ Failed to create the case.")
s = s.replace("❌ Court case-management authority is required to import records into an open case.", "❌ Case-management authority is required to import records into an open case.")

# Keep legacy numeric aliases for existing saved UI compatibility, but make named severities canonical.
assert "parseSeverityInput(field(interaction, 'severity'))" in s
assert "Severity must be Low, Medium, High, Severe, or Critical." in s
assert "mod_case_new_submit_v2" in s

p.write_text(s)
