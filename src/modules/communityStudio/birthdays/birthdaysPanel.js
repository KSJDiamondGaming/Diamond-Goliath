'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, ModalBuilder, RoleSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const birthdays = require('./birthdays');

const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const UPCOMING_DAYS = 60;

function birthdayWindow(guildId) {
  const list = birthdays.listUpcoming(guildId, 100, UPCOMING_DAYS);
  return {
    today: list.filter((item) => item.daysUntil === 0),
    upcoming: list.filter((item) => item.daysUntil > 0),
  };
}

function birthdayLine(item, todayLabel = false) {
  const { member, next } = item;
  const date = todayLabel ? 'TODAY' : `${String(next.day).padStart(2, '0')}/${String(next.month).padStart(2, '0')}`;
  return `• <@${member.userId}> — **${date}**`;
}

function birthdayListContent(guildId) {
  const { today, upcoming } = birthdayWindow(guildId);
  const todayLines = today.length ? today.map((item) => birthdayLine(item, true)).join('\n') : 'No birthdays today.';
  const upcomingLines = upcoming.length ? upcoming.map((item) => birthdayLine(item)).join('\n') : 'No birthdays in the next 2 months.';
  return `**🎂 Today’s Birthdays**\n${todayLines}\n\n**📅 Upcoming Birthdays — Next 2 Months**\n${upcomingLines}`;
}

function adminPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const enabled = guildManager.isModuleEnabled(interaction.guildId, 'birthdays');
  const { today, upcoming } = birthdayWindow(interaction.guildId);
  const todayLines = today.length ? today.map((item) => birthdayLine(item, true)).join('\n') : 'No birthdays today.';
  const upcomingLines = upcoming.length ? upcoming.slice(0, 5).map((item) => birthdayLine(item)).join('\n') : 'No birthdays in the next 2 months.';
  return {
    embeds: [new EmbedBuilder().setColor(enabled ? 0x5865F2 : 0x747F8D).setTitle('🎂 Birthdays').setDescription([
      `Module: **${enabled ? 'Enabled' : 'Disabled'}**`,
      `Announcement channel: ${section.settings.announcementChannelId ? `<#${section.settings.announcementChannelId}>` : '**Not set**'}`,
      `Time: **${section.settings.announcementTime} ${section.settings.timezone}**`,
      `Birthday role: ${section.settings.birthdayRoleId ? `<@&${section.settings.birthdayRoleId}>` : '**None**'}`,
      `Stored birthdays: **${Object.keys(section.members).length}**`,
      '',
      '**🎂 Today’s Birthdays**',
      todayLines,
      '',
      '**📅 Upcoming — Next 2 Months**',
      upcomingLines,
    ].join('\n')).setFooter({ text: 'Goliath Birthdays · /admin' }).setTimestamp()],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:birthdays:channel').setPlaceholder('Birthday announcement channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels(section.settings.announcementChannelId ? [section.settings.announcementChannelId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId('admin:birthdays:role').setPlaceholder('Optional birthday role').setMinValues(0).setMaxValues(1).setDefaultRoles(section.settings.birthdayRoleId ? [section.settings.birthdayRoleId] : [])),
      row(button('admin:birthdays:settings', '⚙️ Message / Time', ButtonStyle.Primary), button('admin:birthdays:toggle', enabled ? '⏸ Disable' : '▶ Enable', enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:birthdays:upcoming', '📅 Upcoming'), button('admin:birthdays:health', '🩺 Health')),
      row(button('admin:studio:communityStudio', '⬅️ Back to Community Studio')),
    ],
  };
}

function settingsModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:settings:submit').setTitle('Birthday Settings').addComponents(
    row(new TextInputBuilder().setCustomId('time').setLabel('Announcement time (HH:MM)').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.announcementTime)),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('Timezone').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.timezone).setPlaceholder('Europe/London')),
    row(new TextInputBuilder().setCustomId('message').setLabel('Birthday message').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800).setValue(section.settings.messageTemplate)),
    row(new TextInputBuilder().setCustomId('roleHours').setLabel('Birthday role duration (hours)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(section.settings.roleDurationHours))),
  );
}

function userPayload(interaction) {
  const record = birthdays.getBirthday(interaction.guildId, interaction.user.id);
  const section = birthdays.getSection(interaction.guildId);
  const desc = record ? [
    `Birthday: **${String(record.day).padStart(2, '0')}/${String(record.month).padStart(2, '0')}${record.year ? `/${record.year}` : ''}**`,
    `Birthday announcement: **${record.announce ? 'On' : 'Off'}**`,
    `Show age when announced: **${record.showAge && record.year ? 'On' : 'Off'}**`,
    '', `Server announcement time: **${section.settings.announcementTime} ${section.settings.timezone}**`,
  ].join('\n') : 'You have not added a birthday yet. Your birth year is optional.';
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎂 My Birthday').setDescription(desc).setFooter({ text: 'Your birthday settings' }).setTimestamp()],
    components: [row(button('birthdays:user:set', record ? '✏️ Edit Birthday' : '➕ Add Birthday', ButtonStyle.Primary), record ? button('birthdays:user:announce', record.announce ? '📣 Announce: On' : '📣 Announce: Off', record.announce ? ButtonStyle.Success : ButtonStyle.Secondary) : null, record?.year ? button('birthdays:user:age', record.showAge ? '🎈 Age: On' : '🎈 Age: Off', record.showAge ? ButtonStyle.Success : ButtonStyle.Secondary) : null), row(button('birthdays:user:upcoming', '📅 Upcoming Birthdays'), record ? button('birthdays:user:remove', '🗑️ Remove', ButtonStyle.Danger) : null, button('user:category:community', '⬅️ Back'))],
  };
}

function birthdayModal(record) {
  const value = record ? `${String(record.day).padStart(2, '0')}/${String(record.month).padStart(2, '0')}${record.year ? `/${record.year}` : ''}` : '';
  return new ModalBuilder().setCustomId('birthdays:user:set:submit').setTitle('My Birthday').addComponents(row(new TextInputBuilder().setCustomId('date').setLabel('Birthday (DD/MM or DD/MM/YYYY)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('16/08 or 16/08/1990').setValue(value)));
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: 64 });
  return interaction.update(payload);
}

async function handleAdmin(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:birthdays')) return false;
  const actor = { actorId: interaction.user.id };
  if (id === 'admin:birthdays') { await respond(interaction, adminPayload(interaction)); return true; }
  if (id === 'admin:birthdays:channel' && interaction.isChannelSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { announcementChannelId: interaction.values[0] || null }, { ...actor, action: 'birthdays_channel_update' });
  else if (id === 'admin:birthdays:role' && interaction.isRoleSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { birthdayRoleId: interaction.values[0] || null }, { ...actor, action: 'birthdays_role_update' });
  else if (id === 'admin:birthdays:toggle') guildManager.setModuleEnabled(interaction.guildId, 'birthdays', !guildManager.isModuleEnabled(interaction.guildId, 'birthdays'), { ...actor, action: 'birthdays_toggle' });
  else if (id === 'admin:birthdays:settings') { await interaction.showModal(settingsModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:settings:submit') {
    const time = interaction.fields.getTextInputValue('time').trim(); const timezone = interaction.fields.getTextInputValue('timezone').trim();
    if (!birthdays.validTime(time)) throw new Error('Time must use HH:MM in 24-hour format.');
    if (!birthdays.validTimezone(timezone)) throw new Error('Timezone must be a valid IANA timezone such as Europe/London.');
    birthdays.updateSettings(interaction.guildId, { announcementTime: time, timezone, messageTemplate: interaction.fields.getTextInputValue('message'), roleDurationHours: Number(interaction.fields.getTextInputValue('roleHours') || 24) }, { ...actor, action: 'birthdays_settings_update' });
    await interaction.reply({ content: '✅ Birthday settings updated.', flags: 64 }); return true;
  } else if (id === 'admin:birthdays:upcoming') {
    await interaction.reply({ content: birthdayListContent(interaction.guildId), flags: 64, allowedMentions: { parse: [] } }); return true;
  } else if (id === 'admin:birthdays:health') {
    const health = await birthdays.buildHealth(interaction.guild); await interaction.reply({ content: `Birthdays health: **${health.healthy ? 'Healthy' : 'Needs attention'}**\nIssues: ${health.issues.length}\nWarnings: ${health.warnings.length}`, flags: 64 }); return true;
  }
  await respond(interaction, adminPayload(interaction)); return true;
}

async function handleUser(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('birthdays:user:')) return false;
  if (!guildManager.isModuleEnabled(interaction.guildId, 'birthdays')) { await interaction.reply({ content: '❌ Birthdays is currently disabled for this server.', flags: 64 }); return true; }
  const record = birthdays.getBirthday(interaction.guildId, interaction.user.id);
  if (id === 'birthdays:user:open') { await respond(interaction, userPayload(interaction)); return true; }
  if (id === 'birthdays:user:set') { await interaction.showModal(birthdayModal(record)); return true; }
  if (id === 'birthdays:user:set:submit') {
    const raw = interaction.fields.getTextInputValue('date').trim(); const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/); if (!match) throw new Error('Use DD/MM or DD/MM/YYYY.');
    birthdays.setBirthday(interaction.guildId, interaction.user.id, { day: Number(match[1]), month: Number(match[2]), year: match[3] ? Number(match[3]) : null }, { actorId: interaction.user.id, action: 'birthday_user_set' });
    await interaction.reply({ content: '✅ Your birthday has been saved.', flags: 64 }); return true;
  }
  if (!record) { await interaction.reply({ content: 'Add your birthday first.', flags: 64 }); return true; }
  if (id === 'birthdays:user:announce') birthdays.setBirthday(interaction.guildId, interaction.user.id, { announce: !record.announce }, { actorId: interaction.user.id, action: 'birthday_user_announce' });
  else if (id === 'birthdays:user:age') birthdays.setBirthday(interaction.guildId, interaction.user.id, { showAge: !record.showAge }, { actorId: interaction.user.id, action: 'birthday_user_age' });
  else if (id === 'birthdays:user:remove') { birthdays.removeBirthday(interaction.guildId, interaction.user.id, { actorId: interaction.user.id, action: 'birthday_user_remove' }); await respond(interaction, userPayload(interaction)); return true; }
  else if (id === 'birthdays:user:upcoming') { await interaction.reply({ content: birthdayListContent(interaction.guildId), flags: 64, allowedMentions: { parse: [] } }); return true; }
  await respond(interaction, userPayload(interaction)); return true;
}

module.exports = { adminPayload, userPayload, handleAdmin, handleUser };
