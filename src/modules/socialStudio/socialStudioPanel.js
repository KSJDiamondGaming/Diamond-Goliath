'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');

function getConfig(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {});
  return {
    enabled: section.enabled === true,
    alertsChannelId: section.alertsChannelId || null,
    accounts: section.accounts && typeof section.accounts === 'object' ? section.accounts : {},
    creators: section.creators && typeof section.creators === 'object' ? section.creators : {},
    history: Array.isArray(section.history) ? section.history : [],
    queue: Array.isArray(section.queue) ? section.queue : [],
    analytics: section.analytics && typeof section.analytics === 'object' ? section.analytics : {},
  };
}

function button(customId, label, style = ButtonStyle.Primary, disabled = false) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}
function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function name(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function format(value) { return Number(value || 0).toLocaleString('en-GB'); }

function buildSocialAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = getConfig(guild.id);
  const accounts = Object.values(config.accounts);
  const creators = Object.values(config.creators);
  const enabledAccounts = accounts.filter((account) => account.enabled !== false).length;
  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57f287 : 0xed4245)
    .setTitle('📣 Social Alerts')
    .setDescription([
      'Manage creator accounts, live alerts and Social Studio monitoring from the web dashboard.',
      '',
      `**Module:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Default channel:** ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured'}`,
    ].join('\n'))
    .addFields(
      { name: 'Creators', value: `\`${format(creators.length)}\` profiles`, inline: true },
      { name: 'Accounts', value: `\`${format(enabledAccounts)}\` enabled / \`${format(accounts.length)}\` total`, inline: true },
      { name: 'Alerts sent', value: `\`${format(config.analytics.alertsSent)}\``, inline: true },
      { name: 'Queue', value: `\`${format(config.queue.length)}\` item(s)`, inline: true },
      { name: 'History', value: `\`${format(config.history.length)}\` event(s)`, inline: true },
      { name: 'Management', value: 'Use the Goliath dashboard for provider credentials, creator linking, templates, simulations, retry controls and health repair.', inline: false },
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button(config.enabled ? 'admin:social:disable' : 'admin:social:enable', config.enabled ? '⏸️ Disable' : '▶️ Enable', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:social:refresh', '🔄 Refresh'),
        button('admin:social:check', '🔎 Check Status', ButtonStyle.Primary, accounts.length === 0),
      ),
      row(button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary)),
    ],
  };
}

async function update(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function handleSocialAdminInteraction(interaction) {
  if (!interaction?.isButton?.()) return false;
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:social')) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');

  if (customId === 'admin:social:enable' || customId === 'admin:social:disable') {
    const enabled = customId.endsWith(':enable');
    const config = getConfig(interaction.guild.id);
    config.enabled = enabled;
    guildManager.saveGuildSection(interaction.guild.id, 'social', config, interaction.guild);
    guildManager.setModuleEnabled(interaction.guild.id, 'social', enabled, interaction.guild);
  }

  if (customId === 'admin:social:check') {
    await interaction.deferUpdate().catch(() => null);
    const config = getConfig(interaction.guild.id);
    config.analytics.checks = Number(config.analytics.checks || 0) + Object.values(config.accounts).filter((account) => account.enabled !== false).length;
    config.history.push({ id: `history_${Date.now()}`, createdAt: new Date().toISOString(), status: 'checked', creator: 'All creators', alertType: null, actorId: interaction.user?.id || null });
    config.history = config.history.slice(-1000);
    guildManager.saveGuildSection(interaction.guild.id, 'social', config, interaction.guild);
  }

  return update(interaction, buildSocialAdminPanel(interaction.guild, name(interaction)));
}

module.exports = {
  buildPanel: buildSocialAdminPanel,
  handleInteraction: handleSocialAdminInteraction,
  buildSocialAdminPanel,
  handleSocialAdminInteraction,
};
