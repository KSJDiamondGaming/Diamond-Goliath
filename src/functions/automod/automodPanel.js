// src/functions/automod/automodPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const automod = require('./automodStore');
const panelNav = require('../../helpers/ui/panelNavigation');

const PANEL_COLOR = '#5865F2';
const SUCCESS_COLOR = '#57F287';

const RULES = [
  {
    key: 'antiSpam',
    emoji: '📨',
    label: 'Anti-Spam',
    shortLabel: 'Spam',
    description: 'Detects rapid message spam.',
    modalFields: [
      { id: 'maxMessages', label: 'Max messages', value: '6' },
      { id: 'intervalSeconds', label: 'Interval seconds', value: '8' },
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
  {
    key: 'antiLink',
    emoji: '🔗',
    label: 'Anti-Link',
    shortLabel: 'Links',
    description: 'Blocks links and suspicious domains.',
    modalFields: [
      { id: 'allowedDomains', label: 'Allowed domains', value: '', paragraph: true },
      { id: 'blockedDomains', label: 'Blocked domains', value: '', paragraph: true },
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
  {
    key: 'antiInvite',
    emoji: '📩',
    label: 'Anti-Invite',
    shortLabel: 'Invites',
    description: 'Blocks Discord invite links.',
    modalFields: [
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
  {
    key: 'capsAbuse',
    emoji: '🔠',
    label: 'Caps Abuse',
    shortLabel: 'Caps',
    description: 'Detects excessive capital letters.',
    modalFields: [
      { id: 'minLength', label: 'Minimum message length', value: '10' },
      { id: 'percentage', label: 'Caps percentage', value: '70' },
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
  {
    key: 'badWords',
    emoji: '🚫',
    label: 'Bad Words',
    shortLabel: 'Words',
    description: 'Blocks configured words.',
    modalFields: [
      { id: 'words', label: 'Blocked words', value: '', paragraph: true },
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
  {
    key: 'repeatedMessages',
    emoji: '🔁',
    label: 'Repeated Messages',
    shortLabel: 'Repeats',
    description: 'Detects repeated duplicate messages.',
    modalFields: [
      { id: 'maxRepeats', label: 'Max repeats', value: '3' },
      { id: 'intervalSeconds', label: 'Interval seconds', value: '10' },
      { id: 'timeoutMinutes', label: 'Timeout minutes', value: '10' },
    ],
  },
];

const PUNISHMENTS = [
  { label: '📩 DM user', value: 'dm' },
  { label: '🗑️ Delete message', value: 'delete' },
  { label: '⚠️ Warn user', value: 'warn' },
  { label: '⏱️ Timeout user', value: 'timeout' },
  { label: '👢 Kick user', value: 'kick' },
  { label: '🔨 Ban user', value: 'ban' },
];

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function getRule(key) {
  return RULES.find((rule) => rule.key === key);
}

function getEnabledCount(config) {
  return RULES.filter((rule) => Boolean(config?.[rule.key]?.enabled)).length;
}

function toCsv(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value || '');
}

function parseCsv(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPunishments(ruleConfig) {
  if (Array.isArray(ruleConfig?.punishments)) {
    return ruleConfig.punishments.filter(Boolean);
  }

  if (ruleConfig?.punishment) {
    return [ruleConfig.punishment];
  }

  return ['delete'];
}

function formatPunishments(ruleConfig) {
  return getPunishments(ruleConfig).join(', ') || 'delete';
}

function getRouteLabel(route) {
  const labels = {
    'admin:home': 'Admin Hub',
    'admin:automod': 'AutoMod',
    'automod:home': 'AutoMod',
    'automod:settings': 'Rule Editor',
  };

  if (route?.startsWith('automod:rule:')) {
    const key = route.split(':')[2];
    const rule = getRule(key);
    return rule ? rule.label : 'Rule';
  }

  return labels[route] || String(route || 'automod:home').replaceAll(':', ' › ');
}

function getBreadcrumbFromState(navState) {
  const state = navState || panelNav.createState('admin:automod');
  const history = Array.isArray(state.history)
    ? state.history
    : ['admin:home', 'admin:automod'];

  return history
    .filter(Boolean)
    .slice(-4)
    .map(getRouteLabel)
    .join(' › ');
}

function applyNavigationUI(panel, navState) {
  if (!panel?.embeds?.[0]) return panel;

  const embed = EmbedBuilder.from(panel.embeds[0]);

  embed.setFooter({
    text: `Navigation: ${getBreadcrumbFromState(navState)}`,
  });

  return {
    ...panel,
    embeds: [embed],
  };
}

function backButton(navState) {
  return button(
    panelNav.buildCustomId(navState || panelNav.createState('admin:automod'), 'back'),
    '⬅️ Back',
    ButtonStyle.Secondary
  );
}

function navRow(navState) {
  return row(backButton(navState));
}

function nextState(navState, route) {
  return panelNav.push(
    navState || panelNav.createState('admin:automod'),
    route
  );
}

function buildRuleSummary(config) {
  return RULES.map((rule) => {
    const ruleConfig = config?.[rule.key] || {};
    const enabled = Boolean(ruleConfig.enabled);

    return [
      `**${rule.emoji} ${rule.label}**`,
      `${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `Punishments: ${formatPunishments(ruleConfig)}`,
    ].join('\n');
  }).join('\n\n');
}

function buildRuleFields(config) {
  return [
    {
      name: 'Rules',
      value: buildRuleSummary(config),
      inline: false,
    },
  ];
}

function buildAutomodPanel(
  guild,
  memberDisplayName = 'Unknown User',
  navState = panelNav.createState('admin:automod')
) {
  const config = automod.getGuildAutoModConfig(guild.id);
  const enabledCount = getEnabledCount(config);

  const embed = new EmbedBuilder()
    .setColor(enabledCount > 0 ? SUCCESS_COLOR : PANEL_COLOR)
    .setTitle('🤖 AutoMod Panel')
    .setDescription(
      [
        'Control your server protection from one panel.',
        '',
        `**${enabledCount}/${RULES.length} rules enabled.**`,
      ].join('\n')
    )
    .addFields(buildRuleFields(config))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const toggleButtons = RULES.map((rule) => {
    const enabled = Boolean(config?.[rule.key]?.enabled);

    return button(
      `automod:toggle:${rule.key}`,
      `${rule.emoji} ${rule.shortLabel}: ${enabled ? 'On' : 'Off'}`,
      enabled ? ButtonStyle.Success : ButtonStyle.Secondary
    );
  });

  return applyNavigationUI(
    {
      embeds: [embed],
      components: [
        row(...toggleButtons.slice(0, 3)),
        row(...toggleButtons.slice(3, 6)),
        row(
          button('automod:settings', '⚙️ Edit Rules', ButtonStyle.Primary),
          backButton(navState)
        ),
      ],
    },
    navState
  );
}

function buildAutomodSettingsPanel(
  guild,
  memberDisplayName = 'Unknown User',
  navState = panelNav.createState('admin:automod')
) {
  const config = automod.getGuildAutoModConfig(guild.id);
  const enabledCount = getEnabledCount(config);

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('⚙️ AutoMod Rule Editor')
    .setDescription(
      [
        'Choose a rule below to edit its settings.',
        '',
        `**${enabledCount}/${RULES.length} rules enabled.**`,
      ].join('\n')
    )
    .addFields(buildRuleFields(config))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('automod:select-rule')
    .setPlaceholder('Choose a rule to edit')
    .addOptions(
      RULES.map((rule) => ({
        label: `${rule.emoji} ${rule.label}`,
        description: rule.description.slice(0, 100),
        value: rule.key,
      }))
    );

  return applyNavigationUI(
    {
      embeds: [embed],
      components: [
        row(select),
        navRow(navState),
      ],
    },
    navState
  );
}

function buildRuleEditorPanel(
  guild,
  key,
  memberDisplayName = 'Unknown User',
  navState = panelNav.createState('admin:automod')
) {
  const config = automod.getGuildAutoModConfig(guild.id);
  const rule = getRule(key);

  if (!rule) {
    return buildAutomodSettingsPanel(guild, memberDisplayName, navState);
  }

  const ruleConfig = config?.[key] || {};
  const enabled = Boolean(ruleConfig.enabled);
  const punishments = getPunishments(ruleConfig);

  const embed = new EmbedBuilder()
    .setColor(enabled ? SUCCESS_COLOR : PANEL_COLOR)
    .setTitle(`${rule.emoji} ${rule.label} Settings`)
    .setDescription(
      [
        rule.description,
        '',
        `Status: **${enabled ? 'Enabled ✅' : 'Disabled ❌'}**`,
        `Punishments: **${punishments.join(', ') || 'delete'}**`,
      ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const punishmentSelect = new StringSelectMenuBuilder()
    .setCustomId(`automod:punishments:${key}`)
    .setPlaceholder('Choose punishments')
    .setMinValues(1)
    .setMaxValues(PUNISHMENTS.length)
    .addOptions(
      PUNISHMENTS.map((item) => ({
        label: item.label,
        value: item.value,
        default: punishments.includes(item.value),
      }))
    );

  return applyNavigationUI(
    {
      embeds: [embed],
      components: [
        row(punishmentSelect),
        row(
          button(`automod:modal:${key}`, '⚙️ Edit Settings', ButtonStyle.Primary),
          button(
            `automod:toggle-edit:${key}`,
            enabled ? '🔴 Disable Rule' : '🟢 Enable Rule',
            enabled ? ButtonStyle.Danger : ButtonStyle.Success
          )
        ),
        navRow(navState),
      ],
    },
    navState
  );
}

function buildRuleModal(guildId, key) {
  const config = automod.getGuildAutoModConfig(guildId);
  const rule = getRule(key);

  if (!rule) {
    return null;
  }

  const ruleConfig = config?.[key] || {};

  const modal = new ModalBuilder()
    .setCustomId(`automod:save:${key}`)
    .setTitle(`${rule.label} Settings`);

  const rows = rule.modalFields.slice(0, 5).map((field) => {
    const rawValue =
      field.id === 'allowedDomains' ||
      field.id === 'blockedDomains' ||
      field.id === 'words'
        ? toCsv(ruleConfig[field.id])
        : String(ruleConfig[field.id] ?? field.value ?? '');

    return row(
      new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(false)
        .setValue(rawValue.slice(0, 4000))
    );
  });

  modal.addComponents(rows);
  return modal;
}

async function safeUpdate(interaction, panel) {
  await interaction.update(panel);
  return true;
}

async function safeModalReply(interaction, panel) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(panel);
    return true;
  }

  await interaction.reply({
    ...panel,
    flags: 64,
  });

  return true;
}

async function handleInteraction(
  interaction,
  navState = panelNav.createState('admin:automod')
) {
  if (!interaction.customId?.startsWith('automod:')) return false;

  if (!interaction.guild) {
    await interaction.reply({
      content: 'AutoMod can only be used inside a server.',
      flags: 64,
    });

    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isButton()) {
    if (interaction.customId === 'automod:settings') {
      const state = nextState(navState, 'automod:settings');

      return safeUpdate(
        interaction,
        buildAutomodSettingsPanel(interaction.guild, memberDisplayName, state)
      );
    }

    if (
      interaction.customId.startsWith('automod:toggle:') ||
      interaction.customId.startsWith('automod:toggle-edit:')
    ) {
      const [, actionType, key] = interaction.customId.split(':');
      const rule = getRule(key);

      if (!rule) return false;

      automod.updateGuildAutoModConfig(interaction.guild.id, (current) => {
        const currentRule = current?.[key] || {};

        return {
          ...current,
          [key]: {
            ...currentRule,
            enabled: !Boolean(currentRule.enabled),
          },
        };
      });

      if (actionType === 'toggle-edit') {
        return safeUpdate(
          interaction,
          buildRuleEditorPanel(interaction.guild, key, memberDisplayName, navState)
        );
      }

      return safeUpdate(
        interaction,
        buildAutomodPanel(interaction.guild, memberDisplayName, navState)
      );
    }

    if (interaction.customId.startsWith('automod:modal:')) {
      const [, , key] = interaction.customId.split(':');
      const rule = getRule(key);

      if (!rule) return false;

      const modal = buildRuleModal(interaction.guild.id, key);
      if (!modal) return false;

      await interaction.showModal(modal);
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'automod:select-rule') {
      const key = interaction.values[0];
      const rule = getRule(key);

      if (!rule) return false;

      const state = nextState(navState, `automod:rule:${key}`);

      return safeUpdate(
        interaction,
        buildRuleEditorPanel(interaction.guild, key, memberDisplayName, state)
      );
    }

    if (interaction.customId.startsWith('automod:punishments:')) {
      const [, , key] = interaction.customId.split(':');
      const rule = getRule(key);

      if (!rule) return false;

      automod.updateGuildAutoModConfig(interaction.guild.id, (current) => {
        const currentRule = current?.[key] || {};

        return {
          ...current,
          [key]: {
            ...currentRule,
            punishments: interaction.values,
            punishment: interaction.values[0],
          },
        };
      });

      return safeUpdate(
        interaction,
        buildRuleEditorPanel(interaction.guild, key, memberDisplayName, navState)
      );
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('automod:save:')) {
      const [, , key] = interaction.customId.split(':');
      const rule = getRule(key);

      if (!rule) return false;

      automod.updateGuildAutoModConfig(interaction.guild.id, (current) => {
        const currentRule = current?.[key] || {};
        const nextRule = { ...currentRule };

        for (const field of rule.modalFields) {
          const value = interaction.fields.getTextInputValue(field.id);

          if (
            field.id === 'allowedDomains' ||
            field.id === 'blockedDomains' ||
            field.id === 'words'
          ) {
            nextRule[field.id] = parseCsv(value);
          } else {
            nextRule[field.id] = toNumber(
              value,
              Number(currentRule[field.id] ?? field.value ?? 0)
            );
          }
        }

        return {
          ...current,
          [key]: nextRule,
        };
      });

      return safeModalReply(
        interaction,
        buildRuleEditorPanel(interaction.guild, key, memberDisplayName, navState)
      );
    }
  }

  return false;
}

module.exports = {
  RULES,
  PUNISHMENTS,

  buildAutomodPanel,
  buildAutomodSettingsPanel,
  buildRuleEditorPanel,

  getRule,
  getPunishments,

  handleInteraction,
};