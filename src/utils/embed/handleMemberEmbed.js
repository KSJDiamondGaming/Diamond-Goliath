const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  updateTemplateEmbed,
  updateTemplateButtons,
  deleteTemplate,
} = require('./embedStore');

function shorten(text, max = 100) {
  if (!text) return 'Not set';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeColor(color) {
  if (!color) return '#5865F2';

  let value = color.trim();
  if (!value.startsWith('#')) value = `#${value}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return '#5865F2';

  return value;
}

function normalizeButtonStyle(style) {
  const value = (style || '').trim().toLowerCase();

  if (value === 'primary') return 'Primary';
  if (value === 'secondary') return 'Secondary';
  if (value === 'success') return 'Success';
  if (value === 'danger') return 'Danger';
  return 'Link';
}

function toDiscordButtonStyle(style) {
  switch (normalizeButtonStyle(style)) {
    case 'Primary':
      return ButtonStyle.Primary;
    case 'Secondary':
      return ButtonStyle.Secondary;
    case 'Success':
      return ButtonStyle.Success;
    case 'Danger':
      return ButtonStyle.Danger;
    default:
      return ButtonStyle.Link;
  }
}

function buildDiscordEmbed(template) {
  const embed = new EmbedBuilder()
    .setColor(normalizeColor(template.embed?.color))
    .setTitle(template.embed?.title || template.name || 'Embed Preview')
    .setDescription(template.embed?.description || 'No description set.');

  if (template.embed?.footer) {
    embed.setFooter({ text: template.embed.footer });
  }

  if (template.embed?.image) {
    embed.setImage(template.embed.image);
  }

  if (template.embed?.thumbnail) {
    embed.setThumbnail(template.embed.thumbnail);
  }

  if (template.embed?.authorName) {
    embed.setAuthor({
      name: template.embed.authorName,
      iconURL: template.embed.authorIcon || undefined,
      url: template.embed.authorUrl || undefined,
    });
  }

  return embed;
}

function buildButtonRows(template) {
  const buttons = Array.isArray(template.buttons) ? template.buttons.slice(0, 5) : [];
  if (!buttons.length) return [];

  const row = new ActionRowBuilder();

  for (const btn of buttons) {
    const styleLabel = normalizeButtonStyle(btn.style);
    const style = toDiscordButtonStyle(styleLabel);

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
      builder.setCustomId(btn.customId || `btn_${Date.now()}_${Math.floor(Math.random() * 9999)}`);
    }

    row.addComponents(builder);
  }

  return [row];
}

function summarizeButtons(buttons = []) {
  if (!buttons.length) return 'No buttons added yet.';

  return buttons
    .slice(0, 5)
    .map((btn, index) => {
      const style = normalizeButtonStyle(btn.style);
      const target = style === 'Link'
        ? (btn.url || 'Missing URL')
        : (btn.customId || 'Missing custom ID');

      return `**${index + 1}.** ${btn.label || 'Untitled'} • ${style} • ${shorten(target, 40)}${btn.disabled ? ' • Disabled' : ''}`;
    })
    .join('\n');
}

function buildEmbedPanelMessage(guildId, options = {}) {
  const templates = getTemplates(guildId);

  let selectedTemplateId = options.selectedTemplateId;
  if (!selectedTemplateId && templates.length) {
    selectedTemplateId = templates[0].id;
  }

  const template = selectedTemplateId ? getTemplate(guildId, selectedTemplateId) : null;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('✨ Diamond Goliath Embed Studio')
    .setDescription(
      'Create, customise, preview, and send modular embed templates for any channel in your server.'
    );

  if (!template) {
    embed.addFields(
      {
        name: '📂 Current Template',
        value: 'No template selected',
        inline: true,
      },
      {
        name: '📡 Target Channel',
        value: 'Not selected',
        inline: true,
      },
      {
        name: '🎨 Theme Colour',
        value: '`#5865F2`',
        inline: true,
      },
      {
        name: '📝 Getting Started',
        value:
          'Click **➕ New Embed** to create your first template.\n' +
          'Then choose a channel, edit the content, preview it, and send it when ready.',
        inline: false,
      }
    );
  } else {
    embed.addFields(
      {
        name: '📂 Current Template',
        value: `**${template.name || 'Unnamed Template'}**`,
        inline: true,
      },
      {
        name: '📡 Target Channel',
        value: template.channelId ? `<#${template.channelId}>` : 'Not selected',
        inline: true,
      },
      {
        name: '🎨 Theme Colour',
        value: `\`${normalizeColor(template.embed?.color)}\``,
        inline: true,
      },
      {
        name: '🏷️ Embed Title',
        value: shorten(template.embed?.title, 120),
        inline: false,
      },
      {
        name: '📄 Embed Description',
        value: shorten(template.embed?.description, 220),
        inline: false,
      },
      {
        name: '💬 Message Content',
        value: shorten(template.messageContent, 140),
        inline: false,
      },
      {
        name: '🧾 Footer Text',
        value: shorten(template.embed?.footer, 120),
        inline: true,
      },
      {
        name: '🖼️ Visual Assets',
        value:
          `Image: ${template.embed?.image ? '✅ Set' : '❌ Not set'}\n` +
          `Thumbnail: ${template.embed?.thumbnail ? '✅ Set' : '❌ Not set'}\n` +
          `Author: ${template.embed?.authorName ? '✅ Set' : '❌ Not set'}`,
        inline: true,
      },
      {
        name: '🔘 Buttons',
        value: summarizeButtons(template.buttons),
        inline: false,
      }
    );
  }

  const templateSelect = new StringSelectMenuBuilder()
    .setCustomId('embedpanel_template_select')
    .setPlaceholder('📂 Select an embed template');

  if (templates.length) {
    templateSelect.addOptions(
      templates.map((t) => ({
        label: (t.name || 'Untitled Template').slice(0, 100),
        value: t.id,
        default: t.id === selectedTemplateId,
      }))
    );
  } else {
    templateSelect.addOptions([
      {
        label: 'No templates yet',
        value: 'none',
      },
    ]);
  }

  const templateRow = new ActionRowBuilder().addComponents(templateSelect);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`embedpanel_channel_select:${selectedTemplateId || 'none'}`)
    .setPlaceholder(template?.channelId ? '📡 Channel selected below' : '📡 Choose the target channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!template);

  const channelRow = new ActionRowBuilder().addComponents(channelSelect);

  const actionRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('embedpanel_new')
      .setLabel('New Embed')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_embed:${selectedTemplateId || 'none'}`)
      .setLabel('Edit Embed')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!template),

    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_assets:${selectedTemplateId || 'none'}`)
      .setLabel('Edit Assets')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!template),

    new ButtonBuilder()
      .setCustomId(`embedpanel_edit_buttons:${selectedTemplateId || 'none'}`)
      .setLabel('Edit Buttons')
      .setEmoji('🔘')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!template)
  );

  const actionRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embedpanel_preview:${selectedTemplateId || 'none'}`)
      .setLabel('Preview')
      .setEmoji('👀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!template),

    new ButtonBuilder()
      .setCustomId(`embedpanel_send:${selectedTemplateId || 'none'}`)
      .setLabel('Send')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!template || !template.channelId),

    new ButtonBuilder()
      .setCustomId(`embedpanel_delete:${selectedTemplateId || 'none'}`)
      .setLabel('Delete')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!template),

    new ButtonBuilder()
      .setCustomId('embedpanel_close')
      .setLabel('Close')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embed,
    components: [templateRow, channelRow, actionRow1, actionRow2],
  };
}

function buildDashboardPayload(guildId, selectedTemplateId) {
  const panel = buildEmbedPanelMessage(guildId, { selectedTemplateId });
  return {
    embeds: [panel.embed],
    components: panel.components,
  };
}

function makeTextInput(customId, label, style, value = '', required = false, maxLength) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (value) input.setValue(String(value).slice(0, maxLength || 4000));
  if (maxLength) input.setMaxLength(maxLength);

  return input;
}

function buildEmbedEditModal(template) {
  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_embed:${template.id}`)
    .setTitle('Edit Embed')
    .addComponents(
      new ActionRowBuilder().addComponents(
        makeTextInput('templateName', 'Template Name', TextInputStyle.Short, template.name || '', true, 100)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('title', 'Embed Title', TextInputStyle.Short, template.embed?.title || '', false, 256)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('description', 'Embed Description', TextInputStyle.Paragraph, template.embed?.description || '', false, 4000)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('color', 'Embed Colour (#5865F2)', TextInputStyle.Short, template.embed?.color || '#5865F2', false, 7)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('messageContent', 'Message Content', TextInputStyle.Paragraph, template.messageContent || '', false, 2000)
      )
    );
}

function buildAssetsModal(template) {
  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_assets:${template.id}`)
    .setTitle('Edit Embed Assets')
    .addComponents(
      new ActionRowBuilder().addComponents(
        makeTextInput('footer', 'Footer Text', TextInputStyle.Short, template.embed?.footer || '', false, 2048)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('image', 'Image URL', TextInputStyle.Short, template.embed?.image || '', false, 1000)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('thumbnail', 'Thumbnail URL', TextInputStyle.Short, template.embed?.thumbnail || '', false, 1000)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('authorName', 'Author Name', TextInputStyle.Short, template.embed?.authorName || '', false, 256)
      ),
      new ActionRowBuilder().addComponents(
        makeTextInput('authorIcon', 'Author Icon URL', TextInputStyle.Short, template.embed?.authorIcon || '', false, 1000)
      )
    );
}

function buildButtonsModal(template) {
  return new ModalBuilder()
    .setCustomId(`embedpanel_modal_buttons:${template.id}`)
    .setTitle('Edit Buttons JSON')
    .addComponents(
      new ActionRowBuilder().addComponents(
        makeTextInput(
          'buttonsJson',
          'Buttons JSON Array',
          TextInputStyle.Paragraph,
          template.buttons?.length
            ? JSON.stringify(template.buttons, null, 2)
            : '[\n  {\n    "label": "Visit Website",\n    "style": "Link",\n    "url": "https://example.com"\n  }\n]',
          false,
          4000
        )
      )
    );
}

function sanitizeUrl(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function parseButtonsJson(input) {
  const raw = (input || '').trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Buttons JSON must be an array.');
  }

  return parsed.slice(0, 5).map((button, index) => {
    if (!button || typeof button !== 'object' || Array.isArray(button)) {
      throw new Error(`Button ${index + 1} must be an object.`);
    }

    const style = normalizeButtonStyle(button.style);
    const label = String(button.label || '').trim();

    if (!label) {
      throw new Error(`Button ${index + 1} is missing a label.`);
    }

    const normalized = {
      label: label.slice(0, 80),
      style,
      disabled: Boolean(button.disabled),
    };

    if (button.emoji) {
      normalized.emoji = String(button.emoji).trim();
    }

    if (style === 'Link') {
      const url = sanitizeUrl(button.url);
      if (!url) {
        throw new Error(`Link button ${index + 1} needs a valid http(s) URL.`);
      }
      normalized.url = url;
    } else {
      normalized.customId = String(button.customId || `embedpanel_btn_${index + 1}`).trim().slice(0, 100);
    }

    return normalized;
  });
}

async function refreshPanel(interaction, guildId, selectedTemplateId) {
  const payload = buildDashboardPayload(guildId, selectedTemplateId);

  if (interaction.isModalSubmit()) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.followUp({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.update(payload);
}

async function sendEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleEmbedPanelInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('embedpanel_')) return false;

  const guildId = interaction.guildId;
  if (!guildId) {
    await sendEphemeral(interaction, 'This panel can only be used in a server.');
    return true;
  }

  if (interaction.isStringSelectMenu() && customId === 'embedpanel_template_select') {
    const selectedTemplateId = interaction.values?.[0];
    await refreshPanel(interaction, guildId, selectedTemplateId === 'none' ? null : selectedTemplateId);
    return true;
  }

  if (typeof interaction.isChannelSelectMenu === 'function' &&
      interaction.isChannelSelectMenu() &&
      customId.startsWith('embedpanel_channel_select:')) {
    const templateId = customId.split(':')[1];

    if (!templateId || templateId === 'none') {
      await sendEphemeral(interaction, 'Select or create a template first.');
      return true;
    }

    const selectedChannelId = Array.isArray(interaction.values) ? interaction.values[0] : null;
    if (!selectedChannelId) {
      await sendEphemeral(interaction, 'No channel was selected.');
      return true;
    }

    updateTemplate(guildId, templateId, {
      channelId: selectedChannelId,
    });

    await refreshPanel(interaction, guildId, templateId);
    return true;
  }

  if (interaction.isButton()) {
    if (customId === 'embedpanel_new') {
      const template = createTemplate(guildId, `Embed ${getTemplates(guildId).length + 1}`);
      await refreshPanel(interaction, guildId, template.id);
      return true;
    }

    if (customId === 'embedpanel_close') {
      await interaction.update({
        content: 'Embed Studio closed.',
        embeds: [],
        components: [],
      });
      return true;
    }

    const parts = customId.split(':');
    const templateId = parts[1];
    const template = templateId && templateId !== 'none' ? getTemplate(guildId, templateId) : null;

    if (!template) {
      await sendEphemeral(interaction, 'That template no longer exists.');
      return true;
    }

    if (customId.startsWith('embedpanel_edit_embed:')) {
      await interaction.showModal(buildEmbedEditModal(template));
      return true;
    }

    if (customId.startsWith('embedpanel_edit_assets:')) {
      await interaction.showModal(buildAssetsModal(template));
      return true;
    }

    if (customId.startsWith('embedpanel_edit_buttons:')) {
      await interaction.showModal(buildButtonsModal(template));
      return true;
    }

    if (customId.startsWith('embedpanel_preview:')) {
      await interaction.reply({
        content: template.messageContent || undefined,
        embeds: [buildDiscordEmbed(template)],
        components: buildButtonRows(template),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (customId.startsWith('embedpanel_send:')) {
      const channel = template.channelId
        ? await interaction.guild.channels.fetch(template.channelId).catch(() => null)
        : null;

      if (!channel || !channel.isTextBased()) {
        await sendEphemeral(interaction, 'Pick a valid text channel before sending.');
        return true;
      }

      await channel.send({
        content: template.messageContent || undefined,
        embeds: [buildDiscordEmbed(template)],
        components: buildButtonRows(template),
      });

      await sendEphemeral(interaction, `Embed sent to <#${channel.id}>.`);
      return true;
    }

    if (customId.startsWith('embedpanel_delete:')) {
      deleteTemplate(guildId, template.id);
      const remaining = getTemplates(guildId);
      await refreshPanel(interaction, guildId, remaining[0]?.id || null);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    const parts = customId.split(':');
    const modalId = parts[0];
    const templateId = parts[1];
    const template = templateId ? getTemplate(guildId, templateId) : null;

    if (!template) {
      await sendEphemeral(interaction, 'That template no longer exists.');
      return true;
    }

    if (modalId === 'embedpanel_modal_embed') {
      updateTemplate(guildId, templateId, {
        name: interaction.fields.getTextInputValue('templateName').trim() || template.name,
        messageContent: interaction.fields.getTextInputValue('messageContent').trim(),
      });

      updateTemplateEmbed(guildId, templateId, {
        title: interaction.fields.getTextInputValue('title').trim(),
        description: interaction.fields.getTextInputValue('description').trim(),
        color: normalizeColor(interaction.fields.getTextInputValue('color').trim()),
      });

      await refreshPanel(interaction, guildId, templateId);
      return true;
    }

    if (modalId === 'embedpanel_modal_assets') {
      updateTemplateEmbed(guildId, templateId, {
        footer: interaction.fields.getTextInputValue('footer').trim(),
        image: sanitizeUrl(interaction.fields.getTextInputValue('image')),
        thumbnail: sanitizeUrl(interaction.fields.getTextInputValue('thumbnail')),
        authorName: interaction.fields.getTextInputValue('authorName').trim(),
        authorIcon: sanitizeUrl(interaction.fields.getTextInputValue('authorIcon')),
      });

      await refreshPanel(interaction, guildId, templateId);
      return true;
    }

    if (modalId === 'embedpanel_modal_buttons') {
      try {
        const buttons = parseButtonsJson(interaction.fields.getTextInputValue('buttonsJson'));
        updateTemplateButtons(guildId, templateId, buttons);
        await refreshPanel(interaction, guildId, templateId);
      } catch (error) {
        await sendEphemeral(interaction, `Invalid buttons JSON: ${error.message}`);
      }
      return true;
    }
  }

  return false;
}

module.exports = {
  buildEmbedPanelMessage,
  buildDiscordEmbed,
  buildButtonRows,
  handleEmbedPanelInteraction,
};