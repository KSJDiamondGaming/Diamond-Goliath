const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const {
  buildEmbedPanelMessage,
  buildDiscordEmbed,
  buildButtonRows,
} = require('./embedPanelHandler');

const {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  updateTemplateEmbed,
  updateTemplateButtons,
  deleteTemplate,
} = require('./embedStore');

module.exports = async function embedPanelInteraction(interaction) {
  const id = interaction.customId || '';

  if (!id.startsWith('embedpanel_')) return false;

  try {
    if (interaction.isStringSelectMenu()) {
      if (id === 'embedpanel_template_select') {
        const selectedTemplateId = interaction.values?.[0];

        if (!selectedTemplateId || selectedTemplateId === 'none') {
          await interaction.deferUpdate();
          return true;
        }

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId,
        });

        await interaction.update({
          embeds: [payload.embed],
          components: payload.components,
        });

        return true;
      }
    }

    if (interaction.isChannelSelectMenu()) {
      if (id.startsWith('embedpanel_channel_select:')) {
        const templateId = id.split(':')[1];

        if (!templateId || templateId === 'none') {
          await interaction.reply({
            content: 'Create a template first.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const channelId = interaction.values?.[0] || null;

        updateTemplate(interaction.guildId, templateId, { channelId });

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: templateId,
        });

        await interaction.update({
          embeds: [payload.embed],
          components: payload.components,
        });

        return true;
      }
    }

    if (interaction.isButton()) {
      if (id === 'embedpanel_new') {
        const modal = new ModalBuilder()
          .setCustomId('embedpanel_modal_new')
          .setTitle('Create New Embed');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Template Name')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setPlaceholder('Rules Panel')
          )
        );

        await interaction.showModal(modal);
        return true;
      }

      if (id.startsWith('embedpanel_edit_embed:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId(`embedpanel_modal_edit_embed:${templateId}`)
          .setTitle(`Edit ${template.name}`);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Embed Title')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(256)
              .setValue(template.embed?.title || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Embed Description')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(4000)
              .setValue(template.embed?.description || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('messageContent')
              .setLabel('Message Content Above Embed')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(2000)
              .setValue(template.messageContent || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('color')
              .setLabel('Hex Color')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(7)
              .setValue(template.embed?.color || '#5865F2')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('footer')
              .setLabel('Footer')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(2048)
              .setValue(template.embed?.footer || '')
          )
        );

        await interaction.showModal(modal);
        return true;
      }

      if (id.startsWith('embedpanel_edit_assets:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const modal = new ModalBuilder()
          .setCustomId(`embedpanel_modal_edit_assets:${templateId}`)
          .setTitle(`Assets for ${template.name}`);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('image')
              .setLabel('Image URL')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(template.embed?.image || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('thumbnail')
              .setLabel('Thumbnail URL')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(template.embed?.thumbnail || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('authorName')
              .setLabel('Author Name')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(256)
              .setValue(template.embed?.authorName || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('authorIcon')
              .setLabel('Author Icon URL')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(template.embed?.authorIcon || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('authorUrl')
              .setLabel('Author URL')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(template.embed?.authorUrl || '')
          )
        );

        await interaction.showModal(modal);
        return true;
      }

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
              .setLabel('Button 1: label|style|url/customId|emoji|disabled')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(400)
              .setValue(serializeButton(buttons[0]))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('button2')
              .setLabel('Button 2: label|style|url/customId|emoji|disabled')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(400)
              .setValue(serializeButton(buttons[1]))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('button3')
              .setLabel('Button 3: label|style|url/customId|emoji|disabled')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(400)
              .setValue(serializeButton(buttons[2]))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('button4')
              .setLabel('Button 4: label|style|url/customId|emoji|disabled')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(400)
              .setValue(serializeButton(buttons[3]))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('button5')
              .setLabel('Button 5: label|style|url/customId|emoji|disabled')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(400)
              .setValue(serializeButton(buttons[4]))
          )
        );

        await interaction.showModal(modal);
        return true;
      }

      if (id.startsWith('embedpanel_preview:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const previewEmbed = buildDiscordEmbed(template);
        const previewRows = buildButtonRows(template);

        await interaction.reply({
          content: template.messageContent || undefined,
          embeds: [previewEmbed],
          components: previewRows,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (id.startsWith('embedpanel_send:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        if (!template.channelId) {
          await interaction.reply({
            content: 'Select a target channel first.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const channel = await interaction.guild.channels.fetch(template.channelId).catch(() => null);

        if (!channel || !channel.isTextBased()) {
          await interaction.reply({
            content: 'The saved channel is invalid.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        await channel.send({
          content: template.messageContent || undefined,
          embeds: [buildDiscordEmbed(template)],
          components: buildButtonRows(template),
        });

        await interaction.reply({
          content: `Sent **${template.name}** to ${channel}.`,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (id.startsWith('embedpanel_delete:')) {
        const templateId = id.split(':')[1];
        deleteTemplate(interaction.guildId, templateId);

        const remaining = getTemplates(interaction.guildId);
        const nextTemplateId = remaining[0]?.id;

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: nextTemplateId,
        });

        await interaction.update({
          embeds: [payload.embed],
          components: payload.components,
        });

        return true;
      }

      if (id === 'embedpanel_close') {
        await interaction.update({
          content: 'Embed panel closed.',
          embeds: [],
          components: [],
        });
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (id === 'embedpanel_modal_new') {
        const name = safeValue(interaction.fields.getTextInputValue('name'));

        if (!name) {
          await interaction.reply({
            content: 'Template name is required.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const template = createTemplate(interaction.guildId, name);

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: template.id,
        });

        await interaction.reply({
          content: 'Template created.',
          embeds: [payload.embed],
          components: payload.components,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (id.startsWith('embedpanel_modal_edit_embed:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        updateTemplate(interaction.guildId, templateId, {
          messageContent: safeValue(interaction.fields.getTextInputValue('messageContent')),
        });

        updateTemplateEmbed(interaction.guildId, templateId, {
          title: safeValue(interaction.fields.getTextInputValue('title')),
          description: safeValue(interaction.fields.getTextInputValue('description')),
          color: normalizeColor(interaction.fields.getTextInputValue('color')),
          footer: safeValue(interaction.fields.getTextInputValue('footer')),
        });

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: templateId,
        });

        await interaction.reply({
          content: 'Template updated.',
          embeds: [payload.embed],
          components: payload.components,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (id.startsWith('embedpanel_modal_edit_assets:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        updateTemplateEmbed(interaction.guildId, templateId, {
          image: safeValue(interaction.fields.getTextInputValue('image')),
          thumbnail: safeValue(interaction.fields.getTextInputValue('thumbnail')),
          authorName: safeValue(interaction.fields.getTextInputValue('authorName')),
          authorIcon: safeValue(interaction.fields.getTextInputValue('authorIcon')),
          authorUrl: safeValue(interaction.fields.getTextInputValue('authorUrl')),
        });

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: templateId,
        });

        await interaction.reply({
          content: 'Assets updated.',
          embeds: [payload.embed],
          components: payload.components,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (id.startsWith('embedpanel_modal_edit_buttons:')) {
        const templateId = id.split(':')[1];
        const template = getTemplate(interaction.guildId, templateId);

        if (!template) {
          await interaction.reply({
            content: 'That template could not be found.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        const buttons = [
          parseButtonInput(interaction.fields.getTextInputValue('button1')),
          parseButtonInput(interaction.fields.getTextInputValue('button2')),
          parseButtonInput(interaction.fields.getTextInputValue('button3')),
          parseButtonInput(interaction.fields.getTextInputValue('button4')),
          parseButtonInput(interaction.fields.getTextInputValue('button5')),
        ].filter(Boolean);

        updateTemplateButtons(interaction.guildId, templateId, buttons);

        const payload = buildEmbedPanelMessage(interaction.guildId, {
          selectedTemplateId: templateId,
        });

        await interaction.reply({
          content: 'Buttons updated.',
          embeds: [payload.embed],
          components: payload.components,
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }
    }

    await interaction.reply({
      content: `Unhandled: ${id}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  } catch (error) {
    console.error('❌ Embed panel handler error:', error);

    const payload = {
      content: 'There was an error while processing the embed panel interaction.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }

    return true;
  }
};

function safeValue(value) {
  return value && value.trim().length ? value.trim() : '';
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

function parseButtonInput(raw) {
  const value = safeValue(raw);
  if (!value) return null;

  const parts = value.split('|').map((x) => x.trim());
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
      disabled,
    };
  }

  return {
    label,
    style,
    url: '',
    customId: target || `custom_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    emoji,
    disabled,
  };
}