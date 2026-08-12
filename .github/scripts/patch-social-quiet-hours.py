from pathlib import Path

monitor = Path('src/modules/socialStudio/socialAlerts/socialStudioMonitorCore.js')
text = monitor.read_text()
marker = "const intText = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-GB') : '';\n"
helper = '''\nfunction validTimeZone(value) {\n  const timezone = String(value || '').trim();\n  if (!timezone) return false;\n  try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date()); return true; }\n  catch { return false; }\n}\n\nfunction quietHoursActive(settings, date = new Date()) {\n  const quiet = settings?.quietHours && typeof settings.quietHours === 'object' ? settings.quietHours : null;\n  if (!quiet || quiet.enabled !== true) return false;\n  const timezone = String(quiet.timezone || '').trim();\n  if (!validTimeZone(timezone)) return false;\n  const parseTime = (value) => {\n    const match = String(value || '').trim().match(/^(\\d{2}):(\\d{2})$/);\n    if (!match) return null;\n    const hours = Number(match[1]);\n    const minutes = Number(match[2]);\n    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;\n    return hours * 60 + minutes;\n  };\n  const start = parseTime(quiet.start);\n  const end = parseTime(quiet.end);\n  if (start === null || end === null || start === end) return false;\n  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);\n  const hour = Number(parts.find((part) => part.type === 'hour')?.value);\n  const minute = Number(parts.find((part) => part.type === 'minute')?.value);\n  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;\n  const current = hour * 60 + minute;\n  return start < end ? current >= start && current < end : current >= start || current < end;\n}\n'''
if 'function quietHoursActive(' not in text:
    if marker not in text: raise SystemExit('helper marker not found')
    text = text.replace(marker, marker + helper, 1)
old = """  const mentionMode = account.mentionMode || 'none';
  const content = mentionMode === 'everyone' ? '@everyone' : mentionMode === 'here' ? '@here' : mentionMode === 'role' && account.mentionRoleId ? `<@&${account.mentionRoleId}>` : undefined;
  return {
    channel,
    payload: {
      content,
      embeds: [embed],
      components: [],
      allowedMentions: {
        parse: mentionMode === 'everyone' || mentionMode === 'here' ? ['everyone'] : [],
        roles: account.mentionRoleId ? [account.mentionRoleId] : [],
      },
    },
  };
"""
new = """  const mentionMode = account.mentionMode || 'none';
  const content = mentionMode === 'everyone' ? '@everyone' : mentionMode === 'here' ? '@here' : mentionMode === 'role' && account.mentionRoleId ? `<@&${account.mentionRoleId}>` : undefined;
  const quiet = quietHoursActive(config.settings);
  return {
    channel,
    quietHoursPingSuppressed: quiet && Boolean(content),
    payload: {
      content,
      embeds: [embed],
      components: [],
      allowedMentions: {
        parse: !quiet && (mentionMode === 'everyone' || mentionMode === 'here') ? ['everyone'] : [],
        roles: !quiet && account.mentionRoleId ? [account.mentionRoleId] : [],
      },
    },
  };
"""
if old in text: text = text.replace(old, new, 1)
elif 'quietHoursPingSuppressed' not in text: raise SystemExit('mention block not found')
old_send = """async function sendEvent(client, guildId, config, account, creator, event) {
  const { channel, payload } = await buildEventPayload(client, guildId, config, account, creator, event);
  const message = await channel.send(payload);
  message.socialStudioChannelId = channel.id;
  return message;
}
"""
new_send = """async function sendEvent(client, guildId, config, account, creator, event) {
  const { channel, payload, quietHoursPingSuppressed } = await buildEventPayload(client, guildId, config, account, creator, event);
  const message = await channel.send(payload);
  message.socialStudioChannelId = channel.id;
  message.socialStudioQuietHoursPingSuppressed = quietHoursPingSuppressed === true;
  return message;
}
"""
if old_send in text: text = text.replace(old_send, new_send, 1)
elif 'socialStudioQuietHoursPingSuppressed' not in text: raise SystemExit('sendEvent block not found')
text = text.replace("channelId: state.lastAlertChannelId });", "channelId: state.lastAlertChannelId, quietHoursPingSuppressed: message.socialStudioQuietHoursPingSuppressed === true });", 1)
monitor.write_text(text)

compat = Path('src/modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat.js')
c = compat.read_text()
old_validate = """      if (!timezone) throw new Error('Quiet Hours timezone is required.');
      config.settings.quietHours = {
"""
new_validate = """      if (!timezone) throw new Error('Quiet Hours timezone is required.');
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date());
      } catch {
        throw new Error('Quiet Hours timezone must be a valid IANA timezone, for example Europe/London.');
      }
      if (start === end) throw new Error('Quiet Hours start and end times must be different.');
      config.settings.quietHours = {
"""
if old_validate in c: c = c.replace(old_validate, new_validate, 1)
elif 'valid IANA timezone' not in c: raise SystemExit('validation block not found')
compat.write_text(c)
