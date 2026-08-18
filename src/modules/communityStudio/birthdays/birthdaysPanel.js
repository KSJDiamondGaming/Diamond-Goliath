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
  return { today: list.filter((item) => item.daysUntil === 0), upcoming: list.filter((item) => item.daysUntil > 0) };
}
function birthdayLine(item, todayLabel = false) {
  const date = todayLabel ? 'TODAY' : `${String(item.next.day).padStart(2, '0')}/${String(item.next.month).padStart(2, '0')}`;
  return `• <@${item.member.userId}> — **${date}**`;
}
function birthdayListContent(guildId) {
  const { today, upcoming } = birthdayWindow(guildId);
  return `**🎂 Today’s Birthdays (${today.length})**\n${today.length ? today.map((item) => birthdayLine(item, true)).join('\n') : 'No birthdays today.'}\n\n**📅 Upcoming Birthdays — Next 2 Months**\n${upcoming.length ? upcoming.map((item) => birthdayLine(item)).join('\n') : 'No birthdays in the next 2 months.'}`;
}

function adminPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const enabled = guildManager.isModuleEnabled(interaction.guildId, 'birthdays');
  const { today, upcoming } = birthdayWindow(interaction.guildId);
  const todayLines = today.length ? today.map((item) => birthdayLine(item, true)).join('\n') : 'No birthdays today.';
  const upcomingLines = upcoming.length ? upcoming.slice(0, 5).map((item) => birthdayLine(item)).join('\n') : 'No birthdays in the next 2 months.';
  const desc = [
    `Module: **${enabled ? 'Enabled' : 'Disabled'}**`,
    '', '**🎉 Birthday Day**',
    `Role: ${section.settings.birthdayRoleId ? `<@&${section.settings.birthdayRoleId}>` : '**None**'}`,
    `Today: **${today.length}**`,
    '', '**📣 Public Celebration**',
    `Channel: ${section.settings.announcementChannelId ? `<#${section.settings.announcementChannelId}>` : '**Not set**'}`,
    `Time: **${section.settings.announcementTime} · ${section.settings.timezone}**`,
    `Style: **${section.settings.useBirthdayEmbed ? 'Birthday Card' : 'Plain Message'} · ${section.settings.combineSameDay ? 'Combined' : 'Individual'}**`,
    '', '**📅 Monthly Board**',
    `Channel: ${section.settings.monthlyBoardChannelId ? `<#${section.settings.monthlyBoardChannelId}>` : '**Not set**'}`,
    `Posts: **1st monthly · ${section.settings.monthlyBoardTime}**`,
    '', '**🎂 Today**', todayLines,
    '', '**📆 Upcoming — Next 2 Months**', upcomingLines,
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(enabled ? 0x5865F2 : 0x747F8D).setTitle('🎂 Birthdays').setDescription(desc).setFooter({ text: 'Goliath Birthdays · /admin' }).setTimestamp()],
    components: [
      row(
        button('admin:birthdays:celebration', '🎉 Celebration', ButtonStyle.Primary),
        button('admin:birthdays:management', '🛠️ Birthday Management'),
      ),
      row(
        button('admin:studio:communityStudio', '⬅️ Back'),
        button('admin:birthdays:tools', '⚙️ Settings'),
      ),
    ],
  };
}

function celebrationPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const desc = [
    '**📣 Public Celebration**',
    `Channel: ${section.settings.announcementChannelId ? `<#${section.settings.announcementChannelId}>` : '**Not set**'}`,
    `Time: **${section.settings.announcementTime} · ${section.settings.timezone}**`,
    `Celebrations: **${section.settings.combineSameDay ? 'Combined' : 'Individual'}**`,
    `Style: **${section.settings.useBirthdayEmbed ? 'Birthday Card' : 'Plain Message'}**`,
    `Message templates: **${section.settings.messageTemplates.length}**`,
    '', 'Configure the member-facing birthday celebration here.',
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎉 Birthday Celebration').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Celebration' }).setTimestamp()],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:birthdays:channel').setPlaceholder('Public birthday celebration channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels(section.settings.announcementChannelId ? [section.settings.announcementChannelId] : [])),
      row(button('admin:birthdays:settings', '⚙️ Celebration Settings', ButtonStyle.Primary), button('admin:birthdays:card', '🎨 Birthday Card')),
      row(button('admin:birthdays', '⬅️ Back')),
    ],
  };
}

function managementPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const desc = [
    '**🎭 Birthday Day**',
    `Birthday role: ${section.settings.birthdayRoleId ? `<@&${section.settings.birthdayRoleId}>` : '**Not set**'}`,
    '', '**📅 Monthly Birthday Board**',
    `Channel: ${section.settings.monthlyBoardChannelId ? `<#${section.settings.monthlyBoardChannelId}>` : '**Not set**'}`,
    `Posts: **1st monthly · ${section.settings.monthlyBoardTime} · ${section.settings.timezone}**`,
    `Leap day: **${section.settings.leapDayMode === 'mar1' ? '1 March' : '28 February'} in non-leap years**`,
    '', 'Manage server-side birthday roles, the management board and member birthday records here.',
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🛠️ Birthday Management').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Management' }).setTimestamp()],
    components: [
      row(new RoleSelectMenuBuilder().setCustomId('admin:birthdays:role').setPlaceholder('Optional all-day birthday role').setMinValues(0).setMaxValues(1).setDefaultRoles(section.settings.birthdayRoleId ? [section.settings.birthdayRoleId] : [])),
      row(new ChannelSelectMenuBuilder().setCustomId('admin:birthdays:monthly:channel').setPlaceholder('Optional management birthday board channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels(section.settings.monthlyBoardChannelId ? [section.settings.monthlyBoardChannelId] : [])),
      row(button('admin:birthdays:monthly:settings', '📅 Monthly Board'), button('admin:birthdays:manage', '👥 Manage Birthdays')),
      row(button('admin:birthdays', '⬅️ Back')),
    ],
  };
}

function toolsPayload() {
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Birthday Settings').setDescription('Birthday diagnostics, testing and data tools.').setFooter({ text: 'Goliath Birthdays · Settings' }).setTimestamp()],
    components: [
      row(button('admin:birthdays:testmenu', '🧪 Test Centre'), button('admin:birthdays:health', '🩺 Health')),
      row(button('admin:birthdays:import', '📥 Import'), button('admin:birthdays:export', '📤 Export')),
      row(button('admin:birthdays', '⬅️ Back')),
    ],
  };
}

function settingsModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:settings:submit').setTitle('Birthday Celebration').addComponents(
    row(new TextInputBuilder().setCustomId('time').setLabel('Celebration time (HH:MM)').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.announcementTime)),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('Birthday timezone').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.timezone).setPlaceholder('Europe/London')),
    row(new TextInputBuilder().setCustomId('combine').setLabel('Combine same-day birthdays? on / off').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.combineSameDay ? 'on' : 'off')),
    row(new TextInputBuilder().setCustomId('messages').setLabel('Random messages — one per line').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(section.settings.messageTemplates.join('\n'))),
  );
}
function cardModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:card:submit').setTitle('Birthday Card').addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Card title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(section.settings.cardTitle)),
    row(new TextInputBuilder().setCustomId('footer').setLabel('Footer — {server} supported').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1000).setValue(section.settings.cardFooter || '')),
    row(new TextInputBuilder().setCustomId('color').setLabel('Embed colour hex').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.cardColor)),
    row(new TextInputBuilder().setCustomId('image').setLabel('Optional image / GIF URL').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2000).setValue(section.settings.cardImageUrl || '').setPlaceholder('https://...')),
    row(new TextInputBuilder().setCustomId('mode').setLabel('Use embed card? on / off').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.useBirthdayEmbed ? 'on' : 'off')),
  );
}
function monthlySettingsModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:monthly:settings:submit').setTitle('Monthly Board & Leap Day').addComponents(
    row(new TextInputBuilder().setCustomId('time').setLabel('Monthly board time (HH:MM)').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.monthlyBoardTime)),
    row(new TextInputBuilder().setCustomId('leap').setLabel('Feb 29 in non-leap years').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.leapDayMode === 'mar1' ? 'mar1' : 'feb28').setPlaceholder('feb28 or mar1')),
  );
}
function manageModal() {
  return new ModalBuilder().setCustomId('admin:birthdays:manage:submit').setTitle('Manage Member Birthday').addComponents(
    row(new TextInputBuilder().setCustomId('user').setLabel('Discord user ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456789012345678')),
    row(new TextInputBuilder().setCustomId('date').setLabel('Birthday (DD/MM or DD/MM/YYYY)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('18/08/1990 · blank = remove')),
    row(new TextInputBuilder().setCustomId('privacy').setLabel('List / Announce / Age (on/off)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('on / on / off')),
  );
}
function importModal() {
  return new ModalBuilder().setCustomId('admin:birthdays:import:submit').setTitle('Import Birthdays JSON').addComponents(
    row(new TextInputBuilder().setCustomId('json').setLabel('Paste Goliath birthday JSON').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
  );
}
function birthdayModal(record) {
  const value = record ? `${String(record.day).padStart(2, '0')}/${String(record.month).padStart(2, '0')}${record.year ? `/${record.year}` : ''}` : '';
  return new ModalBuilder().setCustomId('birthdays:user:set:submit').setTitle('My Birthday').addComponents(row(new TextInputBuilder().setCustomId('date').setLabel('Birthday (DD/MM or DD/MM/YYYY)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('16/08 or 16/08/1990').setValue(value)));
}

function userPayload(interaction) {
  const record = birthdays.getBirthday(interaction.guildId, interaction.user.id);
  const section = birthdays.getSection(interaction.guildId);
  const isToday = birthdayWindow(interaction.guildId).today.some((item) => item.member.userId === interaction.user.id);
  const desc = record ? [
    '**🎂 Your Birthday**',
    `Date: **${String(record.day).padStart(2, '0')}/${String(record.month).padStart(2, '0')}${record.year ? `/${record.year}` : ''}**${isToday ? ' — **TODAY**' : ''}`,
    '', '**🔐 Privacy Controls**',
    `List my birthday: **${record.listPublic ? 'On' : 'Off'}**`,
    `Announce my birthday: **${record.announce ? 'On' : 'Off'}**`,
    `Show my age: **${record.showAge && record.year ? 'On' : 'Off'}**`,
    '', '**🎉 On Your Birthday**',
    `Birthday role: ${section.settings.birthdayRoleId ? `<@&${section.settings.birthdayRoleId}>` : 'Not configured'}`,
    'The role runs for the birthday day only — midnight to midnight.',
    `Public celebration: **${section.settings.announcementTime} ${section.settings.timezone}**`,
    section.settings.announcementChannelId ? `Posted in: <#${section.settings.announcementChannelId}>` : 'Celebration channel: **Not configured**',
  ].join('\n') : [
    '**🎂 Add Your Birthday**', 'You have not added a birthday yet.',
    'Your birth year is optional. Privacy controls become available after saving your birthday.',
    '', `Server birthday timezone: **${section.settings.timezone}**`,
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(isToday ? 0xF1C40F : 0x5865F2).setTitle(isToday ? '🎉 Happy Birthday!' : '🎂 My Birthday').setDescription(desc).setFooter({ text: 'Goliath Birthdays · /user' }).setTimestamp()],
    components: [
      row(button('birthdays:user:set', record ? '✏️ Edit Birthday' : '➕ Add Birthday', ButtonStyle.Primary), record ? button('birthdays:user:list', record.listPublic ? '📅 Listed: On' : '📅 Listed: Off', record.listPublic ? ButtonStyle.Success : ButtonStyle.Secondary) : null, record ? button('birthdays:user:announce', record.announce ? '📣 Announce: On' : '📣 Announce: Off', record.announce ? ButtonStyle.Success : ButtonStyle.Secondary) : null, record?.year ? button('birthdays:user:age', record.showAge ? '🎈 Age: On' : '🎈 Age: Off', record.showAge ? ButtonStyle.Success : ButtonStyle.Secondary) : null),
      row(button('birthdays:user:upcoming', '📅 Today & Upcoming'), record ? button('birthdays:user:remove', '🗑️ Remove Birthday', ButtonStyle.Danger) : null),
      row(button('user:category:community', '⬅️ Back to Community')),
    ],
  };
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: 64 });
  return interaction.update(payload);
}
function parseDate(raw) {
  const match = String(raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) throw new Error('Use DD/MM or DD/MM/YYYY.');
  return { day: Number(match[1]), month: Number(match[2]), year: match[3] ? Number(match[3]) : null };
}
function parsePrivacy(raw) {
  const values = String(raw || '').split('/').map((v) => v.trim().toLowerCase());
  const bool = (v, fallback) => !v ? fallback : ['on', 'true', 'yes', '1'].includes(v);
  return { listPublic: bool(values[0], true), announce: bool(values[1], true), showAge: bool(values[2], false) };
}
function onOff(raw) { return ['on', 'true', 'yes', '1'].includes(String(raw || '').trim().toLowerCase()); }

async function handleAdmin(interaction) {
  const id = String(interaction.customId || ''); if (!id.startsWith('admin:birthdays')) return false;
  const actor = { actorId: interaction.user.id };
  if (id === 'admin:birthdays') { await respond(interaction, adminPayload(interaction)); return true; }
  if (id === 'admin:birthdays:celebration') { await respond(interaction, celebrationPayload(interaction)); return true; }
  if (id === 'admin:birthdays:management') { await respond(interaction, managementPayload(interaction)); return true; }
  if (id === 'admin:birthdays:tools') { await respond(interaction, toolsPayload()); return true; }
  if (id === 'admin:birthdays:channel' && interaction.isChannelSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { announcementChannelId: interaction.values[0] || null }, { ...actor, action: 'birthdays_channel_update' });
  else if (id === 'admin:birthdays:role' && interaction.isRoleSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { birthdayRoleId: interaction.values[0] || null }, { ...actor, action: 'birthdays_role_update' });
  else if (id === 'admin:birthdays:monthly:channel' && interaction.isChannelSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { monthlyBoardChannelId: interaction.values[0] || null }, { ...actor, action: 'birthdays_monthly_channel_update' });
  else if (id === 'admin:birthdays:settings') { await interaction.showModal(settingsModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:card') { await interaction.showModal(cardModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:monthly:settings') { await interaction.showModal(monthlySettingsModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:manage') { await interaction.showModal(manageModal()); return true; }
  else if (id === 'admin:birthdays:import') { await interaction.showModal(importModal()); return true; }
  else if (id === 'admin:birthdays:combine') birthdays.updateSettings(interaction.guildId, { combineSameDay: !birthdays.getSection(interaction.guildId).settings.combineSameDay }, { ...actor, action: 'birthdays_combine_toggle' });
  else if (id === 'admin:birthdays:testmenu') {
    await interaction.reply({ content: '**🧪 Birthday Test Centre**\nThese tests do not mark live birthdays as announced or change scheduler state.', flags: 64, components: [row(button('admin:birthdays:test:role', '🎭 Test Role'), button('admin:birthdays:test:announcement', '📣 Test Celebration'), button('admin:birthdays:test:monthly', '🗓️ Test Monthly Board'))] }); return true;
  }
  else if (id === 'admin:birthdays:test:role') { const result = await birthdays.testRoleAssignment(interaction.guild, interaction.user.id); await interaction.reply({ content: `✅ Birthday role test passed for <@&${result.roleId}>.${result.alreadyHadRole ? ' You already had the role, so it was not removed.' : ' The role was added and removed successfully.'}`, flags: 64 }); return true; }
  else if (id === 'admin:birthdays:test:announcement') { await birthdays.testPublicAnnouncement(interaction.guild, interaction.user.id); await interaction.reply({ content: '✅ Test birthday celebration posted. Live announcement state was not changed.', flags: 64 }); return true; }
  else if (id === 'admin:birthdays:test:monthly') { await birthdays.testMonthlyBoard(interaction.guild); await interaction.reply({ content: '✅ Test monthly birthday board posted. The real monthly schedule was not marked as sent.', flags: 64 }); return true; }
  else if (id === 'admin:birthdays:export') {
    const data = Buffer.from(JSON.stringify(birthdays.exportData(interaction.guildId), null, 2), 'utf8');
    await interaction.reply({ content: '📤 Birthday export ready.', flags: 64, files: [{ attachment: data, name: `goliath-birthdays-${interaction.guildId}.json` }] }); return true;
  }
  else if (id === 'admin:birthdays:health') {
    const health = await birthdays.buildHealth(interaction.guild); const a = health.audit;
    await interaction.reply({ content: `**🩺 Birthday Health — ${health.healthy ? 'Healthy' : 'Needs attention'}**\nIssues: **${health.issues.length}** · Warnings: **${health.warnings.length}**\nLast processed: **${a.lastProcessed || 'Never'}**\nLast announcement: **${a.lastAnnouncement || 'Never'}**\nLast monthly board: **${a.lastMonthlyBoard || 'Never'}**\nNext scheduled announcement: **${a.nextAnnouncement}**\nFailures: **${a.failures}**${a.lastFailure ? ` · Last: ${a.lastFailure}` : ''}`, flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:settings:submit') {
    const time = interaction.fields.getTextInputValue('time').trim(); const timezone = interaction.fields.getTextInputValue('timezone').trim();
    if (!birthdays.validTime(time) || !birthdays.validTimezone(timezone)) throw new Error('Check the announcement time and timezone.');
    birthdays.updateSettings(interaction.guildId, { announcementTime: time, timezone, combineSameDay: onOff(interaction.fields.getTextInputValue('combine')), messageTemplates: interaction.fields.getTextInputValue('messages') }, { ...actor, action: 'birthdays_settings_update' });
    await interaction.reply({ content: '✅ Birthday celebration settings updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:card:submit') {
    const color = interaction.fields.getTextInputValue('color').trim(); if (!/^#?[0-9a-f]{6}$/i.test(color)) throw new Error('Card colour must be a 6-digit hex colour such as #5865F2.');
    const image = interaction.fields.getTextInputValue('image').trim(); if (image && !/^https?:\/\//i.test(image)) throw new Error('Card image must be an http/https URL.');
    birthdays.updateSettings(interaction.guildId, { cardTitle: interaction.fields.getTextInputValue('title'), cardFooter: interaction.fields.getTextInputValue('footer'), cardColor: color, cardImageUrl: image || null, useBirthdayEmbed: onOff(interaction.fields.getTextInputValue('mode')) }, { ...actor, action: 'birthdays_card_update' });
    await interaction.reply({ content: '✅ Birthday Card settings updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:monthly:settings:submit') {
    const time = interaction.fields.getTextInputValue('time').trim(); if (!birthdays.validTime(time)) throw new Error('Monthly board time must use HH:MM.');
    const leap = interaction.fields.getTextInputValue('leap').trim().toLowerCase(); if (!['feb28', 'mar1'].includes(leap)) throw new Error('Leap day mode must be feb28 or mar1.');
    birthdays.updateSettings(interaction.guildId, { monthlyBoardTime: time, leapDayMode: leap }, { ...actor, action: 'birthdays_monthly_settings_update' });
    await interaction.reply({ content: `✅ Monthly board updated. Feb 29 birthdays will use **${leap === 'mar1' ? '1 March' : '28 February'}** in non-leap years.`, flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:manage:submit') {
    const userId = interaction.fields.getTextInputValue('user').trim(); if (!/^\d{15,25}$/.test(userId)) throw new Error('Enter a valid Discord user ID.');
    const rawDate = interaction.fields.getTextInputValue('date').trim();
    if (!rawDate) { const removed = birthdays.removeBirthday(interaction.guildId, userId, { ...actor, action: 'birthday_admin_remove' }); await interaction.reply({ content: removed ? `✅ Removed birthday for <@${userId}>.` : 'No birthday record was found for that member.', flags: 64 }); return true; }
    birthdays.setBirthday(interaction.guildId, userId, { ...parseDate(rawDate), ...parsePrivacy(interaction.fields.getTextInputValue('privacy')) }, { ...actor, action: 'birthday_admin_set' });
    await interaction.reply({ content: `✅ Birthday updated for <@${userId}>.`, flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:import:submit') {
    let parsed; try { parsed = JSON.parse(interaction.fields.getTextInputValue('json')); } catch { throw new Error('Import data is not valid JSON.'); }
    const result = birthdays.importData(interaction.guildId, parsed, { ...actor, action: 'birthday_admin_import' }); await interaction.reply({ content: `✅ Imported **${result.imported}** birthday record(s). Total stored: **${result.total}**.`, flags: 64 }); return true;
  }
  if (id === 'admin:birthdays:channel') { await respond(interaction, celebrationPayload(interaction)); return true; }
  if (id === 'admin:birthdays:role' || id === 'admin:birthdays:monthly:channel') { await respond(interaction, managementPayload(interaction)); return true; }
  await respond(interaction, adminPayload(interaction)); return true;
}

async function handleUser(interaction) {
  const id = String(interaction.customId || ''); if (!id.startsWith('birthdays:user:')) return false;
  if (!guildManager.isModuleEnabled(interaction.guildId, 'birthdays')) { await interaction.reply({ content: '❌ Birthdays is currently disabled for this server.', flags: 64 }); return true; }
  const record = birthdays.getBirthday(interaction.guildId, interaction.user.id);
  if (id === 'birthdays:user:open') { await respond(interaction, userPayload(interaction)); return true; }
  if (id === 'birthdays:user:set') { await interaction.showModal(birthdayModal(record)); return true; }
  if (id === 'birthdays:user:set:submit') { birthdays.setBirthday(interaction.guildId, interaction.user.id, parseDate(interaction.fields.getTextInputValue('date')), { actorId: interaction.user.id, action: 'birthday_user_set' }); await interaction.reply({ content: '✅ Your birthday has been saved.', flags: 64 }); return true; }
  if (!record) { await interaction.reply({ content: 'Add your birthday first.', flags: 64 }); return true; }
  if (id === 'birthdays:user:list') birthdays.setBirthday(interaction.guildId, interaction.user.id, { listPublic: !record.listPublic }, { actorId: interaction.user.id, action: 'birthday_user_list' });
  else if (id === 'birthdays:user:announce') birthdays.setBirthday(interaction.guildId, interaction.user.id, { announce: !record.announce }, { actorId: interaction.user.id, action: 'birthday_user_announce' });
  else if (id === 'birthdays:user:age') birthdays.setBirthday(interaction.guildId, interaction.user.id, { showAge: !record.showAge }, { actorId: interaction.user.id, action: 'birthday_user_age' });
  else if (id === 'birthdays:user:remove') { birthdays.removeBirthday(interaction.guildId, interaction.user.id, { actorId: interaction.user.id, action: 'birthday_user_remove' }); await respond(interaction, userPayload(interaction)); return true; }
  else if (id === 'birthdays:user:upcoming') { await interaction.reply({ content: birthdayListContent(interaction.guildId), flags: 64, allowedMentions: { parse: [] } }); return true; }
  await respond(interaction, userPayload(interaction)); return true;
}

module.exports = { adminPayload, userPayload, handleAdmin, handleUser };
