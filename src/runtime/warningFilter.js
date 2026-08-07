const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const message = String(typeof warning === 'string' ? warning : warning?.message || '');
  const warningName = typeof args[0] === 'string' ? args[0] : args[0]?.type || warning?.name;
  if (warningName === 'DeprecationWarning' && message.includes('ready event has been renamed to clientReady')) return;
  originalEmitWarning(warning, ...args);
};

try {
  const { ModalSubmitInteraction } = require('discord.js');
  const original = ModalSubmitInteraction?.prototype?.isFromMessage;
  if (typeof original === 'function') {
    ModalSubmitInteraction.prototype.isFromMessage = function isFromMessage() {
      return Boolean(this.message) || original.call(this);
    };
  }
} catch (error) {
  console.warn('[Runtime] Unable to apply modal source-message compatibility fix.');
  console.warn(error?.stack || error?.message || error);
}

try {
  const { AsyncLocalStorage } = require('async_hooks');
  const {
    ButtonInteraction,
    ChannelSelectMenuInteraction,
    ChatInputCommandInteraction,
    MentionableSelectMenuInteraction,
    ModalSubmitInteraction,
    RoleSelectMenuBuilder,
    RoleSelectMenuInteraction,
    StringSelectMenuInteraction,
    UserSelectMenuInteraction,
  } = require('discord.js');

  const ctx = new AsyncLocalStorage();
  const converted = new Set();
  const classes = [
    ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction,
    RoleSelectMenuInteraction, ChannelSelectMenuInteraction, UserSelectMenuInteraction,
    MentionableSelectMenuInteraction, ModalSubmitInteraction,
  ].filter(Boolean);

  for (const InteractionClass of classes) {
    for (const method of ['reply', 'update', 'editReply', 'followUp']) {
      const original = InteractionClass?.prototype?.[method];
      if (typeof original !== 'function' || original.__goliathRoleContextWrapped) continue;
      const wrapped = function wrapped(...args) {
        return ctx.run({ guild: this.guild || null }, () => original.apply(this, args));
      };
      wrapped.__goliathRoleContextWrapped = true;
      InteractionClass.prototype[method] = wrapped;
    }
  }

  const originalToJSON = RoleSelectMenuBuilder?.prototype?.toJSON;
  if (typeof originalToJSON === 'function' && !originalToJSON.__goliathHierarchyAware) {
    const wrappedToJSON = function wrappedToJSON(...args) {
      const data = originalToJSON.apply(this, args);
      const guild = ctx.getStore()?.guild;
      const botMember = guild?.members?.me;
      const cache = guild?.roles?.cache;
      if (!guild || !botMember || !cache?.values) return data;

      const selected = new Set(
        (Array.isArray(data.default_values) ? data.default_values : [])
          .filter((entry) => entry?.type === 'role' && entry.id)
          .map((entry) => String(entry.id)),
      );

      const roles = [...cache.values()]
        .filter((role) => role && role.id !== guild.id && role.managed !== true
          && botMember.roles?.highest?.comparePositionTo?.(role) > 0)
        .sort((a, b) => Number(b.rawPosition ?? b.position ?? 0) - Number(a.rawPosition ?? a.position ?? 0)
          || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
        .slice(0, 25);

      const customId = String(data.custom_id || '');
      if (customId) converted.add(customId);
      const available = roles.length;
      return {
        type: 3,
        custom_id: customId,
        placeholder: String(data.placeholder || (available ? 'Select role(s) in server hierarchy order' : 'No manageable roles available')).slice(0, 150),
        min_values: available ? Math.min(Math.max(0, Number(data.min_values ?? 1)), available) : 0,
        max_values: available ? Math.min(Math.max(1, Number(data.max_values || 1)), available, 25) : 1,
        disabled: Boolean(data.disabled) || !available,
        options: available ? roles.map((role) => ({
          label: String(role.name || role.id).slice(0, 100),
          value: String(role.id),
          description: `Hierarchy position ${Number(role.rawPosition ?? role.position ?? 0)}`.slice(0, 100),
          default: selected.has(String(role.id)),
          ...(role.unicodeEmoji ? { emoji: { name: role.unicodeEmoji } } : {}),
        })) : [{
          label: 'No manageable roles available',
          value: 'goliath:no-manageable-roles',
          description: 'Move Goliath above the roles it needs to manage.',
        }],
      };
    };
    wrappedToJSON.__goliathHierarchyAware = true;
    RoleSelectMenuBuilder.prototype.toJSON = wrappedToJSON;
  }

  if (StringSelectMenuInteraction?.prototype) {
    const original = StringSelectMenuInteraction.prototype.isRoleSelectMenu;
    StringSelectMenuInteraction.prototype.isRoleSelectMenu = function isRoleSelectMenu() {
      return converted.has(String(this.customId || ''))
        || (typeof original === 'function' && original.call(this));
    };
  }
} catch (error) {
  console.warn('[Runtime] Unable to apply hierarchy-aware role dropdown standard.');
  console.warn(error?.stack || error?.message || error);
}

try {
  const Module = require('module');
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
  } = require('discord.js');
  const guildManager = require('../core/guild/guildManager');
  const { normalizeAccountInput } = require('../modules/socialStudio/socialAlerts/accountNormalizer');
  const { checkGuildAccounts } = require('../modules/socialStudio/socialAlerts/socialStudioMonitor');

  const PLATFORMS = ['facebook', 'instagram', 'kick', 'tiktok', 'twitch', 'x', 'youtube'];
  const LABEL = { facebook: 'Facebook', instagram: 'Instagram', kick: 'Kick', tiktok: 'TikTok', twitch: 'Twitch', x: 'X', youtube: 'YouTube' };
  const ICON = { facebook: '🔵', instagram: '🟠', kick: '🟢', tiktok: '⚫', twitch: '🟣', x: '⚪', youtube: '🔴' };
  const TYPES = ['live', 'ended', 'vod', 'clip', 'upload', 'short', 'post'];
  const TYPE_LABEL = { live: 'LIVE', ended: 'Stream Ended', vod: 'VOD', clip: 'Clip', upload: 'Upload', short: 'Short', post: 'Social Post' };
  const routingSessions = new Map();
  const accountSessions = new Map();
  const key = (i) => `${i.guildId}:${i.user?.id || 'unknown'}`;
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const clone = (v) => JSON.parse(JSON.stringify(v || {}));
  const row = (...c) => new ActionRowBuilder().addComponents(...c.filter(Boolean));
  const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

  const getSocial = (guildId) => obj(guildManager.getGuildSection(guildId, 'social', {}));
  const saveSocial = (i, social) => guildManager.saveGuildSection(i.guildId, 'social', {
    ...social,
    updatedAt: new Date().toISOString(),
    lastActorId: i.user?.id || null,
  }, { guildId: i.guildId, guild: i.guild, actorId: i.user?.id || null });

  function canManage(i, social) {
    if (i.guild?.ownerId === i.user?.id) return true;
    if (i.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return (Array.isArray(social?.managerRoleIds) ? social.managerRoleIds : [])
      .some((roleId) => i.member?.roles?.cache?.has?.(roleId));
  }

  async function respond(i, payload) {
    if (i.deferred || i.replied) return i.editReply(payload);
    if (i.isButton?.() || i.isAnySelectMenu?.()) return i.update(payload);
    if (i.isModalSubmit?.() && i.message) return i.update(payload);
    return i.reply({ ...payload, flags: 64 });
  }

  function repairText(value) {
    if (typeof value !== 'string' || !value.includes('?')) return value;
    return value
      .replaceAll('??? Delete', '🗑️ Delete')
      .replaceAll('?? Manage Profile', '👤 Manage Profile')
      .replaceAll('?? Edit Profile', '📝 Edit Profile')
      .replaceAll('?? Clear', '🧹 Clear')
      .replaceAll('?? Pause', '⏸️ Pause')
      .replaceAll('?? Resume', '▶️ Resume')
      .replaceAll('?? Back', '⬅️ Back')
      .replaceAll('?? Settings', '⚙️ Settings')
      .replaceAll('?? Monitoring', '🟢 Monitoring')
      .replaceAll('?? Paused', '⏸️ Paused')
      .replaceAll('?? **__Admin Notes__**', '🔒 **__Admin Notes__**')
      .replace(/^\?\? \*\*/m, '👤 **');
  }
  function repair(v) {
    if (typeof v === 'string') return repairText(v);
    if (Array.isArray(v)) return v.map(repair);
    if (!v || typeof v !== 'object') return v;
    const data = typeof v.toJSON === 'function' ? v.toJSON() : v;
    return Object.fromEntries(Object.entries(data).map(([k, x]) => [k, repair(x)]));
  }

  function channelMenu(id, selected, placeholder) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
    if (selected) menu.setDefaultChannels([selected]);
    return row(menu);
  }
  function typeMenu(id, selected) {
    return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choose the route to configure')
      .setMinValues(1).setMaxValues(1).addOptions([
        { label: 'All content', value: 'default', description: 'Use one channel for every content type.', default: selected === 'default' },
        ...TYPES.map((type) => ({ label: TYPE_LABEL[type], value: type, description: `Override only ${TYPE_LABEL[type]} posts.`, default: selected === type })),
      ]));
  }
  function routeValue(route, type) { return type === 'default' ? route?.channelId || null : route?.alertChannels?.[type] || null; }

  function platformList(i, social) {
    const routes = obj(social.platformRoutes);
    const lines = PLATFORMS.map((p) => {
      const route = obj(routes[p]);
      const count = Object.keys(obj(route.alertChannels)).length;
      return `**${LABEL[p]}:** ${route.channelId ? `<#${route.channelId}>` : count ? `${count} content-type override(s)` : 'Inherited routing'}`;
    });
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌐 Platform Routes')
        .setDescription(['Creators without a dedicated creator route can be grouped by platform.', '', ...lines].join('\n')).setTimestamp()],
      components: [
        row(new StringSelectMenuBuilder().setCustomId('social:routing:platform:select').setPlaceholder('Choose a platform')
          .setMinValues(1).setMaxValues(1).addOptions(PLATFORMS.map((p) => ({ label: LABEL[p], value: p })))),
        row(btn('social:channels', '⬅️ Channels'), btn('social:routing:creators', '👤 Creator Routes', ButtonStyle.Primary)),
      ],
    };
  }
  function creatorList(i, social) {
    const creators = Object.values(obj(social.creators)).filter((c) => c?.creatorId)
      .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), undefined, { sensitivity: 'base' }));
    const dedicated = creators.filter((c) => c.routing?.channelId || Object.keys(obj(c.routing?.alertChannels)).length).length;
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Creator Routes')
        .setDescription(`Give selected creators their own destination channel while everyone else continues through platform, content-type and default routing.\n\n**Creators with overrides:** ${dedicated}\n**Total creators:** ${creators.length}`).setTimestamp()],
      components: [
        ...(creators.length ? [row(new StringSelectMenuBuilder().setCustomId('social:routing:creator:select').setPlaceholder('Choose a creator')
          .setMinValues(1).setMaxValues(1).addOptions(creators.slice(0, 25).map((c) => ({ label: String(c.displayName || c.creatorId).slice(0, 100), value: c.creatorId }))))] : []),
        row(btn('social:channels', '⬅️ Channels'), btn('social:routing:platforms', '🌐 Platform Routes', ButtonStyle.Primary)),
      ],
    };
  }
  function routeEditor(i, social, scope, target) {
    const session = routingSessions.get(key(i)) || {};
    const type = TYPES.includes(session.routeType) ? session.routeType : 'default';
    const route = scope === 'platform' ? obj(social.platformRoutes?.[target]) : obj(social.creators?.[target]?.routing);
    const selected = routeValue(route, type);
    const name = scope === 'platform' ? LABEL[target] || target : social.creators?.[target]?.displayName || target;
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${scope === 'platform' ? '🌐' : '👤'} ${name} Routing`)
        .setDescription([
          `**All content:** ${route.channelId ? `<#${route.channelId}>` : 'Inherited'}`, '',
          ...TYPES.map((t) => `**${TYPE_LABEL[t]}:** ${route.alertChannels?.[t] ? `<#${route.alertChannels[t]}>` : 'Inherited'}`),
          '', 'Creator routes override platform routes. Platform routes override existing account, content-type and default routes.',
        ].join('\n')).setTimestamp()],
      components: [
        typeMenu(`social:routing:${scope}:type`, type),
        channelMenu(`social:routing:${scope}:channel`, selected, type === 'default' ? 'Choose the channel for all content' : `Choose the ${TYPE_LABEL[type]} channel`),
        row(btn(`social:routing:${scope}:inherit`, '↩️ Use Inherited Routing', ButtonStyle.Secondary, !selected),
          btn(scope === 'platform' ? 'social:routing:platforms' : 'social:routing:creators', '⬅️ Back')),
      ],
    };
  }

  async function handleRouting(i) {
    const id = String(i.customId || '');
    if (!id.startsWith('social:routing:')) return false;
    const social = getSocial(i.guildId);
    if (!canManage(i, social)) throw new Error('You do not have permission to manage Social Studio routing.');
    const session = routingSessions.get(key(i)) || { routeType: 'default', platform: null, creatorId: null };

    if (id === 'social:routing:platforms') return respond(i, platformList(i, social));
    if (id === 'social:routing:creators') return respond(i, creatorList(i, social));
    if (id === 'social:routing:platform:select' || id === 'social:routing:creator:select') {
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      if (scope === 'platform') session.platform = i.values?.[0] || null;
      else session.creatorId = i.values?.[0] || null;
      session.routeType = 'default'; routingSessions.set(key(i), session);
      return respond(i, routeEditor(i, social, scope, scope === 'platform' ? session.platform : session.creatorId));
    }
    if (id.endsWith(':type')) {
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      session.routeType = i.values?.[0] || 'default'; routingSessions.set(key(i), session);
      return respond(i, routeEditor(i, social, scope, scope === 'platform' ? session.platform : session.creatorId));
    }
    if (id.endsWith(':channel') || id.endsWith(':inherit')) {
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      const target = scope === 'platform' ? session.platform : session.creatorId;
      if (!target) throw new Error(`Select a ${scope} first.`);
      const route = scope === 'platform'
        ? { ...obj(social.platformRoutes?.[target]), alertChannels: { ...obj(social.platformRoutes?.[target]?.alertChannels) } }
        : { ...obj(social.creators?.[target]?.routing), alertChannels: { ...obj(social.creators?.[target]?.routing?.alertChannels) } };
      if (id.endsWith(':channel')) {
        const channelId = i.values?.[0] || null;
        if (session.routeType === 'default') route.channelId = channelId;
        else route.alertChannels[session.routeType] = channelId;
      } else if (session.routeType === 'default') delete route.channelId;
      else delete route.alertChannels[session.routeType];

      if (scope === 'platform') {
        social.platformRoutes = { ...obj(social.platformRoutes) };
        if (!route.channelId && !Object.keys(route.alertChannels).length) delete social.platformRoutes[target];
        else social.platformRoutes[target] = route;
      } else {
        const creator = { ...social.creators[target], updatedAt: new Date().toISOString() };
        if (!route.channelId && !Object.keys(route.alertChannels).length) delete creator.routing;
        else creator.routing = route;
        social.creators[target] = creator;
      }
      saveSocial(i, social);
      return respond(i, routeEditor(i, getSocial(i.guildId), scope, target));
    }
    return false;
  }

  function selectedCreator(i, social) {
    for (const actionRow of i.message?.components || []) {
      const data = typeof actionRow?.toJSON === 'function' ? actionRow.toJSON() : actionRow;
      for (const component of data?.components || []) {
        if ((component.custom_id || component.customId) !== 'social:creator:select') continue;
        const selected = (component.options || []).find((option) => option.default === true);
        if (selected?.value && social.creators?.[selected.value]) return selected.value;
      }
    }
    const description = String(i.message?.embeds?.[0]?.data?.description || i.message?.embeds?.[0]?.toJSON?.()?.description || '');
    const match = description.match(/👤 \*\*(.+?)\*\*/);
    return Object.values(obj(social.creators)).find((c) => match && String(c?.displayName || '') === match[1])?.creatorId || null;
  }
  function accountStatus(a) {
    if (a?.enabled === false) return '⏸️ Paused';
    if (a?.state?.isLive === true) return '🔴 LIVE';
    if (a?.state?.isLive === false) return '⚫ Offline';
    if (a?.state?.lastError) return '🟡 Unavailable';
    return '🟢 Monitoring';
  }
  function accountPayload(i, social, creatorId, accountId = null) {
    const creator = social.creators?.[creatorId];
    if (!creator) throw new Error('The selected creator profile no longer exists.');
    const accounts = (creator.accountIds || []).map((id) => social.accounts?.[id]).filter(Boolean);
    const selected = accounts.find((a) => String(a.accountId) === String(accountId)) || null;
    if (!selected) return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🛠️ Manage Accounts')
        .setDescription([`**Creator:** ${creator.displayName}`, `**Accounts:** ${accounts.length}`, '',
          ...(accounts.length ? accounts.map((a) => `${ICON[a.platform] || '🌐'} **${LABEL[a.platform] || a.platform}** — ${a.username || a.externalId || 'Resolving…'} — ${accountStatus(a)}`) : ['No social accounts are linked to this creator.']),
          '', 'Choose an account below to edit, pause or remove it.'].join('\n')).setTimestamp()],
      components: [
        ...(accounts.length ? [row(new StringSelectMenuBuilder().setCustomId('social:runtime:account:select').setPlaceholder('Select an account to manage')
          .setMinValues(1).setMaxValues(1).addOptions(accounts.slice(0, 25).map((a) => ({
            label: `${LABEL[a.platform] || a.platform} · ${a.username || a.externalId || 'Resolving'}`.slice(0, 100),
            value: String(a.accountId), description: accountStatus(a),
          }))))] : []),
        row(btn('social:creators', '⬅️ Creator Profiles'), btn('social:settings', '⚙️ Settings')),
      ],
    };
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🔗 Manage Social Account').setDescription([
        `${ICON[selected.platform] || '🌐'} **${LABEL[selected.platform] || selected.platform}**`,
        `**${selected.username || selected.externalId || 'Resolving…'}**`, accountStatus(selected), '',
        `**Creator:** ${creator.displayName}`,
        `**Monitoring:** ${selected.enabled === false ? 'Paused' : 'Enabled'}`,
        `**Default route:** ${selected.alertChannelId ? `<#${selected.alertChannelId}>` : social.alertsChannelId ? `Server default <#${social.alertsChannelId}>` : 'Inherited / not configured'}`,
      ].join('\n')).setTimestamp()],
      components: [
        row(btn('social:runtime:account:edit', '📝 Edit', ButtonStyle.Primary),
          btn('social:runtime:account:toggle', selected.enabled === false ? '▶️ Resume' : '⏸️ Pause'),
          btn('social:runtime:account:delete', '🗑️ Delete', ButtonStyle.Danger),
          ...(selected.profileUrl && /^https?:\/\//i.test(selected.profileUrl)
            ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(selected.profileUrl).setLabel('🔗 Open Profile')] : [])),
        row(btn('social:runtime:accounts', '⬅️ Accounts'), btn('social:creators', '👥 Creator Profiles'), btn('social:settings', '⚙️ Settings')),
      ],
    };
  }
  function accountModal(account) {
    return new ModalBuilder().setCustomId('social:runtime:account:update').setTitle(`Edit ${LABEL[account.platform] || account.platform} Account`)
      .addComponents(row(new TextInputBuilder().setCustomId('accountValue').setLabel('Username, channel ID or URL')
        .setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)
        .setValue(String(account.sourceInput || account.profileUrl || account.externalId || account.username || '').slice(0, 500))));
  }
  async function handleAccounts(i) {
    const id = String(i.customId || '');
    if (!['social:creator:accounts','social:runtime:accounts','social:runtime:account:select','social:runtime:account:edit',
      'social:runtime:account:update','social:runtime:account:toggle','social:runtime:account:delete',
      'social:runtime:account:delete:confirm','social:runtime:account:delete:cancel'].includes(id)) return false;
    const social = getSocial(i.guildId);
    if (!canManage(i, social)) throw new Error('You do not have permission to manage Social Studio accounts.');
    const session = accountSessions.get(key(i)) || { creatorId: null, accountId: null };

    if (id === 'social:creator:accounts') {
      session.creatorId = selectedCreator(i, social); session.accountId = null;
      if (!session.creatorId) throw new Error('Select a creator profile first.');
      accountSessions.set(key(i), session);
      return respond(i, accountPayload(i, social, session.creatorId));
    }
    if (!session.creatorId || !social.creators?.[session.creatorId]) throw new Error('Open Manage Account from a creator profile first.');
    if (id === 'social:runtime:accounts') {
      session.accountId = null; accountSessions.set(key(i), session);
      return respond(i, accountPayload(i, social, session.creatorId));
    }
    if (id === 'social:runtime:account:select') {
      session.accountId = i.values?.[0] || null; accountSessions.set(key(i), session);
      return respond(i, accountPayload(i, social, session.creatorId, session.accountId));
    }
    const account = social.accounts?.[session.accountId];
    if (!account) throw new Error('Select an account to manage first.');
    if (id === 'social:runtime:account:edit') { await i.showModal(accountModal(account)); return true; }
    if (id === 'social:runtime:account:update') {
      const n = normalizeAccountInput(account.platform, i.fields.getTextInputValue('accountValue').trim());
      const duplicate = Object.values(obj(social.accounts)).find((other) => String(other?.accountId) !== String(account.accountId)
        && String(other?.platform || '').toLowerCase() === String(account.platform || '').toLowerCase()
        && String(other?.canonicalIdentity || other?.externalId || other?.normalizedUsername || other?.username || '').toLowerCase()
          === String(n.canonicalIdentity || n.externalId || n.normalizedUsername || n.username || '').toLowerCase());
      if (duplicate) throw new Error('That social account is already linked in Social Studio.');
      social.accounts[account.accountId] = { ...account, username: n.username, normalizedUsername: n.normalizedUsername,
        externalId: n.externalId || account.externalId || null, inputType: n.inputType, canonicalIdentity: n.canonicalIdentity,
        profileUrl: n.profileUrl, sourceInput: n.sourceInput, updatedAt: new Date().toISOString() };
      saveSocial(i, social);
      return respond(i, accountPayload(i, getSocial(i.guildId), session.creatorId, session.accountId));
    }
    if (id === 'social:runtime:account:toggle') {
      account.enabled = account.enabled === false; account.updatedAt = new Date().toISOString(); saveSocial(i, social);
      return respond(i, accountPayload(i, getSocial(i.guildId), session.creatorId, session.accountId));
    }
    if (id === 'social:runtime:account:delete') return respond(i, {
      embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🗑️ Delete Social Account?')
        .setDescription(`Remove **${LABEL[account.platform] || account.platform} — ${account.username || account.externalId || account.accountId}** from **${social.creators[session.creatorId].displayName}**?`).setTimestamp()],
      components: [row(btn('social:runtime:account:delete:confirm', '🗑️ Delete Account', ButtonStyle.Danger), btn('social:runtime:account:delete:cancel', 'Cancel'))],
    });
    if (id === 'social:runtime:account:delete:cancel') return respond(i, accountPayload(i, social, session.creatorId, session.accountId));
    if (id === 'social:runtime:account:delete:confirm') {
      delete social.accounts[session.accountId];
      for (const creator of Object.values(obj(social.creators))) creator.accountIds = (creator.accountIds || []).filter((x) => String(x) !== String(session.accountId));
      session.accountId = null; accountSessions.set(key(i), session); saveSocial(i, social);
      return respond(i, accountPayload(i, getSocial(i.guildId), session.creatorId));
    }
    return false;
  }

  function quietModal(social) {
    const q = obj(social.settings?.quietHours);
    return new ModalBuilder().setCustomId('social:runtime:automation:quiet:save').setTitle('Configure Quiet Hours').addComponents(
      row(new TextInputBuilder().setCustomId('enabled').setLabel('Enabled? yes or no').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true).setValue(q.enabled === true ? 'yes' : 'no')),
      row(new TextInputBuilder().setCustomId('start').setLabel('Start time, HH:MM').setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true).setValue(String(q.start || '23:00'))),
      row(new TextInputBuilder().setCustomId('end').setLabel('End time, HH:MM').setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true).setValue(String(q.end || '08:00'))),
      row(new TextInputBuilder().setCustomId('timezone').setLabel('Timezone').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(String(q.timezone || 'Europe/London'))),
    );
  }
  async function handleMonitoring(i) {
    const id = String(i.customId || '');
    const ids = ['social:automation:quiet','social:runtime:automation:quiet:save','social:automation:interval','social:automation:dupes',
      'social:automation:retry','social:automation:editlive','social:automation:deleteended','social:automation:viewers',
      'social:automation:duration','social:account:check','social:test','social:toggle'];
    if (!ids.includes(id)) return null;
    const social = getSocial(i.guildId);
    if (!canManage(i, social)) throw new Error('You do not have permission to manage Social Studio monitoring.');
    social.settings = { ...obj(social.settings) };

    if (id === 'social:automation:quiet') { await i.showModal(quietModal(social)); return true; }
    if (id === 'social:runtime:automation:quiet:save') {
      const enabled = String(i.fields.getTextInputValue('enabled') || '').trim().toLowerCase();
      const start = String(i.fields.getTextInputValue('start') || '').trim();
      const end = String(i.fields.getTextInputValue('end') || '').trim();
      const timezone = String(i.fields.getTextInputValue('timezone') || '').trim();
      if (!['yes','no'].includes(enabled)) throw new Error('Quiet Hours enabled must be yes or no.');
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end)) throw new Error('Quiet Hours times must use HH:MM (24-hour time).');
      try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date()); } catch { throw new Error('Enter a valid IANA timezone, for example Europe/London.'); }
      social.settings.quietHours = { enabled: enabled === 'yes', start, end, timezone };
      saveSocial(i, social);
      return respond(i, { content: `✅ Quiet Hours ${enabled === 'yes' ? `enabled (${start}–${end}, ${timezone})` : 'disabled'}.`, components: [], embeds: [] });
    }
    if (id === 'social:automation:interval') {
      const value = Number(i.values?.[0]);
      if (![30000,60000,300000,600000,900000,1800000,3600000].includes(value)) throw new Error('Invalid monitoring interval.');
      social.settings.checkIntervalMs = value; saveSocial(i, social); return false;
    }
    if (id === 'social:automation:dupes') { social.settings.suppressDuplicates = String(i.values?.[0]) === 'true'; saveSocial(i, social); return false; }
    if (id === 'social:automation:retry') { social.settings.retryDeliveries = String(i.values?.[0]) === 'true'; saveSocial(i, social); return false; }
    if (id === 'social:automation:editlive') { social.settings.editLiveNotifications = social.settings.editLiveNotifications === false; saveSocial(i, social); return false; }
    if (id === 'social:automation:deleteended') { social.settings.deleteEndedNotifications = social.settings.deleteEndedNotifications === false; saveSocial(i, social); return false; }
    if (id === 'social:automation:viewers') { social.settings.includeViewerCount = social.settings.includeViewerCount === false; saveSocial(i, social); return false; }
    if (id === 'social:automation:duration') { social.settings.includeLiveDuration = social.settings.includeLiveDuration === false; saveSocial(i, social); return false; }
    if (id === 'social:toggle') {
      if (typeof guildManager.setModuleEnabled === 'function') guildManager.setModuleEnabled(i.guildId, 'social', !guildManager.isModuleEnabled(i.guildId, 'social'), { guildId: i.guildId, guild: i.guild, actorId: i.user?.id || null });
      else throw new Error('Module toggle service is unavailable.');
      return false;
    }
    if (id === 'social:account:check') {
      const result = await checkGuildAccounts(i.client, i.guildId, { manual: true, force: true, includeDisabled: false });
      const bad = (result.results || []).filter((r) => r.reason || r.status === 'error' || r.status === 'unavailable');
      await i.followUp({ content: `🔄 Provider check complete: ${result.checked || 0} checked${result.merged ? `, ${result.merged} duplicate(s) merged` : ''}${bad.length ? `, ${bad.length} issue(s)` : ''}.`, flags: 64 }).catch(() => null);
      return false;
    }
    if (id === 'social:test') {
      const channelId = social.alertsChannelId;
      if (!channelId) throw new Error('Choose a default Social Studio channel first.');
      const channel = i.guild?.channels?.cache?.get(channelId) || await i.guild?.channels?.fetch?.(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) throw new Error('The configured Social Studio channel is unavailable.');
      await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🧪 Social Studio Test')
        .setDescription('✅ Notification routing is working.\n\nThis is a test LIVE alert from Social Studio.').setTimestamp()] });
      await i.followUp({ content: `✅ Test alert sent to <#${channelId}>.`, flags: 64 }).catch(() => null);
      return false;
    }
    return false;
  }

  function augment(payload) {
    payload = repair(payload);
    if (!payload || !Array.isArray(payload.embeds)) return payload;
    const title = payload.embeds.map((e) => typeof e?.toJSON === 'function' ? e.toJSON().title : e?.title).find(Boolean);
    if (title !== '📂 Channels') return payload;
    const components = Array.isArray(payload.components) ? [...payload.components] : [];
    const exists = components.some((r) => {
      const d = typeof r?.toJSON === 'function' ? r.toJSON() : r;
      return d?.components?.some((c) => (c.custom_id || c.customId) === 'social:routing:platforms');
    });
    if (!exists) components.splice(Math.max(0, components.length - 1), 0,
      row(btn('social:routing:platforms', '🌐 Platform Routes', ButtonStyle.Primary), btn('social:routing:creators', '👤 Creator Routes', ButtonStyle.Primary)));
    return { ...payload, components };
  }

  const originalReload = guildManager.reloadGuild?.bind(guildManager);
  if (typeof originalReload === 'function') {
    guildManager.reloadGuild = function routedReload(guildId, ...args) {
      const data = originalReload(guildId, ...args);
      const social = data?.modules?.social;
      if (!social || typeof social !== 'object') return data;
      const routed = clone(data);
      const s = routed.modules.social;
      for (const account of Object.values(obj(s.accounts))) {
        const creator = Object.values(obj(s.creators)).find((c) => (c.accountIds || []).map(String).includes(String(account.accountId)));
        const cr = obj(creator?.routing), pr = obj(obj(s.platformRoutes)[String(account.platform || '').toLowerCase()]);
        account.alertChannels = { ...obj(account.alertChannels) };
        for (const type of TYPES) {
          const override = cr.alertChannels?.[type] || cr.channelId || pr.alertChannels?.[type] || pr.channelId;
          if (override) account.alertChannels[type] = override;
        }
        account.alertChannelId = cr.channelId || pr.channelId || account.alertChannelId || null;
      }
      return routed;
    };
  }

  const originalLoad = Module._load;
  Module._load = function socialCompatibilityLoader(request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (!/socialStudioPanel(?:\.js)?$/.test(String(request)) || !loaded || loaded.__goliathCompatibilityWrapped) return loaded;
    const original = loaded.handleSocialAdminInteraction;
    if (typeof original !== 'function') return loaded;
    loaded.handleSocialAdminInteraction = async function wrappedSocial(i, ...args) {
      if (await handleAccounts(i)) return true;
      if (await handleRouting(i)) return true;
      const monitoringResult = await handleMonitoring(i);
      if (monitoringResult === true) return true;

      const originals = {};
      for (const method of ['reply','update','editReply','followUp']) {
        if (typeof i[method] !== 'function') continue;
        originals[method] = i[method];
        i[method] = function wrappedResponse(payload, ...rest) { return originals[method].call(this, augment(payload), ...rest); };
      }
      const handledIds = ['social:automation:interval','social:automation:dupes','social:automation:retry','social:automation:editlive',
        'social:automation:deleteended','social:automation:viewers','social:automation:duration','social:account:check','social:test','social:toggle'];
      try {
        const result = await original.call(this, i, ...args);
        if (monitoringResult === false && handledIds.includes(String(i.customId || ''))) return true;
        return result;
      } catch (error) {
        if (monitoringResult === false && handledIds.includes(String(i.customId || ''))
          && /Unknown Social Studio interaction/.test(String(error?.message || ''))) return true;
        throw error;
      } finally {
        for (const [method, originalMethod] of Object.entries(originals)) i[method] = originalMethod;
      }
    };
    loaded.__goliathCompatibilityWrapped = true;
    return loaded;
  };
} catch (error) {
  console.warn('[Runtime] Unable to load Social Studio compatibility layer.');
  console.warn(error?.stack || error?.message || error);
}
