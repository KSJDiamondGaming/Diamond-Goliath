'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require('discord.js');

const guildManager = require('../../../core/guild/guildManager');
const reactionRoles = require('./reactionRoles');
const reactionRolesHealth = require('./reactionRolesHealth');

const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
  .setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));
const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';
const noticeLine = (notice) => notice ? `> ${notice}` : null;

function modeLabel(mode) {
  if (mode === reactionRoles.MODES.ADD) return 'Add only';
  if (mode === reactionRoles.MODES.REMOVE) return 'Remove only';
  return 'Toggle role';
}

function mappingText(mappings, guild) {
  if (!mappings.length) return '> No emoji and role pairs have been added.';
  return mappings.slice(0, 20).map((mapping, index) => {
    const role = guild.roles.cache.get(mapping.roleId);
    return `**${index + 1}. ${mapping.emoji}** → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``}\n└ ${modeLabel(mapping.mode)}`;
  }).join('\n\n');
}

function deploymentSelect(guildId) {
  const panels = reactionRoles.listPanels(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:manage:panel')
    .setPlaceholder(panels.length ? 'Choose a reaction-role panel' : 'No reaction-role panels configured')
    .setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
  menu.addOptions(panels.length ? panels.map((panel) => ({
    label: String(panel.name || panel.panelId).slice(0, 100),
    description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} mapping${panel.mappings.length === 1 ? '' : 's'}`.slice(0, 100),
    value: panel.panelId,
  })) : [{ label: 'Create a panel to begin', value: 'none' }]);
  return menu;
}

function templateSelect(guildId, selectedId) {
  const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:template')
    .setPlaceholder(templates.length ? 'Choose an Embed Studio template' : 'No Reaction Role templates available')
    .setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
  menu.addOptions(templates.length ? templates.map((template) => ({
    label: String(template.name || template.templateId).slice(0, 100),
    description: String(template.embed?.title || 'Reaction Role panel').slice(0, 100),
    value: String(template.templateId),
    default: String(template.templateId) === String(selectedId),
  })) : [{ label: 'Create a Reaction Role template in Embed Studio first', value: 'none' }]);
  return menu;
}

function modeSelect(mode) {
  return new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:mode')
    .setPlaceholder('Choose what the reaction does')
    .addOptions([
      { label: 'Toggle role', description: 'Add on react and remove on unreact', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
      { label: 'Add only', description: 'Add the role and keep it', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
      { label: 'Remove only', description: 'Remove the role when reacted', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
    ]);
}

function removeMappingSelect(draft, guild) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:remove:mapping')
    .setPlaceholder('Choose a mapping to remove')
    .setMinValues(1).setMaxValues(1);
  menu.addOptions(draft.mappings.slice(0, 25).map((mapping) => {
    const role = guild.roles.cache.get(mapping.roleId);
    return {
      label: `${mapping.emoji} → ${role?.name || mapping.roleId}`.slice(0, 100),
      description: modeLabel(mapping.mode),
      value: mapping.mappingId,
    };
  }));
  return menu;
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User', notice = '') {
  const enabled = guildManager.isModuleEnabled(guild.id, reactionRoles.SECTION);
  const health = await reactionRoles.buildHealth(guild);
  const panels = reactionRoles.listPanels(guild.id);
  const mappings = panels.reduce((total, panel) => total + (panel.mappings?.length || 0), 0);
  return {
    embeds: [new EmbedBuilder()
      .setColor(!enabled ? 0x747f8d : health.healthy ? 0x57f287 : 0xfaa61a)
      .setTitle('🎭 Reaction Roles')
      .setDescription([
        noticeLine(notice), notice ? '' : null,
        'Let members assign their own roles by reacting to a message.', '',
        `**Module:** ${enabled ? '🟢 Enabled' : '⏸️ Disabled'}`,
        `**Panels:** \`${panels.length}\``,
        `**Role mappings:** \`${mappings}\``,
        `**Health:** ${health.healthy ? '✅ Healthy' : `⚠️ ${health.unhealthy || 0} panel(s) need attention`}`,
        '',
        enabled
          ? '> Create a panel or manage an existing reaction-role message.'
          : '> Existing panels remain saved, but reactions will not change roles while disabled.',
      ].filter((line) => line !== null).join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` }).setTimestamp()],
    components: [
      row(
        button('admin:reactionRoles:create', '➕ Create Reaction Role', ButtonStyle.Success),
        button('admin:reactionRoles:manage', '⚙️ Manage Panels', ButtonStyle.Primary, !panels.length),
      ),
      row(
        button(enabled ? 'admin:reactionRoles:disable:confirm' : 'admin:reactionRoles:enable',
          enabled ? '⏸️ Disable Module' : '▶️ Enable Module',
          enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        button('admin:reactionRoles:repair', '🩺 Repair All Panels', ButtonStyle.Secondary, !panels.length || !enabled),
      ),
      row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio', ButtonStyle.Secondary)),
    ],
  };
}

function buildDisableConfirmation(guild) {
  const panels = reactionRoles.listPanels(guild.id);
  return {
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⚠️ Disable Reaction Roles?').setDescription([
      'Members will no longer receive or lose roles from reactions.', '',
      `**Saved panels:** \`${panels.length}\``,
      '**What stays:** Panel settings, mappings and Discord messages.',
      '**What stops:** All reaction-role assignments and removals.', '',
      '> You can enable the module again later without recreating the panels.',
    ].join('\n'))],
    components: [row(
      button('admin:reactionRoles:disable:execute', 'Disable Reaction Roles', ButtonStyle.Danger),
      button('admin:reactionRoles', 'Keep Module Enabled', ButtonStyle.Secondary),
    )],
  };
}

function buildDeleteConfirmation(guild, panelId) {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That reaction-role panel no longer exists.');
  return {
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⚠️ Delete Reaction-Role Panel?').setDescription([
      `**Panel:** ${panel.name}`, `**Channel:** <#${panel.channelId}>`, `**Mappings:** \`${panel.mappings.length}\``, '',
      '**This will:**', '• Remove the saved mappings.', '• Remove Goliath’s reactions from the tracked message.', '',
      '**This will not:**', '• Delete the Discord message.', '• Remove roles members already have.', '',
      '> This action cannot be undone automatically.',
    ].join('\n'))],
    components: [row(
      button(`admin:reactionRoles:manage:remove:execute:${panelId}`, 'Delete Panel', ButtonStyle.Danger),
      button(`admin:reactionRoles:manage:view:${panelId}`, 'Cancel', ButtonStyle.Secondary),
    )],
  };
}

function buildCreatePicker() {
  return {
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('➕ Create Reaction Role').setDescription([
      'Choose where the reaction roles should be placed.', '',
      '**Create New Panel**', 'Post a new message using a Reaction Role template from Embed Studio.', '',
      '**Use Existing Message**', 'Attach emoji and role pairs to a message already in the server.',
    ].join('\n'))],
    components: [
      row(
        button('admin:reactionRoles:new:template', '✨ Create New Panel', ButtonStyle.Success),
        button('admin:reactionRoles:new:existing', '🔗 Use Existing Message', ButtonStyle.Primary),
      ),
      row(button('admin:reactionRoles', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildManagePicker(guild, notice = '') {
  const panels = reactionRoles.listPanels(guild.id);
  return {
    embeds: [new EmbedBuilder().setColor(notice ? 0x57f287 : 0x5865f2).setTitle('⚙️ Manage Reaction Roles').setDescription([
      noticeLine(notice), notice ? '' : null,
      panels.length
        ? 'Choose a panel to view its mappings, status and management controls.'
        : 'No reaction-role panels are configured yet.',
    ].filter((line) => line !== null).join('\n'))],
    components: [
      ...(panels.length ? [row(deploymentSelect(guild.id))] : [row(button('admin:reactionRoles:create', '➕ Create First Panel', ButtonStyle.Success))]),
      row(button('admin:reactionRoles', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildExistingMessageStep(guild, userId, notice = '') {
  const draft = reactionRoles.getDraft(guild.id, userId);
  return {
    embeds: [new EmbedBuilder().setColor(draft?.messageId ? 0x57f287 : 0x5865f2)
      .setTitle('🔗 Select Existing Message').setDescription([
        noticeLine(notice), notice ? '' : null,
        'Paste the full Discord message link.', '',
        draft?.messageId ? `**Selected:** <#${draft.channelId}> · \`${draft.messageId}\`` : '> No message selected.',
      ].filter((line) => line !== null).join('\n'))],
    components: [
      row(button('admin:reactionRoles:source:link', draft?.messageId ? '🔄 Change Message' : '🔗 Paste Message Link', ButtonStyle.Primary)),
      row(
        button('admin:reactionRoles:source:continue', 'Continue to Mappings', ButtonStyle.Success, !draft?.messageId),
        button('admin:reactionRoles:wizard:cancel', 'Cancel Setup', ButtonStyle.Secondary),
      ),
    ],
  };
}

function buildWizard(guild, userId, showRemove = false, notice = '') {
  const draft = reactionRoles.getDraft(guild.id, userId);
  if (!draft) throw new Error('Your setup session has expired. Start again.');

  const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
  if (existing && !draft.messageId) {
    return buildExistingMessageStep(guild, userId, notice);
  }

  const sourceReady = existing ? Boolean(draft.messageId) : Boolean(draft.templateId);
  const ready = Boolean(draft.channelId && sourceReady && draft.mappings.length);
  const selectedRole = draft.selectedRoleId
    ? guild.roles.cache.get(draft.selectedRoleId)
    : null;
  const components = [];

  if (!existing) {
    components.push(
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId('admin:reactionRoles:wizard:channel')
          .setPlaceholder(draft.channelId ? 'Change target channel' : '1. Choose target channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1)
      ),
      row(templateSelect(guild.id, draft.templateId))
    );
  } else {
    components.push(
      row(button('admin:reactionRoles:source', '🔄 Change Source', ButtonStyle.Secondary))
    );
  }

  components.push(
    row(
      new RoleSelectMenuBuilder()
        .setCustomId('admin:reactionRoles:wizard:role')
        .setPlaceholder(selectedRole ? `Selected role: ${selectedRole.name}` : '2. Choose a role')
        .setMinValues(1)
        .setMaxValues(1)
    )
  );

  if (showRemove && draft.mappings.length) {
    components.push(row(removeMappingSelect(draft, guild)));
  } else {
    components.push(row(modeSelect(draft.selectedMode)));
  }

  components.push(
    row(
      button('admin:reactionRoles:wizard:emoji', '➕ Add Role', ButtonStyle.Success, !draft.selectedRoleId),
      button('admin:reactionRoles:wizard:remove', '➖ Remove', ButtonStyle.Secondary, !draft.mappings.length),
      button(
        'admin:reactionRoles:wizard:deploy',
        draft.panelId ? '💾 Save' : '🚀 Deploy',
        ButtonStyle.Success,
        !ready
      ),
      button('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [new EmbedBuilder().setColor(notice || ready ? 0x57f287 : 0x5865f2)
      .setTitle(draft.panelId ? '✏️ Edit Reaction Roles' : existing ? '🔗 Attach Reaction Roles' : '✨ Create Reaction Role Panel')
      .setDescription([
        noticeLine(notice), notice ? '' : null,
        `**Source:** ${existing ? `Existing message in <#${draft.channelId}>` : 'New Embed Studio panel'}`,
        !existing ? `**Channel:** ${draft.channelId ? `<#${draft.channelId}>` : 'Not selected'}` : null,
        !existing ? `**Template:** ${draft.templateId ? `\`${draft.templateId}\`` : 'Not selected'}` : null,
        '', `### Mappings (${draft.mappings.length})`, mappingText(draft.mappings, guild), '',
        `**Selected role:** ${selectedRole ? `<@&${selectedRole.id}>` : 'Choose a role above'}`,
        `**Behaviour:** ${modeLabel(draft.selectedMode)}`, '',
        showRemove && draft.mappings.length
          ? '> Choose a mapping above to remove it.'
          : ready
            ? '> Ready to deploy.'
            : '> Complete the selections above and add at least one mapping.',
      ].filter((line) => line !== null).join('\n').slice(0, 4096))],
    components,
  };
}

async function buildManagedPanel(guild, panelId, notice = '') {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That reaction-role panel no longer exists.');
  const health = await reactionRoles.buildHealth(guild);
  const panelHealth = health.panels.find((item) => item.panelId === panelId);
  const healthy = panel.enabled !== false && panelHealth?.healthy !== false;
  return {
    embeds: [new EmbedBuilder().setColor(notice ? 0x57f287 : panel.enabled === false ? 0x747f8d : healthy ? 0x57f287 : 0xed4245)
      .setTitle(`🎭 ${panel.name}`).setDescription([
        noticeLine(notice), notice ? '' : null,
        `**Status:** ${panel.enabled === false ? '⏸️ Disabled' : healthy ? '✅ Healthy' : '⚠️ Needs attention'}`,
        `**Channel:** <#${panel.channelId}>`,
        `**Message:** [Open tracked message](https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId})`,
        `**Mappings:** \`${panel.mappings.length}\``,
        panel.lastError ? `**Last error:** ${panel.lastError}` : null,
        '', '### Emoji and roles', mappingText(panel.mappings, guild),
      ].filter((line) => line !== null).join('\n').slice(0, 4096))],
    components: [
      row(
        button(`admin:reactionRoles:manage:edit:${panelId}`, '✏️ Edit Mappings', ButtonStyle.Primary),
        button(`admin:reactionRoles:manage:repair:${panelId}`, '🔄 Sync & Repair', ButtonStyle.Secondary, panel.enabled === false),
      ),
      row(button(`admin:reactionRoles:manage:${panel.enabled === false ? 'enable' : 'disable'}:${panelId}`,
        panel.enabled === false ? '▶️ Enable Panel' : '⏸️ Disable Panel',
        panel.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary)),
      row(button(`admin:reactionRoles:manage:remove:confirm:${panelId}`, '🗑️ Delete Panel', ButtonStyle.Danger)),
      row(button('admin:reactionRoles:manage', '⬅️ Back to Panels', ButtonStyle.Secondary)),
    ],
  };
}

function modal(customId, title, fields) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(...fields.map((field) =>
    row(new TextInputBuilder().setCustomId(field.id).setLabel(field.label)
      .setPlaceholder(field.placeholder || '').setStyle(TextInputStyle.Short).setRequired(true))));
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function deployDraft(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  if (!draft) throw new Error('Your setup session has expired. Start again.');
  await reactionRolesHealth.assertDeploymentAccess({
    guild, channelId: draft.channelId, mappings: draft.mappings,
    createMessage: draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE,
  });
  let panel;
  if (draft.panelId) panel = await reactionRoles.updatePanelMappings(guild, draft.panelId, draft.mappings, userId);
  else if (draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE) {
    panel = await reactionRoles.createFromTemplate({
      guild, channelId: draft.channelId, templateId: draft.templateId,
      name: draft.name, mappings: draft.mappings, createdBy: userId,
    });
  } else {
    panel = await reactionRoles.attachExistingMessage({
      guild, messageReference: draft.messageId, channelId: draft.channelId,
      name: draft.name, mappings: draft.mappings, createdBy: userId,
    });
  }
  await reactionRolesHealth.ensurePanelReactions(guild, panel);
  return { panel, wasEdit: Boolean(draft.panelId) };
}

async function handleReactionRolesAdminInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;
  const guild = interaction.guild;
  const userId = interaction.user.id;

  try {
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:link:submit') {
      const parsed = reactionRoles.parseMessageReference(interaction.fields.getTextInputValue('messageLink'));
      if (parsed.guildId && parsed.guildId !== guild.id) throw new Error('That message belongs to a different server.');
      const channel = guild.channels.cache.get(parsed.channelId) || await guild.channels.fetch(parsed.channelId).catch(() => null);
      const message = channel?.messages?.fetch ? await channel.messages.fetch(parsed.messageId).catch(() => null) : null;
      if (!message) throw new Error('That message could not be found or Goliath cannot access it.');
      reactionRoles.saveDraft(guild.id, userId, { channelId: parsed.channelId, messageId: parsed.messageId }, guild);
      return interaction.reply({ ...buildExistingMessageStep(guild, userId, '✅ Message selected successfully.'), ephemeral: true });
    }

    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:emoji:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      if (!draft?.selectedRoleId) throw new Error('Choose a role before adding an emoji.');
      reactionRoles.addDraftMapping(guild.id, userId, {
        emoji: interaction.fields.getTextInputValue('emoji'), roleId: draft.selectedRoleId,
        mode: draft.selectedMode, removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE,
      }, guild);
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: null }, guild);
      return interaction.reply({ ...buildWizard(guild, userId, false, '✅ Mapping added. Choose another role or deploy the panel.'), ephemeral: true });
    }

    if (id === 'admin:reactionRoles' || id === 'admin:reactionRoles:open') return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    if (id === 'admin:reactionRoles:create') return respond(interaction, buildCreatePicker());
    if (id === 'admin:reactionRoles:manage') return respond(interaction, buildManagePicker(guild));
    if (id === 'admin:reactionRoles:disable:confirm') return respond(interaction, buildDisableConfirmation(guild));

    if (id === 'admin:reactionRoles:new:existing' || id === 'admin:reactionRoles:new:template') {
      const type = id.endsWith('template') ? reactionRoles.DRAFT_TYPES.TEMPLATE : reactionRoles.DRAFT_TYPES.EXISTING;
      reactionRoles.saveDraft(guild.id, userId, {
        type, panelId: null, channelId: null, messageId: null, templateId: null,
        mappings: [], selectedRoleId: null, selectedMode: reactionRoles.MODES.TOGGLE,
      }, guild);
      return respond(interaction, type === reactionRoles.DRAFT_TYPES.EXISTING ? buildExistingMessageStep(guild, userId) : buildWizard(guild, userId));
    }

    if (id === 'admin:reactionRoles:source') return respond(interaction, buildExistingMessageStep(guild, userId));
    if (id === 'admin:reactionRoles:source:continue') return respond(interaction, buildWizard(guild, userId));

    if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:wizard:channel') {
      reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:wizard:role') {
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:mode') {
      reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:template' && interaction.values[0] !== 'none') {
      reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:remove:mapping') {
      reactionRoles.removeDraftMapping(guild.id, userId, interaction.values[0], guild);
      return respond(interaction, buildWizard(guild, userId, false, '✅ Mapping removed.'));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:manage:panel' && interaction.values[0] !== 'none') {
      return respond(interaction, await buildManagedPanel(guild, interaction.values[0]));
    }

    if (id === 'admin:reactionRoles:source:link') {
      await interaction.showModal(modal(`${id}:submit`, 'Select Discord Message', [{
        id: 'messageLink', label: 'Full Discord message link', placeholder: 'https://discord.com/channels/server/channel/message',
      }]));
      return true;
    }
    if (id === 'admin:reactionRoles:wizard:emoji') {
      await interaction.showModal(modal(`${id}:submit`, 'Add Emoji and Role', [{
        id: 'emoji', label: 'Unicode or custom emoji', placeholder: '⭐ or <:name:id>',
      }]));
      return true;
    }
    if (id === 'admin:reactionRoles:wizard:remove') return respond(interaction, buildWizard(guild, userId, true));
    if (id === 'admin:reactionRoles:wizard:cancel') {
      reactionRoles.clearDraft(guild.id, userId, guild);
      return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction), 'ℹ️ Setup cancelled. No changes were deployed.'));
    }
    if (id === 'admin:reactionRoles:wizard:deploy') {
      await interaction.deferUpdate();
      const { panel, wasEdit } = await deployDraft(guild, userId);
      reactionRoles.clearDraft(guild.id, userId, guild);
      return interaction.editReply(await buildManagedPanel(guild, panel.panelId,
        wasEdit ? '✅ Changes saved and reactions synchronised.' : '✅ Panel deployed and reactions added.'));
    }

    if (id.startsWith('admin:reactionRoles:manage:view:')) return respond(interaction, await buildManagedPanel(guild, id.split(':').pop()));
    if (id.startsWith('admin:reactionRoles:manage:remove:confirm:')) return respond(interaction, buildDeleteConfirmation(guild, id.split(':').pop()));
    if (id.startsWith('admin:reactionRoles:manage:edit:')) {
      const panel = reactionRoles.getPanel(guild.id, id.split(':').pop());
      if (!panel) throw new Error('That reaction-role panel no longer exists.');
      reactionRoles.saveDraft(guild.id, userId, {
        type: panel.source, panelId: panel.panelId, channelId: panel.channelId,
        messageId: panel.messageId, name: panel.name, templateId: panel.templateId,
        mappings: panel.mappings, selectedRoleId: null, selectedMode: reactionRoles.MODES.TOGGLE,
      }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (id.startsWith('admin:reactionRoles:manage:enable:') || id.startsWith('admin:reactionRoles:manage:disable:')) {
      const panelId = id.split(':').pop();
      const enabling = id.includes(':enable:');
      await interaction.deferUpdate();
      const panel = await reactionRoles.setPanelEnabled(guild, panelId, enabling, guild);
      if (panel.enabled !== false) await reactionRolesHealth.ensurePanelReactions(guild, panel);
      return interaction.editReply(await buildManagedPanel(guild, panelId,
        enabling ? '✅ Panel enabled and reactions synchronised.' : '✅ Panel disabled. Its mappings remain saved.'));
    }
    if (id.startsWith('admin:reactionRoles:manage:repair:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      const panel = await reactionRoles.repairPanel(guild, panelId, guild);
      await reactionRolesHealth.ensurePanelReactions(guild, panel);
      return interaction.editReply(await buildManagedPanel(guild, panelId, '✅ Panel checked and repaired successfully.'));
    }
    if (id.startsWith('admin:reactionRoles:manage:remove:execute:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.detachPanel(guild, panelId, { clearReactions: true });
      return interaction.editReply(buildManagePicker(guild, '✅ Panel deleted. The Discord message was left in place.'));
    }

    if (id === 'admin:reactionRoles:enable') {
      guildManager.setModuleEnabled(guild.id, reactionRoles.SECTION, true, { actorId: userId });
      return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction), '✅ Reaction Roles enabled.'));
    }
    if (id === 'admin:reactionRoles:disable:execute') {
      guildManager.setModuleEnabled(guild.id, reactionRoles.SECTION, false, { actorId: userId });
      return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction), '✅ Reaction Roles disabled. Saved panels were preserved.'));
    }
    if (id === 'admin:reactionRoles:repair') {
      await interaction.deferUpdate();
      const result = await reactionRoles.repairAll(guild);
      const notice = result.failed?.length
        ? `⚠️ Repair finished: ${result.repaired.length} repaired, ${result.failed.length} failed.`
        : `✅ Repair finished: ${result.repaired.length} panel${result.repaired.length === 1 ? '' : 's'} synchronised.`;
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction), notice));
    }

    return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
  } catch (error) {
    const payload = { content: `❌ Reaction Roles failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
