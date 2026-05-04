// functions/automod/automodPanel.js

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
const { buildAdminPanel } = require('../admin/adminPanel');

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
  { label: '🗑️ Delete message', value: 'delete' },
  { label: '⚠️ Warn user', value: 'warn' },
  { label: '⏱️ Timeout user', value: 'timeout' },
  { label: '👢 Kick user', value: 'kick' },
  { label: '🔨 Ban user', value: 'ban' },
];

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
  if (Array.isArray(ruleConfig?.punishments)) return ruleConfig.punishments;
  if (ruleConfig?.punishment) return [ruleConfig.punishment];
  return ['delete'];
}

function formatPunishments(ruleConfig) {
  return getPunishments(ruleConfig).join(', ') || 'delete';
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

function buildAutomodPanel(guild, memberDisplayName = 'Unknown User') {
  const config = automod.getGuildAutoModConfig(guild.id);
  const enabledCount = getEnabledCount(config);

  const embed = new EmbedBuilder()
    .setColor(enabledCount > 0 ? '#57F287' : '#5865F2')
    .setTitle('🛡️ AutoMod Panel')
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

    return new ButtonBuilder()
      .setCustomId(`automod:toggle:${rule.key}`)
      .setLabel(`${rule.emoji} ${rule.shortLabel}: ${enabled ? 'On' : 'Off'}`)
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(toggleButtons.slice(0, 3)),
      new ActionRowBuilder().addComponents(toggleButtons.slice(3, 6)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('automod:settings')
          .setLabel('⚙️ Edit Rules')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('automod:back:admin')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildAutomodSettingsPanel(guild, memberDisplayName = 'Unknown User') {
  const config = automod.getGuildAutoModConfig(guild.id);
  const enabledCount = getEnabledCount(config);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
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

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('automod:panel')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildRuleEditorPanel(guild, key, memberDisplayName = 'Unknown User') {
  const config = automod.getGuildAutoModConfig(guild.id);
  const rule = getRule(key);
  const ruleConfig = config?.[key] || {};
  const enabled = Boolean(ruleConfig.enabled);
  const punishments = getPunishments(ruleConfig);

  const embed = new EmbedBuilder()
    .setColor(enabled ? '#57F287' : '#5865F2')
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

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(punishmentSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`automod:modal:${key}`)
          .setLabel('⚙️ Edit Settings')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`automod:toggle-edit:${key}`)
          .setLabel(enabled ? '🔴 Disable Rule' : '🟢 Enable Rule')
          .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('automod:settings')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildRuleModal(guildId, key) {
  const config = automod.getGuildAutoModConfig(guildId);
  const rule = getRule(key);
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

    return new ActionRowBuilder().addComponents(
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

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('automod:')) return false;

  if (!interaction.guild) {
    await interaction.reply({
      content: 'AutoMod can only be used inside a server.',
      ephemeral: true,
    });
    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isButton()) {
    if (interaction.customId === 'automod:panel') {
      await interaction.update(buildAutomodPanel(interaction.guild, memberDisplayName));
      return true;
    }

    if (interaction.customId === 'automod:settings') {
      await interaction.update(buildAutomodSettingsPanel(interaction.guild, memberDisplayName));
      return true;
    }

    if (interaction.customId === 'automod:back:admin') {
      await interaction.update(buildAdminPanel(interaction.guild, memberDisplayName));
      return true;
    }

    if (
      interaction.customId.startsWith('automod:toggle:') ||
      interaction.customId.startsWith('automod:toggle-edit:')
    ) {
      const parts = interaction.customId.split(':');
      const key = parts[2];
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

      if (interaction.customId.startsWith('automod:toggle-edit:')) {
        await interaction.update(buildRuleEditorPanel(interaction.guild, key, memberDisplayName));
      } else {
        await interaction.update(buildAutomodPanel(interaction.guild, memberDisplayName));
      }

      return true;
    }

    if (interaction.customId.startsWith('automod:modal:')) {
      const [, , key] = interaction.customId.split(':');
      const rule = getRule(key);
      if (!rule) return false;

      await interaction.showModal(buildRuleModal(interaction.guild.id, key));
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'automod:select-rule') {
      const key = interaction.values[0];
      const rule = getRule(key);
      if (!rule) return false;

      await interaction.update(buildRuleEditorPanel(interaction.guild, key, memberDisplayName));
      return true;
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

      await interaction.update(buildRuleEditorPanel(interaction.guild, key, memberDisplayName));
      return true;
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

      await interaction.update(buildRuleEditorPanel(interaction.guild, key, memberDisplayName));
      return true;
    }
  }

  return false;
}

module.exports = {
  RULES,
  buildAutomodPanel,
  buildAutomodSettingsPanel,
  buildRuleEditorPanel,
  handleInteraction,
};