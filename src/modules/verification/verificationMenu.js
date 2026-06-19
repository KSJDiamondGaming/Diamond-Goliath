function buildVerificationMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verification:toggle')
        .setLabel('Enable / Disable')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('verification:deploy')
        .setLabel('Deploy Panel')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('verification:configure')
        .setLabel('Configure')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verification:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('admin:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}