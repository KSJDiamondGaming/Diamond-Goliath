'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');

const welcomeStore = require('../../../modules/welcome/welcomeStore');
const welcomeManager = require('../../../modules/welcome/welcomeManager');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

async function buildWelcomeAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = welcomeStore.getWelcomeSection(guild.id);
  const health = await welcomeManager.buildHealthReport(guild);
  const analytics = config.analytics || {};

  const embed = new EmbedBuilder()
    .setColor(health.healthy ? 0x57f287 : 0xfaa61a)
    .setTitle('👋 Welcome · Setup')
    .setDescription([
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Welcome Channel:** ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}`,
      `**Welcome DM:** ${config.dmEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Ping New Member:** ${config.allowUserPing ? 'Yes ✅' : 'No ❌'}`,
      `**Ignore Bots:** ${config.ignoreBots ? 'Yes ✅' : 'No ❌'}`,
      `**Public Template:** \`${config.templateId}\``,
      `**DM Template:** \`${config.dmTemplateId}\``,
      '',
      `Public sent: \`${analytics.publicSent || 0}\` | DMs sent: \`${analytics.dmSent || 0}\` | Failed: \`${(analytics.publicFailed || 0) + (analytics.dmFailed || 0)}\``,
      '',
      health.warnings.length ? `**Warnings**\n${health.warnings.map((warning) => `• ${warning}`).join('\n')}` : '**Health:** Healthy ✅',
    ].join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:welcome:channel')
        .setPlaceholder('Select the public welcome channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(
        button(config.enabled ? 'admin:welcome:disable' : 'admin:welcome:enable', config.enabled ? '⏸️ Disable' : '▶️ Enable', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:welcome:toggleDm', config.dmEnabled ? '📨 Disable DM' : '📨 Enable DM'),
        button('admin:welcome:togglePing', config.allowUserPing ? '🔕 Disable Ping' : '🔔 Enable Ping'),
        button('admin:welcome:toggleBots', config.ignoreBots ? '🤖 Include Bots' : '🤖 Ignore Bots')
      ),
      row(
        button('admin:welcome:test', '🧪 Test Welcome', ButtonStyle.Success),
        button('admin:welcome:repair', '🩺 Repair', ButtonStyle.Primary),
        button('admin:welcome:export', '📤 Export'),
        button('admin:welcome:reset', '♻️ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅️ Modules')
      ),
    ],
  };
}

async function updatePanel(interaction) {
  const payload = await buildWelcomeAdminPanel(interaction.guild, interaction.member?.displayName || interaction.user?.username);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function handleWelcomeAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:welcome')) return false;

  try {
    if (customId === 'admin:welcome') return updatePanel(interaction);

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:welcome:channel') {
      const channelId = interaction.values?.[0] || null;
      welcomeStore.updateConfig(interaction.guild.id, { channelId }, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    const config = welcomeStore.getWelcomeSection(interaction.guild.id);
    if (customId === 'admin:welcome:enable') welcomeStore.updateConfig(interaction.guild.id, { enabled: true }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:disable') welcomeStore.updateConfig(interaction.guild.id, { enabled: false }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleDm') welcomeStore.updateConfig(interaction.guild.id, { dmEnabled: !config.dmEnabled }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:togglePing') welcomeStore.updateConfig(interaction.guild.id, { allowUserPing: !config.allowUserPing }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleBots') welcomeStore.updateConfig(interaction.guild.id, { ignoreBots: !config.ignoreBots }, { actorId: interaction.user.id });

    if (customId === 'admin:welcome:test') {
      await interaction.deferUpdate();
      await welcomeManager.sendWelcome(interaction.member, { silent: false });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:repair') {
      await interaction.deferUpdate();
      await welcomeManager.repairConfiguration(interaction.guild, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:reset') {
      await interaction.deferUpdate();
      welcomeManager.resetWelcome(interaction.guild.id, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:export') {
      const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(welcomeManager.exportConfiguration(interaction.guild.id), null, 2), 'utf8'),
        { name: `goliath-welcome-${interaction.guild.id}.json` }
      );
      await interaction.reply({ content: '📤 Welcome configuration export.', files: [attachment], ephemeral: true });
      return true;
    }

    return updatePanel(interaction);
  } catch (error) {
    const payload = { content: `❌ Welcome setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildWelcomeAdminPanel,
  handleWelcomeAdminInteraction,
};
