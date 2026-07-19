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

const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
  .setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';

function modeLabel(mode) {
  if (mode === reactionRoles.MODES.ADD) return 'Add only';
  if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
  return 'Add + remove on unreact';
}

function templateSelect(guildId, selectedId, customId = 'admin:reactionRoles:wizard:template') {
  const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(templates.length ? 'Optional: choose an Embed Studio template' : 'No Reaction Role templates found')
    .setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
  menu.addOptions(templates.length ? templates.map((template) => ({
    label: String(template.name || template.templateId).slice(0, 100),
    description: String(template.embed?.title || template.module || 'Embed Studio template').slice(0, 100),
    value: String(template.templateId),
    default: String(template.templateId) === String(selectedId),
  })) : [{ label: 'Create one in Embed Studio first', value: 'none' }]);
  return menu;
}

function panelSelect(guildId) {
  const panels = reactionRoles.listPanels(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:manage:panel')
    .setPlaceholder(panels.length ? 'Open a deployment' : 'No deployments yet')
    .setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
  menu.addOptions(panels.length ? panels.map((panel) => ({
    label: String(panel.name || panel.panelId).slice(0, 100),
    description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} mapping(s) • ${panel.source === 'template' ? 'Embed Studio' : 'Existing message'}`.slice(0, 100),
    value: panel.panelId,
  })) : [{ label: 'No deployments available', value: 'none' }]);
  return menu;
}

function modeSelect(mode) {
  return new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:mode')
    .setPlaceholder('Choose what this reaction does')
    .addOptions([
      { label: 'Add + remove on unreact', description: 'Recommended for self-service roles', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
      { label: 'Add only', description: 'Removing the reaction keeps the role', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
      { label: 'Remove role', description: 'Reacting removes the selected role', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
    ]);
}

function mappingText(mappings, guild) {
  if (!mappings.length) return '> No emoji-to-role mappings added yet.';
  return mappings.slice(0, 20).map((mapping, index) => {
    const role = guild.roles.cache.get(mapping.roleId);
    return `**${index + 1}. ${mapping.emoji}**  →  ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``}\n└ ${modeLabel(mapping.mode)}`;
  }).join('\n\n');
}

function mappingRemovalSelect(draft, guild) {
  return new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:remove:select')
    .setPlaceholder('Choose a mapping to remove')
    .setMinValues(1).setMaxValues(1)
    .addOptions(draft.mappings.slice(0, 25).map((mapping, index) => ({
      label: `${mapping.emoji} → ${guild.roles.cache.get(mapping.roleId)?.name || mapping.roleId}`.slice(0, 100),
      description: `${index + 1}. ${modeLabel(mapping.mode)}`.slice(0, 100),
      value: mapping.mappingId,
    })));
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealth(guild);
  const panels = reactionRoles.listPanels(guild.id);
  const mappings = panels.reduce((count, panel) => count + panel.mappings.length, 0);
  const drafts = Object.keys(config.drafts || {}).length;
  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
    .setTitle('🎭 Reaction Roles Studio')
    .setDescription([
      `### ${config.enabled !== false ? '🟢 Online' : '⏸️ Disabled'}  •  ${health.healthy ? 'All systems healthy' : 'Attention required'}`,
      '',
      `**Deployments**  \`${panels.length}\`     **Mappings**  \`${mappings}\`     **Drafts**  \`${drafts}\``,
      `**Assigned**  \`${config.analytics.assigned || 0}\`     **Removed**  \`${config.analytics.removed || 0}\`     **Failed**  \`${config.analytics.failed || 0}\``,
      '',
      '**Create a new role panel or upgrade any existing Discord message.**',
      'Your original message content and unrelated reactions are preserved.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return { embeds: [embed], components: [
    row(
      btn('admin:reactionRoles:new:existing', '🔗 Attach Existing Message', ButtonStyle.Primary),
      btn('admin:reactionRoles:new:template', '🎨 Create New Panel', ButtonStyle.Success),
      btn('admin:reactionRoles:continue', drafts ? '▶️ Resume Draft' : '▶️ Start Setup', ButtonStyle.Secondary)
    ),
    row(panelSelect(guild.id)),
    row(
      btn(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? '⏸️ Disable Module' : '▶️ Enable Module'),
      btn('admin:reactionRoles:repair', '🩺 Health & Repair', ButtonStyle.Primary),
      btn('admin:reactionRoles:export', '📤 Export'),
      btn('admin:modules', '⬅️ Modules')
    ),
  ] };
}

function buildWizard(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
  const template = draft.templateId ? reactionRoles.getReactionTemplate(guild.id, draft.templateId) : null;
  const role = draft.selectedRoleId ? guild.roles.cache.get(draft.selectedRoleId) : null;
  const hasTarget = Boolean(draft.channelId && (existing ? draft.messageId : draft.templateId));
  const ready = Boolean(hasTarget && draft.mappings.length);
  const addInstruction = role
    ? `Ready for the emoji that maps to ${role}. Press **Add Emoji Mapping**.`
    : draft.mappings.length
      ? 'To add another mapping, choose the next role below, choose its behaviour, then press **Add Emoji Mapping**.'
      : 'Choose the first role below, choose its behaviour, then press **Add Emoji Mapping**.';

  const targetLines = existing
    ? [
        `**Channel:** ${draft.channelId ? `<#${draft.channelId}>` : '❌ Not selected'}`,
        `**Message:** ${draft.messageId ? `\`${draft.messageId}\`` : '❌ Not entered'}`,
        `**Content:** ${draft.applyTemplate ? 'Replace with selected template ⚠️' : 'Preserve original message ✅'}`,
      ]
    : [
        `**Channel:** ${draft.channelId ? `<#${draft.channelId}>` : '❌ Not selected'}`,
        `**Template:** ${template ? `\`${template.name}\`` : '❌ Not selected'}`,
      ];

  const embed = new EmbedBuilder()
    .setColor(ready ? 0x57f287 : 0x5865f2)
    .setTitle(existing ? '🔗 Attach Roles to an Existing Message' : '🎨 Create a Reaction Role Panel')
    .setDescription([
      'Your progress is saved automatically.',
      '',
      '### 1️⃣ Choose the message',
      ...targetLines,
      '',
      '### 2️⃣ Build emoji-to-role mappings',
      mappingText(draft.mappings, guild),
      '',
      `**Next role:** ${role ? `<@&${role.id}>` : 'Not selected'}`,
      `**Next behaviour:** ${modeLabel(draft.selectedMode)}`,
      `> ${addInstruction}`,
      '',
      '### 3️⃣ Deploy',
      ready ? `✅ Ready with **${draft.mappings.length} mapping${draft.mappings.length === 1 ? '' : 's'}**.` : 'Complete the missing message and mapping selections above.',
    ].join('\n').slice(0, 4096));

  const addButtonLabel = role ? '➕ Add Emoji Mapping' : draft.mappings.length ? '1️⃣ Select Next Role Above' : '1️⃣ Select a Role Above';

  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:wizard:channel')
      .setPlaceholder(draft.channelId ? 'Change target channel' : '1. Choose target channel')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1).setMaxValues(1)),
    row(existing
      ? templateSelect(guild.id, draft.templateId)
      : templateSelect(guild.id, draft.templateId)),
    row(new RoleSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:wizard:role')
      .setPlaceholder(role ? `Next role: ${role.name}` : draft.mappings.length ? '2. Choose another role' : '2. Choose the first role')
      .setMinValues(1).setMaxValues(1)),
    row(modeSelect(draft.selectedMode)),
    row(
      existing ? btn('admin:reactionRoles:wizard:message', draft.messageId ? '✏️ Change Message' : '📝 Enter Message ID', ButtonStyle.Primary) : null,
      btn('admin:reactionRoles:wizard:emoji', addButtonLabel, ButtonStyle.Success, !draft.selectedRoleId),
      draft.mappings.length ? btn('admin:reactionRoles:wizard:remove', `➖ Remove Mapping (${draft.mappings.length})`) : null
    ),
    row(
      existing ? btn('admin:reactionRoles:wizard:applyTemplate', draft.applyTemplate ? '⚠️ Replacing Content' : '🛡️ Preserving Content', draft.applyTemplate ? ButtonStyle.Danger : ButtonStyle.Secondary) : null,
      btn('admin:reactionRoles:wizard:deploy', draft.panelId ? '💾 Save & Sync' : existing ? `🔗 Attach ${draft.mappings.length || ''} Mapping${draft.mappings.length === 1 ? '' : 's'}` : `🚀 Create Panel`, ButtonStyle.Success, !ready),
      btn('admin:reactionRoles:wizard:cancel', '✖ Cancel', ButtonStyle.Danger)
    ),
  ] };
}

function buildMappingRemoval(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  if (!draft?.mappings?.length) return buildWizard(guild, userId);
  const embed = new EmbedBuilder().setColor(0xfaa61a).setTitle('➖ Remove a Mapping')
    .setDescription(['Choose one mapping to remove.', '', mappingText(draft.mappings, guild), '', 'Your remaining setup stays saved.'].join('\n').slice(0, 4096));
  return { embeds: [embed], components: [
    row(mappingRemovalSelect(draft, guild)),
    row(btn('admin:reactionRoles:wizard:remove:back', '⬅️ Back to Builder', ButtonStyle.Primary), btn('admin:reactionRoles:wizard:cancel', '✖ Cancel Setup', ButtonStyle.Danger)),
  ] };
}

async function buildManagedPanel(guild, panelId) {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That deployment no longer exists.');
  const health = await reactionRoles.buildHealth(guild);
  const panelHealth = health.panels.find((item) => item.panelId === panelId);
  const template = panel.templateId ? reactionRoles.getReactionTemplate(guild.id, panel.templateId) : null;
  const messageUrl = `https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId}`;
  const embed = new EmbedBuilder()
    .setColor(panel.enabled === false ? 0x747f8d : panelHealth?.healthy === false ? 0xed4245 : 0x57f287)
    .setTitle(`🎭 ${panel.name}`)
    .setDescription([
      `### ${panel.enabled === false ? '⏸️ Disabled' : panelHealth?.healthy === false ? '🔴 Needs attention' : '🟢 Healthy'}`,
      `**Source:** ${panel.source === 'template' ? 'Goliath-created panel' : 'Existing Discord message'}`,
      `**Channel:** <#${panel.channelId}>`,
      `**Message:** [Open in Discord](${messageUrl})`,
      `**Template:** ${template ? `\`${template.name}\`` : '`None`'}`,
      panelHealth?.issues?.length ? `\n**Issues**\n${panelHealth.issues.map((issue) => `• ${issue}`).join('\n')}` : '',
      '',
      `### Mappings (${panel.mappings.length})`,
      mappingText(panel.mappings, guild),
    ].filter(Boolean).join('\n').slice(0, 4096));

  return { embeds: [embed], components: [
    row(templateSelect(guild.id, panel.templateId, `admin:reactionRoles:manage:template:${panelId}`)),
    row(
      btn(`admin:reactionRoles:manage:edit:${panelId}`, '✏️ Edit Mappings', ButtonStyle.Primary),
      btn(`admin:reactionRoles:manage:${panel.enabled === false ? 'enable' : 'disable'}:${panelId}`, panel.enabled === false ? '▶️ Enable' : '⏸️ Disable', panel.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
      btn(`admin:reactionRoles:manage:repair:${panelId}`, '🩺 Repair'),
      btn(`admin:reactionRoles:manage:redeploy:${panelId}`, '🔄 Redeploy Template', ButtonStyle.Primary, !panel.templateId || panel.enabled === false),
      btn(`admin:reactionRoles:manage:remove:${panelId}`, '🗑️ Remove', ButtonStyle.Danger)
    ),
    row(btn('admin:reactionRoles', '⬅️ Back to Studio')),
  ] };
}

function buildRemovalChoices(guild, panelId) {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That deployment no longer exists.');
  const canDelete = panel.source === reactionRoles.DRAFT_TYPES.TEMPLATE;
  const embed = new EmbedBuilder().setColor(0xed4245).setTitle(`🗑️ Remove ${panel.name}`).setDescription([
    'Choose exactly what Goliath should remove:', '',
    '**Detach Only** — stop tracking and leave the message unchanged.',
    '**Clear + Detach** — remove Goliath’s configured reactions, then stop tracking.',
    canDelete ? '**Delete Message** — permanently delete the Goliath-created message.' : '**Delete Message** is unavailable for an existing Discord message.',
    '', 'This action cannot be undone.',
  ].join('\n'));
  return { embeds: [embed], components: [
    row(
      btn(`admin:reactionRoles:remove:detach:${panelId}`, '🔗 Detach Only'),
      btn(`admin:reactionRoles:remove:clear:${panelId}`, '🧹 Clear + Detach', ButtonStyle.Danger),
      btn(`admin:reactionRoles:remove:delete:${panelId}`, '🗑️ Delete Message', ButtonStyle.Danger, !canDelete)
    ),
    row(btn(`admin:reactionRoles:remove:cancel:${panelId}`, '⬅️ Cancel', ButtonStyle.Primary)),
  ] };
}

function oneFieldModal(customId, title, fieldId, label, placeholder, value = '') {
  const input = new TextInputBuilder().setCustomId(fieldId).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short).setRequired(true);
  if (value) input.setValue(String(value));
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(row(input));
}

async function show(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function handleReactionRolesAdminInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;
  const guild = interaction.guild;
  const userId = interaction.user.id;
  try {
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:message:submit') {
      const parsed = reactionRoles.parseMessageReference(interaction.fields.getTextInputValue('messageReference'), reactionRoles.getDraft(guild.id, userId).channelId);
      reactionRoles.saveDraft(guild.id, userId, { channelId: parsed.channelId, messageId: parsed.messageId }, guild);
      return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
    }
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:emoji:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      reactionRoles.addDraftMapping(guild.id, userId, {
        emoji: interaction.fields.getTextInputValue('emoji'), roleId: draft.selectedRoleId,
        mode: draft.selectedMode, removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE,
      }, guild);
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: null }, guild);
      return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
    }
    if (id === 'admin:reactionRoles') return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    if (id === 'admin:reactionRoles:new:existing' || id === 'admin:reactionRoles:new:template') {
      const type = id.endsWith('template') ? reactionRoles.DRAFT_TYPES.TEMPLATE : reactionRoles.DRAFT_TYPES.EXISTING;
      reactionRoles.saveDraft(guild.id, userId, { type, panelId: null, messageId: null, mappings: [], selectedRoleId: null, applyTemplate: type === reactionRoles.DRAFT_TYPES.TEMPLATE }, guild);
      return show(interaction, buildWizard(guild, userId));
    }
    if (id === 'admin:reactionRoles:continue') return show(interaction, buildWizard(guild, userId));

    if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:wizard:channel') reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
    else if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:wizard:role') reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:mode') reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:template' && interaction.values[0] !== 'none') reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:remove:select') {
      reactionRoles.removeDraftMapping(guild.id, userId, interaction.values[0], guild);
      return show(interaction, reactionRoles.getDraft(guild.id, userId).mappings.length ? buildMappingRemoval(guild, userId) : buildWizard(guild, userId));
    } else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:manage:panel') return show(interaction, await buildManagedPanel(guild, interaction.values[0]));
    else if (interaction.isStringSelectMenu?.() && id.startsWith('admin:reactionRoles:manage:template:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.applyTemplateToPanel(guild, panelId, interaction.values[0]);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    } else if (interaction.isAnySelectMenu?.()) return show(interaction, buildWizard(guild, userId));

    if (id === 'admin:reactionRoles:wizard:message') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      await interaction.showModal(oneFieldModal('admin:reactionRoles:wizard:message:submit', 'Message to Attach', 'messageReference', 'Message ID or Discord link', 'Paste a message link or message ID', draft.messageId || ''));
      return true;
    }
    if (id === 'admin:reactionRoles:wizard:emoji') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      if (!draft.selectedRoleId) return interaction.reply({ content: 'Choose a role first, then press **Add Emoji Mapping**.', ephemeral: true });
      await interaction.showModal(oneFieldModal('admin:reactionRoles:wizard:emoji:submit', 'Add Emoji Mapping', 'emoji', 'Unicode or custom emoji', '⭐ or <:name:emoji_id>'));
      return true;
    }
    if (id === 'admin:reactionRoles:wizard:remove') return show(interaction, buildMappingRemoval(guild, userId));
    if (id === 'admin:reactionRoles:wizard:remove:back') return show(interaction, buildWizard(guild, userId));
    if (id === 'admin:reactionRoles:wizard:applyTemplate') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      reactionRoles.saveDraft(guild.id, userId, { applyTemplate: !draft.applyTemplate }, guild);
      return show(interaction, buildWizard(guild, userId));
    }
    if (id === 'admin:reactionRoles:wizard:cancel') {
      reactionRoles.clearDraft(guild.id, userId, guild);
      return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    }
    if (id === 'admin:reactionRoles:wizard:deploy') {
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

    if (id.startsWith('admin:reactionRoles:manage:edit:')) {
      const panel = reactionRoles.getPanel(guild.id, id.split(':').pop());
      if (!panel) throw new Error('That deployment no longer exists.');
      reactionRoles.saveDraft(guild.id, userId, { type: panel.source, panelId: panel.panelId, channelId: panel.channelId, messageId: panel.messageId, name: panel.name, templateId: panel.templateId, mappings: panel.mappings, selectedRoleId: null, applyTemplate: false }, guild);
      return show(interaction, buildWizard(guild, userId));
    }
    if (id.startsWith('admin:reactionRoles:manage:enable:') || id.startsWith('admin:reactionRoles:manage:disable:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.setPanelEnabled(guild, panelId, id.includes(':enable:'), guild);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (id.startsWith('admin:reactionRoles:manage:repair:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.repairPanel(guild, panelId, guild);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (id.startsWith('admin:reactionRoles:manage:redeploy:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.redeployPanel(guild, panelId, guild);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (id.startsWith('admin:reactionRoles:manage:remove:')) return show(interaction, buildRemovalChoices(guild, id.split(':').pop()));
    if (id.startsWith('admin:reactionRoles:remove:cancel:')) return show(interaction, await buildManagedPanel(guild, id.split(':').pop()));
    if (id.startsWith('admin:reactionRoles:remove:detach:') || id.startsWith('admin:reactionRoles:remove:clear:')) {
      await interaction.deferUpdate();
      await reactionRoles.detachPanel(guild, id.split(':').pop(), { clearReactions: id.includes(':clear:') });
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    }
    if (id.startsWith('admin:reactionRoles:remove:delete:')) {
      await interaction.deferUpdate();
      await reactionRoles.deleteDeploymentMessage(guild, id.split(':').pop(), guild);
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    }

    if (id === 'admin:reactionRoles:enable') reactionRoles.setEnabled(guild.id, true, guild);
    if (id === 'admin:reactionRoles:disable') reactionRoles.setEnabled(guild.id, false, guild);
    if (id === 'admin:reactionRoles:repair') {
      await interaction.deferUpdate();
      await reactionRoles.repairAll(guild);
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    }
    if (id === 'admin:reactionRoles:export') {
      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(reactionRoles.exportConfiguration(guild.id), null, 2), 'utf8'), { name: `goliath-reaction-roles-${guild.id}.json` });
      await interaction.reply({ content: '📤 Reaction Roles configuration export.', files: [file], ephemeral: true });
      return true;
    }
    return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
  } catch (error) {
    const payload = { content: `❌ Reaction Roles setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
