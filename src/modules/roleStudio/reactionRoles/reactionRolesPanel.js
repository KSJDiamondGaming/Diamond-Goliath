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
const reactionRolesHealth = require('./reactionRolesHealth');
const messageFinder = require('./reactionRoleMessageFinder');

const sessions = new Map();
const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
  .setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));
const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';
const sessionKey = (guildId, userId) => `${guildId}:${userId}`;
const getSession = (guildId, userId) => sessions.get(sessionKey(guildId, userId)) || { messages: [], query: '' };
const saveSession = (guildId, userId, patch) => sessions.set(sessionKey(guildId, userId), { ...getSession(guildId, userId), ...patch });
const clearSession = (guildId, userId) => sessions.delete(sessionKey(guildId, userId));

function modeLabel(mode) {
  if (mode === reactionRoles.MODES.ADD) return 'Add only';
  if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
  return 'Add and remove on unreact';
}

function mappingText(mappings, guild) {
  if (!mappings.length) return '> No emoji-to-role mappings added yet.';
  return mappings.slice(0, 20).map((mapping, index) => {
    const role = guild.roles.cache.get(mapping.roleId);
    return `**${index + 1}. ${mapping.emoji}** → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``}\n└ ${modeLabel(mapping.mode)}`;
  }).join('\n\n');
}

function deploymentSelect(guildId) {
  const panels = reactionRoles.listPanels(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:manage:panel')
    .setPlaceholder(panels.length ? 'Manage a deployment' : 'No deployments yet')
    .setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
  menu.addOptions(panels.length ? panels.map((panel) => ({
    label: String(panel.name || panel.panelId).slice(0, 100),
    description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} mapping(s) • ${panel.source === 'template' ? 'Goliath panel' : 'Existing message'}`.slice(0, 100),
    value: panel.panelId,
  })) : [{ label: 'Create or attach a panel to begin', value: 'none' }]);
  return menu;
}

function templateSelect(guildId, selectedId) {
  const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:reactionRoles:wizard:template')
    .setPlaceholder(templates.length ? 'Choose an Embed Studio template' : 'No Reaction Role templates found')
    .setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
  menu.addOptions(templates.length ? templates.map((template) => ({
    label: String(template.name || template.templateId).slice(0, 100),
    description: String(template.embed?.title || template.module || 'Embed Studio template').slice(0, 100),
    value: String(template.templateId),
    default: String(template.templateId) === String(selectedId),
  })) : [{ label: 'Create one in Embed Studio first', value: 'none' }]);
  return menu;
}

function modeSelect(mode) {
  return new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:mode').setPlaceholder('Choose reaction behaviour').addOptions([
    { label: 'Add and remove on unreact', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
    { label: 'Add only', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
    { label: 'Remove role', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
  ]);
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealth(guild);
  const panels = reactionRoles.listPanels(guild.id);
  const mappings = panels.reduce((total, panel) => total + (panel.mappings?.length || 0), 0);
  const drafts = Object.keys(config.drafts || {}).length;
  return {
    embeds: [new EmbedBuilder()
      .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
      .setTitle('🎭 Reaction Roles')
      .setDescription('Create and manage self-service role panels from one workspace.')
      .addFields(
        { name: 'Status', value: config.enabled !== false ? '🟢 Enabled' : '⏸️ Disabled', inline: true },
        { name: 'Health', value: health.healthy ? 'Healthy' : `${health.unhealthy || 0} need attention`, inline: true },
        { name: 'Deployments', value: String(panels.length), inline: true },
        { name: 'Mappings', value: String(mappings), inline: true },
        { name: 'Drafts', value: String(drafts), inline: true },
        { name: 'Assignments', value: `${config.analytics.assigned || 0} added • ${config.analytics.removed || 0} removed`, inline: true },
      )
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:reactionRoles:new:existing', 'Attach Existing Message', ButtonStyle.Primary),
        button('admin:reactionRoles:new:template', 'Create New Panel', ButtonStyle.Success),
        button('admin:reactionRoles:continue', drafts ? 'Resume Draft' : 'Start Setup')
      ),
      row(deploymentSelect(guild.id)),
      row(button('admin:reactionRoles:admin', 'Admin Centre', ButtonStyle.Primary), button('admin:modules', 'Back to Modules')),
    ],
  };
}

async function buildAdminCentre(guild) {
  const config = reactionRoles.getSection(guild.id);
  const health = await reactionRoles.buildHealth(guild);
  return {
    embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57f287 : 0xfaa61a).setTitle('🛡️ Reaction Roles Admin Centre').addFields(
      { name: 'Module', value: config.enabled !== false ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Active', value: String(health.active || 0), inline: true },
      { name: 'Unhealthy', value: String(health.unhealthy || 0), inline: true },
      { name: 'Assigned', value: String(config.analytics.assigned || 0), inline: true },
      { name: 'Removed', value: String(config.analytics.removed || 0), inline: true },
      { name: 'Failed', value: String(config.analytics.failed || 0), inline: true },
    )],
    components: [
      row(
        button(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? 'Disable Module' : 'Enable Module', config.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success),
        button('admin:reactionRoles:repair', 'Repair All', ButtonStyle.Primary),
        button('admin:reactionRoles:export', 'Export')
      ),
      row(button('admin:reactionRoles', 'Back to Reaction Roles', ButtonStyle.Primary)),
    ],
  };
}

function buildSourcePicker(guild, userId, notice = '') {
  const draft = reactionRoles.getDraft(guild.id, userId);
  const session = getSession(guild.id, userId);
  const selected = draft?.messageId ? `Selected: <#${draft.channelId}> / \`${draft.messageId}\`` : 'No message selected.';
  const components = [
    row(new ChannelSelectMenuBuilder().setCustomId('admin:reactionRoles:source:channel').setPlaceholder('Choose a channel or thread').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread).setMinValues(1).setMaxValues(1)),
  ];
  if (session.messages.length) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:source:message').setPlaceholder('Choose the exact message').setMinValues(1).setMaxValues(1);
    menu.addOptions(session.messages.slice(0, 25).map((message) => ({
      label: String(message.embedTitle || message.content || `${message.authorName || 'Unknown'} message`).replace(/\s+/g, ' ').slice(0, 100),
      description: `${message.authorName || 'Unknown'} • ${new Date(message.createdAt).toLocaleString()}`.slice(0, 100),
      value: `${message.channelId}:${message.id}`,
    })));
    components.push(row(menu));
  }
  components.push(row(
    button('admin:reactionRoles:source:browse', 'Load Recent', ButtonStyle.Primary, !draft?.channelId),
    button('admin:reactionRoles:source:search', 'Search Messages', ButtonStyle.Secondary, !draft?.channelId),
    button('admin:reactionRoles:source:link', 'Paste Link'),
    button('admin:reactionRoles:source:ids', 'Enter IDs')
  ));
  components.push(row(button('admin:reactionRoles:source:continue', 'Continue to Roles', ButtonStyle.Success, !draft?.messageId), button('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger)));
  return {
    embeds: [new EmbedBuilder().setColor(draft?.messageId ? 0x57f287 : 0x5865f2).setTitle('🔎 Select an Existing Message').setDescription([selected, notice, session.query ? `Search: \`${session.query}\`` : ''].filter(Boolean).join('\n'))],
    components,
  };
}

function buildWizard(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
  if (existing && !draft.messageId) return buildSourcePicker(guild, userId);
  const ready = Boolean(draft.channelId && (existing ? draft.messageId : draft.templateId) && draft.mappings.length);
  const role = draft.selectedRoleId ? guild.roles.cache.get(draft.selectedRoleId) : null;
  const components = [];
  if (!existing) components.push(
    row(new ChannelSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:channel').setPlaceholder('Choose target channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)),
    row(templateSelect(guild.id, draft.templateId))
  );
  else components.push(row(button('admin:reactionRoles:source', 'Change Message')));
  components.push(
    row(new RoleSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:role').setPlaceholder(role ? `Next role: ${role.name}` : 'Choose a role').setMinValues(1).setMaxValues(1)),
    row(modeSelect(draft.selectedMode)),
    row(
      button('admin:reactionRoles:wizard:emoji', 'Add Emoji', ButtonStyle.Success, !draft.selectedRoleId),
      draft.mappings.length ? button('admin:reactionRoles:wizard:remove', `Remove Mapping (${draft.mappings.length})`) : null,
      button('admin:reactionRoles:wizard:deploy', draft.panelId ? 'Save and Sync' : existing ? 'Attach Roles' : 'Create Panel', ButtonStyle.Success, !ready),
      button('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger)
    )
  );
  return {
    embeds: [new EmbedBuilder().setColor(ready ? 0x57f287 : 0x5865f2).setTitle(existing ? '🔗 Attach Reaction Roles' : '🎨 Create Reaction Role Panel').setDescription([
      existing ? `Target: <#${draft.channelId}> / \`${draft.messageId}\`` : `Channel: ${draft.channelId ? `<#${draft.channelId}>` : 'Not selected'}\nTemplate: ${draft.templateId || 'Not selected'}`,
      '', '### Mappings', mappingText(draft.mappings, guild), '', `Next role: ${role ? `<@&${role.id}>` : 'Not selected'}`, `Behaviour: ${modeLabel(draft.selectedMode)}`,
    ].join('\n').slice(0, 4096))],
    components,
  };
}

async function buildManagedPanel(guild, panelId) {
  const panel = reactionRoles.getPanel(guild.id, panelId);
  if (!panel) throw new Error('That deployment no longer exists.');
  const health = await reactionRoles.buildHealth(guild);
  const panelHealth = health.panels.find((item) => item.panelId === panelId);
  return {
    embeds: [new EmbedBuilder().setColor(panel.enabled === false ? 0x747f8d : panelHealth?.healthy === false ? 0xed4245 : 0x57f287).setTitle(`🎭 ${panel.name}`).setDescription([
      `Status: ${panel.enabled === false ? 'Disabled' : panelHealth?.healthy === false ? 'Needs attention' : 'Healthy'}`,
      `Channel: <#${panel.channelId}>`,
      `[Open message](https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId})`,
      '', `### Mappings (${panel.mappings.length})`, mappingText(panel.mappings, guild),
    ].join('\n').slice(0, 4096))],
    components: [
      row(
        button(`admin:reactionRoles:manage:edit:${panelId}`, 'Edit Mappings', ButtonStyle.Primary),
        button(`admin:reactionRoles:manage:${panel.enabled === false ? 'enable' : 'disable'}:${panelId}`, panel.enabled === false ? 'Enable' : 'Disable'),
        button(`admin:reactionRoles:manage:repair:${panelId}`, 'Repair'),
        button(`admin:reactionRoles:manage:remove:${panelId}`, 'Remove', ButtonStyle.Danger)
      ),
      row(button('admin:reactionRoles', 'Back to Reaction Roles')),
    ],
  };
}

function modal(customId, title, fields) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(...fields.map((field) => row(new TextInputBuilder()
    .setCustomId(field.id).setLabel(field.label).setPlaceholder(field.placeholder || '').setStyle(TextInputStyle.Short).setRequired(true))));
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function verifyMessage(guild, userId, channelId, messageId) {
  const result = await messageFinder.searchGuildMessages(guild, { channelId, messageId, resultLimit: 1 });
  const message = result.messages?.[0];
  if (!message) throw new Error('That message could not be found or Goliath cannot access it.');
  reactionRoles.saveDraft(guild.id, userId, { channelId: message.channelId, messageId: message.id }, guild);
  saveSession(guild.id, userId, { messages: [message] });
}

async function deployDraft(guild, userId) {
  const draft = reactionRoles.getDraft(guild.id, userId);
  await reactionRolesHealth.assertDeploymentAccess({ guild, channelId: draft.channelId, mappings: draft.mappings, createMessage: draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE });
  let panel;
  if (draft.panelId) panel = await reactionRoles.updatePanelMappings(guild, draft.panelId, draft.mappings, userId);
  else if (draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE) panel = await reactionRoles.createFromTemplate({ guild, channelId: draft.channelId, templateId: draft.templateId, name: draft.name, mappings: draft.mappings, createdBy: userId });
  else panel = await reactionRoles.attachExistingMessage({ guild, messageReference: draft.messageId, channelId: draft.channelId, name: draft.name, mappings: draft.mappings, createdBy: userId });
  await reactionRolesHealth.ensurePanelReactions(guild, panel);
  return panel;
}

async function handleReactionRolesAdminInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;
  const guild = interaction.guild;
  const userId = interaction.user.id;
  try {
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:link:submit') {
      const parsed = reactionRoles.parseMessageReference(interaction.fields.getTextInputValue('messageLink'));
      await verifyMessage(guild, userId, parsed.channelId, parsed.messageId);
      return interaction.reply({ ...buildSourcePicker(guild, userId, '✅ Message verified.'), ephemeral: true });
    }
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:ids:submit') {
      await verifyMessage(guild, userId, interaction.fields.getTextInputValue('channelId'), interaction.fields.getTextInputValue('messageId'));
      return interaction.reply({ ...buildSourcePicker(guild, userId, '✅ Message verified.'), ephemeral: true });
    }
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:search:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const query = interaction.fields.getTextInputValue('query');
      const result = await messageFinder.searchGuildMessages(guild, { channelId: draft.channelId, query, scanLimit: 500, resultLimit: 25 });
      saveSession(guild.id, userId, { messages: result.messages || [], query });
      return interaction.reply({ ...buildSourcePicker(guild, userId, `${result.messages?.length || 0} result(s).`), ephemeral: true });
    }
    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:emoji:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      reactionRoles.addDraftMapping(guild.id, userId, { emoji: interaction.fields.getTextInputValue('emoji'), roleId: draft.selectedRoleId, mode: draft.selectedMode, removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE }, guild);
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: null }, guild);
      return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
    }

    if (id === 'admin:reactionRoles') return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    if (id === 'admin:reactionRoles:admin') return respond(interaction, await buildAdminCentre(guild));
    if (id === 'admin:reactionRoles:new:existing' || id === 'admin:reactionRoles:new:template') {
      const type = id.endsWith('template') ? reactionRoles.DRAFT_TYPES.TEMPLATE : reactionRoles.DRAFT_TYPES.EXISTING;
      reactionRoles.saveDraft(guild.id, userId, { type, panelId: null, channelId: null, messageId: null, templateId: null, mappings: [], selectedRoleId: null }, guild);
      clearSession(guild.id, userId);
      return respond(interaction, type === reactionRoles.DRAFT_TYPES.EXISTING ? buildSourcePicker(guild, userId) : buildWizard(guild, userId));
    }
    if (id === 'admin:reactionRoles:continue') return respond(interaction, buildWizard(guild, userId));
    if (id === 'admin:reactionRoles:source') return respond(interaction, buildSourcePicker(guild, userId));

    if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:source:channel') {
      reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0], messageId: null }, guild);
      clearSession(guild.id, userId);
      return respond(interaction, buildSourcePicker(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:source:message') {
      const [channelId, messageId] = String(interaction.values[0]).split(':');
      await verifyMessage(guild, userId, channelId, messageId);
      return respond(interaction, buildSourcePicker(guild, userId, '✅ Message selected.'));
    }
    if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:wizard:channel') reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
    else if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:wizard:role') reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:mode') reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:template' && interaction.values[0] !== 'none') reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
    else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:manage:panel') return respond(interaction, await buildManagedPanel(guild, interaction.values[0]));
    else if (interaction.isAnySelectMenu?.()) return respond(interaction, buildWizard(guild, userId));

    if (id === 'admin:reactionRoles:source:browse') {
      await interaction.deferUpdate();
      const draft = reactionRoles.getDraft(guild.id, userId);
      const result = await messageFinder.searchGuildMessages(guild, { channelId: draft.channelId, scanLimit: 100, resultLimit: 25 });
      saveSession(guild.id, userId, { messages: result.messages || [], query: '' });
      return interaction.editReply(buildSourcePicker(guild, userId, `${result.messages?.length || 0} recent message(s).`));
    }
    if (id === 'admin:reactionRoles:source:search') { await interaction.showModal(modal(id + ':submit', 'Search Messages', [{ id: 'query', label: 'Text or embed content', placeholder: 'Search query' }])); return true; }
    if (id === 'admin:reactionRoles:source:link') { await interaction.showModal(modal(id + ':submit', 'Paste Message Link', [{ id: 'messageLink', label: 'Discord message link', placeholder: 'https://discord.com/channels/...' }])); return true; }
    if (id === 'admin:reactionRoles:source:ids') { await interaction.showModal(modal(id + ':submit', 'Enter Message IDs', [{ id: 'channelId', label: 'Channel or thread ID' }, { id: 'messageId', label: 'Message ID' }])); return true; }
    if (id === 'admin:reactionRoles:source:continue') return respond(interaction, buildWizard(guild, userId));
    if (id === 'admin:reactionRoles:wizard:emoji') { await interaction.showModal(modal(id + ':submit', 'Add Emoji Mapping', [{ id: 'emoji', label: 'Unicode or custom emoji', placeholder: '⭐ or <:name:id>' }])); return true; }
    if (id === 'admin:reactionRoles:wizard:cancel') { reactionRoles.clearDraft(guild.id, userId, guild); clearSession(guild.id, userId); return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction))); }
    if (id === 'admin:reactionRoles:wizard:deploy') {
      await interaction.deferUpdate();
      const panel = await deployDraft(guild, userId);
      reactionRoles.clearDraft(guild.id, userId, guild);
      clearSession(guild.id, userId);
      return interaction.editReply(await buildManagedPanel(guild, panel.panelId));
    }

    if (id.startsWith('admin:reactionRoles:manage:edit:')) {
      const panel = reactionRoles.getPanel(guild.id, id.split(':').pop());
      reactionRoles.saveDraft(guild.id, userId, { type: panel.source, panelId: panel.panelId, channelId: panel.channelId, messageId: panel.messageId, name: panel.name, templateId: panel.templateId, mappings: panel.mappings, selectedRoleId: null }, guild);
      return respond(interaction, buildWizard(guild, userId));
    }
    if (id.startsWith('admin:reactionRoles:manage:enable:') || id.startsWith('admin:reactionRoles:manage:disable:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      const panel = await reactionRoles.setPanelEnabled(guild, panelId, id.includes(':enable:'), guild);
      if (panel.enabled !== false) await reactionRolesHealth.ensurePanelReactions(guild, panel);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (id.startsWith('admin:reactionRoles:manage:repair:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      const panel = await reactionRoles.repairPanel(guild, panelId, guild);
      await reactionRolesHealth.ensurePanelReactions(guild, panel);
      return interaction.editReply(await buildManagedPanel(guild, panelId));
    }
    if (id.startsWith('admin:reactionRoles:manage:remove:')) {
      const panelId = id.split(':').pop();
      await interaction.deferUpdate();
      await reactionRoles.detachPanel(guild, panelId, { clearReactions: true });
      return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    }

    if (id === 'admin:reactionRoles:enable') reactionRoles.setEnabled(guild.id, true, guild);
    if (id === 'admin:reactionRoles:disable') reactionRoles.setEnabled(guild.id, false, guild);
    if (id === 'admin:reactionRoles:repair') { await interaction.deferUpdate(); await reactionRoles.repairAll(guild); return interaction.editReply(await buildAdminCentre(guild)); }
    if (id === 'admin:reactionRoles:export') {
      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(reactionRoles.exportConfiguration(guild.id), null, 2), 'utf8'), { name: `goliath-reaction-roles-${guild.id}.json` });
      await interaction.reply({ content: '📤 Reaction Roles configuration export.', files: [file], ephemeral: true });
      return true;
    }
    if (id === 'admin:reactionRoles:enable' || id === 'admin:reactionRoles:disable') return respond(interaction, await buildAdminCentre(guild));
    return respond(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
  } catch (error) {
    const payload = { content: `❌ Reaction Roles setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildReactionRolesAdminPanel,
  handleReactionRolesAdminInteraction,
};
