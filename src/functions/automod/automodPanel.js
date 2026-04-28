// functions/automod/automodPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const automod = require('./automodStore');

const RULES = [
  {
    key: 'antiSpam',
    label: 'Anti-Spam',
    buttonLabel: 'Spam',
    customId: 'automod:toggle:antiSpam',
    style: ButtonStyle.Primary,
  },
  {
    key: 'antiLink',
    label: 'Anti-Link',
    buttonLabel: 'Link',
    customId: 'automod:toggle:antiLink',
    style: ButtonStyle.Primary,
  },
  {
    key: 'antiInvite',
    label: 'Anti-Invite',
    buttonLabel: 'Invite',
    customId: 'automod:toggle:antiInvite',
    style: ButtonStyle.Primary,
  },
  {
    key: 'capsAbuse',
    label: 'Caps Abuse',
    buttonLabel: 'Caps',
    customId: 'automod:toggle:capsAbuse',
    style: ButtonStyle.Secondary,
  },
  {
    key: 'badWords',
    label: 'Bad Words',
    buttonLabel: 'Words',
    customId: 'automod:toggle:badWords',
    style: ButtonStyle.Secondary,
  },
  {
    key: 'repeatedMessages',
    label: 'Repeated Messages',
    buttonLabel: 'Repeats',
    customId: 'automod:toggle:repeatedMessages',
    style: ButtonStyle.Secondary,
  },
];

function formatEnabled(enabled) {
  return enabled ? 'Enabled ✅' : 'Disabled ❌';
}

function getEnabledCount(config) {
  return RULES.filter((rule) => config?.[rule.key]?.enabled).length;
}

function buildRuleFields(config) {
  return RULES.map((rule) => ({
    name: rule.label,
    value: formatEnabled(Boolean(config?.[rule.key]?.enabled)),
    inline: true,
  }));
}

function buildRuleButtons(config) {
  const rows = [];
  const buttons = RULES.map((rule) =>
    new ButtonBuilder()
      .setCustomId(rule.customId)
      .setLabel(`${rule.buttonLabel}: ${config?.[rule.key]?.enabled ? 'On' : 'Off'}`)
      .setStyle(config?.[rule.key]?.enabled ? ButtonStyle.Success : rule.style)
  );

  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }

  return rows;
}

function buildAutomodPanel(guild, memberDisplayName) {
  const config = automod.getGuildAutoModConfig(guild.id);
  const enabledCount = getEnabledCount(config);

  const embed = new EmbedBuilder()
    .setColor(enabledCount > 0 ? '#57F287' : '#5865F2')
    .setTitle('🛡️ AutoMod Panel')
    .setDescription(
      [
        'Control quick AutoMod toggles from Discord.',
        '',
        `**${enabledCount}/${RULES.length}** rules enabled.`,
      ].join('\n')
    )
    .addFields(buildRuleFields(config))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: buildRuleButtons(config),
  };
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('automod:toggle:')) return false;

  const [, , key] = interaction.customId.split(':');
  const rule = RULES.find((entry) => entry.key === key);

  if (!rule) return false;

  const guildId = interaction.guild.id;

  automod.updateGuildAutoModConfig(guildId, (current) => ({
    ...current,
    [key]: {
      ...current[key],
      enabled: !current?.[key]?.enabled,
    },
  }));

  await interaction.update(
    buildAutomodPanel(interaction.guild, interaction.member.displayName)
  );

  return true;
}

module.exports = {
  RULES,
  buildAutomodPanel,
  handleInteraction,
};