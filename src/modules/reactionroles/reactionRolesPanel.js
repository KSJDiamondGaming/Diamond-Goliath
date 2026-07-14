' strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const reactionRoles = require('./reactionRoles');

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (customId, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealth(guild);
  const panels = reactionRoles.listPanels(guild.id);
  const mappings = panels.reduce((total, panel) => total + panel.mappings.length, 0);
  const unhealthy = health.panels.filter((panel) => !panel.healthy).length;

  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
    .setTitle('😊 Reaction Roles · Setup')
    .setDescription([
      `**Status:** ${config.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Tracked Messages:** \`${panels.length}\``,
      `**Emoji → Role Mappings:** \`${mappings}\``,
      `**Health:** ${health.healthy ? 'Healthy ✅' : `${unhealthy} message(s) need attention ⚠️`}`,
      `**Assigned:** \`${config.analytics.assigned || 0}\` | **Removed:** \`${config.analytics.removed || 0}\` | **Failed:** \`${config.analytics.failed || 0}\``,
      '',
      'Use the Goliath dashboard to attach Reaction Roles to any existing message or embed by pasting its Discord message link or entering its channel and message ID.',
      '',
      panels.length
        ? panels.slice(0, 8).map((panel) => `• **${panel.name}** — <#${panel.channelId}> · \`${panel.messageId}\` · ${panel.mappings.length} mapping(s)`).join('\n')
        : '`No messages attached yet.`',
    ].join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? '⏸️ Disable' : '▶️ Enable', config.enabled !== false ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:reactionRoles:repair', '🩺 Repair', ButtonStyle.Primary),
        button('admin:reactionRoles:export', '📤 Export'),
        button('admin:reactionRoles:reset', '♻️ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅️ Modules')
      ),
    ],
  };
}

async function updatePanel(interaction) {
  const payload = await buildReactionRolesAdminPanel(interaction.guild, interaction.member?.displayName || interaction.user?.username);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function handleReactionRolesAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:reactionRoles')) return false;
  try {
    if (customId === 'admin:reactionRoles') return updatePanel(interaction);
    if (customId === 'admin:reactionRoles:enable') reactionRoles.setEnabled(interaction.guild.id, true, interaction.guild);
    if (customId === 'admin:reactionRoles:disable') reactionRoles.setEnabled(interaction.guild.id, false, interaction.guild);
    if (customId === 'admin:reactionRoles:repair') {
      await interaction.deferUpdate();
      await reactionRoles.repairAll(interaction.guild);
      return updatePanel(interaction);
    }
    if (customId === 'admin:reactionRoles:reset') {
      await interaction.deferUpdate();
      reactionRoles.reset(interaction.guild.id, interaction.guild);
      return updatePanel(interaction);
    }
    if (customId === 'admin:reactionRoles:export') {
      const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(reactionRoles.exportConfiguration(interaction.guild.id), null, 2), 'utf8'), { name: `goliath-reaction-roles-${interaction.guild.id}.json` });
      await interaction.reply({ content: '📤 Reaction Roles configuration export.', files: [attachment], ephemeral: true });
      return true;
    }
    return updatePanel(interaction);
  } catch (error) {
    const payload = { content: `❌ Reaction Roles setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
