'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const reactionRoles = require('./reactionRoles');

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (customId, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);

function modeLabel(mode) {
  if (mode === reactionRoles.MODES.ADD) return 'Add only';
  if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
  return 'Add + remove on unreact';
}

function templateMenu(guildId, selectedId, customId = 'admin:reactionRoles:wizard:template') {
  const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(templates.length ? 'Choose an Embed Studio template' : 'No Reaction Role templates found')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(templates.length === 0);
  if (templates.length) {
    menu.addOptions(templates.map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: String(template.embed?.title || template.module || 'Embed Studio template').slice(0, 100),
      value: String(template.templateId),
      default: String(template.templateId) === String(selectedId),
    })));
  } else {
    menu.addOptions({ label: 'Create one in Embed Studio first', value: 'none' });
  }
  return menu;
}

function modeMenu(selectedMode) {
  return new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:mode')
    .setPlaceholder('Choose reaction behaviour')
    .addOptions([
      { label: 'Add + remove on unreact', value: reactionRoles.MODES.TOGGLE, default: selectedMode === reactionRoles.MODES.TOGGLE },
      { label: 'Add only', value: reactionRoles.MODES.ADD, default: selectedMode === reactionRoles.MODES.ADD },
      { label: 'Remove role', value: reactionRoles.MODES.REMOVE, default: selectedMode === reactionRoles.MODES.REMOVE },
    ]);
}

function panelMenu(guildId) {
  const panels = reactionRoles.listPanels(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:manage:panel')
    .setPlaceholder(panels.length ? 'Choose a tracked message' : 'No tracked messages')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(panels.length === 0);
  if (panels.length) {
    menu.addOptions(panels.map((panel) => ({
      label: String(panel.name || panel.panelId).slice(0, 100),
      description: `${panel.mappings.length} mapping(s) • ${panel.source === 'template' ? 'Embed Studio' : 'Existing message'}`.slice(0, 100),
      value: panel.panelId,
    })));
  } else {
    menu.addOptions({ label: 'No panels available', value: 'none' });
  }
  return menu;
}

function mappingLines(draft, guild) {
  if (!draft.mappings.length) return '`No mappings added yet.`';
  return draft.mappings.slice(0, 15).map((mapping, index) => {
    const role = guild.roles.cache.get(mapping.roleId);
    return `**${index + 1}.** ${mapping.emoji} → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``} · ${modeLabel(mapping.mode)}`;
  }).join('\n');
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealth(guild);
  const panels = reactionRoles.listPanels(guild.id);
  const mappings = panels.reduce((total, panel) => total + panel.mappings.length, 0);
  const unhealthy = health.panels.filter((panel) => !panel.healthy).length;

  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
    .setTitle('😊 Reaction Roles')
    .setDescription([
      `**Status:** ${config.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Tracked Messages:** \`${panels.length}\``,
      `**Mappings:** \`${mappings}\``,
      `**Health:** ${health.healthy ? 'Healthy ✅' : `${unhealthy} panel(s) need attention ⚠️`}`,
      `**Assigned:** \`${config.analytics.assigned || 0}\` | **Removed:** \`${config.analytics.removed || 0}\` | **Failed:** \`${config.analytics.failed || 0}\``,
      '',
      '**Create from Embed Studio** or attach roles to **any existing message/embed**.',
      'Setup progress is saved, so you can close this panel, copy a message ID, reopen `/admin`, and continue.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:reactionRoles:new:template', '🎨 Create from Template', ButtonStyle.Success),
        button('admin:reactionRoles:new:existing', '🔗 Attach Existing', ButtonStyle.Primary),
        button('admin:reactionRoles:continue', '▶️ Continue Setup')
      ),
      row(panelMenu(guild.id)),
      row(
        button(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? '⏸️ Disable' : '▶️ Enable'),
        button('admin:reactionRoles:repair', '🩺 Repair All', ButtonStyle.Primary),
        button('admin:reactionRoles:export', '📤 Export'),
        button('admin:modules', '⬅️ Modules')
      ),
    ],
  };
}

function buildWizard(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  const selectedRole = draft.selectedRoleId ? guild.roles.cache.get(draft.selectedRoleId) : null;
  const selectedTemplate = draft.templateId ? reactionRoles.getReactionTemplate(guild.id, draft.templateId) : null;
  const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
  const ready = Boolean(
    draft.channelId &&
    draft.mappings.length &&
    (existing ? draft.messageId : draft.templateId)
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(existing ? '🔗 Attach to Existing Message' : '🎨 Create from Embed Studio')
    .setDescription([
      `**Draft saved for:** <@${userId}>`,
      `**Channel:** ${draft.channelId ? `<#${draft.channelId}>` : '`Choose below`'}`,
      existing ? `**Message ID:** ${draft.messageId ? `\`${draft.messageId}\`` : '`Not entered yet`'}` : null,
      `**Template:** ${selectedTemplate ? `\`${selectedTemplate.name}\`` : existing ? '`None — preserve existing content`' : '`Choose below`'}`,
      existing ? `**Apply template to existing message:** ${draft.applyTemplate ? 'Yes ⚠️' : 'No — preserve content ✅'}` : null,
      `**Selected Role:** ${selectedRole ? `<@&${selectedRole.id}>` : '`Choose below`'}`,
      `**Behaviour:** ${modeLabel(draft.selectedMode)}`,
      '',
      '**Mappings**',
      mappingLines(draft, guild),
      '',
      ready ? '✅ Ready to deploy.' : 'Complete the missing selections, then deploy.',
    ].filter(Boolean).join('\n').slice(0, 4096));

  const components = [
    row(new ChannelSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:wizard:channel')
      .setPlaceholder('Choose the message channel')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1)),
    row(templateMenu(guild.id, draft.templateId)),
    row(new RoleSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:wizard:role')
      .setPlaceholder('Choose a role for the next mapping')
      .setMinValues(1)
      .setMaxValues(1)),
    row(modeMenu(draft.selectedMode)),
    row(
      existing ? button('admin:reactionRoles:wizard:message', draft.messageId ? '✏️ Change Message ID' : '📝 Enter Message ID', ButtonStyle.Primary) : null,
      button('admin:reactionRoles:wizard:emoji', '➕ Add Emoji Mapping', ButtonStyle.Success, !draft.selectedRoleId),
      existing ? button('admin:reactionRoles:wizard:applyTemplate', draft.applyTemplate ? '⚠️ Template Will Replace Content' : '🛡️ Preserve Existing Content', draft.applyTemplate ? ButtonStyle.Danger : ButtonStyle.Secondary) : null,
      button('admin:reactionRoles:wizard:deploy', existing ? '🔗 Attach' : '🚀 Create Panel', ButtonStyle.Success, !ready),
      button('admin:reactionRoles:wizard:cancel', '✖ Cancel', ButtonStyle.Danger)
    ].filter(Boolean)),
  ];

  return { embeds: [embed], components };
}

async function buildManagedPanel(guild, panelId) {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That Reaction Roles panel no longer exists.');
  const health = await reactionRoles.buildHealth(guild);
  const panelHealth = health.panels.find((item) => item.panelId === panel.panelId);
  const template = panel.templateId ? reactionRoles.getReactionTemplate(guild.id, panel.templateId) : null;
  const embed = new EmbedBuilder()
    .setColor(panelHealth?.healthy === false ? 0xed4245 : 0x57f287)
    .setTitle(`🛠️ ${panel.name}`)
    .setDescription([
      `**Source:** ${panel.source === 'template' ? 'Embed Studio' : 'Existing message'}`,
      `**Channel:** <#${panel.channelId}>`,
      `**Message:** \`${panel.messageId}\``,
      `**Template:** ${template ? `\`${template.name}\`` : '`None`'}`,
      `**Mappings:** \`${panel.mappings.length}\``,
      `**Health:** ${panelHealth?.healthy === false ? 'Needs attention ⚠️' : 'Healthy ✅'}`,
      panelHealth?.issues?.length ? `\n${panelHealth.issues.map((issue) => `• ${issue}`).join('\n')}` : '',
      '',
      panel.mappings.length
        ? panel.mappings.map((mapping) => `${mapping.emoji} → <@&${mapping.roleId}> · ${modeLabel(mapping.mode)}`).join('\n')
        : '`No mappings.`',
    ].join('\n').slice(0, 4096));

  return {
    embeds: [embed],
    components: [
      row(templateMenu(guild.id, panel.templateId, `admin:reactionRoles:manage:template:${panel.panelId}`)),
      row(
        button(`admin:reactionRoles:manage:edit:${panel.panelId}`, '✏️ Edit Mappings', ButtonStyle.Primary),
        button(`admin:reactionRoles:manage:repair:${panel.panelId}`, '🩺 Repair'),
        button(`admin:reactionRoles:manage:detach:${panel.panelId}`, '🗑️ Detach', ButtonStyle.Danger),
        button('admin:reactionRoles', '⬅️ Back')
      ),
    ],
  };
}

function textModal(customId, title, fieldId, label, placeholder, value = '') {
  const input = new TextInputBuilder()
    .setCustomId(fieldId)
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (value) input.setValue(String(value));
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(row(input));
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function handleReactionRolesAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:reactionRoles')) return false;
  const guild = interaction.guild;
  const userId = interaction.user.id;

  try {
    if (interaction.isModalSubmit?.()) {
      if (customId === 'admin:reactionRoles:wizard:message:submit') {
        const reference = interaction.fields.getTextInputValue('messageReference');
        const parsed = reactionRoles.parseMessageReference(reference, reactionRoles.getDraft(guild.id, userId)?.channelId);
        reactionRoles.saveDraft(guild.id, userId, { channelId: parsed.channelId, messageId: parsed.messageId }, guild);
        return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
      }
      if (customId === 'admin:reactionRoles:wizard:emoji:submit') {
        const draft = reactionRoles.getDraft(guild.id, userId);
        const emoji = interaction.fields.getTextInputValue('emoji');
        reactionRoles.addDraftMapping(guild.id, userId, {
          emoji,
          roleId: draft.selectedRoleId,
          mode: draft.selectedMode,
          removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE,
          enabled: true,
        }, guild);
        return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
      }
    }

    if (customId === 'admin:reactionRoles') return respond(interaction, await buildReactionRolesAdminPanel(guild, interaction.member?.displayName || interaction.user.username));
    if (customId === 'admin:reactionRoles:new:existing') {
      reactionRoles.saveDraft(guild.id, userId, { ...reactionRoles.getDraft(guild.id, userId), type: reactionRoles.DRAFT_TYPES.EXISTING, panelId: null, messageId: null, mappings: [], applyTemplate: false }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (customId === 'admin:reactionRoles:new:template') {
      reactionRoles.saveDraft(guild.id, userId, { ...reactionRoles.getDraft(guild.id, userId), type: reactionRoles.DRAFT_TYPES.TEMPLATE, panelId: null, messageId: null, mappings: [], applyTemplate: true }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (customId === 'admin:reactionRoles:continue') return respond(interaction, buildWizard(guild, userId));

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:reactionRoles:wizard:channel') {
      reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isRoleSelectMenu?.() && customId === 'admin:reactionRoles:wizard:role') {
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && customId === 'admin:reactionRoles:wizard:mode') {
      reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && customId === 'admin:reactionRoles:wizard:template') {
      if (interaction.values[0] !== 'none') reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && customId === 'admin:reactionRoles:manage:panel') {
      return respond(interaction, await buildManagedPanel(guild, interaction.values[0]));
    }
    if (interaction.isStringSelectMenu?.() && customId.startsWith('admin:reactionRoles:manage:template:')) {
      const panelId = customId.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.applyTemplateToPanel(guild, panelId, interaction.values[0]);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }

    if (customId === 'admin:reactionRoles:wizard:message') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      await interaction.showModal(textModal('admin:reactionRoles:wizard:message:submit', 'Message to Attach', 'messageReference', 'Message ID or full Discord link', 'Right-click message → Copy Message ID', draft.messageId || ''));
      return true;
    }
    if (customId === 'admin:reactionRoles:wizard:emoji') {
      await interaction.showModal(textModal('admin:reactionRoles:wizard:emoji:submit', 'Add Emoji Mapping', 'emoji', 'Unicode or custom emoji', '⭐ or <:name:emoji_id>'));
      return true;
    }
    if (customId === 'admin:reactionRoles:wizard:applyTemplate') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      reactionRoles.saveDraft(guild.id, userId, { applyTemplate: !draft.applyTemplate }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (customId === 'admin:reactionRoles:wizard:cancel') {
      reactionRoles.clearDraft(guild.id, userId, guild);
      return respond(interaction, await buildReactionRolesAdminPanel(guild, interaction.member?.displayName || interaction.user.username));
    }
    if (customId === 'admin:reactionRoles:wizard:deploy') {
      await interaction.deferUpdate();
      const draft = reactionRoles.getDraft(guild.id, userId);
      let panel;
      if (draft.panelId) {
        panel = await reactionRoles.updatePanelMappings(guild, draft.panelId, draft.mappings, userId);
        if (draft.applyTemplate && draft.templateId) panel = await reactionRoles.applyTemplateToPanel(guild, draft.panelId, draft.templateId);
      } else if (draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE) {
        panel = await reactionRoles.createFromTemplate({ guild, channelId: draft.channelId, templateId: draft.templateId, name: draft.name, mappings: draft.mappings, createdBy: userId });
      } else {
        panel = await reactionRoles.attachExistingMessage({ guild, messageReference: draft.messageId, channelId: draft.channelId, name: draft.name, templateId: draft.templateId, applyTemplate: draft.applyTemplate, mappings: draft.mappings, createdBy: userId });
      }
      reactionRoles.clearDraft(guild.id, userId, guild);
      return interaction.editReply(await buildManagedPanel(guild, panel.panelId));
    }

    if (customId.startsWith('admin:reactionRoles:manage:edit:')) {
      const panelId = customId.split(':').pop();
      const panel = reactionRoles.getPanel(guild.id, panelId);
      reactionRoles.saveDraft(guild.id, userId, {
        type: panel.source,
        panelId: panel.panelId,
        channelId: panel.channelId,
        messageId: panel.messageId,
        name: panel.name,
        templateId: panel.templateId,
        mappings: panel.mappings,
        applyTemplate: false,
      }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (customId.startsWith('admin:reactionRoles:manage:repair:')) {
      const panelId = customId.split(':').pop();
      await interaction.deferUpdate();
      const panel = reactionRoles.getPanel(guild.id, panelId);
      await reactionRoles.syncPanelReactions(guild, panel);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (customId.startsWith('admin:reactionRoles:manage:detach:')) {
      const panelId = customId.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.detachPanel(guild, panelId, { clearReactions: false });
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, interaction.member?.displayName || interaction.user.username));
    }

    if (customId === 'admin:reactionRoles:enable') reactionRoles.setEnabled(guild.id, true, guild);
    if (customId === 'admin:reactionRoles:disable') reactionRoles.setEnabled(guild.id, false, guild);
    if (customId === 'admin:reactionRoles:repair') {
      await interaction.deferUpdate();
      await reactionRoles.repairAll(guild);
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, interaction.member?.displayName || interaction.user.username));
    }
    if (customId === 'admin:reactionRoles:export') {
      const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(reactionRoles.exportConfiguration(guild.id), null, 2), 'utf8'), { name: `goliath-reaction-roles-${guild.id}.json` });
      await interaction.reply({ content: '📤 Reaction Roles configuration export.', files: [attachment], ephemeral: true });
      return true;
    }

    return respond(interaction, await buildReactionRolesAdminPanel(guild, interaction.member?.displayName || interaction.user.username));
  } catch (error) {
    const payload = { content: `❌ Reaction Roles setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
