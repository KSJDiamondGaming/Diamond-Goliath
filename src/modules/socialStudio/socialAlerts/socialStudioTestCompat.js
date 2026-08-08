'use strict';

const { EmbedBuilder } = require('discord.js');
const store = require('./socialStudioStore');

const TEST_ID = 'social:test';

async function handle(interaction) {
  if (String(interaction?.customId || '') !== TEST_ID) return false;

  const config = store.getConfig(interaction.guildId);
  if (!config.alertsChannelId) throw new Error('Choose an alert channel first.');

  const payload = {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🧪 Social Studio Test')
      .setDescription(
        `✅ Notification routing is working.\n\n` +
        `Default alert channel: <#${config.alertsChannelId}>\n\n` +
        'This is a private preview. Real provider events will apply the configured templates, platform metadata and variables.',
      )
      .setFooter({ text: 'Social Studio • Test' })
      .setTimestamp()],
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
  return true;
}

module.exports = { handle };
