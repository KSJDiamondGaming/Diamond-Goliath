'use strict';

const fs = require('node:fs');
const path = 'src/owner/dev/duplicator/selective.js';
let source = fs.readFileSync(path, 'utf8');
const startMarker = 'async function prepareDeleteScan(interaction, session) {';
const endMarker = '\nfunction deletePayload(session) {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('prepareDeleteScan block not found');
const replacement = `async function prepareDeleteScan(interaction, session) {
  const guild = interaction.client.guilds.cache.get(session.destinationGuildId);
  if (!guild) throw new Error('Bulk Delete is DEV-local only. Select a destination connected to the DEV bot.');
  await guild.channels.fetch().catch(() => null);

  const all = [...guild.channels.cache.values()];
  const byPosition = (a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0);
  const output = [];

  // Mirror Discord: uncategorised channels first, in their live sidebar order.
  for (const channel of all.filter((c) => c.type !== ChannelType.GuildCategory && !c.parentId).sort(byPosition)) {
    output.push({ id: channel.id, name: channel.name, type: channel.type, parentId: null, itemKind: 'channel' });
  }

  // Then each category followed immediately by its children, all using live Discord positions.
  for (const category of all.filter((c) => c.type === ChannelType.GuildCategory).sort(byPosition)) {
    output.push({ id: category.id, name: category.name, type: category.type, parentId: null, itemKind: 'category' });
    for (const child of all.filter((c) => c.parentId === category.id).sort(byPosition)) {
      output.push({ id: child.id, name: child.name, type: child.type, parentId: category.id, itemKind: 'channel' });
    }
  }

  // Keep any orphan/nonstandard channel visible instead of silently dropping it.
  const included = new Set(output.map((item) => item.id));
  for (const channel of all.filter((c) => c.type !== ChannelType.GuildCategory && !included.has(c.id)).sort(byPosition)) {
    output.push({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null, itemKind: 'channel' });
  }

  session.deleteItems = output;
  session.deleteSelected = new Set();
  session.deletePage = 0;
}`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);
console.log('Patched Bulk Delete ordering.');
