'use strict';

const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const serverCopy = require('./serverCopy');

const REQUIRED_BOT_PERMISSIONS = [
  ['ManageGuild', PermissionFlagsBits.ManageGuild],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageEmojisAndStickers', PermissionFlagsBits.ManageEmojisAndStickers],
  ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
];

function createEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date());
}

function getGuildById(client, guildId) {
  return client.guilds.cache.get(String(guildId || '').trim()) || null;
}

async function fetchGuildState(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  await guild.emojis.fetch().catch(() => null);
}

function countPermissionIssues(destinationGuild) {
  const botMember = destinationGuild.members.me;
  const permissions = botMember?.permissions;

  return REQUIRED_BOT_PERMISSIONS.map(([name, bit]) => ({
    name,
    ok: Boolean(permissions?.has(bit)),
  }));
}

function findDuplicateNames(items, nameGetter) {
  const seen = new Set();
  const duplicates = new Set();

  for (const item of items) {
    const name = String(nameGetter(item) || '').trim().toLowerCase();
    if (!name) continue;
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }

  return [...duplicates];
}

function buildAnalysis(sourceGuild, destinationGuild, snapshot) {
  const destinationRoleNames = new Set(destinationGuild.roles.cache.map((role) => role.name.toLowerCase()));
  const destinationChannelKeys = new Set(
    destinationGuild.channels.cache.map((channel) => `${channel.type}:${channel.name.toLowerCase()}`)
  );
  const destinationEmojiNames = new Set(destinationGuild.emojis.cache.map((emoji) => emoji.name.toLowerCase()));

  const existingRoles = snapshot.roles.filter((role) => destinationRoleNames.has(role.name.toLowerCase()));
  const missingRoles = snapshot.roles.filter((role) => !destinationRoleNames.has(role.name.toLowerCase()));

  const existingChannels = snapshot.channels.filter((channel) =>
    destinationChannelKeys.has(`${channel.type}:${channel.name.toLowerCase()}`)
  );
  const missingChannels = snapshot.channels.filter((channel) =>
    !destinationChannelKeys.has(`${channel.type}:${channel.name.toLowerCase()}`)
  );

  const existingEmojis = snapshot.emojis.filter((emoji) => destinationEmojiNames.has(emoji.name.toLowerCase()));
  const missingEmojis = snapshot.emojis.filter((emoji) => !destinationEmojiNames.has(emoji.name.toLowerCase()));

  const sourceRoleDuplicates = findDuplicateNames(snapshot.roles, (role) => role.name);
  const sourceChannelDuplicates = findDuplicateNames(snapshot.channels, (channel) => `${channel.type}:${channel.name}`);
  const permissionChecks = countPermissionIssues(destinationGuild);

  const estimatedRoleTotal = destinationGuild.roles.cache.size + missingRoles.length;
  const estimatedChannelTotal = destinationGuild.channels.cache.size + missingChannels.length;
  const estimatedEmojiTotal = destinationGuild.emojis.cache.size + missingEmojis.length;

  const warnings = [];
  if (sourceRoleDuplicates.length) warnings.push(`Source has duplicate role names: ${sourceRoleDuplicates.slice(0, 8).join(', ')}`);
  if (sourceChannelDuplicates.length) warnings.push(`Source has duplicate channel names/types: ${sourceChannelDuplicates.slice(0, 8).join(', ')}`);
  if (estimatedRoleTotal >= 250) warnings.push(`Destination may hit Discord role limit. Estimated total: ${estimatedRoleTotal}`);
  if (estimatedChannelTotal >= 500) warnings.push(`Destination may hit Discord channel limit. Estimated total: ${estimatedChannelTotal}`);
  if (estimatedEmojiTotal >= 50) warnings.push(`Destination may hit normal emoji limits depending on boost tier. Estimated total: ${estimatedEmojiTotal}`);

  for (const check of permissionChecks) {
    if (!check.ok) warnings.push(`Bot missing permission on destination: ${check.name}`);
  }

  return {
    existingRoles: existingRoles.length,
    missingRoles: missingRoles.length,
    existingChannels: existingChannels.length,
    missingChannels: missingChannels.length,
    existingEmojis: existingEmojis.length,
    missingEmojis: missingEmojis.length,
    permissionChecks,
    estimatedRoleTotal,
    estimatedChannelTotal,
    estimatedEmojiTotal,
    warnings,
  };
}

function buildAnalysisEmbed(sourceGuild, destinationGuild, snapshot, analysis) {
  const permissionLines = analysis.permissionChecks
    .map((check) => `${check.ok ? '✅' : '❌'} ${check.name}`)
    .join('\n');

  return createEmbed(
    '🔎 Server Copy Analyse / Pre-check',
    [
      `**Source:** ${sourceGuild.name} \`(${sourceGuild.id})\``,
      `**Destination:** ${destinationGuild.name} \`(${destinationGuild.id})\``,
      '',
      '**Source snapshot:**',
      `• Roles: \`${snapshot.stats.roles}\``,
      `• Categories: \`${snapshot.stats.categories}\``,
      `• Channels: \`${snapshot.stats.channels}\``,
      `• Permission overwrites: \`${snapshot.stats.permissionOverwrites}\``,
      `• Emojis: \`${snapshot.stats.emojis}\``,
      '',
      '**Destination comparison:**',
      `• Existing matching roles: \`${analysis.existingRoles}\``,
      `• Missing roles: \`${analysis.missingRoles}\``,
      `• Existing matching channels: \`${analysis.existingChannels}\``,
      `• Missing channels: \`${analysis.missingChannels}\``,
      `• Existing matching emojis: \`${analysis.existingEmojis}\``,
      `• Missing emojis: \`${analysis.missingEmojis}\``,
      '',
      '**Bot permission pre-check:**',
      permissionLines || 'No permission data available.',
      '',
      '**Limit estimates:**',
      `• Estimated roles after copy: \`${analysis.estimatedRoleTotal}\``,
      `• Estimated channels after copy: \`${analysis.estimatedChannelTotal}\``,
      `• Estimated emojis after copy: \`${analysis.estimatedEmojiTotal}\``,
      analysis.warnings.length ? `\n**Warnings:**\n${analysis.warnings.slice(0, 12).map((warning) => `⚠️ ${warning}`).join('\n')}` : '\n✅ No major pre-check warnings found.',
    ].join('\n'),
    analysis.warnings.length ? 0xf59e0b : 0x22c55e
  );
}

async function run(interaction) {
  const access = serverCopy.assertAccess(interaction);
  if (!access.allowed) {
    return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  }

  const sourceGuildId = interaction.options.getString('source_server', true);
  const destinationGuildId = interaction.options.getString('destination_server', true);

  if (sourceGuildId === destinationGuildId) {
    return interaction.reply({ content: '❌ Source and destination cannot be the same server.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sourceGuild = getGuildById(interaction.client, sourceGuildId);
  const destinationGuild = getGuildById(interaction.client, destinationGuildId);

  if (!sourceGuild || !destinationGuild) {
    return interaction.editReply({
      content: '❌ Goliath must be in both the source and destination servers. Use server IDs for this analyse command.',
    });
  }

  await fetchGuildState(sourceGuild);
  await fetchGuildState(destinationGuild);

  const snapshot = serverCopy.buildSnapshot(sourceGuild, ['everything']);
  const analysis = buildAnalysis(sourceGuild, destinationGuild, snapshot);

  return interaction.editReply({
    embeds: [buildAnalysisEmbed(sourceGuild, destinationGuild, snapshot, analysis)],
  });
}

module.exports = {
  run,
  buildAnalysis,
};
