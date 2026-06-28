const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

// =========================
// 🧾 Generic Case ID Modal
// =========================
function buildCaseIdModal(customId, title, label = 'Case ID') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('case_id')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
}

// =========================
// ⚠️ Warn / Timeout / Kick / Ban Modal
// =========================
function buildReasonModal(
  customId,
  title,
  includeDays = false,
  includeDuration = false,
  includeWarnExpiry = false
) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title);

  const rows = [];

  if (includeDays) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Delete message days (0-7)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(1)
      )
    );
  }

  if (includeDuration) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Duration (10m, 1h, 1d)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1h')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
  }

  if (includeWarnExpiry) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('warn_expiry')
          .setLabel('Warn expiry (7d, 2w, 1m, or never)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('never')
          .setRequired(false)
          .setMaxLength(10)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the moderation reason')
        .setRequired(true)
        .setMaxLength(500)
    )
  );

  modal.addComponents(...rows);
  return modal;
}

// =========================
// 📦 Bulk Action Modal
// =========================
function buildBulkModal(type) {
  const titleMap = {
    warn: 'Bulk Warn',
    timeout: 'Bulk Timeout',
    kick: 'Bulk Kick',
    ban: 'Bulk Ban'
  };

  const modal = new ModalBuilder()
    .setCustomId(`mod_submit_bulk_${type}`)
    .setTitle(titleMap[type] || 'Bulk Moderation');

  const rows = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('users')
        .setLabel('User IDs (comma separated)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('123456789012345678, 987654321098765432')
        .setRequired(true)
    )
  ];

  if (type === 'timeout') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Duration (10m, 1h, 1d)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1h')
          .setRequired(true)
      )
    );
  }

  if (type === 'ban') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Delete message days (0-7)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(1)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the moderation reason')
        .setRequired(true)
        .setMaxLength(500)
    )
  );

  modal.addComponents(...rows);
  return modal;
}

// =========================
// ✏️ Edit Case Modal
// =========================
function buildEditCaseModal(customId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Edit Case')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('case_id')
          .setLabel('Case ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('New Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter the updated moderation reason')
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

// =========================
// 📝 Case Note Modal
// =========================
function buildCaseNoteModal(customId, existingNote = '') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existingNote ? 'Edit Case Note' : 'Add Case Note')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Staff Note')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Add internal staff-only context for this case')
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(String(existingNote || '').slice(0, 1000))
      )
    );
}

module.exports = {
  buildCaseIdModal,
  buildReasonModal,
  buildBulkModal,
  buildEditCaseModal,
  buildCaseNoteModal
};
