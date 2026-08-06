const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const message = String(typeof warning === 'string' ? warning : warning?.message || '');
  const warningName = typeof args[0] === 'string' ? args[0] : args[0]?.type || warning?.name;
  const isKnownDiscordReadyWarning = warningName === 'DeprecationWarning' && message.includes('ready event has been renamed to clientReady');

  if (isKnownDiscordReadyWarning) {
    return;
  }

  originalEmitWarning(warning, ...args);
};

// Discord.js modal submissions can carry the source message even when
// isFromMessage() reports false. Treat an attached source message as the
// authoritative signal so panel modal submissions edit the existing ephemeral
// panel instead of creating another "Only you can see this" response.
try {
  const { ModalSubmitInteraction } = require('discord.js');
  const originalIsFromMessage = ModalSubmitInteraction?.prototype?.isFromMessage;

  if (typeof originalIsFromMessage === 'function') {
    ModalSubmitInteraction.prototype.isFromMessage = function isFromMessage() {
      return Boolean(this.message) || originalIsFromMessage.call(this);
    };
  }
} catch (error) {
  console.warn('[Runtime] Unable to apply modal source-message compatibility fix.');
  console.warn(error?.stack || error?.message || error);
}

// Standardise every current and future role dropdown across Goliath.
// Discord's native role selector decides its own ordering and can expose roles
// that a bot cannot manage. During response serialization we convert native role
// selectors into normal string selectors populated from the live guild cache.
// This gives every module the same true hierarchy order and manageability rules.
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

  const roleSelectContext = new AsyncLocalStorage();
  const convertedRoleSelectIds = new Set();
  const RESPONSE_METHODS = ['reply', 'update', 'editReply', 'followUp'];
  const RESPONSE_CLASSES = [
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    RoleSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    UserSelectMenuInteraction,
    MentionableSelectMenuInteraction,
    ModalSubmitInteraction,
  ].filter(Boolean);

  for (const InteractionClass of RESPONSE_CLASSES) {
    for (const methodName of RESPONSE_METHODS) {
      const current = InteractionClass?.prototype?.[methodName];
      if (typeof current !== 'function' || current.__goliathRoleContextWrapped) continue;

      const wrapped = function wrappedInteractionResponse(...args) {
        return roleSelectContext.run({ guild: this.guild || null }, () => current.apply(this, args));
      };
      wrapped.__goliathRoleContextWrapped = true;
      InteractionClass.prototype[methodName] = wrapped;
    }
  }

  const originalRoleSelectToJSON = RoleSelectMenuBuilder?.prototype?.toJSON;
  if (typeof originalRoleSelectToJSON === 'function' && !originalRoleSelectToJSON.__goliathHierarchyAware) {
    const hierarchyAwareToJSON = function hierarchyAwareRoleSelectToJSON(...args) {
      const data = originalRoleSelectToJSON.apply(this, args);
      const guild = roleSelectContext.getStore()?.guild;
      const botMember = guild?.members?.me;
      const roleCache = guild?.roles?.cache;

      if (!guild || !botMember || !roleCache?.values) return data;

      const selected = new Set(
        (Array.isArray(data.default_values) ? data.default_values : [])
          .filter((entry) => entry?.type === 'role' && entry.id)
          .map((entry) => String(entry.id)),
      );

      const roles = [...roleCache.values()]
        .filter((role) => (
          role
          && role.id !== guild.id
          && role.managed !== true
          && botMember.roles?.highest?.comparePositionTo?.(role) > 0
        ))
        .sort((left, right) => {
          const position = Number(right.rawPosition ?? right.position ?? 0)
            - Number(left.rawPosition ?? left.position ?? 0);
          if (position) return position;
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
            sensitivity: 'base',
          });
        });

      const visibleRoles = roles.slice(0, 25);
      const desiredMax = Math.max(1, Number(data.max_values || 1));
      const desiredMin = Math.max(0, Number(data.min_values ?? 1));
      const available = visibleRoles.length;
      const customId = String(data.custom_id || '');

      if (customId) convertedRoleSelectIds.add(customId);

      return {
        type: 3,
        custom_id: customId,
        placeholder: String(
          data.placeholder
          || (available ? 'Select role(s) in server hierarchy order' : 'No manageable roles available'),
        ).slice(0, 150),
        min_values: available ? Math.min(desiredMin, available) : 0,
        max_values: available ? Math.min(desiredMax, available, 25) : 1,
        disabled: Boolean(data.disabled) || !available,
        options: available
          ? visibleRoles.map((role) => ({
              label: String(role.name || role.id).slice(0, 100),
              value: String(role.id),
              description: `Hierarchy position ${Number(role.rawPosition ?? role.position ?? 0)}`.slice(0, 100),
              default: selected.has(String(role.id)),
              ...(role.unicodeEmoji ? { emoji: { name: role.unicodeEmoji } } : {}),
            }))
          : [{
              label: 'No manageable roles available',
              value: 'goliath:no-manageable-roles',
              description: 'Move Goliath above the roles it needs to manage.',
            }],
      };
    };

    hierarchyAwareToJSON.__goliathHierarchyAware = true;
    RoleSelectMenuBuilder.prototype.toJSON = hierarchyAwareToJSON;
  }

  const originalIsRoleSelectMenu = StringSelectMenuInteraction?.prototype?.isRoleSelectMenu;
  if (StringSelectMenuInteraction?.prototype) {
    StringSelectMenuInteraction.prototype.isRoleSelectMenu = function isRoleSelectMenu() {
      return convertedRoleSelectIds.has(String(this.customId || ''))
        || (typeof originalIsRoleSelectMenu === 'function' && originalIsRoleSelectMenu.call(this));
    };
  }
} catch (error) {
  console.warn('[Runtime] Unable to apply hierarchy-aware role dropdown standard.');
  console.warn(error?.stack || error?.message || error);
}

// Social Studio mixed routing.
// Creator routes win over platform routes, which win over the existing account,
// alert-type and default routes. The existing data remains valid and unchanged
// until an administrator explicitly adds an override.
try {
  const Module = require('module');
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
  } = require('discord.js');
  const guildManager = require('../core/guild/guildManager');

  const PLATFORM_IDS = ['facebook', 'instagram', 'kick', 'tiktok', 'twitch', 'x', 'youtube'];
  const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', kick: 'Kick', tiktok: 'TikTok', twitch: 'Twitch', x: 'X', youtube: 'YouTube' };
  const ALERT_TYPES = ['live', 'ended', 'vod', 'clip', 'upload', 'short', 'post'];
  const ALERT_LABELS = { live: 'LIVE', ended: 'Stream Ended', vod: 'VOD', clip: 'Clip', upload: 'Upload', short: 'Short', post: 'Social Post' };
  const routingSessions = new Map();
  const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
  const row = (...components) => new ActionRowBuilder().addComponents(...components.filter(Boolean));
  const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  function canManage(interaction, social) {
    if (interaction.guild?.ownerId === interaction.user?.id) return true;
    if (interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    const managerRoles = Array.isArray(social?.managerRoleIds) ? social.managerRoleIds : [];
    return managerRoles.some((roleId) => interaction.member?.roles?.cache?.has?.(roleId));
  }

  function getSocial(guildId) {
    return object(guildManager.getGuildSection(guildId, 'social', {}));
  }

  function saveSocial(interaction, social) {
    return guildManager.saveGuildSection(interaction.guildId, 'social', {
      ...social,
      updatedAt: new Date().toISOString(),
      lastActorId: interaction.user?.id || null,
    }, { guildId: interaction.guildId, guild: interaction.guild, actorId: interaction.user?.id || null });
  }

  function routeValue(route, type) {
    if (!route) return null;
    return type === 'default' ? route.channelId || null : route.alertChannels?.[type] || null;
  }

  function routeTypeMenu(customId, selected) {
    return row(new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Choose the route to configure')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions([
        { label: 'All content', value: 'default', description: 'Use one channel for every content type.', default: selected === 'default' },
        ...ALERT_TYPES.map((type) => ({ label: ALERT_LABELS[type], value: type, description: `Override only ${ALERT_LABELS[type]} posts.`, default: selected === type })),
      ]));
  }

  function channelMenu(customId, selected, placeholder) {
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    if (selected) menu.setDefaultChannels([selected]);
    return row(menu);
  }

  function platformListPayload(interaction, social) {
    const routes = object(social.platformRoutes);
    const lines = PLATFORM_IDS.map((platform) => {
      const route = object(routes[platform]);
      const count = Object.keys(object(route.alertChannels)).length;
      const summary = route.channelId ? `<#${route.channelId}>` : count ? `${count} content-type override(s)` : 'Inherited routing';
      return `**${PLATFORM_LABELS[platform]}:** ${summary}`;
    });
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌐 Platform Routes').setDescription(['Creators without a dedicated creator route can be grouped by platform.', '', ...lines].join('\n')).setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user?.username || 'Administrator'}` }).setTimestamp()],
      components: [
        row(new StringSelectMenuBuilder().setCustomId('social:routing:platform:select').setPlaceholder('Choose a platform').setMinValues(1).setMaxValues(1).addOptions(PLATFORM_IDS.map((platform) => ({ label: PLATFORM_LABELS[platform], value: platform })))),
        row(button('social:channels', '⬅️ Channels'), button('social:routing:creators', '👤 Creator Routes', ButtonStyle.Primary)),
      ],
    };
  }

  function creatorListPayload(interaction, social) {
    const creators = Object.values(object(social.creators)).filter((creator) => creator?.creatorId).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), undefined, { sensitivity: 'base' }));
    const dedicated = creators.filter((creator) => creator.routing?.channelId || Object.keys(object(creator.routing?.alertChannels)).length).length;
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Creator Routes').setDescription(`Give selected creators their own destination channel while everyone else continues through platform, content-type and default routing.\n\n**Creators with overrides:** ${dedicated}\n**Total creators:** ${creators.length}`).setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user?.username || 'Administrator'}` }).setTimestamp()],
      components: [
        ...(creators.length ? [row(new StringSelectMenuBuilder().setCustomId('social:routing:creator:select').setPlaceholder('Choose a creator').setMinValues(1).setMaxValues(1).addOptions(creators.slice(0, 25).map((creator) => ({ label: String(creator.displayName || creator.creatorId).slice(0, 100), value: creator.creatorId, description: creator.routing?.channelId ? `All content → #${creator.routing.channelId}`.slice(0, 100) : 'Uses inherited routing' }))))] : []),
        row(button('social:channels', '⬅️ Channels'), button('social:routing:platforms', '🌐 Platform Routes', ButtonStyle.Primary)),
      ],
    };
  }

  function routeEditorPayload(interaction, social, scope, key) {
    const session = routingSessions.get(sessionKey(interaction)) || {};
    const type = ALERT_TYPES.includes(session.routeType) ? session.routeType : 'default';
    const entity = scope === 'platform' ? object(social.platformRoutes?.[key]) : object(social.creators?.[key]?.routing);
    const selected = routeValue(entity, type);
    const name = scope === 'platform' ? PLATFORM_LABELS[key] || key : social.creators?.[key]?.displayName || key;
    const typeLines = ALERT_TYPES.map((alertType) => `**${ALERT_LABELS[alertType]}:** ${entity.alertChannels?.[alertType] ? `<#${entity.alertChannels[alertType]}>` : 'Inherited'}`);
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${scope === 'platform' ? '🌐' : '👤'} ${name} Routing`).setDescription([`**All content:** ${entity.channelId ? `<#${entity.channelId}>` : 'Inherited'}`, '', ...typeLines, '', 'Creator routes override platform routes. Platform routes override existing account, content-type and default routes.'].join('\n')).setFooter({ text: `Requested by ${interaction.member?.displayName || interaction.user?.username || 'Administrator'}` }).setTimestamp()],
      components: [
        routeTypeMenu(`social:routing:${scope}:type`, type),
        channelMenu(`social:routing:${scope}:channel`, selected, type === 'default' ? 'Choose the channel for all content' : `Choose the ${ALERT_LABELS[type]} channel`),
        row(button(`social:routing:${scope}:inherit`, '↩️ Use Inherited Routing', ButtonStyle.Secondary, !selected), button(scope === 'platform' ? 'social:routing:platforms' : 'social:routing:creators', '⬅️ Back')),
      ],
    };
  }

  async function respond(interaction, payload) {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(payload);
    return interaction.reply({ ...payload, flags: 64 });
  }

  async function handleRouting(interaction) {
    const id = String(interaction.customId || '');
    if (!id.startsWith('social:routing:')) return false;
    const social = getSocial(interaction.guildId);
    if (!canManage(interaction, social)) throw new Error('You do not have permission to manage Social Studio routing.');
    const key = sessionKey(interaction);
    const session = routingSessions.get(key) || { routeType: 'default', platform: null, creatorId: null };

    if (id === 'social:routing:platforms') return respond(interaction, platformListPayload(interaction, social));
    if (id === 'social:routing:creators') return respond(interaction, creatorListPayload(interaction, social));
    if (id === 'social:routing:platform:select') {
      session.platform = interaction.values?.[0] || null;
      session.routeType = 'default';
      routingSessions.set(key, session);
      return respond(interaction, routeEditorPayload(interaction, social, 'platform', session.platform));
    }
    if (id === 'social:routing:creator:select') {
      session.creatorId = interaction.values?.[0] || null;
      session.routeType = 'default';
      routingSessions.set(key, session);
      return respond(interaction, routeEditorPayload(interaction, social, 'creator', session.creatorId));
    }
    if (id === 'social:routing:platform:type' || id === 'social:routing:creator:type') {
      session.routeType = interaction.values?.[0] || 'default';
      routingSessions.set(key, session);
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      return respond(interaction, routeEditorPayload(interaction, social, scope, scope === 'platform' ? session.platform : session.creatorId));
    }
    if (id === 'social:routing:platform:channel' || id === 'social:routing:creator:channel') {
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      const target = scope === 'platform' ? session.platform : session.creatorId;
      const channelId = interaction.values?.[0] || null;
      if (!target) throw new Error(`Select a ${scope} first.`);
      const route = scope === 'platform'
        ? { ...object(social.platformRoutes?.[target]), alertChannels: { ...object(social.platformRoutes?.[target]?.alertChannels) } }
        : { ...object(social.creators?.[target]?.routing), alertChannels: { ...object(social.creators?.[target]?.routing?.alertChannels) } };
      if (session.routeType === 'default') route.channelId = channelId;
      else route.alertChannels[session.routeType] = channelId;
      if (scope === 'platform') social.platformRoutes = { ...object(social.platformRoutes), [target]: route };
      else social.creators[target] = { ...social.creators[target], routing: route, updatedAt: new Date().toISOString() };
      saveSocial(interaction, social);
      return respond(interaction, routeEditorPayload(interaction, getSocial(interaction.guildId), scope, target));
    }
    if (id === 'social:routing:platform:inherit' || id === 'social:routing:creator:inherit') {
      const scope = id.includes(':platform:') ? 'platform' : 'creator';
      const target = scope === 'platform' ? session.platform : session.creatorId;
      if (!target) throw new Error(`Select a ${scope} first.`);
      const route = scope === 'platform'
        ? { ...object(social.platformRoutes?.[target]), alertChannels: { ...object(social.platformRoutes?.[target]?.alertChannels) } }
        : { ...object(social.creators?.[target]?.routing), alertChannels: { ...object(social.creators?.[target]?.routing?.alertChannels) } };
      if (session.routeType === 'default') delete route.channelId;
      else delete route.alertChannels[session.routeType];
      if (scope === 'platform') {
        social.platformRoutes = { ...object(social.platformRoutes) };
        if (!route.channelId && !Object.keys(route.alertChannels).length) delete social.platformRoutes[target];
        else social.platformRoutes[target] = route;
      } else {
        const creator = { ...social.creators[target], updatedAt: new Date().toISOString() };
        if (!route.channelId && !Object.keys(route.alertChannels).length) delete creator.routing;
        else creator.routing = route;
        social.creators[target] = creator;
      }
      saveSocial(interaction, social);
      return respond(interaction, routeEditorPayload(interaction, getSocial(interaction.guildId), scope, target));
    }
    return false;
  }

  function augmentChannelsPayload(payload) {
    if (!payload || !Array.isArray(payload.embeds)) return payload;
    const title = payload.embeds.map((embed) => typeof embed?.toJSON === 'function' ? embed.toJSON().title : embed?.title).find(Boolean);
    if (title !== '📂 Channels') return payload;
    const components = Array.isArray(payload.components) ? [...payload.components] : [];
    const alreadyAdded = components.some((actionRow) => {
      const data = typeof actionRow?.toJSON === 'function' ? actionRow.toJSON() : actionRow;
      return data?.components?.some((component) => (component.custom_id || component.customId) === 'social:routing:platforms');
    });
    if (!alreadyAdded) components.splice(Math.max(0, components.length - 1), 0, row(button('social:routing:platforms', '🌐 Platform Routes', ButtonStyle.Primary), button('social:routing:creators', '👤 Creator Routes', ButtonStyle.Primary)));
    return { ...payload, components };
  }

  const originalReloadGuild = guildManager.reloadGuild?.bind(guildManager);
  if (typeof originalReloadGuild === 'function' && !guildManager.reloadGuild.__goliathSocialRouting) {
    const routedReloadGuild = function routedReloadGuild(guildId, ...args) {
      const guildData = originalReloadGuild(guildId, ...args);
      const social = guildData?.modules?.social;
      if (!social || typeof social !== 'object') return guildData;
      const routed = clone(guildData);
      const routedSocial = routed.modules.social;
      const creators = object(routedSocial.creators);
      const platforms = object(routedSocial.platformRoutes);
      const accounts = object(routedSocial.accounts);
      for (const account of Object.values(accounts)) {
        if (!account || typeof account !== 'object') continue;
        const creator = Object.values(creators).find((item) => Array.isArray(item?.accountIds) && item.accountIds.map(String).includes(String(account.accountId)));
        const creatorRoute = object(creator?.routing);
        const platformRoute = object(platforms[String(account.platform || '').toLowerCase()]);
        const originalTypeRoutes = { ...object(account.alertChannels) };
        account.alertChannels = { ...originalTypeRoutes };
        for (const type of ALERT_TYPES) {
          const override = creatorRoute.alertChannels?.[type]
            || creatorRoute.channelId
            || platformRoute.alertChannels?.[type]
            || platformRoute.channelId;
          if (override) account.alertChannels[type] = override;
        }
        account.alertChannelId = creatorRoute.channelId || platformRoute.channelId || account.alertChannelId || null;
      }
      return routed;
    };
    routedReloadGuild.__goliathSocialRouting = true;
    guildManager.reloadGuild = routedReloadGuild;
  }

  const originalLoad = Module._load;
  Module._load = function goliathSocialRoutingLoader(request, parent, isMain) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (!/socialStudioPanel(?:\.js)?$/.test(String(request)) || !loaded || loaded.__goliathRoutingWrapped) return loaded;
    const originalHandler = loaded.handleSocialAdminInteraction;
    if (typeof originalHandler !== 'function') return loaded;
    loaded.handleSocialAdminInteraction = async function routedSocialHandler(interaction, ...args) {
      if (await handleRouting(interaction)) return true;
      const originals = {};
      for (const method of ['reply', 'update', 'editReply', 'followUp']) {
        if (typeof interaction[method] !== 'function') continue;
        originals[method] = interaction[method];
        interaction[method] = function augmentedSocialResponse(payload, ...methodArgs) {
          return originals[method].call(this, augmentChannelsPayload(payload), ...methodArgs);
        };
      }
      try { return await originalHandler.call(this, interaction, ...args); }
      finally { for (const [method, original] of Object.entries(originals)) interaction[method] = original; }
    };
    loaded.__goliathRoutingWrapped = true;
    return loaded;
  };
} catch (error) {
  console.warn('[Runtime] Unable to load Social Studio mixed routing.');
  console.warn(error?.stack || error?.message || error);
}
