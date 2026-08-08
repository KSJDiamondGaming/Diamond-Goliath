'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const COLORS = {
  create: 0x57F287,
  update: 0xFEE75C,
  delete: 0xED4245,
  moderation: 0xEB459E,
  member: 0x5865F2,
  voice: 0x3498DB,
  message: 0x95A5A6,
  system: 0x2F3136,
  intelligence: 0x5865F2,
};

function family(event) {
  if (event.category === 'moderation') return 'moderation';
  if (event.category === 'voice') return 'voice';
  if (event.category === 'message') return 'message';
  if (event.category === 'member') return 'member';
  if (event.action === 'create' || event.action === 'join') return 'create';
  if (event.action === 'delete' || event.action === 'leave') return 'delete';
  if (event.action === 'update') return 'update';
  return 'system';
}

function compact(value, max = 950) {
  if (value === null || value === undefined || value === '') return 'None';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function discordTime(value, style = 'F') {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function buildAuditEmbed(event) {
  const actor = event.actor?.id ? `<@${event.actor.id}> (${event.actor.id})` : event.actor?.label || 'Unknown / not exposed by Discord';
  const user = event.user?.id ? `<@${event.user.id}> (${event.user.id})` : null;
  const target = user || event.target?.label || event.target?.name || event.target?.id || 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(COLORS[family(event)] || COLORS.system)
    .setTitle(`${event.icon || '🧾'} ${event.title || event.type}`)
    .setDescription(event.summary || `Audit event detected in **${event.guildName || 'Unknown Guild'}**.`)
    .addFields(
      { name: 'Action', value: `\`${event.type}\``, inline: true },
      { name: 'Source', value: event.source || 'Discord', inline: true },
      { name: 'Result', value: event.result || 'Observed', inline: true },
      { name: 'Target', value: compact(target), inline: false },
      { name: 'Actor', value: compact(actor), inline: false },
    )
    .setFooter({ text: `Goliath Audit • ${event.eventId}` })
    .setTimestamp(new Date(event.timestamp));

  if (event.channel?.id) embed.addFields({ name: 'Channel', value: `<#${event.channel.id}> (${event.channel.id})`, inline: false });
  if (event.reason) embed.addFields({ name: 'Reason', value: compact(event.reason), inline: false });
  if (event.before !== undefined) embed.addFields({ name: 'Before', value: `\`\`\`json\n${compact(event.before)}\n\`\`\``, inline: false });
  if (event.after !== undefined) embed.addFields({ name: 'After', value: `\`\`\`json\n${compact(event.after)}\n\`\`\``, inline: false });

  return embed;
}

function buildCommandCenterSetup(client) {
  const guilds = [...(client?.guilds?.cache?.values?.() || [])]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 25);
  const embed = new EmbedBuilder()
    .setColor(COLORS.intelligence)
    .setTitle('🛡️ Goliath Command Center Setup')
    .setDescription('Choose the **one private Discord server** that should host Goliath Audit Intelligence. `/commandcenter` will only be registered in that server and nowhere else.')
    .addFields(
      { name: 'Privacy', value: 'Only the configured Goliath owner can complete setup or use the Command Center.' },
      { name: 'Provisioning', value: 'Goliath will create a private **GOLIATH CONTROL** category and **#command-center** channel.' },
    )
    .setFooter({ text: 'Goliath Command Center • Private owner bootstrap' });

  if (!guilds.length) return { embeds: [embed.setDescription('No shared guilds are currently available to Goliath.')], components: [] };
  const select = new StringSelectMenuBuilder()
    .setCustomId('owner:commandcenter:destination')
    .setPlaceholder('Select your private Command Center server')
    .addOptions(guilds.map((guild) => ({ label: String(guild.name || guild.id).slice(0, 100), value: guild.id, description: `Guild ID: ${guild.id}`.slice(0, 100) })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function buildCommandCenterHome(client, guild, config = {}) {
  const monitored = Object.keys(config.guilds && typeof config.guilds === 'object' ? config.guilds : {})
    .filter((guildId) => String(guildId) !== String(guild?.id || config.commandCenter?.guildId || ''))
    .length;
  const embed = new EmbedBuilder()
    .setColor(COLORS.intelligence)
    .setTitle('🛡️ GOLIATH COMMAND CENTER')
    .setDescription('Private owner control plane for Audit Intelligence. This panel is intentionally isolated from Goliath public guild commands.')
    .addFields(
      { name: 'Environment', value: `\`${String(process.env.BOT_MODE || 'DEV').toUpperCase()}\``, inline: true },
      { name: 'Destination', value: guild ? `**${guild.name}**\n\`${guild.id}\`` : 'Not configured', inline: true },
      { name: 'Status', value: guild ? '🟢 Operational' : '🔴 Not configured', inline: true },
      { name: 'Monitored Guilds', value: `\`${monitored}\``, inline: true },
      { name: 'Auto Provision', value: config.autoProvision === false ? '🔴 Off' : '🟢 On', inline: true },
      { name: 'Command Visibility', value: guild ? `Only registered in **${guild.name}**` : 'Not registered', inline: true },
    )
    .setFooter({ text: 'Goliath Command Center • Owner only' })
    .setTimestamp();

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('owner:commandcenter:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:commandcenter:routing').setLabel('Routing').setEmoji('📡').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('owner:commandcenter:monitoring').setLabel('Monitoring').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:commandcenter:structure').setLabel('Structure').setEmoji('📂').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:commandcenter:health').setLabel('Health').setEmoji('🩺').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('owner:commandcenter:intelligence').setLabel('User Intelligence').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('owner:commandcenter:guild-intelligence').setLabel('Guild Intelligence').setEmoji('🏰').setStyle(ButtonStyle.Primary),
    ),
  ];
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

function buildGuildIntelligenceEmbed(guild, stored = {}, guildConfig = {}, structure = {}) {
  const members = guild?.memberCount ?? guild?.members?.cache?.size ?? 0;
  const cachedMembers = guild?.members?.cache ? [...guild.members.cache.values()] : [];
  const bots = cachedMembers.filter((member) => member.user?.bot).length;
  const humans = Math.max(0, Number(members || 0) - bots);
  const roles = Math.max(0, Number(guild?.roles?.cache?.size || 0) - 1);
  const channels = Number(guild?.channels?.cache?.size || 0);
  const categories = guild?.channels?.cache ? [...guild.channels.cache.values()].filter((channel) => channel.type === 4).length : 0;
  const disabledFamilies = Object.entries(guildConfig.monitoring || {}).filter(([, enabled]) => enabled === false).map(([key]) => key);
  const routes = Object.keys(guildConfig.routes || {}).length;
  const eventTypes = Object.entries(stored.eventTypes || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 8);
  const topEvents = eventTypes.length ? eventTypes.map(([type, count]) => `• \`${type}\` — **${count}**`).join('\n') : 'No stored events yet.';
  const structureState = structure.healthy === true ? '🟢 Healthy' : structure.systemChannel ? '🟠 Attention required' : '⚪ Not provisioned';

  return new EmbedBuilder()
    .setColor(structure.healthy === false ? 0xFEE75C : COLORS.intelligence)
    .setTitle(`🏰 Guild Intelligence • ${guild?.name || stored.guildName || stored.guildId || 'Unknown Guild'}`)
    .setDescription('Owner-only combined live Discord state and Goliath Audit Intelligence history.')
    .addFields(
      { name: 'Guild', value: `**${guild?.name || stored.guildName || 'Unknown'}**\n\`${guild?.id || stored.guildId || 'Unknown'}\``, inline: true },
      { name: 'Owner', value: guild?.ownerId ? `<@${guild.ownerId}>\n\`${guild.ownerId}\`` : 'Unknown', inline: true },
      { name: 'Created', value: discordTime(guild?.createdAt, 'F'), inline: true },
      { name: 'Members', value: `Total: **${members}**\nHumans: **${humans}**\nBots cached: **${bots}**`, inline: true },
      { name: 'Structure', value: `Channels: **${channels}**\nCategories: **${categories}**\nRoles: **${roles}**`, inline: true },
      { name: 'Security', value: `Verification: **${guild?.verificationLevel ?? 'Unknown'}**\nContent filter: **${guild?.explicitContentFilter ?? 'Unknown'}**`, inline: true },
      { name: 'Goliath History', value: `Events: **${stored.eventCount || 0}**\nFirst observed: ${discordTime(stored.firstObservedAt, 'F')}\nLast event: ${discordTime(stored.lastEventAt, 'R')}`, inline: false },
      { name: 'Audit Configuration', value: `${guildConfig.enabled === false ? '⏸️ Monitoring paused' : '▶️ Monitoring active'}\nDisabled families: **${disabledFamilies.length ? disabledFamilies.join(', ') : 'None'}**\nCustom routes: **${routes}**\nStructure: **${structureState}**`, inline: false },
      { name: 'Top Recorded Event Types', value: topEvents.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Goliath Command Center • Guild Intelligence • Owner only' })
    .setTimestamp();
}

function buildUserIntelligenceEmbed(report, sourceGuild) {
  const profile = report?.profile || {};
  const summary = report?.summary || {};
  const history = report?.history || {};
  const guildState = (report?.currentState?.guilds || []).find((item) => String(item.guildId) === String(sourceGuild?.id));
  const member = guildState?.member || null;
  const latestNames = [...new Set([
    profile.displayName,
    profile.globalName,
    profile.username,
    ...(history.displayNames || []).slice(-5).reverse(),
    ...(history.names || []).slice(-5).reverse(),
  ].filter(Boolean))].slice(0, 8);
  const roles = (member?.roles || []).slice(0, 12).map((role) => role.name).join(', ') || 'None / not currently in guild';
  const status = member ? 'Current member' : 'Not currently present';

  return new EmbedBuilder()
    .setColor(COLORS.intelligence)
    .setTitle('🔎 Goliath User Intelligence')
    .setDescription(`Live owner-only intelligence summary for <@${report.userId}> in **${sourceGuild?.name || 'Unknown Guild'}**.`)
    .addFields(
      { name: 'User', value: `<@${report.userId}>\n\`${report.userId}\``, inline: true },
      { name: 'Status', value: status, inline: true },
      { name: 'Bot', value: profile.bot === true ? 'Yes' : profile.bot === false ? 'No' : 'Unknown', inline: true },
      { name: 'Account Created', value: discordTime(profile.accountCreatedAt, 'F'), inline: true },
      { name: 'First Seen by Goliath', value: discordTime(summary.firstObservedAt, 'F'), inline: true },
      { name: 'Last Seen by Goliath', value: discordTime(summary.lastObservedAt, 'R'), inline: true },
      { name: 'Joined This Guild', value: discordTime(member?.joinedAt, 'F'), inline: true },
      { name: 'Known Guilds', value: `\`${summary.knownGuildCount || 0}\``, inline: true },
      { name: 'Recorded Events', value: `\`${summary.eventCount || 0}\``, inline: true },
      { name: 'Moderation History', value: `\`${summary.moderationCount || 0}\` events`, inline: true },
      { name: 'Role Changes', value: `\`${summary.roleChangeCount || 0}\``, inline: true },
      { name: 'Voice Events', value: `\`${summary.voiceEventCount || 0}\``, inline: true },
      { name: 'Current Roles', value: compact(roles), inline: false },
      { name: 'Known Names', value: latestNames.length ? compact(latestNames.join(' • ')) : 'None recorded', inline: false },
    )
    .setFooter({ text: `Goliath User Intelligence • ${report.userId}` })
    .setTimestamp(new Date(report.generatedAt || Date.now()));
}

function buildUserIntelligenceControls() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('owner:audit:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:audit:deep').setLabel('Deep Scan').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('owner:audit:guilds').setLabel('Guild History').setEmoji('🏰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:audit:moderation').setLabel('Moderation').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('owner:audit:roles').setLabel('Roles').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:audit:voice').setLabel('Voice').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owner:audit:timeline').setLabel('Timeline').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function listLines(items, formatter, limit = 15) {
  if (!Array.isArray(items) || !items.length) return 'None recorded.';
  return items.slice(-limit).reverse().map(formatter).join('\n').slice(0, 3900) || 'None recorded.';
}

function buildUserIntelligenceSectionEmbed(report, section, sourceGuild) {
  const history = report?.history || {};
  const stored = report?.stored || {};
  const currentGuilds = report?.currentState?.guilds || [];
  const titleMap = {
    deep: '🔎 Deep Scan',
    guilds: '🏰 Guild History',
    moderation: '🛡️ Moderation History',
    roles: '🎭 Role History',
    voice: '🔊 Voice History',
    timeline: '🕒 Recent Timeline',
  };
  const embed = new EmbedBuilder()
    .setColor(COLORS.intelligence)
    .setTitle(titleMap[section] || '🔎 User Intelligence')
    .setFooter({ text: `Goliath User Intelligence • ${report.userId}` })
    .setTimestamp(new Date(report.generatedAt || Date.now()));

  if (section === 'deep') {
    const guildLines = currentGuilds.map((item) => {
      const member = item.member || {};
      return `**${item.guildName || item.guildId}** — ${member.joinedAt ? `joined ${discordTime(member.joinedAt, 'F')}` : 'join unknown'} — ${(member.roles || []).length} roles`;
    }).join('\n') || 'No current guild memberships visible to Goliath.';
    embed.setDescription(`Full live + stored scan for <@${report.userId}>.`).addFields(
      { name: 'Identity', value: compact({ profile: report.profile, summary: report.summary }, 1000), inline: false },
      { name: 'Current Guilds', value: compact(guildLines, 1000), inline: false },
      { name: 'Event Totals', value: compact(report.counts, 1000), inline: false },
    );
    return embed;
  }

  if (section === 'guilds') {
    const guilds = Object.values(stored.guilds || {});
    embed.setDescription(listLines(guilds, (guild) => `**${guild.guildName || guild.guildId}** — first seen ${discordTime(guild.firstObservedAt, 'F')} — last seen ${discordTime(guild.lastObservedAt, 'R')} — ${guild.currentMember === true ? 'current member' : guild.currentMember === false ? 'former member' : 'membership unknown'} — ${guild.eventCount || 0} events`, 20));
    return embed;
  }

  if (section === 'moderation') {
    embed.setDescription(listLines(history.moderation, (item) => `**${item.type || 'moderation'}** — ${discordTime(item.timestamp, 'F')} — ${item.reason || 'No reason recorded'}${item.actorId ? ` — actor <@${item.actorId}>` : ''}`, 20));
    return embed;
  }

  if (section === 'roles') {
    embed.setDescription(listLines(history.roles, (item) => `**${discordTime(item.timestamp, 'F')}** — +${(item.added || []).map((role) => role.name || role.id).join(', ') || 'none'} / -${(item.removed || []).map((role) => role.name || role.id).join(', ') || 'none'} — ${item.guildName || item.guildId || 'Unknown guild'}`, 20));
    return embed;
  }

  if (section === 'voice') {
    embed.setDescription(listLines(history.voice, (item) => `**${discordTime(item.timestamp, 'F')}** — ${item.guildName || item.guildId || 'Unknown guild'} — ${item.before?.channelId || 'none'} → ${item.after?.channelId || 'none'}`, 20));
    return embed;
  }

  embed.setDescription(listLines(history.recentEvents, (item) => `**${discordTime(item.timestamp, 'F')}** — \`${item.type || 'event'}\` — ${item.guildName || item.guildId || 'Unknown guild'}${item.relation ? ` — ${item.relation}` : ''}`, 25));
  return embed;
}

module.exports = {
  buildAuditEmbed,
  buildCommandCenterSetup,
  buildCommandCenterHome,
  buildGuildIntelligenceEmbed,
  buildUserIntelligenceEmbed,
  buildUserIntelligenceControls,
  buildUserIntelligenceSectionEmbed,
};
