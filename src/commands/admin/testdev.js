const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const testDevOverride = require('../../core/dev/testDevOverrideManager');

function modeLabel() {
  return String(process.env.BOT_MODE || 'DEV').toUpperCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testdev')
    .setDescription('Owner-only DEV toggle for Goliath test override mode.'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      return interaction.editReply({ content: '❌ This command can only be used inside a server.' });
    }

    if (!testDevOverride.isDevMode()) {
      return interaction.editReply({
        content: [
          '❌ **Test Dev Override is disabled.**',
          '',
          `Current mode: \`${modeLabel()}\``,
          'This command only works in `DEV` and cannot enable anything in BETA or PRODUCTION.',
        ].join('\n'),
      });
    }

    if (!testDevOverride.isOwnerId(interaction.user.id)) {
      return interaction.editReply({
        content: [
          '❌ Owner only. You cannot toggle DEV test override mode.',
          '',
          `Your ID: \`${interaction.user.id}\``,
          `OWNER_IDS loaded: \`${testDevOverride.getOwnerIds().join(', ') || 'none'}\``,
        ].join('\n'),
      });
    }

    const state = testDevOverride.toggle(interaction.user.id);

    if (state.blocked) {
      return interaction.editReply({ content: `❌ ${state.reason || 'Toggle blocked.'}` });
    }

    return interaction.editReply({
      content: [
        state.enabled ? '🟢 **Development Test Mode: ENABLED**' : '🔴 **Development Test Mode: DISABLED**',
        '',
        `Mode: \`${modeLabel()}\``,
        `Updated by: \`${interaction.user.id}\``,
        '',
        state.enabled
          ? 'Goliath guard checks can now be bypassed for DEV owner testing.'
          : 'Goliath guard checks are now operating normally.',
        '',
        'Discord API permissions are still enforced by Discord.',
      ].join('\n'),
    });
  },
};
