'use strict';

// src/modules/forms/formManager.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const formStore = require('./formStore');

const CUSTOM_ID_PREFIX = 'form';
const MAX_MODAL_FIELDS = 5;

function buildFormOpenCustomId(formId) {
  return `${CUSTOM_ID_PREFIX}:open:${formStore.cleanKey(formId)}`;
}

function buildFormSubmitCustomId(formId) {
  return `${CUSTOM_ID_PREFIX}:submit:${formStore.cleanKey(formId)}`;
}

function parseFormCustomId(customId = '') {
  const [prefix, action, id] = String(customId || '').split(':');
  if (prefix !== CUSTOM_ID_PREFIX || !action) return null;

  return {
    action,
    id: id ? formStore.cleanKey(id) : null,
  };
}

function buildFormsOverviewEmbed(guildId) {
  const section = formStore.getFormsSection(guildId);
  const forms = Object.values(section.forms || {});
  const enabledForms = forms.filter((form) => form.enabled !== false);

  return new EmbedBuilder()
    .setColor(section.enabled === false ? 0xed4245 : 0x5865f2)
    .setTitle('📝 Universal Forms')
    .setDescription([
      '**One clean form engine for applications, appeals, reports and support.**',
      '',
      `> **Status:** ${section.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
      `> **Forms:** ${enabledForms.length}/${forms.length} active`,
      `> **Submissions:** ${section.analytics?.submitted || 0}`,
      `> **Tickets Created:** ${section.analytics?.ticketsCreated || 0}`,
      '',
      forms.length
        ? forms.slice(0, 10).map((form, index) => `**${index + 1}. ${form.name}** — ${form.enabled === false ? 'Disabled' : form.action}`).join('\n')
        : 'No forms created yet. Dashboard builder can wire into this store next.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Forms • Universal forms + tickets foundation' })
    .setTimestamp(new Date());
}

function buildFormPanelEmbed(panel = {}, forms = []) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(panel.title || 'Forms')
    .setDescription([
      panel.description || 'Choose a form below.',
      '',
      forms.length
        ? forms.map((form) => `• **${form.name}** — ${form.description || 'Submit for staff review.'}`).join('\n')
        : 'No forms are currently available.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Forms' })
    .setTimestamp(new Date());
}

function buildFormPanelRows(panel = {}, forms = []) {
  const buttons = forms
    .filter((form) => form.enabled !== false)
    .slice(0, 25)
    .map((form) => new ButtonBuilder()
      .setCustomId(buildFormOpenCustomId(form.formId))
      .setLabel(form.buttonLabel || form.name || 'Open Form')
      .setStyle(ButtonStyle.Primary));

  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }

  return rows;
}

function textInputStyleForField(field) {
  return field.type === formStore.FIELD_TYPES.PARAGRAPH
    ? TextInputStyle.Paragraph
    : TextInputStyle.Short;
}

function buildFormModal(form) {
  const modal = new ModalBuilder()
    .setCustomId(buildFormSubmitCustomId(form.formId))
    .setTitle(String(form.name || 'Submit Form').slice(0, 45));

  const fields = Array.isArray(form.fields) ? form.fields.slice(0, MAX_MODAL_FIELDS) : [];

  if (!fields.length) {
    fields.push({
      id: 'message',
      label: 'Message',
      type: formStore.FIELD_TYPES.PARAGRAPH,
      placeholder: 'Write your response here.',
      required: true,
      maxLength: 1000,
    });
  }

  modal.addComponents(fields.map((field) => new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(String(field.label || field.id).slice(0, 45))
      .setStyle(textInputStyleForField(field))
      .setPlaceholder(String(field.placeholder || '').slice(0, 100))
      .setRequired(field.required !== false)
      .setMaxLength(Math.min(Math.max(Number(field.maxLength || 400), 1), 4000))
  )));

  return modal;
}

async function deployFormPanel(channel, panel, guildOrMeta = {}) {
  if (!channel?.guild?.id || !channel?.send) {
    throw new Error('A sendable channel is required.');
  }

  const forms = panel.formIds
    .map((formId) => formStore.getForm(channel.guild.id, formId))
    .filter(Boolean);

  const savedPanel = formStore.savePanel(channel.guild.id, {
    ...panel,
    channelId: channel.id,
  }, guildOrMeta);

  const message = await channel.send({
    embeds: [buildFormPanelEmbed(savedPanel, forms)],
    components: buildFormPanelRows(savedPanel, forms),
  });

  return formStore.savePanel(channel.guild.id, {
    ...savedPanel,
    channelId: channel.id,
    messageId: message.id,
  }, guildOrMeta);
}

function collectModalAnswers(interaction, form) {
  const answers = {};
  const fields = Array.isArray(form.fields) && form.fields.length
    ? form.fields.slice(0, MAX_MODAL_FIELDS)
    : [{ id: 'message', label: 'Message' }];

  for (const field of fields) {
    answers[field.id] = interaction.fields?.getTextInputValue(field.id) || '';
  }

  return answers;
}

async function handleFormInteraction(interaction) {
  const parsed = parseFormCustomId(interaction.customId);
  if (!parsed || !interaction.guildId) return false;

  if (parsed.action === 'open') {
    const form = formStore.getForm(interaction.guildId, parsed.id);

    if (!form || form.enabled === false) {
      await interaction.reply({ content: '⚠️ This form is no longer available.', flags: 64 });
      return true;
    }

    await interaction.showModal(buildFormModal(form));
    return true;
  }

  if (parsed.action === 'submit') {
    const form = formStore.getForm(interaction.guildId, parsed.id);

    if (!form || form.enabled === false) {
      await interaction.reply({ content: '⚠️ This form is no longer available.', flags: 64 });
      return true;
    }

    const submission = formStore.saveSubmission(interaction.guildId, {
      formId: form.formId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      answers: collectModalAnswers(interaction, form),
      status: 'pending',
    }, interaction.guild);

    await interaction.reply({
      content: `✅ Your **${form.name}** submission was received. Reference: \`${submission.submissionId}\``,
      flags: 64,
    });

    return true;
  }

  return false;
}

module.exports = {
  CUSTOM_ID_PREFIX,
  buildFormOpenCustomId,
  buildFormSubmitCustomId,
  parseFormCustomId,
  buildFormsOverviewEmbed,
  buildFormPanelEmbed,
  buildFormPanelRows,
  buildFormModal,
  deployFormPanel,
  handleFormInteraction,
};
