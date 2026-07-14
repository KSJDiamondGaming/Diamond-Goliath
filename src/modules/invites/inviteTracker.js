const store = require('./invitesStore');
const snapshots = new Map();

async function snapshot(guild) {
  try {
    const invites = await guild.invites.fetch();
    snapshots.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  } catch {
    snapshots.delete(guild.id);
  }
}

async function detect(member) {
  const config = store.get(member.guild.id);
  if (!config.enabled || !config.trackingEnabled) return null;
  const previous = snapshots.get(member.guild.id) || new Map();
  try {
    const invites = await member.guild.invites.fetch();
    const used = invites.find(invite => (invite.uses || 0) > (previous.get(invite.code) || 0));
    snapshots.set(member.guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
    return used ? { code: used.code, inviterId: used.inviter?.id || null, uses: used.uses || 0 } : null;
  } catch {
    return null;
  }
}

function attach(client) {
  client.once('ready', () => Promise.all(client.guilds.cache.map(snapshot)).catch(() => null));
  client.on('inviteCreate', invite => snapshot(invite.guild));
  client.on('inviteDelete', invite => snapshot(invite.guild));
  client.on('guildCreate', snapshot);
  client.on('guildMemberAdd', async member => {
    const result = await detect(member);
    client.emit('goliathInviteUsed', member, result);
  });
}

module.exports = { attach, snapshot, detect };
