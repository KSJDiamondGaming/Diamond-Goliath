'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

const formsStore = require('./formsStore');

function isManager(member, section) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return (section.managerRoleIds || []).some((roleId) => member.roles?.cache?.has(roleId));
}

function buildFormEmbed(form) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📝 ${form.title}`)
    .setDescription(form.description || 'Click below to submit this form.')
    .setFooter({ text: `Form ID: ${form.formId}` })
    .setTimestamp();
}

function buildFormRows(form) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`forms:open:${form.formId}`)
        .setLabel(form.buttonLabel || 'Submit Form')
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function buildSubmissionEmbed(guild, form, submission, section) {
  const answers = Object.entries(submission.answers || {})
    .map(([key, value]) => `**${key}:**\n${String(value || '').slice(0, 900)}`)
    .join('\n\n') || '_No answers_';

  return new EmbedBuilder()
    .setColor(submission.status === 'approved' ? 0x57f287 : submission.status === 'denied' ? 0xed4245 : 0xfaa61a)
    .setTitle(`📝 Form Submission: ${form?.title || submission.formId}`)
    .setDescription(answers.slice(0, 3800))
    .addFields(
      { name: 'Author', value: section.anonymousSubmissions ? 'Anonymous' : `<@${submission.authorId}>`, inline: true },
      { name: 'Status', value: submission.status, inline: true }
    )
    .setFooter({ text: `Submission ID: ${submission.submissionId}` })
    .setTimestamp(new Date(submission.createdAt || Date.now()));
}

function buildSubmissionRows(submission, section) {
  if (section.requireReview === false || submission.status !== 'pending') return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`forms:review:${submission.submissionId}:approve`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`forms:review:${submission.submissionId}:deny`).setLabel('Deny').setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildModal(form) {
  const modal = new ModalBuilder()
    .setCustomId(`forms:modal:${form.formId}`)
    .setTitle((form.title || 'Submit Form').slice(0, 45));

  for (const question of (form.questions || []).slice(0, 5)) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(question.id)
          .setLabel(question.label.slice(0, 45))
          .setStyle(question.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
          .setRequired(question.required !== false)
          .setMaxLength(Math.min(1000, question.maxLength || 1000))
      )
    );
  }

  return modal;
}

async function deployDefaultForm(guild, actorId = null) {
  const section = formsStore.getSection(guild.id);
  if (section.enabled === false) throw new Error('Forms are disabled.');
  if (!section.submitChannelId) throw new Error('Choose a submit channel first.');
  const channel = guild.channels.cache.get(section.submitChannelId) || await guild.channels.fetch(section.submitChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Submit channel is not sendable.');

  let form = formsStore.saveForm(guild.id, {
    title: 'Server Form',
    description: 'Submit your response using the button below.',
    buttonLabel: 'Submit Form',
    channelId: channel.id,
    createdBy: actorId,
  }, guild);

  const message = await channel.send({ embeds: [buildFormEmbed(form)], components: buildFormRows(form) });
  form = formsStore.saveForm(guild.id, { ...form, messageId: message.id, channelId: channel.id }, guild);
  formsStore.incrementAnalytics(guild.id, { deployed: 1 }, guild);
  return form;
}

async function handleSubmitModal(interaction, formId) {
  const section = formsStore.getSection(interaction.guildId);
  if (section.enabled === false) throw new Error('Forms are disabled.');
  const form = formsStore.getForm(interaction.guildId, formId);
  if (!form || form.enabled === false) throw new Error('This form is not available.');

  const answers = {};
  for (const question of form.questions || []) {
    answers[question.label] = interaction.fields.getTextInputValue(question.id) || '';
  }

  let submission = formsStore.saveSubmission(interaction.guildId, {
    formId,
    authorId: interaction.user.id,
    answers,
  }, interaction.guild);

  const targetId = section.logChannelId || section.submitChannelId;
  const target = targetId ? interaction.guild.channels.cache.get(targetId) || await interaction.guild.channels.fetch(targetId).catch(() => null) : null;
  if (target?.send) {
    const message = await target.send({ embeds: [buildSubmissionEmbed(interaction.guild, form, submission, section)], components: buildSubmissionRows(submission, section) }).catch(() => null);
    if (message) submission = formsStore.saveSubmission(interaction.guildId, { ...submission, channelId: message.channelId, messageId: message.id }, interaction.guild);
  }

  formsStore.incrementAnalytics(interaction.guildId, { submitted: 1 }, interaction.guild);
  return submission;
}

async function refreshSubmissionMessage(guild, submissionId) {
  const section = formsStore.getSection(guild.id);
  const submission = formsStore.getSubmission(guild.id, submissionId);
  if (!submission?.channelId || !submission.messageId) return null;
  const form = formsStore.getForm(guild.id, submission.formId);
  const channel = guild.channels.cache.get(submission.channelId) || await guild.channels.fetch(submission.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(submission.messageId).catch(() => null);
  if (!message?.editable) return null;
  await message.edit({ embeds: [buildSubmissionEmbed(guild, form, submission, section)], components: buildSubmissionRows(submission, section) }).catch(() => null);
  return submission;
}

async function reviewSubmission(interaction, submissionId, action) {
  const section = formsStore.getSection(interaction.guildId);
  if (!isManager(interaction.member, section)) throw new Error('You do not have permission to review forms.');
  const status = action === 'approve' ? 'approved' : 'denied';
  const updated = formsStore.updateSubmission(interaction.guildId, submissionId, {
    status,
    reviewedBy: interaction.user.id,
    reviewedAt: new Date().toISOString(),
  }, interaction.guild);
  formsStore.incrementAnalytics(interaction.guildId, status === 'approved' ? { approved: 1 } : { denied: 1 }, interaction.guild);
  await refreshSubmissionMessage(interaction.guild, submissionId);
  return updated;
}

module.exports = {
  isManager,
  buildFormEmbed,
  buildFormRows,
  buildSubmissionEmbed,
  buildSubmissionRows,
  buildModal,
  deployDefaultForm,
  handleSubmitModal,
  reviewSubmission,
  refreshSubmissionMessage,
};
