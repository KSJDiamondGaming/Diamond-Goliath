const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');

const {
  getTemplates,
  getTemplate,
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
        label: t.name,
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

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`embedpanel_channel_select:${selectedTemplateId || 'none'}`)
      .setPlaceholder('📡 Choose the target channel')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(!template)
  );

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
      .setDisabled(!template),
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
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embed,
    components: [templateRow, channelRow, actionRow1, actionRow2],
  };
}

module.exports = {
  buildEmbedPanelMessage,
  buildDiscordEmbed,
  buildButtonRows,
};