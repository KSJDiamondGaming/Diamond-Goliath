from pathlib import Path

# Dedicated court authority keys: moderators can build files; admins/judges decide, publish and close.
p = Path('src/core/administration/admin/panel.js')
s = p.read_text()
old = "  { key: 'mod.cases.manage', label: 'Manage Cases', group: 'Cases' },\n  { key: 'mod.evidence.manage', label: 'Manage Evidence', group: 'Cases' },\n"
new = "  { key: 'mod.cases.manage', label: 'Manage Cases', group: 'Cases' },\n  { key: 'mod.court.manage', label: 'Build Court Case Files', group: 'Cases' },\n  { key: 'mod.court.review', label: 'Review & Decide Court Cases', group: 'Cases' },\n  { key: 'mod.court.publish', label: 'Publish Court Decisions', group: 'Cases' },\n  { key: 'mod.court.close', label: 'Close / Reopen Court Cases', group: 'Cases' },\n  { key: 'mod.evidence.manage', label: 'Manage Evidence', group: 'Cases' },\n"
assert old in s
s = s.replace(old, new, 1)
old = "  'mod.cases.manage': true, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,\n"
new = "  'mod.cases.manage': true, 'mod.court.manage': true, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': true, 'mod.appeals.view': true, 'mod.appeals.decide': false,\n"
assert old in s
s = s.replace(old, new, 1)
old = "  'mod.cases.manage': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,\n"
new = "  'mod.cases.manage': false, 'mod.court.manage': false, 'mod.court.review': false, 'mod.court.publish': false, 'mod.court.close': false, 'mod.evidence.manage': false, 'mod.appeals.view': false, 'mod.appeals.decide': false,\n"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('src/core/administration/mod/permissions.js')
s = p.read_text()
old = "  edit_case: STAFF_LEVELS.ADMIN,\n  export_cases: STAFF_LEVELS.ADMIN,\n"
new = "  edit_case: STAFF_LEVELS.ADMIN,\n  court_manage: STAFF_LEVELS.MOD,\n  court_review: STAFF_LEVELS.ADMIN,\n  court_publish: STAFF_LEVELS.ADMIN,\n  court_close: STAFF_LEVELS.ADMIN,\n  export_cases: STAFF_LEVELS.ADMIN,\n"
assert old in s
s = s.replace(old, new, 1)
old = "  edit_case: { key: 'mod.cases.manage' },\n  export_cases: { key: 'mod.cases.export', fallback: 'mod.cases.view' },\n"
new = "  edit_case: { key: 'mod.cases.manage' },\n  court_manage: { key: 'mod.court.manage', fallback: 'mod.cases.manage' },\n  court_review: { key: 'mod.court.review', fallback: 'mod.cases.manage' },\n  court_publish: { key: 'mod.court.publish', fallback: 'mod.cases.manage' },\n  court_close: { key: 'mod.court.close', fallback: 'mod.cases.manage' },\n  export_cases: { key: 'mod.cases.export', fallback: 'mod.cases.view' },\n"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()
s = s.replace("const canManage = canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction);", "const canManage = canUseModAction(interaction.member, interaction.guild, 'court_manage', interaction);")
s = s.replace("function isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction); }", "function isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_review', interaction); }\nfunction canPublishCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_publish', interaction); }\nfunction canCloseCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_close', interaction); }")
# Publication is a separate authority from judicial review.
s = s.replace("button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision || isClosed ||", "button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canPublishCourt(interaction) || !court.decision || isClosed ||")
# Closing/reopening is also independently controlled.
s = s.replace("button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage)", "button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canCloseCourt(interaction))")
# Verify/decision/ban approval remain judicial functions.
s = s.replace("if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to publish the member record.'", "if (!canPublishCourt(interaction)) return interaction.reply({ content: '❌ Court publishing authority is required to publish the member record.'")
# Explicit close/reopen authorization checks.
s = s.replace("if (key === 'mod_court_close') {", "if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; }")
s = s.replace("if (key === 'mod_court_reopen') {", "if (key === 'mod_court_reopen') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; }")
s = s.replace("if (key === 'mod_court_close_submit') {", "if (key === 'mod_court_close_submit') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Court closure authority is required.', flags: 64 }); return true; }")
p.write_text(s)
