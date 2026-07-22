'use strict';

/**
 * Consolidated Reaction Roles administration panel.
 *
 * Former panel versions V3-V7 are retained as isolated internal scopes so
 * their established override order remains intact without separate files.
 */

function loadV3() {
  const module = { exports: {} };
  const exports = module.exports;
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
  const messageFinder = require('./reactionRoleMessageFinder');
  
  const sessions = new Map();
  const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
  const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));
  const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';
  const sessionKey = (guildId, userId) => `${guildId}:${userId}`;
  const getSession = (guildId, userId) => sessions.get(sessionKey(guildId, userId)) || { messages: [], query: '' };
  const saveSession = (guildId, userId, patch) => sessions.set(sessionKey(guildId, userId), { ...getSession(guildId, userId), ...patch });
  const clearSession = (guildId, userId) => sessions.delete(sessionKey(guildId, userId));
  
  function modeLabel(mode) {
    if (mode === reactionRoles.MODES.ADD) return 'Add only';
    if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
    return 'Add + remove on unreact';
  }
  
  function panelSelect(guildId) {
    const panels = reactionRoles.listPanels(guildId).slice(0, 25);
    const menu = new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:manage:panel').setPlaceholder(panels.length ? 'Open a deployment' : 'No deployments yet').setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
    menu.addOptions(panels.length ? panels.map((panel) => ({
      label: String(panel.name || panel.panelId).slice(0, 100),
      description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} mapping(s) • ${panel.source === 'template' ? 'Goliath panel' : 'Existing message'}`.slice(0, 100),
      value: panel.panelId,
    })) : [{ label: 'No deployments available', value: 'none' }]);
    return menu;
  }
  
  function templateSelect(guildId, selectedId, customId = 'admin:reactionRoles:wizard:template') {
    const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(templates.length ? 'Choose an Embed Studio template' : 'No Role Studio templates found').setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
    menu.addOptions(templates.length ? templates.map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: String(template.embed?.title || template.module || 'Embed Studio template').slice(0, 100),
      value: String(template.templateId),
      default: String(template.templateId) === String(selectedId),
    })) : [{ label: 'Create one in Embed Studio first', value: 'none' }]);
    return menu;
  }
  
  function modeSelect(mode) {
    return new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:mode').setPlaceholder('Choose what this reaction does').addOptions([
      { label: 'Add + remove on unreact', description: 'Recommended for self-service roles', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
      { label: 'Add only', description: 'Removing the reaction keeps the role', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
      { label: 'Remove role', description: 'Reacting removes the selected role', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
    ]);
  }
  
  function mappingText(mappings, guild) {
    if (!mappings.length) return '> No emoji-to-role mappings added yet.';
    return mappings.slice(0, 20).map((mapping, index) => {
      const role = guild.roles.cache.get(mapping.roleId);
      return `**${index + 1}. ${mapping.emoji}** → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``}\n└ ${modeLabel(mapping.mode)}`;
    }).join('\n\n');
  }
  
  function mappingRemovalSelect(draft, guild) {
    return new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:remove:select').setPlaceholder('Choose a mapping to remove').setMinValues(1).setMaxValues(1).addOptions(draft.mappings.slice(0, 25).map((mapping, index) => ({
      label: `${mapping.emoji} → ${guild.roles.cache.get(mapping.roleId)?.name || mapping.roleId}`.slice(0, 100),
      description: `${index + 1}. ${modeLabel(mapping.mode)}`.slice(0, 100),
      value: mapping.mappingId,
    })));
  }
  
  function messageLabel(message) {
    return String(message.embedTitle || message.content || `${message.authorName || 'Unknown'} message`).replace(/\s+/g, ' ').slice(0, 100);
  }
  
  function messageDescription(message) {
    const date = message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown date';
    return `${message.authorName || 'Unknown'} • ${date} • ${message.embedCount || 0} embed(s)`.slice(0, 100);
  }
  
  function messageSelect(messages) {
    const menu = new StringSelectMenuBuilder().setCustomId('admin:reactionRoles:source:message').setPlaceholder(messages.length ? 'Choose the exact message' : 'No messages found').setMinValues(1).setMaxValues(1).setDisabled(!messages.length);
    menu.addOptions(messages.length ? messages.slice(0, 25).map((message) => ({ label: messageLabel(message), description: messageDescription(message), value: `${message.channelId}:${message.id}` })) : [{ label: 'No accessible messages found', value: 'none' }]);
    return menu;
  }
  
  async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
    const config = reactionRoles.getSection(guild.id);
    const health = await reactionRoles.buildHealth(guild);
    const panels = reactionRoles.listPanels(guild.id);
    const mappings = panels.reduce((count, panel) => count + panel.mappings.length, 0);
    const drafts = Object.keys(config.drafts || {}).length;
    return {
      embeds: [new EmbedBuilder().setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a).setTitle('🎭 Role Studio').setDescription('Attach roles to any accessible Discord message or create a new panel through Embed Studio.').addFields(
        { name: 'Status', value: config.enabled !== false ? '🟢 Online' : '⏸️ Disabled', inline: true },
        { name: 'Health', value: health.healthy ? 'All systems healthy' : `${health.unhealthy || 0} need attention`, inline: true },
        { name: 'Deployments', value: String(panels.length), inline: true },
        { name: 'Mappings', value: String(mappings), inline: true },
        { name: 'Drafts', value: String(drafts), inline: true },
        { name: 'Assignments', value: `${config.analytics.assigned || 0} added • ${config.analytics.removed || 0} removed`, inline: true },
        { name: 'Universal Message Support', value: 'Browse by channel, search messages, paste a full Discord link, or enter channel and message IDs manually.', inline: false },
      ).setFooter({ text: `Requested by ${memberDisplayName}` }).setTimestamp()],
      components: [
        row(btn('admin:reactionRoles:new:existing', 'Attach Existing Message', ButtonStyle.Primary), btn('admin:reactionRoles:new:template', 'Create New Panel', ButtonStyle.Success), btn('admin:reactionRoles:continue', drafts ? 'Resume Draft' : 'Start Setup')),
        row(panelSelect(guild.id)),
        row(btn('admin:reactionRoles:admin', 'Admin Centre', ButtonStyle.Primary), btn('admin:modules', 'Back to Modules')),
      ],
    };
  }
  
  async function buildAdminCentre(guild) {
    const config = reactionRoles.getSection(guild.id);
    const health = await reactionRoles.buildHealth(guild);
    return { embeds: [new EmbedBuilder().setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a).setTitle('🛡️ Role Studio Admin Centre').setDescription('Module controls, diagnostics and configuration tools.').addFields(
      { name: 'Module', value: config.enabled !== false ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Health', value: health.healthy ? 'Healthy' : 'Attention required', inline: true },
      { name: 'Active Deployments', value: String(health.active || 0), inline: true },
      { name: 'Disabled Deployments', value: String(health.disabled || 0), inline: true },
      { name: 'Unhealthy', value: String(health.unhealthy || 0), inline: true },
      { name: 'Failed Assignments', value: String(config.analytics.failed || 0), inline: true },
    )], components: [row(btn(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? 'Disable Module' : 'Enable Module', config.enabled !== false ? ButtonStyle.Danger : ButtonStyle.Success), btn('admin:reactionRoles:repair', 'Health & Repair', ButtonStyle.Primary), btn('admin:reactionRoles:export', 'Export')), row(btn('admin:reactionRoles', 'Back to Role Studio', ButtonStyle.Primary))] };
  }
  
  function buildSourcePicker(guild, userId, notice = '') {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const session = getSession(guild.id, userId);
    const selected = draft?.messageId ? `Selected: <#${draft.channelId}> / \`${draft.messageId}\`` : 'No message selected yet.';
    const embed = new EmbedBuilder().setColor(draft?.messageId ? 0x57f287 : 0x5865f2).setTitle('🔎 Find Any Existing Message').setDescription([
      'Use whichever method is easiest. Goliath verifies access before allowing deployment.', '',
      '**1. Browse:** choose a channel or thread, then load recent messages.',
      '**2. Search:** choose a channel or thread, then search message text/embed content.',
      '**3. Paste Link:** paste the full Discord message link.',
      '**4. Manual IDs:** enter channel ID and message ID directly.', '',
      selected,
      notice ? `\n${notice}` : '',
      session.query ? `\nCurrent search: \`${session.query}\`` : '',
    ].join('\n').slice(0, 4096));
    const components = [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:reactionRoles:source:channel').setPlaceholder(draft?.channelId ? 'Change channel or thread' : 'Choose channel or thread').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread).setMinValues(1).setMaxValues(1)),
    ];
    if (session.messages.length) components.push(row(messageSelect(session.messages)));
    components.push(row(
      btn('admin:reactionRoles:source:browse', 'Load Recent', ButtonStyle.Primary, !draft?.channelId),
      btn('admin:reactionRoles:source:search', 'Search Messages', ButtonStyle.Secondary, !draft?.channelId),
      btn('admin:reactionRoles:source:link', 'Paste Link'),
      btn('admin:reactionRoles:source:ids', 'Enter IDs')
    ));
    components.push(row(
      btn('admin:reactionRoles:source:continue', 'Continue to Roles', ButtonStyle.Success, !draft?.messageId),
      btn('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger)
    ));
    return { embeds: [embed], components };
  }
  
  function buildWizard(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
    if (existing && !draft.messageId) return buildSourcePicker(guild, userId);
    const template = draft.templateId ? reactionRoles.getReactionTemplate(guild.id, draft.templateId) : null;
    const role = draft.selectedRoleId ? guild.roles.cache.get(draft.selectedRoleId) : null;
    const hasTarget = Boolean(draft.channelId && (existing ? draft.messageId : draft.templateId));
    const ready = Boolean(hasTarget && draft.mappings.length);
    const embed = new EmbedBuilder().setColor(ready ? 0x57f287 : 0x5865f2).setTitle(existing ? '🔗 Configure Roles for Existing Message' : '🎨 Create a New Role Panel').setDescription([
      existing ? `**Target:** <#${draft.channelId}> / \`${draft.messageId}\`\n**Original content and unrelated reactions remain unchanged.**` : `**Channel:** ${draft.channelId ? `<#${draft.channelId}>` : 'Not selected'}\n**Template:** ${template ? `\`${template.name}\`` : 'Not selected'}`,
      '', '### Emoji mappings', mappingText(draft.mappings, guild), '',
      `**Next role:** ${role ? `<@&${role.id}>` : 'Not selected'}`,
      `**Behaviour:** ${modeLabel(draft.selectedMode)}`, '',
      ready ? `✅ Ready to deploy ${draft.mappings.length} mapping(s).` : 'Add at least one emoji-to-role mapping.',
    ].join('\n').slice(0, 4096));
    const components = [];
    if (!existing) components.push(row(new ChannelSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:channel').setPlaceholder(draft.channelId ? 'Change target channel' : 'Choose target channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)), row(templateSelect(guild.id, draft.templateId)));
    else components.push(row(btn('admin:reactionRoles:source', 'Change Message', ButtonStyle.Secondary)));
    components.push(
      row(new RoleSelectMenuBuilder().setCustomId('admin:reactionRoles:wizard:role').setPlaceholder(role ? `Next role: ${role.name}` : 'Choose a role').setMinValues(1).setMaxValues(1)),
      row(modeSelect(draft.selectedMode)),
      row(btn('admin:reactionRoles:wizard:emoji', 'Add Emoji', ButtonStyle.Success, !draft.selectedRoleId), draft.mappings.length ? btn('admin:reactionRoles:wizard:remove', `Remove (${draft.mappings.length})`) : null, btn('admin:reactionRoles:wizard:deploy', draft.panelId ? 'Save & Sync' : existing ? 'Attach Roles' : 'Create Panel', ButtonStyle.Success, !ready), btn('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger))
    );
    return { embeds: [embed], components };
  }
  
  function buildMappingRemoval(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    if (!draft?.mappings?.length) return buildWizard(guild, userId);
    return { embeds: [new EmbedBuilder().setColor(0xfaa61a).setTitle('➖ Remove a Mapping').setDescription(['Choose one mapping to remove.', '', mappingText(draft.mappings, guild)].join('\n').slice(0, 4096))], components: [row(mappingRemovalSelect(draft, guild)), row(btn('admin:reactionRoles:wizard:remove:back', 'Back to Builder', ButtonStyle.Primary), btn('admin:reactionRoles:wizard:cancel', 'Cancel Setup', ButtonStyle.Danger))] };
  }
  
  async function buildManagedPanel(guild, panelId) {
    const panel = reactionRoles.getPanel(guild.id, panelId);
    if (!panel) throw new Error('That deployment no longer exists.');
    const health = await reactionRoles.buildHealth(guild);
    const panelHealth = health.panels.find((item) => item.panelId === panelId);
    const messageUrl = `https://discord.com/channels/${guild.id}/${panel.channelId}/${panel.messageId}`;
    return { embeds: [new EmbedBuilder().setColor(panel.enabled === false ? 0x747f8d : panelHealth?.healthy === false ? 0xed4245 : 0x57f287).setTitle(`🎭 ${panel.name}`).setDescription([
      `**Status:** ${panel.enabled === false ? 'Disabled' : panelHealth?.healthy === false ? 'Needs attention' : 'Healthy'}`,
      `**Source:** ${panel.source === 'template' ? 'Goliath-created panel' : 'Existing Discord message'}`,
      `**Channel:** <#${panel.channelId}>`, `**Message:** [Open in Discord](${messageUrl})`, '', `### Mappings (${panel.mappings.length})`, mappingText(panel.mappings, guild),
    ].join('\n').slice(0, 4096))], components: [row(btn(`admin:reactionRoles:manage:edit:${panelId}`, 'Edit Mappings', ButtonStyle.Primary), btn(`admin:reactionRoles:manage:${panel.enabled === false ? 'enable' : 'disable'}:${panelId}`, panel.enabled === false ? 'Enable' : 'Disable', panel.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary), btn(`admin:reactionRoles:manage:repair:${panelId}`, 'Repair'), btn(`admin:reactionRoles:manage:remove:${panelId}`, 'Remove', ButtonStyle.Danger)), row(btn('admin:reactionRoles', 'Back to Role Studio'))] };
  }
  
  function buildRemovalChoices(guild, panelId) {
    const panel = reactionRoles.getPanel(guild.id, panelId);
    if (!panel) throw new Error('That deployment no longer exists.');
    const canDelete = panel.source === reactionRoles.DRAFT_TYPES.TEMPLATE;
    return { embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`🗑️ Remove ${panel.name}`).setDescription('Detach only, clear Goliath reactions and detach, or delete a Goliath-created message.')], components: [row(btn(`admin:reactionRoles:remove:detach:${panelId}`, 'Detach Only'), btn(`admin:reactionRoles:remove:clear:${panelId}`, 'Clear + Detach', ButtonStyle.Danger), btn(`admin:reactionRoles:remove:delete:${panelId}`, 'Delete Message', ButtonStyle.Danger, !canDelete)), row(btn(`admin:reactionRoles:remove:cancel:${panelId}`, 'Cancel', ButtonStyle.Primary))] };
  }
  
  function oneFieldModal(customId, title, fieldId, label, placeholder, value = '') {
    const input = new TextInputBuilder().setCustomId(fieldId).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short).setRequired(true);
    if (value) input.setValue(String(value));
    return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(row(input));
  }
  
  function idsModal(draft) {
    const channel = new TextInputBuilder().setCustomId('channelId').setLabel('Channel or thread ID').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true);
    const message = new TextInputBuilder().setCustomId('messageId').setLabel('Message ID').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true);
    if (draft?.channelId) channel.setValue(String(draft.channelId));
    if (draft?.messageId) message.setValue(String(draft.messageId));
    return new ModalBuilder().setCustomId('admin:reactionRoles:source:ids:submit').setTitle('Enter Message IDs').addComponents(row(channel), row(message));
  }
  
  async function show(interaction, payload) {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
    return interaction.reply({ ...payload, ephemeral: true });
  }
  
  async function verifyAndSelect(guild, userId, channelId, messageId) {
    const result = await messageFinder.searchGuildMessages(guild, { channelId, messageId, resultLimit: 1 });
    const message = result.messages?.[0];
    if (!message) throw new Error('That message could not be found, is in another server, or Goliath cannot access its channel history.');
    reactionRoles.saveDraft(guild.id, userId, { channelId: message.channelId, messageId: message.id }, guild);
    saveSession(guild.id, userId, { messages: [message] });
    return message;
  }
  
  async function handleReactionRolesAdminInteraction(interaction) {
    const id = String(interaction.customId || '');
    if (!id.startsWith('admin:reactionRoles')) return false;
    const guild = interaction.guild;
    const userId = interaction.user.id;
    try {
      if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:link:submit') {
        const parsed = reactionRoles.parseMessageReference(interaction.fields.getTextInputValue('messageLink'));
        await verifyAndSelect(guild, userId, parsed.channelId, parsed.messageId);
        return interaction.reply({ ...buildSourcePicker(guild, userId, '✅ Message link verified.'), ephemeral: true });
      }
      if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:ids:submit') {
        await verifyAndSelect(guild, userId, interaction.fields.getTextInputValue('channelId'), interaction.fields.getTextInputValue('messageId'));
        return interaction.reply({ ...buildSourcePicker(guild, userId, '✅ Channel and message IDs verified.'), ephemeral: true });
      }
      if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:source:search:submit') {
        const draft = reactionRoles.getDraft(guild.id, userId);
        const query = interaction.fields.getTextInputValue('query');
        const result = await messageFinder.searchGuildMessages(guild, { channelId: draft.channelId, query, scanLimit: 500, resultLimit: 25 });
        saveSession(guild.id, userId, { messages: result.messages || [], query });
        return interaction.reply({ ...buildSourcePicker(guild, userId, `${result.messages?.length || 0} matching message(s) found.`), ephemeral: true });
      }
      if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:emoji:submit') {
        const draft = reactionRoles.getDraft(guild.id, userId);
        reactionRoles.addDraftMapping(guild.id, userId, { emoji: interaction.fields.getTextInputValue('emoji'), roleId: draft.selectedRoleId, mode: draft.selectedMode, removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE }, guild);
        reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: null }, guild);
        return interaction.reply({ ...buildWizard(guild, userId), ephemeral: true });
      }
  
      if (id === 'admin:reactionRoles') return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
      if (id === 'admin:reactionRoles:admin') return show(interaction, await buildAdminCentre(guild));
      if (id === 'admin:reactionRoles:new:existing' || id === 'admin:reactionRoles:new:template') {
        const type = id.endsWith('template') ? reactionRoles.DRAFT_TYPES.TEMPLATE : reactionRoles.DRAFT_TYPES.EXISTING;
        reactionRoles.saveDraft(guild.id, userId, { type, panelId: null, channelId: null, messageId: null, templateId: null, mappings: [], selectedRoleId: null, applyTemplate: false }, guild);
        clearSession(guild.id, userId);
        return show(interaction, type === reactionRoles.DRAFT_TYPES.EXISTING ? buildSourcePicker(guild, userId) : buildWizard(guild, userId));
      }
      if (id === 'admin:reactionRoles:continue') return show(interaction, buildWizard(guild, userId));
      if (id === 'admin:reactionRoles:source') return show(interaction, buildSourcePicker(guild, userId));
  
      if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:source:channel') {
        reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0], messageId: null }, guild);
        saveSession(guild.id, userId, { messages: [], query: '' });
        return show(interaction, buildSourcePicker(guild, userId));
      }
      if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:source:message') {
        const [channelId, messageId] = String(interaction.values[0]).split(':');
        await verifyAndSelect(guild, userId, channelId, messageId);
        return show(interaction, buildSourcePicker(guild, userId, '✅ Message selected and verified.'));
      }
      if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:wizard:channel') reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
      else if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:wizard:role') reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
      else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:mode') reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
      else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:template' && interaction.values[0] !== 'none') reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
      else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:wizard:remove:select') { reactionRoles.removeDraftMapping(guild.id, userId, interaction.values[0], guild); return show(interaction, reactionRoles.getDraft(guild.id, userId).mappings.length ? buildMappingRemoval(guild, userId) : buildWizard(guild, userId)); }
      else if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:manage:panel') return show(interaction, await buildManagedPanel(guild, interaction.values[0]));
      else if (interaction.isAnySelectMenu?.()) return show(interaction, buildWizard(guild, userId));
  
      if (id === 'admin:reactionRoles:source:browse') {
        await interaction.deferUpdate();
        const draft = reactionRoles.getDraft(guild.id, userId);
        if (!draft.channelId) throw new Error('Choose a channel or thread first.');
        const result = await messageFinder.searchGuildMessages(guild, { channelId: draft.channelId, scanLimit: 100, resultLimit: 25 });
        saveSession(guild.id, userId, { messages: result.messages || [], query: '' });
        return interaction.editReply(buildSourcePicker(guild, userId, `${result.messages?.length || 0} recent message(s) loaded.`));
      }
      if (id === 'admin:reactionRoles:source:search') { await interaction.showModal(oneFieldModal('admin:reactionRoles:source:search:submit', 'Search Messages', 'query', 'Text or embed content', 'Search up to the latest 500 messages')); return true; }
      if (id === 'admin:reactionRoles:source:link') { await interaction.showModal(oneFieldModal('admin:reactionRoles:source:link:submit', 'Paste Message Link', 'messageLink', 'Full Discord message link', 'https://discord.com/channels/server/channel/message')); return true; }
      if (id === 'admin:reactionRoles:source:ids') { await interaction.showModal(idsModal(reactionRoles.getDraft(guild.id, userId))); return true; }
      if (id === 'admin:reactionRoles:source:continue') return show(interaction, buildWizard(guild, userId));
      if (id === 'admin:reactionRoles:wizard:emoji') { const draft = reactionRoles.getDraft(guild.id, userId); if (!draft.selectedRoleId) return interaction.reply({ content: 'Choose a role first.', ephemeral: true }); await interaction.showModal(oneFieldModal('admin:reactionRoles:wizard:emoji:submit', 'Add Emoji Mapping', 'emoji', 'Unicode or custom emoji', '⭐ or <:name:emoji_id>')); return true; }
      if (id === 'admin:reactionRoles:wizard:remove') return show(interaction, buildMappingRemoval(guild, userId));
      if (id === 'admin:reactionRoles:wizard:remove:back') return show(interaction, buildWizard(guild, userId));
      if (id === 'admin:reactionRoles:wizard:cancel') { reactionRoles.clearDraft(guild.id, userId, guild); clearSession(guild.id, userId); return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction))); }
      if (id === 'admin:reactionRoles:wizard:deploy') {
        await interaction.deferUpdate();
        const draft = reactionRoles.getDraft(guild.id, userId);
        let panel;
        if (draft.panelId) panel = await reactionRoles.updatePanelMappings(guild, draft.panelId, draft.mappings, userId);
        else if (draft.type === reactionRoles.DRAFT_TYPES.TEMPLATE) panel = await reactionRoles.createFromTemplate({ guild, channelId: draft.channelId, templateId: draft.templateId, name: draft.name, mappings: draft.mappings, createdBy: userId });
        else panel = await reactionRoles.attachExistingMessage({ guild, messageReference: draft.messageId, channelId: draft.channelId, name: draft.name, templateId: null, applyTemplate: false, mappings: draft.mappings, createdBy: userId });
        reactionRoles.clearDraft(guild.id, userId, guild); clearSession(guild.id, userId);
        return interaction.editReply(await buildManagedPanel(guild, panel.panelId));
      }
  
      if (id.startsWith('admin:reactionRoles:manage:edit:')) { const panel = reactionRoles.getPanel(guild.id, id.split(':').pop()); if (!panel) throw new Error('That deployment no longer exists.'); reactionRoles.saveDraft(guild.id, userId, { type: panel.source, panelId: panel.panelId, channelId: panel.channelId, messageId: panel.messageId, name: panel.name, templateId: panel.templateId, mappings: panel.mappings, selectedRoleId: null, applyTemplate: false }, guild); return show(interaction, buildWizard(guild, userId)); }
      if (id.startsWith('admin:reactionRoles:manage:enable:') || id.startsWith('admin:reactionRoles:manage:disable:')) { const panelId = id.split(':').pop(); await interaction.deferUpdate(); await reactionRoles.setPanelEnabled(guild, panelId, id.includes(':enable:'), guild); return interaction.editReply(await buildManagedPanel(guild, panelId)); }
      if (id.startsWith('admin:reactionRoles:manage:repair:')) { const panelId = id.split(':').pop(); await interaction.deferUpdate(); await reactionRoles.repairPanel(guild, panelId, guild); return interaction.editReply(await buildManagedPanel(guild, panelId)); }
      if (id.startsWith('admin:reactionRoles:manage:remove:')) return show(interaction, buildRemovalChoices(guild, id.split(':').pop()));
      if (id.startsWith('admin:reactionRoles:remove:cancel:')) return show(interaction, await buildManagedPanel(guild, id.split(':').pop()));
      if (id.startsWith('admin:reactionRoles:remove:detach:') || id.startsWith('admin:reactionRoles:remove:clear:')) { await interaction.deferUpdate(); await reactionRoles.detachPanel(guild, id.split(':').pop(), { clearReactions: id.includes(':clear:') }); return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction))); }
      if (id.startsWith('admin:reactionRoles:remove:delete:')) { await interaction.deferUpdate(); await reactionRoles.deleteDeploymentMessage(guild, id.split(':').pop(), guild); return interaction.editReply(await buildReactionRolesAdminPanel(guild, displayName(interaction))); }
  
      if (id === 'admin:reactionRoles:enable') reactionRoles.setEnabled(guild.id, true, guild);
      if (id === 'admin:reactionRoles:disable') reactionRoles.setEnabled(guild.id, false, guild);
      if (id === 'admin:reactionRoles:repair') { await interaction.deferUpdate(); await reactionRoles.repairAll(guild); return interaction.editReply(await buildAdminCentre(guild)); }
      if (id === 'admin:reactionRoles:export') { const file = new AttachmentBuilder(Buffer.from(JSON.stringify(reactionRoles.exportConfiguration(guild.id), null, 2), 'utf8'), { name: `goliath-role-studio-${guild.id}.json` }); await interaction.reply({ content: '📤 Role Studio configuration export.', files: [file], ephemeral: true }); return true; }
      if (id === 'admin:reactionRoles:enable' || id === 'admin:reactionRoles:disable') return show(interaction, await buildAdminCentre(guild));
      return show(interaction, await buildReactionRolesAdminPanel(guild, displayName(interaction)));
    } catch (error) {
      const payload = { content: `❌ Role Studio setup failed: ${error.message}`, ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null); else await interaction.reply(payload).catch(() => null);
      return true;
    }
  }
  
  module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
  
  return module.exports;
}

const panelV3 = loadV3();

function loadV4() {
  const module = { exports: {} };
  const exports = module.exports;
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const reactionRoles = require('./reactionRoles');
  const legacyPanel = panelV3;
  
  const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
  const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
    .setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));
  const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';
  
  function deploymentSelect(guildId) {
    const { StringSelectMenuBuilder } = require('discord.js');
    const panels = reactionRoles.listPanels(guildId).slice(0, 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:manage:panel')
      .setPlaceholder(panels.length ? '📂 Manage a deployment' : 'No deployments yet')
      .setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
    menu.addOptions(panels.length ? panels.map((panel) => ({
      label: String(panel.name || panel.panelId).slice(0, 100),
      description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} role mapping(s) • ${panel.source === 'template' ? 'Goliath panel' : 'Existing message'}`.slice(0, 100),
      value: panel.panelId,
    })) : [{ label: 'Create or attach a panel to begin', value: 'none' }]);
    return menu;
  }
  
  async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
    const config = reactionRoles.getSection(guild.id);
    const health = await reactionRoles.buildHealth(guild);
    const panels = reactionRoles.listPanels(guild.id);
    const mappings = panels.reduce((total, panel) => total + (panel.mappings?.length || 0), 0);
    const drafts = Object.keys(config.drafts || {}).length;
    const analytics = config.analytics || {};
  
    const status = config.enabled !== false ? '🟢 Online' : '⏸️ Disabled';
    const healthText = health.healthy ? 'Healthy' : `${health.unhealthy || 0} need attention`;
    const stats = [
      `**Deployments** \`${panels.length}\``,
      `**Mappings** \`${mappings}\``,
      `**Drafts** \`${drafts}\``,
      `**Assigned** \`${analytics.assigned || 0}\``,
      `**Removed** \`${analytics.removed || 0}\``,
      `**Failed** \`${analytics.failed || 0}\``,
    ].join('  •  ');
  
    const embed = new EmbedBuilder()
      .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
      .setTitle('🎭 Role Studio')
      .setDescription([
        `### ${status}  •  ${healthText}`,
        stats,
        '',
        '**Create, attach and manage role panels from one workspace.**',
        'Supports existing messages, embeds, bot and webhook posts, announcement channels and accessible threads.',
        '',
        '**Find any message using:**',
        '`Channel Browser`  •  `Recent Messages`  •  `Message Search`',
        '`Discord Link`  •  `Channel + Message IDs`',
        '',
        '> Original text, embeds, components and unrelated reactions are preserved.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp();
  
    return {
      embeds: [embed],
      components: [
        row(
          button('admin:reactionRoles:new:existing', 'Attach Existing Message', ButtonStyle.Primary),
          button('admin:reactionRoles:new:template', 'Create New Panel', ButtonStyle.Success),
          button('admin:reactionRoles:continue', drafts ? 'Resume Draft' : 'Start Setup')
        ),
        row(deploymentSelect(guild.id)),
        row(
          button('admin:reactionRoles:admin', 'Admin Centre', ButtonStyle.Primary),
          button('admin:modules', 'Back to Modules')
        ),
      ],
    };
  }
  
  async function handleReactionRolesAdminInteraction(interaction) {
    if (String(interaction.customId || '') === 'admin:reactionRoles') {
      const payload = await buildReactionRolesAdminPanel(interaction.guild, displayName(interaction));
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) await interaction.update(payload);
      else await interaction.reply({ ...payload, ephemeral: true });
      return true;
    }
    return legacyPanel.handleReactionRolesAdminInteraction(interaction);
  }
  
  module.exports = { buildReactionRolesAdminPanel, handleReactionRolesAdminInteraction };
  
  return module.exports;
}

const panelV4 = loadV4();

function loadV5() {
  const module = { exports: {} };
  const exports = module.exports;
  const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require('discord.js');
  
  const reactionRoles = require('./reactionRoles');
  const messageFinder = require('./reactionRoleMessageFinder');
  const basePanel = panelV4;
  const runtimePanel = panelV3;
  
  const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
  const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(Boolean(disabled));
  
  function modeLabel(mode) {
    if (mode === reactionRoles.MODES.ADD) return 'Add only';
    if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
    return 'Add + remove on unreact';
  }
  
  function messageSummary(message) {
    const content = String(message.content || '').trim();
    const embedTitle = String(message.embedTitle || '').trim();
    const embedDescription = String(message.embedDescription || '').trim();
    return (content || embedTitle || embedDescription || 'Message has no text preview available.')
      .replace(/\s+/g, ' ')
      .slice(0, 900);
  }
  
  async function selectedMessage(guild, draft) {
    if (!draft?.channelId || !draft?.messageId) return null;
    const result = await messageFinder.searchGuildMessages(guild, {
      channelId: draft.channelId,
      messageId: draft.messageId,
      resultLimit: 1,
    });
    return result.messages?.[0] || null;
  }
  
  async function buildMessagePreview(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const message = await selectedMessage(guild, draft);
    if (!message) throw new Error('The selected message is no longer accessible. Choose it again or check Goliath’s channel permissions.');
  
    const messageUrl = message.jumpUrl || `https://discord.com/channels/${guild.id}/${message.channelId}/${message.id}`;
    const created = message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown';
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('👁️ Confirm Selected Message')
      .setDescription([
        `**Author:** ${message.authorName || 'Unknown'}${message.bot ? ' • Bot/Webhook' : ''}`,
        `**Channel:** <#${message.channelId}>`,
        `**Created:** ${created}`,
        `**Message:** [Open in Discord](${messageUrl})`,
        '',
        '### Preview',
        messageSummary(message),
        '',
        `**Embeds:** \`${message.embedCount || 0}\`  •  **Existing reactions:** \`${message.reactionCount || 0}\``,
        '',
        '### Preservation guarantees',
        '✅ Original text and embeds preserved',
        '✅ Existing buttons/components preserved',
        '✅ Unrelated reactions preserved',
        '✅ Only configured role reactions are added',
      ].join('\n').slice(0, 4096));
  
    if (message.authorAvatar) embed.setThumbnail(message.authorAvatar);
  
    return {
      embeds: [embed],
      components: [
        row(
          button('admin:reactionRoles:source', 'Change Message'),
          button('admin:reactionRoles:continue', 'Correct Message — Configure Roles', ButtonStyle.Success),
          button('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger),
        ),
      ],
    };
  }
  
  async function buildDeploymentReview(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
    const message = existing ? await selectedMessage(guild, draft) : null;
    if (existing && !message) throw new Error('The selected message is no longer accessible. Return to message selection and choose it again.');
    if (!draft.mappings?.length) throw new Error('Add at least one role mapping before review.');
  
    const mappingLines = draft.mappings.slice(0, 20).map((mapping, index) => {
      const role = guild.roles.cache.get(mapping.roleId);
      return `**${index + 1}. ${mapping.emoji}** → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``} • ${modeLabel(mapping.mode)}`;
    });
    const emojis = draft.mappings.map((mapping) => mapping.emoji).join(' ');
  
    const targetLines = existing ? [
      `**Target:** <#${draft.channelId}> / \`${draft.messageId}\``,
      `**Author:** ${message.authorName || 'Unknown'}`,
      `**Preview:** ${messageSummary(message).slice(0, 350)}`,
    ] : [
      `**Target channel:** ${draft.channelId ? `<#${draft.channelId}>` : 'Not selected'}`,
      `**Embed Studio template:** ${draft.templateId ? `\`${draft.templateId}\`` : 'Not selected'}`,
    ];
  
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(existing ? '✅ Final Review — Attach Roles' : '✅ Final Review — Create Panel')
      .setDescription([
        ...targetLines,
        '',
        `### Role mappings (${draft.mappings.length})`,
        ...mappingLines,
        '',
        `**Reactions to add:** ${emojis}`,
        '',
        '### Safety checks',
        existing ? '✅ Existing message content preserved' : '✅ Embed Studio controls presentation',
        existing ? '✅ Existing embeds and components preserved' : '✅ New panel will be created in the selected channel',
        existing ? '✅ Unrelated reactions preserved' : '✅ Only configured role mappings will be deployed',
        '✅ Roles are validated against Goliath’s hierarchy before assignment',
        '',
        '> Nothing is changed until you confirm below.',
      ].join('\n').slice(0, 4096));
  
    return {
      embeds: [embed],
      components: [
        row(
          button('admin:reactionRoles:review:back', 'Back to Builder'),
          button('admin:reactionRoles:wizard:confirm', existing ? 'Attach Roles Now' : 'Create Panel Now', ButtonStyle.Success),
          button('admin:reactionRoles:wizard:cancel', 'Cancel', ButtonStyle.Danger),
        ),
      ],
    };
  }
  
  async function respond(interaction, payload) {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
    return interaction.reply({ ...payload, ephemeral: true });
  }
  
  async function handleReactionRolesAdminInteraction(interaction) {
    const id = String(interaction.customId || '');
    if (!id.startsWith('admin:reactionRoles')) return false;
  
    if (id === 'admin:reactionRoles:source:continue') {
      return respond(interaction, await buildMessagePreview(interaction.guild, interaction.user.id));
    }
  
    if (id === 'admin:reactionRoles:wizard:deploy') {
      return respond(interaction, await buildDeploymentReview(interaction.guild, interaction.user.id));
    }
  
    if (id === 'admin:reactionRoles:review:back') {
      interaction.customId = 'admin:reactionRoles:continue';
      return runtimePanel.handleReactionRolesAdminInteraction(interaction);
    }
  
    if (id === 'admin:reactionRoles:wizard:confirm') {
      interaction.customId = 'admin:reactionRoles:wizard:deploy';
      return runtimePanel.handleReactionRolesAdminInteraction(interaction);
    }
  
    return basePanel.handleReactionRolesAdminInteraction(interaction);
  }
  
  module.exports = {
    buildReactionRolesAdminPanel: basePanel.buildReactionRolesAdminPanel,
    handleReactionRolesAdminInteraction,
  };
  
  return module.exports;
}

const panelV5 = loadV5();

function loadV6() {
  const module = { exports: {} };
  const exports = module.exports;
  require('./reactionRolesReliabilityPatch');
  
  const panel = panelV5;
  
  function stripEphemeral(payload = {}) {
    const next = { ...payload };
    delete next.ephemeral;
    return next;
  }
  
  async function handleReactionRolesAdminInteraction(interaction) {
    const id = String(interaction.customId || '');
    if (!id.startsWith('admin:reactionRoles')) return false;
  
    const modalFromMessage = interaction.isModalSubmit?.()
      && (typeof interaction.isFromMessage !== 'function' || interaction.isFromMessage());
  
    if (!modalFromMessage) return panel.handleReactionRolesAdminInteraction(interaction);
  
    const originalReply = interaction.reply?.bind(interaction);
    const originalEditReply = interaction.editReply?.bind(interaction);
  
    interaction.reply = async (payload) => interaction.update(stripEphemeral(payload));
    interaction.editReply = async (payload) => {
      if (interaction.deferred || interaction.replied) return originalEditReply(stripEphemeral(payload));
      return interaction.update(stripEphemeral(payload));
    };
  
    try {
      return await panel.handleReactionRolesAdminInteraction(interaction);
    } finally {
      if (originalReply) interaction.reply = originalReply;
      if (originalEditReply) interaction.editReply = originalEditReply;
    }
  }
  
  module.exports = {
    buildReactionRolesAdminPanel: panel.buildReactionRolesAdminPanel,
    handleReactionRolesAdminInteraction,
  };
  
  return module.exports;
}

const panelV6 = loadV6();

// Production entry and former V7 smart-builder layer.
require('../roleStudioNavigationPatch');
require('../roleStudioChildNavigationPatch');

const reactionPanel = (() => {
  const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
  } = require('discord.js');

  const reactionRoles = require('./reactionRoles');
  const previousPanel = panelV6;

  const selectedMappings = new Map();
  const keyFor = (guildId, userId) => `${guildId}:${userId}`;
  const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
  const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
    .setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));

  function displayName(interaction) {
    return interaction.member?.displayName || interaction.user?.username || 'Unknown User';
  }

  function modeLabel(mode) {
    if (mode === reactionRoles.MODES.ADD) return 'Add only';
    if (mode === reactionRoles.MODES.REMOVE) return 'Remove role';
    return 'Add + remove on unreact';
  }

  function currentSelection(guildId, userId, draft) {
    const key = keyFor(guildId, userId);
    const selectedId = selectedMappings.get(key);
    const selected = draft.mappings.find((mapping) => mapping.mappingId === selectedId) || draft.mappings[0] || null;
    if (selected) selectedMappings.set(key, selected.mappingId);
    else selectedMappings.delete(key);
    return selected;
  }

  function mappingList(draft, guild) {
    if (!draft.mappings.length) return '> No mappings yet. Choose a role, choose the behaviour, then press **Add Emoji**.';
    return draft.mappings.map((mapping, index) => {
      const role = guild.roles.cache.get(mapping.roleId);
      return `**${index + 1}. ${mapping.emoji}** → ${role ? `<@&${role.id}>` : `\`${mapping.roleId}\``}\n└ ${modeLabel(mapping.mode)}`;
    }).join('\n\n');
  }

  function mappingSelect(draft, selectedId) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:smart:mapping')
      .setPlaceholder(draft.mappings.length ? 'Select a mapping to edit' : 'No mappings available')
      .setMinValues(1).setMaxValues(1).setDisabled(!draft.mappings.length);
    menu.addOptions(draft.mappings.length ? draft.mappings.slice(0, 25).map((mapping, index) => ({
      label: `${index + 1}. ${mapping.emoji}`.slice(0, 100),
      description: `${modeLabel(mapping.mode)} • ${mapping.roleId}`.slice(0, 100),
      value: mapping.mappingId,
      default: mapping.mappingId === selectedId,
    })) : [{ label: 'Add a mapping first', value: 'none' }]);
    return menu;
  }

  function addModeSelect(mode) {
    return new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:smart:add-mode')
      .setPlaceholder('Choose assignment behaviour')
      .addOptions([
        { label: 'Add + remove on unreact', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
        { label: 'Add only', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
        { label: 'Remove role', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
      ]);
  }

  function editModeSelect(mode) {
    return new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:smart:edit-mode')
      .setPlaceholder('Change selected mapping behaviour')
      .addOptions([
        { label: 'Add + remove on unreact', value: reactionRoles.MODES.TOGGLE, default: mode === reactionRoles.MODES.TOGGLE },
        { label: 'Add only', value: reactionRoles.MODES.ADD, default: mode === reactionRoles.MODES.ADD },
        { label: 'Remove role', value: reactionRoles.MODES.REMOVE, default: mode === reactionRoles.MODES.REMOVE },
      ]);
  }

  function templateSelect(guildId, selectedId) {
    const templates = reactionRoles.listReactionTemplates(guildId).slice(0, 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:smart:template')
      .setPlaceholder(templates.length ? 'Choose an Embed Studio template' : 'No Role Studio templates found')
      .setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
    menu.addOptions(templates.length ? templates.map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: String(template.embed?.title || 'Embed Studio template').slice(0, 100),
      value: String(template.templateId),
      default: String(template.templateId) === String(selectedId),
    })) : [{ label: 'Create a template in Embed Studio first', value: 'none' }]);
    return menu;
  }

  function deploymentSelect(guildId) {
    const panels = reactionRoles.listPanels(guildId).slice(0, 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:manage:panel')
      .setPlaceholder(panels.length ? '📂 Manage a deployment' : 'No deployments yet')
      .setMinValues(1).setMaxValues(1).setDisabled(!panels.length);
    menu.addOptions(panels.length ? panels.map((panel) => ({
      label: String(panel.name || panel.panelId).slice(0, 100),
      description: `${panel.enabled === false ? 'Disabled' : 'Enabled'} • ${panel.mappings.length} mapping(s)`.slice(0, 100),
      value: panel.panelId,
    })) : [{ label: 'Create or attach a panel to begin', value: 'none' }]);
    return menu;
  }

  async function buildOverview(guild, memberDisplayName = 'Unknown User') {
    const config = reactionRoles.getSection(guild.id);
    const health = await reactionRoles.buildHealth(guild);
    const panels = reactionRoles.listPanels(guild.id);
    const mappings = panels.reduce((total, panel) => total + panel.mappings.length, 0);
    const hasSetup = Object.keys(config.drafts || {}).length > 0;
    const analytics = config.analytics || {};
    const embed = new EmbedBuilder()
      .setColor(config.enabled !== false && health.healthy ? 0x57f287 : 0xfaa61a)
      .setTitle('🎭 Role Studio')
      .setDescription([
        `### ${config.enabled !== false ? '🟢 Online' : '⏸️ Disabled'} • ${health.healthy ? 'Healthy' : `${health.unhealthy || 0} need attention`}`,
        `**Deployments** \`${panels.length}\` • **Mappings** \`${mappings}\` • **Assigned** \`${analytics.assigned || 0}\` • **Removed** \`${analytics.removed || 0}\` • **Failed** \`${analytics.failed || 0}\``,
        '',
        '**Attach roles to any accessible message or build a new panel through Embed Studio.**',
        'Your active setup is saved automatically and reopens exactly where you left it.',
        '',
        '> Existing text, embeds, components and unrelated reactions are preserved.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp();
    return {
      embeds: [embed],
      components: [
        row(
          button('admin:reactionRoles:new:existing', 'Attach Existing Message', ButtonStyle.Primary),
          button('admin:reactionRoles:new:template', 'Create New Panel', ButtonStyle.Success),
          button('admin:reactionRoles:continue', hasSetup ? 'Open Builder' : 'Builder', ButtonStyle.Secondary, !hasSetup),
        ),
        row(deploymentSelect(guild.id)),
        row(
          button('admin:reactionRoles:admin', 'Admin Centre', ButtonStyle.Primary),
          button('admin:modules', 'Back to Modules'),
        ),
      ],
    };
  }

  function buildSmartBuilder(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    if (!draft) throw new Error('No active setup exists. Start by attaching a message or creating a panel.');
    const existing = draft.type === reactionRoles.DRAFT_TYPES.EXISTING;
    if (existing && (!draft.channelId || !draft.messageId)) return null;
    const selectedRole = draft.selectedRoleId ? guild.roles.cache.get(draft.selectedRoleId) : null;
    const target = existing
      ? `<#${draft.channelId}> • \`${draft.messageId}\``
      : `${draft.channelId ? `<#${draft.channelId}>` : 'Channel not selected'} • ${draft.templateId ? `\`${draft.templateId}\`` : 'Template not selected'}`;
    const ready = Boolean(draft.channelId && (existing ? draft.messageId : draft.templateId) && draft.mappings.length);
    const embed = new EmbedBuilder()
      .setColor(ready ? 0x57f287 : 0x5865f2)
      .setTitle('🎭 Role Studio Builder')
      .setDescription([
        `**Target:** ${target}`,
        existing ? '**Source message remains unchanged.**' : '**Embed Studio controls the new panel presentation.**',
        '',
        `### Current mappings (${draft.mappings.length})`,
        mappingList(draft, guild),
        '',
        `**Next role:** ${selectedRole ? `<@&${selectedRole.id}>` : 'Choose a role below'}`,
        `**Behaviour:** ${modeLabel(draft.selectedMode)}`,
        '',
        ready ? '✅ Ready for final review.' : 'Add at least one mapping and complete the target settings.',
      ].join('\n').slice(0, 4096));

    const components = [];
    if (!existing) {
      components.push(row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:reactionRoles:smart:channel')
        .setPlaceholder(draft.channelId ? 'Change target channel' : 'Choose target channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1).setMaxValues(1)));
      components.push(row(templateSelect(guild.id, draft.templateId)));
    }
    components.push(row(new RoleSelectMenuBuilder()
      .setCustomId('admin:reactionRoles:smart:add-role')
      .setPlaceholder(selectedRole ? `Next role: ${selectedRole.name}` : 'Choose the next role')
      .setMinValues(1).setMaxValues(1)));
    components.push(row(addModeSelect(draft.selectedMode)));
    components.push(row(
      button('admin:reactionRoles:wizard:emoji', 'Add Emoji', ButtonStyle.Success, !draft.selectedRoleId),
      button('admin:reactionRoles:smart:manage', `Manage Mappings (${draft.mappings.length})`, ButtonStyle.Primary, !draft.mappings.length),
      button('admin:reactionRoles:wizard:deploy', 'Review & Deploy', ButtonStyle.Success, !ready),
      existing ? button('admin:reactionRoles:source', 'Change Message') : null,
      button('admin:reactionRoles:smart:exit', 'Exit Studio'),
    ));
    return { embeds: [embed], components };
  }

  function buildMappingManager(guild, userId) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    if (!draft?.mappings?.length) return buildSmartBuilder(guild, userId);
    const selected = currentSelection(guild.id, userId, draft);
    const role = guild.roles.cache.get(selected.roleId);
    const index = draft.mappings.findIndex((mapping) => mapping.mappingId === selected.mappingId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🧩 Mapping Manager')
      .setDescription([
        `### Selected mapping ${index + 1} of ${draft.mappings.length}`,
        `**Emoji:** ${selected.emoji}`,
        `**Role:** ${role ? `<@&${role.id}>` : `\`${selected.roleId}\``}`,
        `**Behaviour:** ${modeLabel(selected.mode)}`,
        '',
        'Select another mapping or edit this one directly below.',
      ].join('\n'));
    return {
      embeds: [embed],
      components: [
        row(mappingSelect(draft, selected.mappingId)),
        row(new RoleSelectMenuBuilder()
          .setCustomId('admin:reactionRoles:smart:edit-role')
          .setPlaceholder(role ? `Change role: ${role.name}` : 'Change selected mapping role')
          .setMinValues(1).setMaxValues(1)),
        row(editModeSelect(selected.mode)),
        row(
          button('admin:reactionRoles:smart:edit-emoji', 'Edit Emoji', ButtonStyle.Primary),
          button('admin:reactionRoles:smart:duplicate', 'Duplicate'),
          button('admin:reactionRoles:smart:up', 'Move Up', ButtonStyle.Secondary, index <= 0),
          button('admin:reactionRoles:smart:down', 'Move Down', ButtonStyle.Secondary, index >= draft.mappings.length - 1),
          button('admin:reactionRoles:smart:delete', 'Delete', ButtonStyle.Danger),
        ),
        row(
          button('admin:reactionRoles:smart:back', 'Back to Builder', ButtonStyle.Primary),
          button('admin:reactionRoles:wizard:deploy', 'Review & Deploy', ButtonStyle.Success),
          button('admin:reactionRoles:smart:exit', 'Exit Studio'),
        ),
      ],
    };
  }

  function editEmojiModal(mapping) {
    const input = new TextInputBuilder()
      .setCustomId('emoji')
      .setLabel('Emoji')
      .setPlaceholder('⭐ or <:name:emoji_id>')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(mapping.emoji || ''));
    return new ModalBuilder()
      .setCustomId('admin:reactionRoles:smart:edit-emoji:submit')
      .setTitle('Edit Mapping Emoji')
      .addComponents(row(input));
  }

  function replaceMapping(guild, userId, mappingId, patch) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const mappings = draft.mappings.map((mapping) => mapping.mappingId === mappingId
      ? { ...mapping, ...patch, updatedAt: new Date().toISOString() }
      : mapping);
    reactionRoles.saveDraft(guild.id, userId, { mappings }, guild);
  }

  function reorderMapping(guild, userId, mappingId, offset) {
    const draft = reactionRoles.getDraft(guild.id, userId);
    const mappings = [...draft.mappings];
    const index = mappings.findIndex((mapping) => mapping.mappingId === mappingId);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= mappings.length) return;
    [mappings[index], mappings[next]] = [mappings[next], mappings[index]];
    reactionRoles.saveDraft(guild.id, userId, { mappings }, guild);
  }

  async function respond(interaction, payload) {
    const clean = { ...payload };
    delete clean.ephemeral;
    if (interaction.isModalSubmit?.() && (typeof interaction.isFromMessage !== 'function' || interaction.isFromMessage())) return interaction.update(clean);
    if (interaction.deferred || interaction.replied) return interaction.editReply(clean);
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(clean);
    return interaction.reply({ ...clean, ephemeral: true });
  }

  async function handleReactionRolesAdminInteraction(interaction) {
    const id = String(interaction.customId || '');
    if (!id.startsWith('admin:reactionRoles')) return false;
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const selectionKey = keyFor(guild.id, userId);

    if (id === 'admin:reactionRoles') return respond(interaction, await buildOverview(guild, displayName(interaction)));

    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:wizard:emoji:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      reactionRoles.addDraftMapping(guild.id, userId, {
        emoji: interaction.fields.getTextInputValue('emoji'),
        roleId: draft.selectedRoleId,
        mode: draft.selectedMode,
        removeOnUnreact: draft.selectedMode === reactionRoles.MODES.TOGGLE,
      }, guild);
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: null }, guild);
      return respond(interaction, buildSmartBuilder(guild, userId));
    }

    if (interaction.isModalSubmit?.() && id === 'admin:reactionRoles:smart:edit-emoji:submit') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      replaceMapping(guild, userId, selected.mappingId, { emoji: interaction.fields.getTextInputValue('emoji') });
      return respond(interaction, buildMappingManager(guild, userId));
    }

    if (id === 'admin:reactionRoles:continue' || id === 'admin:reactionRoles:smart:back') {
      const payload = buildSmartBuilder(guild, userId);
      if (payload) return respond(interaction, payload);
    }

    if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:smart:add-role') {
      reactionRoles.saveDraft(guild.id, userId, { selectedRoleId: interaction.values[0] }, guild);
      return respond(interaction, buildSmartBuilder(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:smart:add-mode') {
      reactionRoles.saveDraft(guild.id, userId, { selectedMode: interaction.values[0] }, guild);
      return respond(interaction, buildSmartBuilder(guild, userId));
    }
    if (interaction.isChannelSelectMenu?.() && id === 'admin:reactionRoles:smart:channel') {
      reactionRoles.saveDraft(guild.id, userId, { channelId: interaction.values[0] }, guild);
      return respond(interaction, buildSmartBuilder(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:smart:template') {
      reactionRoles.saveDraft(guild.id, userId, { templateId: interaction.values[0] }, guild);
      return respond(interaction, buildSmartBuilder(guild, userId));
    }

    if (id === 'admin:reactionRoles:smart:manage') return respond(interaction, buildMappingManager(guild, userId));
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:smart:mapping') {
      selectedMappings.set(selectionKey, interaction.values[0]);
      return respond(interaction, buildMappingManager(guild, userId));
    }

    if (interaction.isRoleSelectMenu?.() && id === 'admin:reactionRoles:smart:edit-role') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      replaceMapping(guild, userId, selected.mappingId, { roleId: interaction.values[0] });
      return respond(interaction, buildMappingManager(guild, userId));
    }
    if (interaction.isStringSelectMenu?.() && id === 'admin:reactionRoles:smart:edit-mode') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      replaceMapping(guild, userId, selected.mappingId, {
        mode: interaction.values[0],
        removeOnUnreact: interaction.values[0] === reactionRoles.MODES.TOGGLE,
      });
      return respond(interaction, buildMappingManager(guild, userId));
    }

    if (id === 'admin:reactionRoles:smart:edit-emoji') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      await interaction.showModal(editEmojiModal(selected));
      return true;
    }

    if (id === 'admin:reactionRoles:smart:duplicate') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      const duplicate = { ...selected, mappingId: `rr_map_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const mappings = [...draft.mappings];
      const index = mappings.findIndex((mapping) => mapping.mappingId === selected.mappingId);
      mappings.splice(index + 1, 0, duplicate);
      reactionRoles.saveDraft(guild.id, userId, { mappings }, guild);
      selectedMappings.set(selectionKey, duplicate.mappingId);
      return respond(interaction, buildMappingManager(guild, userId));
    }

    if (id === 'admin:reactionRoles:smart:up' || id === 'admin:reactionRoles:smart:down') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      reorderMapping(guild, userId, selected.mappingId, id.endsWith(':up') ? -1 : 1);
      return respond(interaction, buildMappingManager(guild, userId));
    }

    if (id === 'admin:reactionRoles:smart:delete') {
      const draft = reactionRoles.getDraft(guild.id, userId);
      const selected = currentSelection(guild.id, userId, draft);
      reactionRoles.removeDraftMapping(guild.id, userId, selected.mappingId, guild);
      selectedMappings.delete(selectionKey);
      const nextDraft = reactionRoles.getDraft(guild.id, userId);
      return respond(interaction, nextDraft.mappings.length ? buildMappingManager(guild, userId) : buildSmartBuilder(guild, userId));
    }

    if (id === 'admin:reactionRoles:smart:exit') return respond(interaction, await buildOverview(guild, displayName(interaction)));

    return previousPanel.handleReactionRolesAdminInteraction(interaction);
  }

  return {
    buildReactionRolesAdminPanel: buildOverview,
    handleReactionRolesAdminInteraction,
  };
})();

const roleStudio = require('../roleStudioPanel');
const temporaryRolesPanel = require('../temporaryRoles/temporaryRolesPanel');

const replacements = [
  [/Role Studio Builder/g, 'Reaction Roles Builder'],
  [/Role Studio/g, 'Reaction Roles'],
  [/Exit Studio/g, 'Exit Reaction Roles'],
  [/Role Studio templates/g, 'Reaction Role templates'],
];

function replaceText(value) {
  if (typeof value !== 'string') return value;
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function transformValue(value) {
  if (typeof value === 'string') return replaceText(value);
  if (Array.isArray(value)) return value.map(transformValue);
  if (!value || typeof value !== 'object') return value;

  const source = typeof value.toJSON === 'function' ? value.toJSON() : value;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, transformValue(item)]));
}

function transformPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return transformValue(payload);
}

function displayName(interaction) {
  return interaction.member?.displayName || interaction.user?.username || 'Unknown User';
}

async function respond(interaction, payload) {
  const transformed = transformPayload(payload);
  if (interaction.deferred || interaction.replied) return interaction.editReply(transformed);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(transformed);
  return interaction.reply({ ...transformed, ephemeral: true });
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  return transformPayload(await roleStudio.buildRoleStudioPanel(guild, memberDisplayName));
}

async function handleReactionRolesAdminInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;

  if (id === 'admin:reactionRoles') {
    return respond(interaction, await roleStudio.buildRoleStudioPanel(interaction.guild, displayName(interaction)));
  }

  if (id === 'admin:reactionRoles:open') {
    interaction.customId = 'admin:reactionRoles';
  }

  if (id === 'admin:reactionRoles:analytics') {
    return respond(interaction, await roleStudio.buildRoleAnalyticsPanel(interaction.guild, displayName(interaction)));
  }

  if (id === 'admin:reactionRoles:health') {
    return respond(interaction, await roleStudio.buildRoleHealthPanel(interaction.guild, displayName(interaction)));
  }

  if (id.startsWith(temporaryRolesPanel.PREFIX)) {
    return temporaryRolesPanel.handleTemporaryRolesInteraction(interaction);
  }

  const originalReply = interaction.reply?.bind(interaction);
  const originalUpdate = interaction.update?.bind(interaction);
  const originalEditReply = interaction.editReply?.bind(interaction);

  if (originalReply) interaction.reply = (payload) => originalReply(transformPayload(payload));
  if (originalUpdate) interaction.update = (payload) => originalUpdate(transformPayload(payload));
  if (originalEditReply) interaction.editReply = (payload) => originalEditReply(transformPayload(payload));

  try {
    return await reactionPanel.handleReactionRolesAdminInteraction(interaction);
  } finally {
    if (originalReply) interaction.reply = originalReply;
    if (originalUpdate) interaction.update = originalUpdate;
    if (originalEditReply) interaction.editReply = originalEditReply;
  }
}

module.exports = {
  buildReactionRolesAdminPanel,
  handleReactionRolesAdminInteraction,
};

