from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
text = p.read_text()

old = "function staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }\nfunction caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }\n"
new = "function staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }\nfunction caseManagementNavigationRow(interaction, targetId) {\n  const items = [button(`mod_dashboard:${targetId}:actions`, 'Back', '⬅️')];\n  if (canUseModAction(interaction.member, interaction.guild, 'export_cases', interaction)) items.push(button(`mod_export_cases:${targetId}`, 'Export', '📤'));\n  return row(...items);\n}\nfunction caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }\n"
if new not in text:
    if old not in text:
        raise SystemExit('navigation helper anchor not found')
    text = text.replace(old, new, 1)

old = """    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
  }
  return { embed, components };
}
"""
new = """    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
    components.push(caseManagementNavigationRow(interaction, target.id));
  }
  return { embed, components };
}
"""
if new not in text:
    if old not in text:
        raise SystemExit('dashboard component anchor not found')
    text = text.replace(old, new, 1)

p.write_text(text)
print('Phase 25 navigation row applied')
