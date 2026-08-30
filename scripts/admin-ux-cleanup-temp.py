from pathlib import Path


def replace_between(path, start_marker, end_marker, replacement):
    p = Path(path)
    text = p.read_text()
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'Missing start marker in {path}: {start_marker}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'Missing end marker in {path}: {end_marker}')
    p.write_text(text[:start] + replacement + text[end:])


admin = Path('src/core/administration/admin/panel.js')
text = admin.read_text()
text = text.replace("'admin:modules': 'Studios & Modules'", "'admin:modules': 'Studios'")
admin.write_text(text)

replace_between(
    admin,
    "function buildAdminPanel(guild, name = 'Unknown User', interaction = null) {",
    "function buildAdminToolsPanel",
    """function buildAdminPanel(guild, name = 'Unknown User', interaction = null) {
  const can = (key) => !interaction || hasGuildPermission(interaction, key);
  const fields = [];
  const actions = [];

  if (!interaction || canManageGuildAuthority(interaction)) {
    fields.push({ name: '👥 Staff & Permissions', value: 'Map guild roles to Goliath authority and control exact powers', inline: true });
    actions.push(['admin:adminpanel', '👥 Permissions', ButtonStyle.Primary]);
  }
  if (can('admin.automod.manage')) {
    fields.push({ name: '🛡️ Security & AutoMod', value: 'Protection rules and automated enforcement', inline: true });
    actions.push(['admin:automod', '🛡️ Security', ButtonStyle.Primary]);
  }
  if (!interaction || hasAnyModulePermission(interaction)) {
    fields.push({ name: '🧩 Goliath Studios', value: 'Configure only the Studios assigned to your Goliath authority profile', inline: true });
    actions.push(['admin:modules', '🧩 Studios', ButtonStyle.Primary]);
  }
  if (can('admin.logs.manage')) {
    fields.push({ name: '📋 Logs & Audit', value: `${Object.values(LOG_TYPES).filter((value) => getLogChannelId(guild.id, value.key)).length}/5 log channels configured`, inline: true });
    actions.push(['admin:logs', '📋 Logs', ButtonStyle.Primary]);
  }
  if (can('admin.backups.view')) {
    fields.push({ name: '🧱 Backup & Recovery', value: 'Server backup visibility and recovery requests', inline: true });
    actions.push(['admin:backups', '🧱 Backups', ButtonStyle.Primary]);
  }
  if (can('mod.panel.view')) {
    fields.push({ name: '🔐 Moderation Hub', value: 'Moderation cases, actions and tooling', inline: true });
    actions.push(['admin:modpanel', '🔐 Moderation', ButtonStyle.Primary]);
  }
  if (can('admin.purge')) {
    fields.push({ name: '🧹 Server Utilities', value: 'Controlled server maintenance actions', inline: true });
    actions.push(['admin:purge', '🧹 Purge', ButtonStyle.Danger]);
  }

  const embed = createEmbed('🛠️ Goliath Administration', 'Choose an administration area. Only controls assigned to your Goliath authority profile are shown.', name);
  if (fields.length) embed.addFields(fields);
  else embed.setDescription('No guild-manageable administration controls are currently assigned to your roles.');
  return { embeds: [embed], components: buttonRows(actions, 3) };
}
"""
)

text = admin.read_text()
text = text.replace("createEmbed('🧩 Goliath Modules',", "createEmbed('🧩 Goliath Studios',")
text = text.replace("'⬅️ Back to Modules'", "'⬅️ Back to Studios'")
admin.write_text(text)

modules = Path('src/core/administration/admin/modules.js')
text = modules.read_text().replace("'🧩 Goliath Modules'", "'🧩 Goliath Studios'")
modules.write_text(text)

mod = Path('src/core/administration/mod/panel.js')
replace_between(
    mod,
    "function buildDashboardNav(targetId, activeView, member, guild) {",
    "function buildUserSelectRow()",
    """function buildDashboardNav(targetId, activeView, member, guild) {
  const active = activeView === 'analytics' ? 'management' : normalizeView(activeView);
  const id = targetId || 'none';
  const buttons = [];

  if (active === 'management') {
    if (canViewDashboardSection(member, guild, 'member')) {
      buttons.push(new ButtonBuilder().setCustomId('mod:overview').setLabel('🛡️ Moderation Home').setStyle(ButtonStyle.Secondary));
    }
  } else if (!targetId) {
    if (canViewDashboardSection(member, guild, 'management')) {
      buttons.push(new ButtonBuilder().setCustomId('mod_dashboard:none:management').setLabel('🛠️ Manage').setStyle(ButtonStyle.Secondary));
    }
  } else {
    const candidates = [
      ['member', '👤 Member'],
      ['actions', '⚡ Actions'],
      ['intelligence', '🧠 Intel'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => view !== active && canViewDashboardSection(member, guild, view));

    for (const [view, label] of candidates.slice(0, 4)) {
      buttons.push(new ButtonBuilder().setCustomId(`mod_dashboard:${id}:${view}`).setLabel(label).setStyle(ButtonStyle.Secondary));
    }
  }

  buttons.push(new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
  return new ActionRowBuilder().addComponents(buttons);
}
"""
)

replace_between(
    mod,
    "function buildMemberEmbed(interaction, target, stats, staffDisplay) {",
    "function buildActionsEmbed",
    """function buildMemberEmbed(interaction, target, stats, staffDisplay) {
  const overall = workspaceStats(interaction.guild.id);
  if (!target) return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('🛡️ Goliath Moderation')
    .setDescription([
      'Moderate members, review intelligence and manage cases from one focused workspace.',
      '',
      `**Authority:** ${staffDisplay}`,
      '',
      'Select a member below to open their workspace, or use **Manage** for server-wide moderation tools.',
    ].join('\\n'))
    .addFields(
      { name: 'Open Cases', value: `**${overall.activeCases}**`, inline: true },
      { name: 'Active Warnings', value: `**${overall.activeWarnings}**`, inline: true },
      { name: 'Pending Appeals', value: `**${overall.pendingAppeals}**`, inline: true },
    );

  const highestRole = target.roles?.highest && target.roles.highest.id !== interaction.guild.id ? `${target.roles.highest}` : 'No elevated role';
  const timeout = targetHasActiveTimeout(target) ? `Active until ${timestamp(target.communicationDisabledUntilTimestamp, 'f')}` : 'None';
  const embed = baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle(`👤 Member Workspace • ${target.user?.tag || target.user?.username || target.id}`)
    .setDescription([`${target.user} is the active moderation target.`, '', 'Use **Actions**, **Intel** and **Cases** below. The selected member stays active while you move between these views.'].join('\\n'))
    .addFields(
      { name: 'Identity', value: `**Discord ID:** \\`${target.id}\\`\\n**Account Created:** ${timestamp(target.user?.createdTimestamp)}\\n**Joined Server:** ${timestamp(target.joinedTimestamp)}`, inline: false },
      { name: 'Server Position', value: `**Highest Role:** ${highestRole}\\n**Timeout:** ${timeout}`, inline: true },
      { name: 'Moderation', value: `**Warnings:** ${stats.warningCount ?? 0}\\n**Cases:** ${stats.caseCount ?? 0}`, inline: true },
      { name: 'Latest Case', value: stats.lastCaseSummary || 'No cases found.', inline: false },
    );
  const avatar = target.user?.displayAvatarURL?.({ size: 256 });
  if (avatar) embed.setThumbnail(avatar);
  return embed;
}
"""
)

replace_between(
    mod,
    "function buildActionsEmbed(interaction, target, stats) {",
    "function buildIntelligenceEmbed",
    """function buildActionsEmbed(interaction, target, stats) {
  if (!target) return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('⚡ Moderation Actions')
    .setDescription(['**No member selected.**', '', 'Return to Moderation Home and choose a member first.'].join('\\n'));

  const timeout = targetHasActiveTimeout(target) ? `Active until ${timestamp(target.communicationDisabledUntilTimestamp, 'f')}` : 'None';
  return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('⚡ Moderation Actions')
    .setDescription([`**Active Member:** ${target.user}`, `**Discord ID:** \\`${target.id}\\``, '', 'Choose an action below. Reversal controls appear only when there is an active warning or timeout to clear.'].join('\\n'))
    .addFields(
      { name: 'Warnings', value: `**${stats?.warningCount ?? 0}**`, inline: true },
      { name: 'Timeout', value: `**${timeout}**`, inline: true },
      { name: 'Safety Checks', value: 'Authority, Discord hierarchy, target safety and confirmation requirements are rechecked when the action is submitted.', inline: false },
    );
}
"""
)
