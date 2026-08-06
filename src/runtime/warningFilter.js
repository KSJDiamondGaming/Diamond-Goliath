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
