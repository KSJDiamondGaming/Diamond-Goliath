const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');

const { getTemplate } = require('./embedPanelStore'); // adjust if needed
const { normalizeButtonStyle } = require('./embedUtils'); // adjust if needed

async function handleEmbedPanelInteraction(interaction) {
  const id = interaction.customId;

  if (!id.startsWith('embedpanel_edit_buttons:')) return false;

  const templateId = id.substring('embedpanel_edit_buttons:'.length);
  const template = getTemplate(interaction.guildId, templateId);

  if (!template) {
    await interaction.reply({
      content: 'That template could not be found.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const serializeButton = (btn) => {
    if (!btn || !btn.label) return null;

    const style = normalizeButtonStyle(btn.style);
    const target = style === 'Link' ? (btn.url || '') : (btn.customId || '');
    const emoji = btn.emoji || '';
    const disabled = btn.disabled ? 'true' : 'false';

    return `${btn.label}|${style}|${target}|${emoji}|${disabled}`;
  };

  const createButtonInput = (customId, label, buttonData) => {
    const input = new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setPlaceholder('label|style|url/customId|emoji|disabled')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(400);

    const value = serializeButton(buttonData);
    if (value) input.setValue(value);

    return new ActionRowBuilder().addComponents(input);
  };

  const buttons = Array.isArray(template.buttons) ? template.buttons : [];

  const modal = new ModalBuilder()
    .setCustomId(`embedpanel_modal_edit_buttons:${templateId}`)
    .setTitle(`Buttons for ${template.name}`.slice(0, 45));

  modal.addComponents(
    createButtonInput('button1', 'Button 1', buttons[0]),
    createButtonInput('button2', 'Button 2', buttons[1]),
    createButtonInput('button3', 'Button 3', buttons[2]),
    createButtonInput('button4', 'Button 4', buttons[3]),
    createButtonInput('button5', 'Button 5', buttons[4])
  );

  await interaction.showModal(modal);
  return true;
}

module.exports = {
  handleEmbedPanelInteraction
};