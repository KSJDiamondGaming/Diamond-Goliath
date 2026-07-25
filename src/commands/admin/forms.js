'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const formManager = require('../../modules/feedbackStudio/forms/formManager');
const formStore = require('../../modules/feedbackStudio/forms/formStore');
const { enforceCommandAccess } = require('../../core/ui/commandAccess');

async function safeReply(interaction, payload) {
  const finalPayload = {
    ...payload,
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(finalPayload);
  }

  return interaction.reply(finalPayload);
}

module.exports = {
  category: 'Admin',

  help: {
    name: 'forms',
    description: '📝 Manage Goliath universal forms foundation.',
    usage: '/forms overview | /forms create-defaults',
  },

  access: {
    level: 'admin',
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('forms')
    .setDescription('📝 Manage Goliath universal forms')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('overview')
        .setDescription('Show the current forms overview')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create-defaults')
        .setDescription('Create starter Support, Appeal and Application forms')
    ),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    const action = interaction.options.getSubcommand(false) || 'overview';

    if (action === 'create-defaults') {
      const defaults = [
        {
          formId: 'support',
          name: 'Support Request',
          description: 'Ask staff for help through a clean support form.',
          buttonLabel: 'Open Support Form',
          action: formStore.FORM_ACTIONS.CREATE_TICKET,
          ticketType: 'support',
          fields: [
            { id: 'summary', label: 'What do you need help with?', type: formStore.FIELD_TYPES.SHORT, required: true, maxLength: 100 },
            { id: 'details', label: 'Describe the issue', type: formStore.FIELD_TYPES.PARAGRAPH, required: true, maxLength: 1000 },
          ],
        },
        {
          formId: 'appeal',
          name: 'Punishment Appeal',
          description: 'Appeal a timeout, kick, ban or moderation decision.',
          buttonLabel: 'Open Appeal Form',
          action: formStore.FORM_ACTIONS.CREATE_TICKET,
          ticketType: 'appeal',
          fields: [
            { id: 'punishment', label: 'What are you appealing?', type: formStore.FIELD_TYPES.SHORT, required: true, maxLength: 100 },
            { id: 'reason', label: 'Why should staff review it?', type: formStore.FIELD_TYPES.PARAGRAPH, required: true, maxLength: 1000 },
          ],
        },
        {
          formId: 'application',
          name: 'Application Form',
          description: 'Apply for staff, creator, event or community roles.',
          buttonLabel: 'Open Application',
          action: formStore.FORM_ACTIONS.CREATE_TICKET,
          ticketType: 'application',
          fields: [
            { id: 'role', label: 'What are you applying for?', type: formStore.FIELD_TYPES.SHORT, required: true, maxLength: 100 },
            { id: 'about', label: 'Tell us about yourself', type: formStore.FIELD_TYPES.PARAGRAPH, required: true, maxLength: 1000 },
          ],
        },
      ];

      for (const form of defaults) {
        formStore.saveForm(interaction.guildId, {
          ...form,
          createdBy: interaction.user.id,
          updatedBy: interaction.user.id,
        }, interaction.guild);
      }

      await safeReply(interaction, {
        content: '✅ Starter forms created: Support, Appeal and Application.',
        embeds: [formManager.buildFormsOverviewEmbed(interaction.guildId)],
      });
      return;
    }

    await safeReply(interaction, {
      embeds: [formManager.buildFormsOverviewEmbed(interaction.guildId)],
    });
  },
};
