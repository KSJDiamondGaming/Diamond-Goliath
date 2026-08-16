'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const schedule = require('./schedule');
const deployment = require('./scheduleDeployment');

const sessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const clean = (value, max = 100) => String(value || '').trim().slice(0, max);
const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user.id}`;

function getState(interaction) {
  const events = schedule.listEvents(interaction.guildId);
  const current = sessions.get(sessionKey(interaction)) || {
    eventId: events.find((event) => event.status === 'scheduled')?.eventId || events[0]?.eventId || null,
    channelId: null,
    templateId: null,
    page: 'home',
  };
  if (current.eventId && !events.some((event) => event.eventId === current.eventId)) current.eventId = events[0]?.eventId || null;
  sessions.set(sessionKey(interaction), current);
  return current;
}

function eventSelect(guildId, state) {
  const events = schedule.listEvents(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:schedule:event').setPlaceholder(events.length ? 'Select an event' : 'No events created').setMinValues(1).setMaxValues(1).setDisabled(!events.length);
  if (events.length) menu.addOptions(events.map((event) => ({
    label: clean(event.title, 100),
    description: clean(`${event.status} · ${new Date(event.startAt).toLocaleString('en-GB')}`, 100),
    value: event.eventId,
    default: event.eventId === state.eventId,
  })));
  return row(menu);
}
function templateSelect(guildId, state) {
  const templates = schedule.listTemplates(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:schedule:template').setPlaceholder(templates.length ? 'Select event template' : 'No templates saved').setMinValues(1).setMaxValues(1).setDisabled(!templates.length);
  if (templates.length) menu.addOptions(templates.map((item) => ({ label: clean(item.name, 100), value: item.templateId, default: state.templateId === item.templateId })));
  return row(menu);
}
function announcementChannelSelect(event, state) {
  return row(new ChannelSelectMenuBuilder().setCustomId('admin:schedule:channel').setPlaceholder('Announcement / event channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels((event?.channelId || state.channelId) ? [event?.channelId || state.channelId] : []));
}
function voiceChannelSelect(event) {
  return row(new ChannelSelectMenuBuilder().setCustomId('admin:schedule:voice').setPlaceholder('Optional voice channel').setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setMinValues(0).setMaxValues(1).setDefaultChannels(event?.voiceChannelId ? [event.voiceChannelId] : []));
}
function roleSelect(id, placeholder, defaults = []) {
  return row(new RoleSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(0).setMaxValues(10).setDefaultRoles((defaults || []).slice(0, 10)));
}
function eventSummary(event) {
  if (!event) return 'Create your first event to begin.';
  const counts = schedule.rsvpCounts(event);
  return [
    `**${event.title}**`,
    `<t:${Math.floor(new Date(event.startAt).getTime() / 1000)}:F>`,
    `Status: **${event.status}** · RSVPs: **${schedule.isRsvpOpen(event) ? 'Open' : 'Closed'}**`,
    `Attending: **${schedule.attendeeCount(event)}${event.capacity ? `/${event.capacity}` : ''}** · Waitlist: **${counts.waitlist || 0}**`,
    `Repeat: **${event.recurrence.type}${event.recurrence.type !== 'none' ? ` / ${event.recurrence.interval}` : ''}**`,
    `Native mirror: **${event.mirrorDiscordEvent ? 'On' : 'Off'}** · Thread: **${event.thread.enabled ? 'On' : 'Off'}**`,
  ].join('\n');
}

function buildHome(interaction) {
  const state = getState(interaction); const section = schedule.getSection(interaction.guildId); const enabled = guildManager.isModuleEnabled(interaction.guildId, 'schedule');
  const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
  const upcoming = schedule.listEvents(interaction.guildId, { status: 'scheduled' });
  const embed = new EmbedBuilder().setColor(enabled ? 0x5865F2 : 0x747F8D).setTitle('📅 Schedule Studio').setDescription('Sesh-style event planning inside Goliath. Configure events here; members RSVP from deployed event messages.').addFields(
    { name: 'Module', value: enabled ? 'Enabled ✅' : 'Disabled', inline: true },
    { name: 'Upcoming', value: String(upcoming.length), inline: true },
    { name: 'Default timezone', value: section.settings.defaultTimezone, inline: true },
    { name: 'Selected event', value: eventSummary(event), inline: false },
    { name: 'Stored templates', value: String(schedule.listTemplates(interaction.guildId).length), inline: true },
    { name: 'Deployment', value: event?.messageId && event?.channelId ? `<#${event.channelId}> · ${event.messageId}` : 'Not deployed', inline: true },
  ).setFooter({ text: 'Goliath Schedule · /admin only' });
  return { embeds: [embed], components: [
    eventSelect(interaction.guildId, state),
    row(button('admin:schedule:create', '➕ Create Event', ButtonStyle.Success), button('admin:schedule:edit', '✏️ Edit', ButtonStyle.Primary, !event), button('admin:schedule:deploy', event?.messageId ? '📨 Update Post' : '📨 Deploy', ButtonStyle.Primary, !event), button('admin:schedule:duplicate', '📄 Duplicate', ButtonStyle.Secondary, !event)),
    row(button('admin:schedule:setup', '⚙️ Event Setup', ButtonStyle.Primary, !event), button('admin:schedule:rsvp', '👥 RSVP & Roles', ButtonStyle.Primary, !event), button('admin:schedule:timing', '🔁 Repeat & Reminders', ButtonStyle.Primary, !event), button('admin:schedule:templates', '🗂️ Templates', ButtonStyle.Secondary)),
    row(button('admin:schedule:toggle', enabled ? '⏸ Disable' : '▶ Enable', enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:schedule:cancel', '🚫 Cancel Event', ButtonStyle.Danger, !event || event.status !== 'scheduled'), button('admin:schedule:health', '🩺 Health'), button('admin:schedule:refresh', '🔄 Refresh')),
    row(button('admin:studio:utilityStudio', '⬅️ Back to Utility Studio')),
  ] };
}

function buildSetup(interaction) {
  const state = getState(interaction); const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
  if (!event) return buildHome(interaction);
  const embed = new EmbedBuilder().setColor(event.color || 0x5865F2).setTitle('⚙️ Schedule · Event Setup').setDescription([
    eventSummary(event), '',
    `**Event channel:** ${event.channelId ? `<#${event.channelId}>` : '`Not set`'}`,
    `**Voice channel:** ${event.voiceChannelId ? `<#${event.voiceChannelId}>` : '`None`'}`,
    `**Location:** ${event.location || '`None`'}`,
    `**Mention roles:** ${event.mentionRoleIds.length ? event.mentionRoleIds.map((id) => `<@&${id}>`).join(', ') : '`None`'}`,
    `**Native Discord event:** ${event.mirrorDiscordEvent ? 'Enabled ✅' : 'Disabled'}`,
    `**Event thread:** ${event.thread.enabled ? 'Enabled ✅' : 'Disabled'}`,
  ].join('\n'));
  return { embeds: [embed], components: [announcementChannelSelect(event, state), voiceChannelSelect(event), roleSelect('admin:schedule:mentions', 'Roles to mention when deployed', event.mentionRoleIds), row(button('admin:schedule:advancedModal', '📝 Location / Appearance'), button('admin:schedule:toggleNative', event.mirrorDiscordEvent ? '📅 Native: On' : '📅 Native: Off', event.mirrorDiscordEvent ? ButtonStyle.Success : ButtonStyle.Secondary), button('admin:schedule:toggleThread', event.thread.enabled ? '🧵 Thread: On' : '🧵 Thread: Off', event.thread.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)), row(button('admin:schedule:home', '⬅️ Back'))] };
}

function buildRsvp(interaction) {
  const state = getState(interaction); const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
  if (!event) return buildHome(interaction);
  const options = event.rsvpOptions.filter((item) => item.enabled !== false).map((item) => `${item.emoji || '•'} **${item.label}**${item.isAttendee ? ' · attendee' : ''}${item.roleId ? ` · <@&${item.roleId}>` : ''}`).join('\n');
  const embed = new EmbedBuilder().setColor(event.color || 0x5865F2).setTitle('👥 Schedule · RSVP & Roles').setDescription([
    `**Capacity:** ${event.capacity || 'Unlimited'}`,
    `**Waitlist:** ${event.waitlistEnabled ? 'On' : 'Off'}`,
    `**RSVP close:** ${event.rsvpCloseAt ? `<t:${Math.floor(new Date(event.rsvpCloseAt).getTime() / 1000)}:F>` : 'Manual / never'}`,
    '', '**RSVP options**', options || '`None`', '',
    `**Allowed roles:** ${event.allowedRoleIds.length ? event.allowedRoleIds.map((id) => `<@&${id}>`).join(', ') : 'Everyone'}`,
    `**Denied roles:** ${event.deniedRoleIds.length ? event.deniedRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
  ].join('\n'));
  return { embeds: [embed], components: [roleSelect('admin:schedule:allowedRoles', 'Roles allowed to RSVP', event.allowedRoleIds), roleSelect('admin:schedule:deniedRoles', 'Roles blocked from RSVP', event.deniedRoleIds), row(button('admin:schedule:rsvpOptionsModal', '🎛️ RSVP Options', ButtonStyle.Primary), button('admin:schedule:capacityModal', '🔢 Capacity / Close Time', ButtonStyle.Primary), button('admin:schedule:toggleWaitlist', event.waitlistEnabled ? '⏳ Waitlist: On' : '⏳ Waitlist: Off', event.waitlistEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)), row(button('admin:schedule:home', '⬅️ Back'))] };
}

function buildTiming(interaction) {
  const state = getState(interaction); const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
  if (!event) return buildHome(interaction);
  const notes = event.notifications.map((item) => `• ${item.minutesBefore}m · ${item.title}`).join('\n') || '`No custom notifications`';
  const embed = new EmbedBuilder().setColor(event.color || 0x5865F2).setTitle('🔁 Schedule · Repeat & Reminders').setDescription([
    `**Repeat:** ${event.recurrence.type} · interval ${event.recurrence.interval}`,
    `**Occurrence limit:** ${event.recurrence.count || 'None'}`,
    `**Until:** ${event.recurrence.until ? `<t:${Math.floor(new Date(event.recurrence.until).getTime() / 1000)}:D>` : 'None'}`,
    `**Timezone:** ${event.recurrence.timezone || event.timezone}`,
    `**Auto Join Next:** ${event.recurrence.autoJoinNextAllowed ? 'Allowed' : 'Disabled'}`,
    `**Default channel reminders:** ${event.reminderMinutes.length ? event.reminderMinutes.join(', ') + ' minutes' : 'None'}`,
    '', '**Custom notifications**', notes,
  ].join('\n'));
  return { embeds: [embed], components: [row(button('admin:schedule:repeatModal', '🔁 Repeat Rules', ButtonStyle.Primary), button('admin:schedule:remindersModal', '⏰ Channel Reminders', ButtonStyle.Primary), button('admin:schedule:notificationsModal', '📣 Notifications', ButtonStyle.Primary), button('admin:schedule:toggleAutoJoin', event.recurrence.autoJoinNextAllowed ? '🔄 Auto Join: Allowed' : '🔄 Auto Join: Off', event.recurrence.autoJoinNextAllowed ? ButtonStyle.Success : ButtonStyle.Secondary)), row(button('admin:schedule:home', '⬅️ Back'))] };
}

function buildTemplates(interaction) {
  const state = getState(interaction); const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null; const selected = state.templateId ? schedule.getSection(interaction.guildId).templates[state.templateId] : null;
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🗂️ Schedule · Event Templates').setDescription([
    `Saved templates: **${schedule.listTemplates(interaction.guildId).length}**`,
    selected ? `Selected: **${selected.name}**` : 'Select a template below.',
    '', 'Save the currently selected event as a reusable template, or create a new event from a saved template.',
  ].join('\n'));
  return { embeds: [embed], components: [templateSelect(interaction.guildId, state), row(button('admin:schedule:saveTemplateModal', '💾 Save Current as Template', ButtonStyle.Success, !event), button('admin:schedule:createFromTemplate', '➕ Create From Template', ButtonStyle.Primary, !selected), button('admin:schedule:deleteTemplate', '🗑️ Delete Template', ButtonStyle.Danger, !selected)), row(button('admin:schedule:home', '⬅️ Back'))] };
}

function buildPanel(interaction) {
  const page = getState(interaction).page;
  if (page === 'setup') return buildSetup(interaction);
  if (page === 'rsvp') return buildRsvp(interaction);
  if (page === 'timing') return buildTiming(interaction);
  if (page === 'templates') return buildTemplates(interaction);
  return buildHome(interaction);
}

function createModal(event = null) {
  return new ModalBuilder().setCustomId(event ? 'admin:schedule:editModal' : 'admin:schedule:createModal').setTitle(event ? 'Edit Schedule Event' : 'Create Schedule Event').addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Event title').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true).setValue(event?.title || '')),
    row(new TextInputBuilder().setCustomId('startAt').setLabel('Start (YYYY-MM-DD HH:mm)').setStyle(TextInputStyle.Short).setPlaceholder('2026-08-20 19:00').setRequired(true).setValue(event ? formatLocalInput(event.startAt, event.timezone) : '')),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('IANA timezone').setStyle(TextInputStyle.Short).setPlaceholder('Europe/London').setValue(event?.timezone || 'Europe/London').setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(false).setValue(event?.description || '')),
    row(new TextInputBuilder().setCustomId('duration').setLabel('Duration in minutes').setStyle(TextInputStyle.Short).setPlaceholder('60').setValue(event ? String(Math.round((new Date(event.endAt) - new Date(event.startAt)) / 60000)) : '60').setRequired(true)),
  );
}
function advancedModal(event) {
  return new ModalBuilder().setCustomId('admin:schedule:advancedSubmit').setTitle('Event Appearance').addComponents(
    row(new TextInputBuilder().setCustomId('location').setLabel('Location (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.location || '')),
    row(new TextInputBuilder().setCustomId('color').setLabel('Embed colour HEX').setStyle(TextInputStyle.Short).setRequired(false).setValue(`#${Number(event.color || 0x5865F2).toString(16).padStart(6, '0').toUpperCase()}`)),
    row(new TextInputBuilder().setCustomId('threadTitle').setLabel('Thread title').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.thread.title || '{event}')),
  );
}
function capacityModal(event) {
  return new ModalBuilder().setCustomId('admin:schedule:capacitySubmit').setTitle('RSVP Capacity').addComponents(
    row(new TextInputBuilder().setCustomId('capacity').setLabel('Capacity (blank = unlimited)').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.capacity ? String(event.capacity) : '')),
    row(new TextInputBuilder().setCustomId('closeAt').setLabel('RSVP close (YYYY-MM-DD HH:mm)').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.rsvpCloseAt ? formatLocalInput(event.rsvpCloseAt, event.timezone) : '')),
  );
}
function rsvpOptionsModal(event) {
  const value = event.rsvpOptions.map((item) => `${item.emoji || ''}|${item.label}|${item.isAttendee ? 'attendee' : 'choice'}|${item.roleId || ''}`).join('\n');
  return new ModalBuilder().setCustomId('admin:schedule:rsvpOptionsSubmit').setTitle('RSVP Options').addComponents(row(new TextInputBuilder().setCustomId('options').setLabel('emoji|label|attendee/choice|roleId').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(value.slice(0, 4000))));
}
function repeatModal(event) {
  return new ModalBuilder().setCustomId('admin:schedule:repeatSubmit').setTitle('Repeat Rules').addComponents(
    row(new TextInputBuilder().setCustomId('type').setLabel('none/hourly/daily/weekly/monthly/yearly').setStyle(TextInputStyle.Short).setRequired(true).setValue(event.recurrence.type)),
    row(new TextInputBuilder().setCustomId('interval').setLabel('Repeat every X').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(event.recurrence.interval || 1))),
    row(new TextInputBuilder().setCustomId('count').setLabel('Stop after X occurrences (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.recurrence.count ? String(event.recurrence.count) : '')),
    row(new TextInputBuilder().setCustomId('until').setLabel('Stop on date YYYY-MM-DD (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.recurrence.until ? event.recurrence.until.slice(0, 10) : '')),
    row(new TextInputBuilder().setCustomId('weekdays').setLabel('Weekly days 0=Sun..6=Sat (optional)').setStyle(TextInputStyle.Short).setRequired(false).setValue((event.recurrence.weekdays || []).join(','))),
  );
}
function remindersModal(event) {
  return new ModalBuilder().setCustomId('admin:schedule:remindersSubmit').setTitle('Channel Reminders').addComponents(row(new TextInputBuilder().setCustomId('minutes').setLabel('Minutes before event, comma-separated').setStyle(TextInputStyle.Short).setRequired(false).setValue(event.reminderMinutes.join(', '))));
}
function notificationsModal(event) {
  const value = event.notifications.map((item) => `${item.minutesBefore}|${item.title}|${item.description}`).join('\n');
  return new ModalBuilder().setCustomId('admin:schedule:notificationsSubmit').setTitle('Event Notifications').addComponents(row(new TextInputBuilder().setCustomId('items').setLabel('minutes|title|message').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(value.slice(0, 4000)).setPlaceholder('30|Starting Soon|{event} starts {relative}.')));
}
function saveTemplateModal(event) {
  return new ModalBuilder().setCustomId('admin:schedule:saveTemplateSubmit').setTitle('Save Event Template').addComponents(row(new TextInputBuilder().setCustomId('name').setLabel('Template name').setStyle(TextInputStyle.Short).setRequired(true).setValue(event.title.slice(0, 100))));
}

function formatLocalInput(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}
function parseStart(value, timezone) {
  const raw = String(value || '').trim(); const direct = new Date(raw);
  if (Number.isFinite(direct.getTime()) && /Z|[+-]\d\d:?\d\d$/.test(raw)) return direct.toISOString();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) { if (Number.isFinite(direct.getTime())) return direct.toISOString(); throw new Error('Use YYYY-MM-DD HH:mm.'); }
  const [, year, month, day, hour, minute] = match.map(Number); const target = Date.UTC(year, month - 1, day, hour, minute); const probe = new Date(target);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(probe);
  const found = Object.fromEntries(parts.map((part) => [part.type, part.value])); const represented = Date.UTC(Number(found.year), Number(found.month) - 1, Number(found.day), Number(found.hour), Number(found.minute));
  return new Date(target + (target - represented)).toISOString();
}
async function respond(interaction, payload) {
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: 64 });
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}
async function saveSelected(interaction, patch, action) {
  const state = getState(interaction); const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
  if (!event) throw new Error('Select an event first.');
  const updated = schedule.saveEvent(interaction.guildId, { ...event, ...patch, eventId: event.eventId }, { actorId: interaction.user.id, action });
  if (updated.messageId) await deployment.updateDeployment(interaction.guild, updated.eventId).catch(() => null);
  return updated;
}

async function handleScheduleAdminInteraction(interaction) {
  if (!String(interaction.customId || '').startsWith('admin:schedule')) return false;
  const state = getState(interaction); const id = interaction.customId; const actor = { actorId: interaction.user.id };
  try {
    if (id === 'admin:schedule:home' || id === 'admin:schedule:refresh') { state.page = 'home'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:setup') { state.page = 'setup'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:rsvp') { state.page = 'rsvp'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:timing') { state.page = 'timing'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:templates') { state.page = 'templates'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:event') { state.eventId = interaction.values[0]; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:template') { state.templateId = interaction.values[0]; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:create') { await interaction.showModal(createModal()); return true; }
    if (id === 'admin:schedule:edit') { const event = schedule.getEvent(interaction.guildId, state.eventId); if (!event) throw new Error('Select an event first.'); await interaction.showModal(createModal(event)); return true; }
    if (id === 'admin:schedule:createModal' || id === 'admin:schedule:editModal') {
      const timezone = interaction.fields.getTextInputValue('timezone').trim(); const startAt = parseStart(interaction.fields.getTextInputValue('startAt'), timezone); const duration = Math.max(5, Number(interaction.fields.getTextInputValue('duration') || 60));
      const existing = id.endsWith('editModal') ? schedule.getEvent(interaction.guildId, state.eventId) : null;
      const event = schedule.saveEvent(interaction.guildId, { ...(existing || {}), eventId: existing?.eventId, title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), startAt, endAt: new Date(new Date(startAt).getTime() + duration * 60000).toISOString(), timezone, channelId: existing?.channelId || state.channelId, hostUserId: existing?.hostUserId || interaction.user.id, createdBy: existing?.createdBy || interaction.user.id }, { ...actor, action: existing ? 'schedule_discord_edit' : 'schedule_discord_create' });
      state.eventId = event.eventId; state.page = 'home'; if (event.messageId) await deployment.updateDeployment(interaction.guild, event.eventId).catch(() => null); return interaction.reply({ content: `✅ ${existing ? 'Updated' : 'Created'} **${event.title}**.`, ...buildPanel(interaction), flags: 64 });
    }
    const event = state.eventId ? schedule.getEvent(interaction.guildId, state.eventId) : null;
    if (id === 'admin:schedule:channel' && interaction.isChannelSelectMenu?.()) { state.channelId = interaction.values[0] || null; if (event) await saveSelected(interaction, { channelId: state.channelId }, 'schedule_channel_update'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:voice' && interaction.isChannelSelectMenu?.()) { await saveSelected(interaction, { voiceChannelId: interaction.values[0] || null }, 'schedule_voice_update'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:mentions' && interaction.isRoleSelectMenu?.()) { await saveSelected(interaction, { mentionRoleIds: interaction.values || [] }, 'schedule_mentions_update'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:allowedRoles' && interaction.isRoleSelectMenu?.()) { await saveSelected(interaction, { allowedRoleIds: interaction.values || [] }, 'schedule_allowed_roles_update'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:deniedRoles' && interaction.isRoleSelectMenu?.()) { await saveSelected(interaction, { deniedRoleIds: interaction.values || [] }, 'schedule_denied_roles_update'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:advancedModal') { if (!event) throw new Error('Select an event first.'); await interaction.showModal(advancedModal(event)); return true; }
    if (id === 'admin:schedule:advancedSubmit') { const colorRaw = interaction.fields.getTextInputValue('color').replace('#', ''); const color = /^[0-9A-Fa-f]{6}$/.test(colorRaw) ? parseInt(colorRaw, 16) : event.color; await saveSelected(interaction, { location: interaction.fields.getTextInputValue('location'), color, thread: { ...event.thread, title: interaction.fields.getTextInputValue('threadTitle') || '{event}' } }, 'schedule_appearance_update'); return interaction.reply({ content: '✅ Event appearance updated.', flags: 64 }); }
    if (id === 'admin:schedule:toggleNative') { const updated = await saveSelected(interaction, { mirrorDiscordEvent: !event.mirrorDiscordEvent }, 'schedule_native_toggle'); if (updated.messageId) await deployment.syncDiscordEvent(interaction.guild, updated).catch(() => null); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:toggleThread') { await saveSelected(interaction, { thread: { ...event.thread, enabled: !event.thread.enabled } }, 'schedule_thread_toggle'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:rsvpOptionsModal') { await interaction.showModal(rsvpOptionsModal(event)); return true; }
    if (id === 'admin:schedule:rsvpOptionsSubmit') { const lines = interaction.fields.getTextInputValue('options').split('\n').map((line) => line.trim()).filter(Boolean); const options = lines.map((line, index) => { const [emoji, label, attendee, roleId] = line.split('|').map((value) => value.trim()); return { key: clean(label || `option-${index + 1}`, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '-'), label: label || `Option ${index + 1}`, emoji: emoji || null, style: index === 0 ? 'success' : 'secondary', isAttendee: attendee.toLowerCase() === 'attendee', roleId: roleId || null, enabled: true }; }); await saveSelected(interaction, { rsvpOptions: options }, 'schedule_rsvp_options_update'); return interaction.reply({ content: '✅ RSVP options updated.', flags: 64 }); }
    if (id === 'admin:schedule:capacityModal') { await interaction.showModal(capacityModal(event)); return true; }
    if (id === 'admin:schedule:capacitySubmit') { const capacityRaw = interaction.fields.getTextInputValue('capacity').trim(); const closeRaw = interaction.fields.getTextInputValue('closeAt').trim(); await saveSelected(interaction, { capacity: capacityRaw ? Number(capacityRaw) : null, rsvpCloseAt: closeRaw ? parseStart(closeRaw, event.timezone) : null }, 'schedule_capacity_update'); return interaction.reply({ content: '✅ Capacity and RSVP close time updated.', flags: 64 }); }
    if (id === 'admin:schedule:toggleWaitlist') { await saveSelected(interaction, { waitlistEnabled: !event.waitlistEnabled }, 'schedule_waitlist_toggle'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:repeatModal') { await interaction.showModal(repeatModal(event)); return true; }
    if (id === 'admin:schedule:repeatSubmit') { const until = interaction.fields.getTextInputValue('until').trim(); const weekdays = interaction.fields.getTextInputValue('weekdays').split(',').map((v) => Number(v.trim())).filter(Number.isInteger); await saveSelected(interaction, { recurrence: { ...event.recurrence, type: interaction.fields.getTextInputValue('type').trim().toLowerCase(), interval: Number(interaction.fields.getTextInputValue('interval') || 1), count: interaction.fields.getTextInputValue('count').trim() || null, until: until ? `${until}T23:59:59Z` : null, weekdays } }, 'schedule_recurrence_update'); return interaction.reply({ content: '✅ Repeat rules updated.', flags: 64 }); }
    if (id === 'admin:schedule:remindersModal') { await interaction.showModal(remindersModal(event)); return true; }
    if (id === 'admin:schedule:remindersSubmit') { const minutes = interaction.fields.getTextInputValue('minutes').split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n >= 0); await saveSelected(interaction, { reminderMinutes: minutes, sentReminders: [] }, 'schedule_reminders_update'); return interaction.reply({ content: '✅ Channel reminders updated.', flags: 64 }); }
    if (id === 'admin:schedule:notificationsModal') { await interaction.showModal(notificationsModal(event)); return true; }
    if (id === 'admin:schedule:notificationsSubmit') { const items = interaction.fields.getTextInputValue('items').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [minutes, title, ...description] = line.split('|'); return { minutesBefore: Number(minutes || 0), title: title || 'Event Reminder', description: description.join('|') || '{event} starts {relative}.', sent: false }; }); await saveSelected(interaction, { notifications: items }, 'schedule_notifications_update'); return interaction.reply({ content: '✅ Event notifications updated.', flags: 64 }); }
    if (id === 'admin:schedule:toggleAutoJoin') { await saveSelected(interaction, { recurrence: { ...event.recurrence, autoJoinNextAllowed: !event.recurrence.autoJoinNextAllowed } }, 'schedule_auto_join_toggle'); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:saveTemplateModal') { await interaction.showModal(saveTemplateModal(event)); return true; }
    if (id === 'admin:schedule:saveTemplateSubmit') { const template = schedule.saveTemplate(interaction.guildId, { name: interaction.fields.getTextInputValue('name'), event }, { ...actor, action: 'schedule_template_save' }); state.templateId = template.templateId; return interaction.reply({ content: `✅ Saved template **${template.name}**.`, flags: 64 }); }
    if (id === 'admin:schedule:createFromTemplate') { const startAt = new Date(Date.now() + 3600000).toISOString(); const created = schedule.createFromTemplate(interaction.guildId, state.templateId, { startAt, endAt: new Date(Date.now() + 7200000).toISOString(), createdBy: interaction.user.id, hostUserId: interaction.user.id }, { ...actor, action: 'schedule_template_create_event' }); state.eventId = created.eventId; state.page = 'home'; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:deleteTemplate') { schedule.removeTemplate(interaction.guildId, state.templateId, { ...actor, action: 'schedule_template_delete' }); state.templateId = null; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:deploy') { if (!event) throw new Error('Select an event first.'); if (event.messageId) await deployment.updateDeployment(interaction.guild, event.eventId); else await deployment.deploy(interaction.guild, event.eventId, state.channelId || event.channelId, actor); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:duplicate') { if (!event) throw new Error('Select an event first.'); const copy = schedule.duplicateEvent(interaction.guildId, event.eventId, new Date(new Date(event.startAt).getTime() + 7 * 86400000), { ...actor, action: 'schedule_discord_duplicate' }); state.eventId = copy.eventId; return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:cancel') { if (!event) throw new Error('Select an event first.'); schedule.cancelEvent(interaction.guildId, event.eventId, { ...actor, action: 'schedule_discord_cancel' }); await deployment.updateDeployment(interaction.guild, event.eventId).catch(() => null); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:toggle') { const enabled = guildManager.isModuleEnabled(interaction.guildId, 'schedule'); guildManager.setModuleEnabled(interaction.guildId, 'schedule', !enabled, { ...actor, action: 'schedule_discord_toggle' }); return respond(interaction, buildPanel(interaction)); }
    if (id === 'admin:schedule:health') { const health = await schedule.buildHealth(interaction.guild); return interaction.reply({ content: `Schedule health: **${health.healthy ? 'Healthy' : 'Needs attention'}**\nIssues: ${health.issues.length}\nWarnings: ${health.warnings.length}`, flags: 64 }); }
    return respond(interaction, buildPanel(interaction));
  } catch (error) {
    const payload = { content: `❌ Schedule Studio failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null); else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildSchedulePanel: buildPanel, handleScheduleAdminInteraction };
