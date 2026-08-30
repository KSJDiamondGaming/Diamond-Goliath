from pathlib import Path

path = Path('src/core/administration/mod/panel.js')
text = path.read_text()

old_nav = '''function buildDashboardNav(targetId, activeView, member, guild) {
  const active = normalizeView(activeView);
  const id = targetId || 'none';
  const rows = [];

  if (targetId) {
    const candidates = [
      ['member', '👤 Member'],
      ['actions', '⚡ Actions'],
      ['intelligence', '🧠 Intel'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => view !== active && canViewDashboardSection(member, guild, view));

    const buttons = candidates.slice(0, 4).map(([view, label]) => new ButtonBuilder()
      .setCustomId(`mod_dashboard:${id}:${view}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary));
    if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}
'''

new_nav = '''function buildDashboardNav(targetId, activeView, member, guild) {
  const active = normalizeView(activeView);
  const id = targetId || 'none';
  const rows = [];
  const candidates = [
    ['member', '👤 Member'],
    ['actions', '⚡ Actions'],
    ['intelligence', '🧠 Intel'],
    ['cases', '📁 Cases'],
  ].filter(([view]) => canViewDashboardSection(member, guild, view));

  const buttons = candidates.slice(0, 4).map(([view, label]) => new ButtonBuilder()
    .setCustomId(`mod_dashboard:${id}:${view}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!targetId || view === active));
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}
'''

old_reverse = '''  const reverse = [];
  if (target && p.removeWarning && Number(stats?.warningCount || 0) > 0) reverse.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')));
  if (target && p.removeTimeout && targetHasActiveTimeout(target)) reverse.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')));

  return [buttonRow(apply), buttonRow(reverse)].filter(Boolean);
'''

new_reverse = '''  const reverse = [];
  if (p.removeWarning) reverse.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')).setDisabled(disabled || Number(stats?.warningCount || 0) <= 0));
  if (p.removeTimeout) reverse.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')).setDisabled(disabled || !targetHasActiveTimeout(target)));

  return [buttonRow(apply), buttonRow(reverse)].filter(Boolean);
'''

for label, old, new in [('dashboard navigation', old_nav, new_nav), ('reversal controls', old_reverse, new_reverse)]:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one {label} block, found {count}')
    text = text.replace(old, new)

path.write_text(text)
print('Visible moderation controls patch applied.')
