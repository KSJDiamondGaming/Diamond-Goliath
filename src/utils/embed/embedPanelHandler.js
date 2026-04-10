const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const {
  defaultTemplate,
  getEmbedTemplate,
  saveEmbedTemplate,
  deleteEmbedTemplate,
  clearAllGuildTemplates
} = require('./embedStore');

const EMBED_TYPES = [
  { label: 'Welcome', value: 'welcome', emoji: '👋' },
  { label: 'Rules', value: 'rules', emoji: '📜' },
  { label: 'Announcement', value: 'announcement', emoji: '📢' },
  { label: 'Giveaway', value: 'giveaway', emoji: '🎉' },
  { label: 'Ticket Panel', value: 'ticket', emoji: '🎫' },
  { label: 'Verification', value: 'verification', emoji: '✅' },
  { label: 'Info', value: 'info', emoji: 'ℹ️' },
  { label: 'Custom', value: 'custom', emoji: '🛠️' }
];

const BUTTON_STYLE_LABELS = ['Primary', 'Secondary', 'Success', 'Danger', 'Link'];

function labelFromType(type) {
  return EMBED_TYPES.find(x => x.value === type)?.label || 'Unknown';
}

function normalizeColor(color) {
  if (!color) return '#5865F2';

  let value = color.trim();
  if (!value.startsWith('#')) value = `#${value}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return '#5865F2';

  return value;
}

function shorten(text, max = 120) {
  if (!text) return 'Not set';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function toButtonStyle(style) {
  switch ((style || '').toLowerCase()) {
    case 'primary':
      return ButtonStyle.Primary;
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'success':
      return ButtonStyle.Success;
    case 'danger':
      return ButtonStyle.Danger;
    case 'link':
    default:
      return ButtonStyle.Link;
  }
}

function normalizeButtonStyle(style) {
  const normalized = (style || '').trim().toLowerCase();

  if (normalized === 'primary') return 'Primary';
  if (normalized === 'secondary') return 'Secondary';
  if (normalized === 'success') return 'Success';
  if (normalized === 'danger') return 'Danger';
  return 'Link';
}

function safeValue(value) {
  return value && value.trim().length ? value.trim() : '';
}

function createTemplate(template = {}) {
  return {
    ...defaultTemplate(),
    ...template,
    buttons: Array.isArray(template.buttons) ? template.buttons.slice(0, 5) : []
  };
}

function buildDiscordEmbed(template, fallbackTitle = 'Embed Preview') {
  const data = createTemplate(template);

  const embed = new EmbedBuilder()
    .setColor(normalizeColor(data.color))
    .setTitle(data.title || fallbackTitle)
    .setDescription(data.description || 'No description set.');

  if (data.footer) {
    embed.setFooter({ text: data.footer });
  }

  if (data.image) {
    embed.setImage(data.image);
  }

  if (data.thumbnail) {
    embed.setThumbnail(data.thumbnail);
  }

  if (data.authorName) {
    embed.setAuthor({
      name: data.authorName,
      iconURL: data.authorIcon || undefined,
      url: data.authorUrl || undefined
    });
  }

  return embed;
}

function buildActionRowsFromTemplate(template) {
  const data = createTemplate(template);

  if (!data.buttons.length) {
    return [];
  }

  const row = new ActionRowBuilder();

  for (const btn of data.buttons.slice(0, 5)) {
    const styleLabel = normalizeButtonStyle(btn.style);
    const style = toButtonStyle(styleLabel);

    const builder = new ButtonBuilder()
      .setLabel(btn.label || 'Button')
      .setStyle(style)
      .setDisabled(Boolean(btn.disabled));

    if (btn.emoji) {
      builder.setEmoji(btn.emoji);
    }

    if (style === ButtonStyle.Link) {
      builder.setURL(btn.url && /^https?:\/\//i.test(btn.url) ? btn.url : 'https://example.com');
    } else {
      builder.setCustomId(btn.customId || `embedpanel_button_${Date.now()}_${Math.floor(Math.random() * 9999)}`);
    }

    row.addComponents(builder);
  }

  return [row];
}

function summarizeButtons(buttons = []) {
  if (!buttons.length) return 'None';

  return buttons
    .slice(0, 5)
    .map((btn, index) => {
      const style = normalizeButtonStyle(btn.style);
      const destination = style === 'Link'
        ? (btn.url ? shorten(btn.url, 35) : 'Missing URL')
        : (btn.customId ? shorten(btn.customId, 35) : 'Missing custom ID');

      return `**${index + 1}.** ${btn.label || 'Untitled'} • ${style} • ${destination}${btn.disabled ? ' • Disabled' : ''}`;
    })
    .join('\n');
}

function buildEmbedPanelMessage(guildId, options = {}) {
  const selectedType = options.selectedType || 'welcome';
  const data = createTemplate(getEmbedTemplate(guildId, selectedType) || {});

  const panelEmbed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📝 Diamond Goliath Advanced Embed Panel')
    .setDescription('Manage one embed template at a time with advanced fields and action buttons.')
    .addFields(
      {
        name: 'Category',
        value: labelFromType(selectedType),
        inline: true
      },
      {
        name: 'Saved Template',
        value: data.title || data.description || data.channelId || data.buttons.length ? 'Yes' : 'No',
        inline: true
      },
      {
        name: 'Target Channel',
        value: data.channelId ? `<#${data.channelId}>` : 'Not selected',
        inline: true
      },
      {
        name: 'Title',
        value: shorten(data.title || 'Not set', 100),
        inline: false
      },
      {
        name: 'Description',
        value: shorten(data.description || 'Not set', 220),
        inline: false
      },
      {
        name: 'Display',
        value:
          `Color: \`${data.color || '#5865F2'}\`\n` +
          `Footer: ${data.footer ? shorten(data.footer, 55) : 'Not set'}\n` +
          `Image: ${data.image ? 'Set' : 'Not set'}\n` +
          `Thumbnail: ${data.thumbnail ? 'Set' : 'Not set'}`,
        inline: true
      },
      {
        name: 'Author / Content',
        value:
          `Author: ${data.authorName ? shorten(data.authorName, 35) : 'Not set'}\n` +
          `Message Content: ${data.content ? shorten(data.content, 50) : 'None'}`,
        inline: true
      },
      {
        name: 'Buttons',
        value: summarizeButtons(data.buttons),
        inline: false
      }
    );

  const typeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`embedpanel_type_select:${selectedType}`)
      .setPlaceholder('Select an embed type')
      .addOptions(
        EMBED_TYPES.map(type => ({
          label: type.label,
          value: type.value,
          emoji: type.emoji,
          default: type.value === selectedType
        }))
      )
  );

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`embedpanel_channel_select:${selectedType}`)
      .setPlaceholder('Select a target channel')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const actionRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_main:${selectedType}`)
      .setLabel('Edit Embed')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_buttons:${selectedType}`)
      .setLabel('Edit Buttons')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`embedpanel_preview:${selectedType}`)
      .setLabel('Preview')
      .setStyle(ButtonStyle.Secondary)
  );

  const actionRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embedpanel_send:${selectedType}`)
      .setLabel('Send Embed')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!data.channelId),

    new ButtonBuilder()
      .setCustomId(`embedpanel_delete:${selectedType}`)
      .setLabel('Remove Selected')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('embedpanel_clear_all')
      .setLabel('Remove All')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('embedpanel_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed: panelEmbed,
    components: [typeRow, channelRow, actionRow1, actionRow2]
  };
}

function buildMainEditModal(selectedType, existingData) {
  const data = createTemplate(existingData);

  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_main:${selectedType}`)
    .setTitle(`Edit ${labelFromType(selectedType)} Embed`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Embed Title')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(256)
          .setValue(data.title || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Embed Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(4000)
          .setValue(data.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message Content Above Embed')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(2000)
          .setValue(data.content || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Hex Color (#5865F2)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue(data.color || '#5865F2')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer Text')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(2048)
          .setValue(data.footer || '')
      )
    );
}

function buildAssetsEditModal(selectedType, existingData) {
  const data = createTemplate(existingData);

  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_assets:${selectedType}`)
    .setTitle(`Assets for ${labelFromType(selectedType)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Image URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(data.image || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnail')
          .setLabel('Thumbnail URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(data.thumbnail || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorName')
          .setLabel('Author Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(256)
          .setValue(data.authorName || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorIcon')
          .setLabel('Author Icon URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(data.authorIcon || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorUrl')
          .setLabel('Author URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(data.authorUrl || '')
      )
    );
}

function buildButtonsEditModal(selectedType, existingData) {
  const data = createTemplate(existingData);
  const buttons = data.buttons || [];

  const serialize = (btn) => {
    if (!btn || !btn.label) return '';
    const style = normalizeButtonStyle(btn.style);
    const target = style === 'Link' ? (btn.url || '') : (btn.customId || '');
    const emoji = btn.emoji || '';
    const disabled = btn.disabled ? 'true' : 'false';
    return `${btn.label}|${style}|${target}|${emoji}|${disabled}`;
  };

  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_buttons:${selectedType}`)
    .setTitle(`Buttons for ${labelFromType(selectedType)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('button1')
          .setLabel('Button 1: label|style|url/customId|emoji|disabled')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(400)
          .setValue(serialize(buttons[0]))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('button2')
          .setLabel('Button 2: label|style|url/customId|emoji|disabled')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(400)
          .setValue(serialize(buttons[1]))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('button3')
          .setLabel('Button 3: label|style|url/customId|emoji|disabled')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(400)
          .setValue(serialize(buttons[2]))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('button4')
          .setLabel('Button 4: label|style|url/customId|emoji|disabled')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(400)
          .setValue(serialize(buttons[3]))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('button5')
          .setLabel('Button 5: label|style|url/customId|emoji|disabled')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(400)
          .setValue(serialize(buttons[4]))
      )
    );
}

function parseButtonInput(raw) {
  const value = safeValue(raw);
  if (!value) return null;

  const parts = value.split('|').map(x => x.trim());
  const label = safeValue(parts[0]);
  const style = normalizeButtonStyle(parts[1] || 'Link');
  const target = safeValue(parts[2]);
  const emoji = safeValue(parts[3]);
  const disabled = ['true', 'yes', '1'].includes((parts[4] || '').trim().toLowerCase());

  if (!label) return null;

  if (style === 'Link') {
    return {
      label,
      style,
      url: target,
      customId: '',
      emoji,
      disabled
    };
  }

  return {
    label,
    style,
    url: '',
    customId: target || `custom_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    emoji,
    disabled
  };
}

async function refreshPanel(interaction, guildId, selectedType) {
  const payload = buildEmbedPanelMessage(guildId, { selectedType });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      embeds: [payload.embed],
      components: payload.components
    });
    return;
  }

  await interaction.update({
    embeds: [payload.embed],
    components: payload.components
  });
}

async function handlePreview(interaction, selectedType) {
  const data = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});
  const previewEmbed = buildDiscordEmbed(data, `${labelFromType(selectedType)} Preview`);
  const previewComponents = buildActionRowsFromTemplate(data);

  return interaction.reply({
    content: data.content || null,
    embeds: [previewEmbed],
    components: previewComponents,
    ephemeral: true
  });
}

async function handleSend(interaction, selectedType) {
  const data = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});

  if (!data.channelId) {
    return interaction.reply({
      content: 'Please choose a target channel first.',
      ephemeral: true
    });
  }

  const channel = await interaction.guild.channels.fetch(data.channelId).catch(() => null);

  if (!channel) {
    return interaction.reply({
      content: 'The saved channel no longer exists. Please select another one.',
      ephemeral: true
    });
  }

  if (!channel.isTextBased()) {
    return interaction.reply({
      content: 'That channel cannot receive messages.',
      ephemeral: true
    });
  }

  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);

  if (me && channel.permissionsFor(me) && !channel.permissionsFor(me).has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages
  ])) {
    return interaction.reply({
      content: 'I do not have permission to send messages in that channel.',
      ephemeral: true
    });
  }

  const outEmbed = buildDiscordEmbed(data, labelFromType(selectedType));
  const outComponents = buildActionRowsFromTemplate(data);

  await channel.send({
    content: data.content || undefined,
    embeds: [outEmbed],
    components: outComponents
  });

  return interaction.reply({
    content: `Sent the **${labelFromType(selectedType)}** embed to ${channel}.`,
    ephemeral: true
  });
}

async function handleEmbedPanelInteraction(interaction) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('embedpanel_type_select:')) {
      const selectedType = interaction.values[0];
      return refreshPanel(interaction, interaction.guildId, selectedType);
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId.startsWith('embedpanel_channel_select:')) {
      const selectedType = interaction.customId.split(':')[1];
      const channelId = interaction.values[0];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});

      saveEmbedTemplate(interaction.guildId, selectedType, {
        ...existing,
        channelId
      });

      return refreshPanel(interaction, interaction.guildId, selectedType);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'embedpanel_close') {
      const closedEmbed = new EmbedBuilder()
        .setColor('#2B2D31')
        .setTitle('📝 Diamond Goliath Advanced Embed Panel')
        .setDescription('This control panel has been closed.');

      return interaction.update({
        embeds: [closedEmbed],
        components: []
      });
    }

    if (interaction.customId === 'embedpanel_clear_all') {
      clearAllGuildTemplates(interaction.guildId);

      const payload = buildEmbedPanelMessage(interaction.guildId, {
        selectedType: 'welcome'
      });

      return interaction.update({
        embeds: [payload.embed],
        components: payload.components
      });
    }

    if (interaction.customId.startsWith('embedpanel_edit_main:')) {
      const selectedType = interaction.customId.split(':')[1];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});
      const modal = buildMainEditModal(selectedType, existing);
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('embedpanel_edit_buttons:')) {
      const selectedType = interaction.customId.split(':')[1];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});
      const modal = buildButtonsEditModal(selectedType, existing);
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('embedpanel_preview:')) {
      const selectedType = interaction.customId.split(':')[1];
      return handlePreview(interaction, selectedType);
    }

    if (interaction.customId.startsWith('embedpanel_send:')) {
      const selectedType = interaction.customId.split(':')[1];
      return handleSend(interaction, selectedType);
    }

    if (interaction.customId.startsWith('embedpanel_delete:')) {
      const selectedType = interaction.customId.split(':')[1];
      deleteEmbedTemplate(interaction.guildId, selectedType);
      return refreshPanel(interaction, interaction.guildId, selectedType);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('embedpanel_modal_main:')) {
      const selectedType = interaction.customId.split(':')[1];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});

      saveEmbedTemplate(interaction.guildId, selectedType, {
        ...existing,
        title: safeValue(interaction.fields.getTextInputValue('title')),
        description: safeValue(interaction.fields.getTextInputValue('description')),
        content: safeValue(interaction.fields.getTextInputValue('content')),
        color: normalizeColor(interaction.fields.getTextInputValue('color')),
        footer: safeValue(interaction.fields.getTextInputValue('footer'))
      });

      await interaction.deferUpdate();
      return refreshPanel(interaction, interaction.guildId, selectedType);
    }

    if (interaction.customId.startsWith('embedpanel_modal_assets:')) {
      const selectedType = interaction.customId.split(':')[1];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});

      saveEmbedTemplate(interaction.guildId, selectedType, {
        ...existing,
        image: safeValue(interaction.fields.getTextInputValue('image')),
        thumbnail: safeValue(interaction.fields.getTextInputValue('thumbnail')),
        authorName: safeValue(interaction.fields.getTextInputValue('authorName')),
        authorIcon: safeValue(interaction.fields.getTextInputValue('authorIcon')),
        authorUrl: safeValue(interaction.fields.getTextInputValue('authorUrl'))
      });

      await interaction.deferUpdate();
      return refreshPanel(interaction, interaction.guildId, selectedType);
    }

    if (interaction.customId.startsWith('embedpanel_modal_buttons:')) {
      const selectedType = interaction.customId.split(':')[1];
      const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});

      const buttons = [
        parseButtonInput(interaction.fields.getTextInputValue('button1')),
        parseButtonInput(interaction.fields.getTextInputValue('button2')),
        parseButtonInput(interaction.fields.getTextInputValue('button3')),
        parseButtonInput(interaction.fields.getTextInputValue('button4')),
        parseButtonInput(interaction.fields.getTextInputValue('button5'))
      ].filter(Boolean);

      saveEmbedTemplate(interaction.guildId, selectedType, {
        ...existing,
        buttons
      });

      await interaction.deferUpdate();
      return refreshPanel(interaction, interaction.guildId, selectedType);
    }
  }
}

function buildAssetsShortcutRow(selectedType) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_assets:${selectedType}`)
      .setLabel('Edit Assets')
      .setStyle(ButtonStyle.Secondary)
  );
}

const originalBuildEmbedPanelMessage = buildEmbedPanelMessage;
buildEmbedPanelMessage = function patchedBuildEmbedPanelMessage(guildId, options = {}) {
  const payload = originalBuildEmbedPanelMessage(guildId, options);
  const selectedType = options.selectedType || 'welcome';
  payload.components.splice(3, 0, buildAssetsShortcutRow(selectedType));
  return payload;
};

const originalHandleEmbedPanelInteraction = handleEmbedPanelInteraction;
handleEmbedPanelInteraction = async function patchedHandleEmbedPanelInteraction(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('embedpanel_edit_assets:')) {
    const selectedType = interaction.customId.split(':')[1];
    const existing = createTemplate(getEmbedTemplate(interaction.guildId, selectedType) || {});
    const modal = buildAssetsEditModal(selectedType, existing);
    return interaction.showModal(modal);
  }

  return originalHandleEmbedPanelInteraction(interaction);
};

module.exports = {
  handleEmbedPanelInteraction,
  buildEmbedPanelMessage
};