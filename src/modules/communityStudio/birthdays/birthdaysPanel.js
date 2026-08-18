'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const birthdays = require('./birthdays');

const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const UPCOMING_DAYS = 60;
const TIMEZONES = [
  ['🇬🇧 Europe/London', 'Europe/London'],
  ['🇮🇪 Europe/Dublin', 'Europe/Dublin'],
  ['🇺🇸 America/New_York', 'America/New_York'],
  ['🇺🇸 America/Chicago', 'America/Chicago'],
  ['🇺🇸 America/Denver', 'America/Denver'],
  ['🇺🇸 America/Los_Angeles', 'America/Los_Angeles'],
  ['🇨🇦 America/Toronto', 'America/Toronto'],
  ['🇦🇺 Australia/Sydney', 'Australia/Sydney'],
  ['🇳🇿 Pacific/Auckland', 'Pacific/Auckland'],
  ['🌐 UTC', 'UTC'],
];

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
        button('admin:birthdays:management', '🛠️ Management'),
      ),
      row(
        button('admin:studio:communityStudio', '⬅️ Back'),
        button('admin:birthdays:tools', '⚙️ Settings'),
      ),
    ],
  };
}

function timezoneMenu(currentTimezone) {
  const options = TIMEZONES.map(([label, value]) => ({ label, value, default: value === currentTimezone }));
  if (!TIMEZONES.some(([, value]) => value === currentTimezone) && currentTimezone) {
    options.unshift({ label: `Current · ${currentTimezone}`.slice(0, 100), value: currentTimezone, default: true });
  }
  options.push({ label: '✏️ Other / Custom…', value: '__custom__' });
  return new StringSelectMenuBuilder()
    .setCustomId('admin:birthdays:timezone')
    .setPlaceholder('Choose birthday timezone')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(...options.slice(0, 25));
}

function celebrationPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const imageLabel = section.settings.cardImageMode === 'none'
    ? 'None'
    : section.settings.cardImageMode === 'custom' ? 'Custom' : 'Goliath Default';
  const desc = [
    '**📣 Public Celebration**',
    `Channel: ${section.settings.announcementChannelId ? `<#${section.settings.announcementChannelId}>` : '**Not set**'}`,
    `Time: **${section.settings.announcementTime} · ${section.settings.timezone}**`,
    `Same-day birthdays: **${section.settings.combineSameDay ? 'Combined' : 'Individual'}**`,
    '', '**💬 Messages**',
    `Individual: **${section.settings.messageTemplates.length} ready**`,
    `Group: **${section.settings.groupMessageTemplates.length} ready**`,
    '', '**🎨 Birthday Card**',
    `Style: **${section.settings.useBirthdayEmbed ? 'Birthday Card' : 'Plain Message'}**`,
    `Image: **${imageLabel}**`,
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎉 Birthday Celebration').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Celebration' }).setTimestamp()],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:birthdays:channel').setPlaceholder('Public birthday celebration channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels(section.settings.announcementChannelId ? [section.settings.announcementChannelId] : [])),
      row(timezoneMenu(section.settings.timezone)),
      row(
        button('admin:birthdays:settings', '🕐 Time', ButtonStyle.Primary),
        button('admin:birthdays:timezone:custom', '🌍 Timezone'),
        button('admin:birthdays:combine', section.settings.combineSameDay ? '👥 Combined: On' : '👤 Combined: Off', section.settings.combineSameDay ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      row(
        button('admin:birthdays:messages:individual', '💬 Individual Messages'),
        button('admin:birthdays:messages:group', '🎉 Group Messages'),
        button('admin:birthdays:card', '🎨 Birthday Card'),
      ),
      row(button('admin:birthdays', '⬅️ Back')),
    ],
  };
}

function messagePoolPayload(interaction, type) {
  const section = birthdays.getSection(interaction.guildId);
  const group = type === 'group';
  const templates = group ? section.settings.groupMessageTemplates : section.settings.messageTemplates;
  const variables = group ? '`{mentions}` · `{count}` · `{server}`' : '`{mention}` · `{user}` · `{server}` · `{age}`';
  const preview = templates.slice(0, 5).map((message, index) => `**${index + 1}.** ${message}`).join('\n\n');
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(group ? '🎉 Group Birthday Messages' : '💬 Individual Birthday Messages')
      .setDescription(`Active messages: **${templates.length}**\nVariables: ${variables}\n\n${preview || 'No messages configured.'}\n\nGoliath rotates through this pool automatically.`)
      .setFooter({ text: 'Goliath Birthdays · Celebration Messages' })
      .setTimestamp()],
    components: [
      row(
        button(`admin:birthdays:messages:${type}:edit`, '✏️ Edit Messages', ButtonStyle.Primary),
        button(`admin:birthdays:messages:${type}:defaults`, '♻️ Restore Defaults'),
      ),
      row(button('admin:birthdays:celebration', '⬅️ Back')),
    ],
  };
}

function cardImageLabel(section) {
  if (section.settings.cardImageMode === 'none') return 'None';
  if (section.settings.cardImageMode === 'custom') return section.settings.cardImageUrl ? 'Custom Image/GIF' : 'Custom — URL missing';
  return 'Goliath Default GIF';
}

function cardPayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const desc = [
    `Status: **${section.settings.useBirthdayEmbed ? 'Enabled' : 'Disabled'}**`,
    `Title: **${section.settings.cardTitle}**`,
    `Colour: **${section.settings.cardColor}**`,
    `Thumbnail: **${section.settings.cardUseServerIcon ? 'Server Icon' : 'Off'}**`,
    `Image: **${cardImageLabel(section)}**`,
    `Footer: **${section.settings.cardFooter || 'None'}**`,
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Birthday Card').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Birthday Card' }).setTimestamp()],
    components: [
      row(
        button('admin:birthdays:card:toggle', section.settings.useBirthdayEmbed ? '🟢 Card: On' : '⚪ Card: Off', section.settings.useBirthdayEmbed ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:birthdays:card:text', '✏️ Card Text', ButtonStyle.Primary),
        button('admin:birthdays:card:color', '🎨 Colour'),
        button('admin:birthdays:card:image', '🖼️ Image / GIF'),
      ),
      row(
        button('admin:birthdays:card:preview', '👁️ Preview'),
        button('admin:birthdays:card:defaults', '♻️ Restore Defaults'),
      ),
      row(button('admin:birthdays:celebration', '⬅️ Back')),
    ],
  };
}

function cardImagePayload(interaction) {
  const section = birthdays.getSection(interaction.guildId);
  const desc = [
    `Current image: **${cardImageLabel(section)}**`,
    '', 'Choose the built-in birthday GIF, use your own image/GIF URL, or disable the large card image.',
    section.settings.cardImageMode === 'custom' && section.settings.cardImageUrl ? `\nCustom URL: ${section.settings.cardImageUrl}` : '',
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Birthday Card Image / GIF').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Birthday Card' }).setTimestamp()],
    components: [
      row(
        button('admin:birthdays:card:image:default', '🎉 Goliath Default', section.settings.cardImageMode === 'default' ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:birthdays:card:image:custom', '🔗 Custom URL', section.settings.cardImageMode === 'custom' ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:birthdays:card:image:none', '🚫 No Image', section.settings.cardImageMode === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      row(button('admin:birthdays:card', '⬅️ Back')),
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
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🛠️ Management').setDescription(desc).setFooter({ text: 'Goliath Birthdays · Management' }).setTimestamp()],
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
      row(
        button('admin:birthdays:testmenu', '🧪 Test Centre'),
        button('admin:birthdays:health', '🩺 Health'),
        button('admin:birthdays:import', '📥 Import'),
        button('admin:birthdays:export', '📤 Export'),
      ),
      row(button('admin:birthdays', '⬅️ Back')),
    ],
  };
}

function settingsModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:settings:submit').setTitle('Birthday Celebration Time').addComponents(
    row(new TextInputBuilder().setCustomId('time').setLabel('Celebration time (HH:MM)').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.announcementTime).setPlaceholder('09:00')),
  );
}
function customTimezoneModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:timezone:custom:submit').setTitle('Custom Birthday Timezone').addComponents(
    row(new TextInputBuilder().setCustomId('timezone').setLabel('IANA timezone').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.timezone).setPlaceholder('Europe/London')),
  );
}
function messagesModal(section, type) {
  const group = type === 'group';
  const values = group ? section.settings.groupMessageTemplates : section.settings.messageTemplates;
  return new ModalBuilder().setCustomId(`admin:birthdays:messages:${type}:submit`).setTitle(group ? 'Group Birthday Messages' : 'Individual Birthday Messages').addComponents(
    row(new TextInputBuilder()
      .setCustomId('messages')
      .setLabel('One rotating message per line')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000)
      .setValue(values.join('\n'))),
  );
}
function cardTextModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:card:text:submit').setTitle('Birthday Card Text').addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Card title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(section.settings.cardTitle)),
    row(new TextInputBuilder().setCustomId('footer').setLabel('Footer — {server} supported').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1000).setValue(section.settings.cardFooter || '')),
  );
}
function cardColorModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:card:color:submit').setTitle('Birthday Card Colour').addComponents(
    row(new TextInputBuilder().setCustomId('color').setLabel('Embed colour hex').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.settings.cardColor).setPlaceholder('#5865F2')),
  );
}
function cardImageModal(section) {
  return new ModalBuilder().setCustomId('admin:birthdays:card:image:custom:submit').setTitle('Custom Birthday Card Image').addComponents(
    row(new TextInputBuilder().setCustomId('image').setLabel('Image / GIF URL').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2000).setValue(section.settings.cardImageUrl || '').setPlaceholder('https://...')),
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

async function handleAdmin(interaction) {
  const id = String(interaction.customId || ''); if (!id.startsWith('admin:birthdays')) return false;
  const actor = { actorId: interaction.user.id };
  if (id === 'admin:birthdays') { await respond(interaction, adminPayload(interaction)); return true; }
  if (id === 'admin:birthdays:celebration') { await respond(interaction, celebrationPayload(interaction)); return true; }
  if (id === 'admin:birthdays:management') { await respond(interaction, managementPayload(interaction)); return true; }
  if (id === 'admin:birthdays:tools') { await respond(interaction, toolsPayload()); return true; }
  if (id === 'admin:birthdays:messages:individual') { await respond(interaction, messagePoolPayload(interaction, 'individual')); return true; }
  if (id === 'admin:birthdays:messages:group') { await respond(interaction, messagePoolPayload(interaction, 'group')); return true; }
  if (id === 'admin:birthdays:card') { await respond(interaction, cardPayload(interaction)); return true; }
  if (id === 'admin:birthdays:card:image') { await respond(interaction, cardImagePayload(interaction)); return true; }
  if (id === 'admin:birthdays:channel' && interaction.isChannelSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { announcementChannelId: interaction.values[0] || null }, { ...actor, action: 'birthdays_channel_update' });
  else if (id === 'admin:birthdays:timezone' && interaction.isStringSelectMenu?.()) {
    const timezone = interaction.values[0];
    if (timezone === '__custom__') { await interaction.showModal(customTimezoneModal(birthdays.getSection(interaction.guildId))); return true; }
    if (!birthdays.validTimezone(timezone)) throw new Error('That timezone is not valid.');
    birthdays.updateSettings(interaction.guildId, { timezone }, { ...actor, action: 'birthdays_timezone_update' });
  }
  else if (id === 'admin:birthdays:timezone:custom') { await interaction.showModal(customTimezoneModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:role' && interaction.isRoleSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { birthdayRoleId: interaction.values[0] || null }, { ...actor, action: 'birthdays_role_update' });
  else if (id === 'admin:birthdays:monthly:channel' && interaction.isChannelSelectMenu?.()) birthdays.updateSettings(interaction.guildId, { monthlyBoardChannelId: interaction.values[0] || null }, { ...actor, action: 'birthdays_monthly_channel_update' });
  else if (id === 'admin:birthdays:settings') { await interaction.showModal(settingsModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:monthly:settings') { await interaction.showModal(monthlySettingsModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:manage') { await interaction.showModal(manageModal()); return true; }
  else if (id === 'admin:birthdays:import') { await interaction.showModal(importModal()); return true; }
  else if (id === 'admin:birthdays:combine') birthdays.updateSettings(interaction.guildId, { combineSameDay: !birthdays.getSection(interaction.guildId).settings.combineSameDay }, { ...actor, action: 'birthdays_combine_toggle' });
  else if (id === 'admin:birthdays:messages:individual:edit') { await interaction.showModal(messagesModal(birthdays.getSection(interaction.guildId), 'individual')); return true; }
  else if (id === 'admin:birthdays:messages:group:edit') { await interaction.showModal(messagesModal(birthdays.getSection(interaction.guildId), 'group')); return true; }
  else if (id === 'admin:birthdays:messages:individual:defaults') {
    birthdays.updateSettings(interaction.guildId, { messageTemplates: birthdays.DEFAULT_INDIVIDUAL_TEMPLATES }, { ...actor, action: 'birthdays_individual_messages_defaults' });
    await respond(interaction, messagePoolPayload(interaction, 'individual')); return true;
  }
  else if (id === 'admin:birthdays:messages:group:defaults') {
    birthdays.updateSettings(interaction.guildId, { groupMessageTemplates: birthdays.DEFAULT_GROUP_TEMPLATES }, { ...actor, action: 'birthdays_group_messages_defaults' });
    await respond(interaction, messagePoolPayload(interaction, 'group')); return true;
  }
  else if (id === 'admin:birthdays:card:toggle') {
    const section = birthdays.getSection(interaction.guildId);
    birthdays.updateSettings(interaction.guildId, { useBirthdayEmbed: !section.settings.useBirthdayEmbed }, { ...actor, action: 'birthdays_card_toggle' });
    await respond(interaction, cardPayload(interaction)); return true;
  }
  else if (id === 'admin:birthdays:card:text') { await interaction.showModal(cardTextModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:card:color') { await interaction.showModal(cardColorModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:card:image:custom') { await interaction.showModal(cardImageModal(birthdays.getSection(interaction.guildId))); return true; }
  else if (id === 'admin:birthdays:card:image:default') {
    birthdays.updateSettings(interaction.guildId, { cardImageMode: 'default', cardImageUrl: null }, { ...actor, action: 'birthdays_card_image_default' });
    await respond(interaction, cardImagePayload(interaction)); return true;
  }
  else if (id === 'admin:birthdays:card:image:none') {
    birthdays.updateSettings(interaction.guildId, { cardImageMode: 'none' }, { ...actor, action: 'birthdays_card_image_none' });
    await respond(interaction, cardImagePayload(interaction)); return true;
  }
  else if (id === 'admin:birthdays:card:defaults') {
    birthdays.updateSettings(interaction.guildId, {
      useBirthdayEmbed: true,
      cardTitle: '🎂 Happy Birthday!',
      cardFooter: 'From everyone at {server} 🎉',
      cardColor: '#5865F2',
      cardImageMode: 'default',
      cardImageUrl: null,
      cardUseServerIcon: true,
    }, { ...actor, action: 'birthdays_card_defaults' });
    await respond(interaction, cardPayload(interaction)); return true;
  }
  else if (id === 'admin:birthdays:card:preview') {
    const section = birthdays.getSection(interaction.guildId);
    const member = birthdays.getBirthday(interaction.guildId, interaction.user.id)
      || birthdays.normalizeMember({ userId: interaction.user.id, month: 1, day: 1 }, interaction.user.id, section.settings);
    const today = new Date().toISOString().slice(0, 10);
    const preview = birthdays.birthdayEmbed(interaction.guild, section, [member], new Date().getUTCFullYear(), today, true);
    await interaction.reply({ content: '👁️ Birthday Card preview', embeds: [preview], flags: 64, allowedMentions: { parse: [] } }); return true;
  }
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
    const time = interaction.fields.getTextInputValue('time').trim();
    if (!birthdays.validTime(time)) throw new Error('Celebration time must use HH:MM.');
    birthdays.updateSettings(interaction.guildId, { announcementTime: time }, { ...actor, action: 'birthdays_time_update' });
    await interaction.reply({ content: '✅ Birthday celebration time updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:timezone:custom:submit') {
    const timezone = interaction.fields.getTextInputValue('timezone').trim();
    if (!birthdays.validTimezone(timezone)) throw new Error('Enter a valid IANA timezone such as Europe/London.');
    birthdays.updateSettings(interaction.guildId, { timezone }, { ...actor, action: 'birthdays_timezone_update' });
    await interaction.reply({ content: `✅ Birthday timezone updated to **${timezone}**.`, flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:messages:individual:submit') {
    birthdays.updateSettings(interaction.guildId, { messageTemplates: interaction.fields.getTextInputValue('messages') }, { ...actor, action: 'birthdays_individual_messages_update' });
    await interaction.reply({ content: '✅ Individual birthday message pool updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:messages:group:submit') {
    birthdays.updateSettings(interaction.guildId, { groupMessageTemplates: interaction.fields.getTextInputValue('messages') }, { ...actor, action: 'birthdays_group_messages_update' });
    await interaction.reply({ content: '✅ Group birthday message pool updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:card:text:submit') {
    birthdays.updateSettings(interaction.guildId, { cardTitle: interaction.fields.getTextInputValue('title'), cardFooter: interaction.fields.getTextInputValue('footer') }, { ...actor, action: 'birthdays_card_text_update' });
    await interaction.reply({ content: '✅ Birthday Card text updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:card:color:submit') {
    const color = interaction.fields.getTextInputValue('color').trim();
    if (!/^#?[0-9a-f]{6}$/i.test(color)) throw new Error('Card colour must be a 6-digit hex colour such as #5865F2.');
    birthdays.updateSettings(interaction.guildId, { cardColor: color }, { ...actor, action: 'birthdays_card_color_update' });
    await interaction.reply({ content: '✅ Birthday Card colour updated.', flags: 64 }); return true;
  }
  else if (id === 'admin:birthdays:card:image:custom:submit') {
    const image = interaction.fields.getTextInputValue('image').trim();
    if (!/^https?:\/\//i.test(image)) throw new Error('Card image must be an http/https URL.');
    birthdays.updateSettings(interaction.guildId, { cardImageMode: 'custom', cardImageUrl: image }, { ...actor, action: 'birthdays_card_image_custom' });
    await interaction.reply({ content: '✅ Custom Birthday Card image/GIF updated.', flags: 64 }); return true;
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
  if (id === 'admin:birthdays:channel' || id === 'admin:birthdays:timezone' || id === 'admin:birthdays:combine') { await respond(interaction, celebrationPayload(interaction)); return true; }
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
