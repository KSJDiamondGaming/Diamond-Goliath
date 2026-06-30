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
const formTicketBridge = require('./formTicketBridge');
const { isModuleEnabled } = require('../../core/guild/guildManager');
const {
  DEFAULT_BOT_CHANNEL_PERMISSIONS,
  guardChannelAccess,
} = require('../../core/security/goliathPermissionGuard');

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
    .setTitle('Universal Forms')
    .setDescription([
      '**One clean form engine for applications, appeals, reports and support.**',
      '',
      `> **Status:** ${section.enabled === false ? 'Disabled' : 'Enabled'}`,
      `> **Forms:** ${enabledForms.length}/${forms.length} active`,
      `> **Submissions:** ${section.analytics?.submitted || 0}`,
      `> **Tickets Created:** ${section.analytics?.ticketsCreated || 0}`,
      '',
      forms.length
        ? forms.slice(0, 10).map((form, index) => `**${index + 1}. ${form.name}** - ${form.enabled === false ? 'Disabled' : form.action}`).join('\n')
        : 'No forms created yet. Dashboard builder can wire into this store next.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Forms - Universal forms + tickets foundation' })
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
        ? forms.map((form) => `- **${form.name}** - ${form.description || 'Submit for staff review.'}`).join('\n')
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
      .setPlaceholder(String(field.placeholder || field.options?.join(', ') || '').slice(0, 100))
      .setRequired(field.required !== false)
      .setMaxLength(Math.min(Math.max(Number(field.maxLength || 400), 1), 4000))
  )));

  return modal;
}

async function deployFormPanel(channel, panel, guildOrMeta = {}) {
  if (!channel?.guild?.id || !channel?.send) {
    throw new Error('A sendable channel is required.');
  }

  if (!isModuleEnabled(channel.guild.id, 'forms')) {
    throw new Error('Forms module is disabled for this server.');
  }

  await guardChannelAccess(
    channel.guild,
    channel.id,
    DEFAULT_BOT_CHANNEL_PERMISSIONS,
    {
      scope: 'forms.panel_deployment',
      autoFix: true,
      throwOnFail: true,
      reason: 'Goliath forms panel deployment validation',
    }
  );

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

function getModalFields(form) {
  const fields = Array.isArray(form.fields) && form.fields.length
    ? form.fields.slice(0, MAX_MODAL_FIELDS)
    : [{ id: 'message', label: 'Message', type: formStore.FIELD_TYPES.PARAGRAPH, required: true, maxLength: 1000 }];

  return fields;
}

function normalizeAnswerValue(field, value) {
  const raw = String(value ?? '').trim();

  if (field.type === formStore.FIELD_TYPES.NUMBER) {
    return raw.replace(/,/g, '').trim();
  }

  if (field.type === formStore.FIELD_TYPES.BOOLEAN) {
    const clean = raw.toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(clean)) return 'Yes';
    if (['no', 'n', 'false', '0'].includes(clean)) return 'No';
  }

  if (field.type === formStore.FIELD_TYPES.USER_MENTION || field.type === formStore.FIELD_TYPES.ROLE_MENTION) {
    return raw.replace(/[<>]/g, '').trim();
  }

  return raw;
}

function validateAnswer(field, value) {
  const label = field.label || field.id || 'Question';
  const answer = normalizeAnswerValue(field, value);
  const errors = [];
  const minLength = Math.max(0, Number(field.minLength || 0));
  const maxLength = Math.min(Math.max(Number(field.maxLength || 400), 1), 4000);

  if (field.required !== false && !answer) {
    errors.push(`${label} is required.`);
    return { answer, errors };
  }

  if (!answer) return { answer, errors };

  if (answer.length < minLength) {
    errors.push(`${label} must be at least ${minLength} characters.`);
  }

  if (answer.length > maxLength) {
    errors.push(`${label} must be ${maxLength} characters or fewer.`);
  }

  if (field.type === formStore.FIELD_TYPES.NUMBER && !/^-?\d+(\.\d+)?$/.test(answer)) {
    errors.push(`${label} must be a valid number.`);
  }

  if (field.type === formStore.FIELD_TYPES.BOOLEAN && !['Yes', 'No'].includes(answer)) {
    errors.push(`${label} must be yes or no.`);
  }

  if ((field.type === formStore.FIELD_TYPES.SELECT || field.type === formStore.FIELD_TYPES.CHECKBOX) && Array.isArray(field.options) && field.options.length) {
    const allowed = field.options.map((option) => String(option).trim().toLowerCase());
    const selected = answer.split(',').map((option) => option.trim().toLowerCase()).filter(Boolean);
    const invalid = selected.filter((option) => !allowed.includes(option));

    if (invalid.length) {
      errors.push(`${label} must match one of: ${field.options.join(', ')}.`);
    }
  }

  if (field.type === formStore.FIELD_TYPES.USER_MENTION && !/^@?!?\d{15,25}$|^\d{15,25}$/.test(answer)) {
    errors.push(`${label} must be a valid user mention or user ID.`);
  }

  if (field.type === formStore.FIELD_TYPES.ROLE_MENTION && !/^@?&?\d{15,25}$|^\d{15,25}$/.test(answer)) {
    errors.push(`${label} must be a valid role mention or role ID.`);
  }

  return { answer, errors };
}

function collectModalAnswers(interaction, form) {
  const answers = {};
  const errors = [];

  for (const field of getModalFields(form)) {
    const rawValue = interaction.fields?.getTextInputValue(field.id) || '';
    const result = validateAnswer(field, rawValue);
    answers[field.id] = result.answer;
    errors.push(...result.errors);
  }

  return { answers, errors };
}

function buildValidationErrorReply(errors = []) {
  return [
    'Your form could not be submitted yet.',
    '',
    errors.slice(0, 8).map((error) => `• ${error}`).join('\n'),
    errors.length > 8 ? `• ${errors.length - 8} more issue(s).` : null,
  ].filter(Boolean).join('\n').slice(0, 1900);
}

function buildSubmissionReply(form, submission, bridgeResult) {
  if (bridgeResult?.ok && bridgeResult.ticket) {
    return [
      `Your **${form.name}** submission was received.`,
      `Reference: ${submission.submissionId}`,
      `Ticket: ${bridgeResult.ticket.displayId || bridgeResult.ticket.ticketId}`,
      bridgeResult.channel ? `Channel: <#${bridgeResult.channel.id}>` : 'Staff ticket record created. Channel creation is pending/recoverable.',
    ].join('\n');
  }

  if (bridgeResult?.skipped) {
    return `Your **${form.name}** submission was received. Reference: ${submission.submissionId}`;
  }

  return [
    `Your **${form.name}** submission was received.`,
    `Reference: ${submission.submissionId}`,
    'Staff ticket creation failed, but the submission was saved for recovery.',
  ].join('\n');
}

async function handleFormInteraction(interaction) {
  const parsed = parseFormCustomId(interaction.customId);
  if (!parsed || !interaction.guildId) return false;

  if (!isModuleEnabled(interaction.guildId, 'forms')) {
    await interaction.reply({
      content: 'Forms are currently disabled on this server.',
      flags: 64,
    });

    return true;
  }

  if (parsed.action === 'open') {
    const form = formStore.getForm(interaction.guildId, parsed.id);

    if (!form || form.enabled === false) {
      await interaction.reply({ content: 'This form is no longer available.', flags: 64 });
      return true;
    }

    await interaction.showModal(buildFormModal(form));
    return true;
  }

  if (parsed.action === 'submit') {
    const form = formStore.getForm(interaction.guildId, parsed.id);

    if (!form || form.enabled === false) {
      await interaction.reply({ content: 'This form is no longer available.', flags: 64 });
      return true;
    }

    const { answers, errors } = collectModalAnswers(interaction, form);

    if (errors.length) {
      await interaction.reply({
        content: buildValidationErrorReply(errors),
        flags: 64,
      });
      return true;
    }

    const submission = formStore.saveSubmission(interaction.guildId, {
      formId: form.formId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      answers,
      status: 'pending',
      workflow: {
        source: 'discord_modal',
        submittedAt: new Date().toISOString(),
        modalFieldCount: Object.keys(answers).length,
      },
    }, interaction.guild);

    const bridgeResult = await formTicketBridge.createTicketForSubmission({
      interaction,
      form,
      submission,
    });

    await interaction.reply({
      content: buildSubmissionReply(form, submission, bridgeResult),
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
  collectModalAnswers,
  validateAnswer,
  handleFormInteraction,
};
