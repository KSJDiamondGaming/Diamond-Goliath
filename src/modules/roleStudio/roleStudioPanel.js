'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const guildManager = require('../../core/guild/guildManager');
const autoroles = require('./autoRoles/autoRoles');
const timedRoles = require('./timedRoles/timedRoles');
const reactionRoles = require('./reactionRoles/reactionRoles');
const temporaryRoles = require('./temporaryRoles/temporaryRoles');

const row = (...components) => new ActionRowBuilder().addComponents(...components.filter(Boolean));
const button = (customId, label, style = ButtonStyle.Primary, disabled = false) => new ButtonBuilder()
  .setCustomId(customId)
  .setLabel(label)
  .setStyle(style)
  .setDisabled(Boolean(disabled));

const statusLabel = (enabled) => enabled ? 'Enabled' : 'Disabled';
const statusIcon = (enabled) => enabled ? '🟢' : '⏸️';

async function buildRoleStudioPanel(guild, memberDisplayName = 'Unknown User') {
  const auto = autoroles.getAutoRolesSection(guild.id);
  const autoEnabled = guildManager.isModuleEnabled(guild.id, 'autoRoles');
  const reactionEnabled = guildManager.isModuleEnabled(guild.id, reactionRoles.SECTION);
  const timedEnabled = guildManager.isModuleEnabled(guild.id, 'timedRoles');
  const temporaryEnabled = guildManager.isModuleEnabled(guild.id, 'temporaryRoles');

  const reactionDeployments = reactionRoles.listPanels(guild.id);
  const timedRules = timedRoles.listRules(guild.id);
  const tempAssignments = temporaryRoles.listAssignments(guild.id, { activeOnly: true });
  const autoRoleCount = (auto.joinRoles || []).length + (auto.botRoles || []).length;
  const canManageRoles = Boolean(guild.members.me?.permissions.has('ManageRoles'));

  const embed = new EmbedBuilder()
    .setColor(canManageRoles ? 0x5865F2 : 0xED4245)
    .setTitle('🎭 Role Studio')
    .setDescription([
      'Choose the role system you want to configure.',
      '',
      `**👥 Auto Roles** — ${statusIcon(autoEnabled)} ${statusLabel(autoEnabled)}`,
      `Roles assigned automatically when members or bots join. \`${autoRoleCount}\` configured.`,
      '',
      `**😊 Reaction Roles** — ${statusIcon(reactionEnabled)} ${statusLabel(reactionEnabled)}`,
      `Members choose roles by reacting to messages. \`${reactionDeployments.length}\` panel${reactionDeployments.length === 1 ? '' : 's'}.`,
      '',
      `**⏳ Timed Roles** — ${statusIcon(timedEnabled)} ${statusLabel(timedEnabled)}`,
      `Roles awarded after server-tenure milestones. \`${timedRules.length}\` milestone${timedRules.length === 1 ? '' : 's'}.`,
      '',
      `**⚡ Temporary Roles** — ${statusIcon(temporaryEnabled)} ${statusLabel(temporaryEnabled)}`,
      `Roles removed automatically after a set duration. \`${tempAssignments.length}\` active.`,
      '',
      canManageRoles
        ? '> Select a module below to open its controls.'
        : '❌ **Goliath is missing Manage Roles.** Role assignments will fail until this permission is restored.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:autoRoles', '👥 Auto Roles', ButtonStyle.Primary),
        button('admin:reactionRoles:open', '😊 Reaction Roles', ButtonStyle.Primary),
      ),
      row(
        button('admin:timedRoles', '⏳ Timed Roles', ButtonStyle.Primary),
        button('admin:temporaryRoles', '⚡ Temporary Roles', ButtonStyle.Primary),
      ),
      row(
        button('admin:studio:roleStudio', '🔄 Refresh Status', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary),
      ),
    ],
  };
}

async function buildRoleAnalyticsPanel(guild, memberDisplayName = 'Unknown User') {
  const auto = autoroles.getAutoRolesSection(guild.id);
  const reaction = reactionRoles.getSection(guild.id);
  const timed = timedRoles.getSection(guild.id);
  const temporary = temporaryRoles.getSection(guild.id);

  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Role Studio Analytics')
      .setDescription([
        '**Assignment activity**',
        `Auto Roles assigned: \`${auto.analytics?.assigned || 0}\``,
        `Reaction Roles added: \`${reaction.analytics?.assigned || 0}\``,
        `Reaction Roles removed: \`${reaction.analytics?.removed || 0}\``,
        `Timed Roles awarded: \`${timed.analytics?.awarded || 0}\``,
        `Temporary Roles assigned: \`${temporary.analytics?.assigned || 0}\``,
        `Temporary Roles expired: \`${temporary.analytics?.expired || 0}\``,
        `Temporary Roles removed early: \`${temporary.analytics?.removed || 0}\``,
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio', ButtonStyle.Secondary))],
  };
}

async function buildRoleHealthPanel(guild, memberDisplayName = 'Unknown User') {
  const [autoHealth, reactionHealth, timedHealth] = await Promise.all([
    autoroles.buildHealthReport(guild),
    reactionRoles.buildHealth(guild),
    timedRoles.buildHealth(guild),
  ]);
  const activeTemporary = temporaryRoles.listAssignments(guild.id, { activeOnly: true });
  const missingTemporaryRoles = activeTemporary.filter((item) => !guild.roles.cache.has(item.roleId)).length;
  const healthy = autoHealth.healthy && reactionHealth.healthy && timedHealth.healthy && missingTemporaryRoles === 0;

  return {
    embeds: [new EmbedBuilder()
      .setColor(healthy ? 0x57F287 : 0xFAA61A)
      .setTitle('🩺 Role Studio Health')
      .setDescription([
        `**Overall status:** ${healthy ? '✅ Healthy' : '⚠️ Needs attention'}`,
        '',
        `**Auto Roles:** ${autoHealth.healthy ? '✅ Healthy' : '⚠️ Needs attention'}`,
        `**Reaction Roles:** ${reactionHealth.healthy ? '✅ Healthy' : `⚠️ ${reactionHealth.unhealthy || 0} panel(s) need attention`}`,
        `**Timed Roles:** ${timedHealth.healthy ? '✅ Healthy' : `⚠️ ${timedHealth.issues?.length || 0} issue(s)`}`,
        `**Temporary Roles:** ${missingTemporaryRoles ? `⚠️ ${missingTemporaryRoles} missing role reference(s)` : '✅ Healthy'}`,
        '',
        `**Goliath highest role:** ${guild.members.me?.roles.highest ? `<@&${guild.members.me.roles.highest.id}>` : 'Unavailable'}`,
        `**Manage Roles permission:** ${guild.members.me?.permissions.has('ManageRoles') ? '✅ Granted' : '❌ Missing'}`,
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio', ButtonStyle.Secondary))],
  };
}

module.exports = {
  buildRoleStudioPanel,
  buildRoleAnalyticsPanel,
  buildRoleHealthPanel,
};
