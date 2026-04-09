const {
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const store = require('./statsStore');

async function fetchMembers(guild) {
  try {
    await guild.members.fetch();
  } catch (err) {
    console.error('Member fetch failed:', err);
  }
}

function getPresence(guild) {
  let online = 0, idle = 0, dnd = 0;

  guild.members.cache.forEach(m => {
    if (m.user.bot) return;

    const s = m.presence?.status;
    if (s === 'online') online++;
    else if (s === 'idle') idle++;
    else if (s === 'dnd') dnd++;
  });

  return { online, idle, dnd };
}

function getCounts(guild) {
  const humans = guild.members.cache.filter(m => !m.user.bot).size;
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  return { humans, bots };
}

async function getGems(guild) {
  // TEMP: replace with your real system later
  return guild.members.cache.filter(m => !m.user.bot).size;
}

async function createChannel(guild, name, parent) {
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.SendMessagesInThreads,
        ],
      },
    ],
  });
}

async function setup(guild) {
  if (store.get(guild.id)?.enabled) {
    return { ok: false, msg: 'Stats already exist.' };
  }

  await fetchMembers(guild);

  const category = await guild.channels.create({
    name: 'server stats',
    type: ChannelType.GuildCategory,
  });

  const channels = {
    online: await createChannel(guild, '🟢 0', category.id),
    dnd: await createChannel(guild, '🔴 0', category.id),
    idle: await createChannel(guild, '🌙 0', category.id),
    members: await createChannel(guild, '👥 0 MEMBERS', category.id),
    services: await createChannel(guild, '🔧 0 DISCORD SERVICES', category.id),
    gems: await createChannel(guild, '💎 0 GEMS', category.id),
  };

  store.set(guild.id, {
    enabled: true,
    categoryId: category.id,
    channels: Object.fromEntries(
      Object.entries(channels).map(([k, v]) => [k, v.id])
    ),
  });

  await update(guild);

  return { ok: true, msg: 'Stats created.' };
}

async function rename(channel, name) {
  if (!channel || channel.name === name) return;
  try {
    await channel.setName(name);
  } catch (e) {
    console.error('Rename failed:', e);
  }
}

async function update(guild) {
  const config = store.get(guild.id);
  if (!config?.enabled) return { ok: false };

  await fetchMembers(guild);

  const { online, idle, dnd } = getPresence(guild);
  const { humans, bots } = getCounts(guild);
  const gems = await getGems(guild);

  const c = config.channels;

  await rename(guild.channels.cache.get(c.online), `🟢 ${online}`);
  await rename(guild.channels.cache.get(c.dnd), `🔴 ${dnd}`);
  await rename(guild.channels.cache.get(c.idle), `🌙 ${idle}`);
  await rename(guild.channels.cache.get(c.members), `👥 ${humans} MEMBERS`);
  await rename(guild.channels.cache.get(c.services), `🔧 ${bots} DISCORD SERVICES`);
  await rename(guild.channels.cache.get(c.gems), `💎 ${gems} GEMS`);

  return { ok: true };
}

async function remove(guild) {
  const config = store.get(guild.id);
  if (!config?.enabled) return { ok: false, msg: 'No stats setup.' };

  for (const id of Object.values(config.channels)) {
    const ch = guild.channels.cache.get(id);
    if (ch) await ch.delete().catch(() => {});
  }

  const cat = guild.channels.cache.get(config.categoryId);
  if (cat) await cat.delete().catch(() => {});

  store.remove(guild.id);

  return { ok: true, msg: 'Stats removed.' };
}

function start(client) {
  setInterval(() => {
    client.guilds.cache.forEach(g => update(g));
  }, 60000);
}

module.exports = { setup, update, remove, start };