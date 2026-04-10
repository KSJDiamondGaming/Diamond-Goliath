// ONLY showing the CHANGED SECTION (buttons modal)
// Everything else stays the same

if (id.startsWith('embedpanel_edit_buttons:')) {
  const templateId = id.split(':')[1];
  const template = getTemplate(interaction.guildId, templateId);

  if (!template) {
    await interaction.reply({
      content: 'That template could not be found.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const serializeButton = (btn) => {
    if (!btn || !btn.label) return '';
    const style = normalizeButtonStyle(btn.style);
    const target = style === 'Link' ? (btn.url || '') : (btn.customId || '');
    const emoji = btn.emoji || '';
    const disabled = btn.disabled ? 'true' : 'false';
    return `${btn.label}|${style}|${target}|${emoji}|${disabled}`;
  };

  const buttons = Array.isArray(template.buttons) ? template.buttons : [];

  const modal = new ModalBuilder()
    .setCustomId(`embedpanel_modal_edit_buttons:${templateId}`)
    .setTitle(`Buttons for ${template.name}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('button1')
        .setLabel('Button 1')
        .setPlaceholder('label|style|url/customId|emoji|disabled')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(serializeButton(buttons[0]))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('button2')
        .setLabel('Button 2')
        .setPlaceholder('label|style|url/customId|emoji|disabled')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(serializeButton(buttons[1]))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('button3')
        .setLabel('Button 3')
        .setPlaceholder('label|style|url/customId|emoji|disabled')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(serializeButton(buttons[2]))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('button4')
        .setLabel('Button 4')
        .setPlaceholder('label|style|url/customId|emoji|disabled')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(serializeButton(buttons[3]))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('button5')
        .setLabel('Button 5')
        .setPlaceholder('label|style|url/customId|emoji|disabled')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(400)
        .setValue(serializeButton(buttons[4]))
    )
  );

  await interaction.showModal(modal);
  return true;
}