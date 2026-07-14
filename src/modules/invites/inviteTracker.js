'use strict';

const { Events } = require('discord.js');
const store = require('./invitesStore');
const snapshots = new Map();
let attached = false;

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

    const result = used ? {
      code: used.code,
      inviterId: used.inviter?.id || null,
      uses: used.uses || 0,
    } : null;

    store.recordJoin(member.guild.id, result, { actorId: member.id });
    return result;
  } catch {
    store.recordJoin(member.guild.id, null, { actorId: member.id });
    return null;
  }
}

function attach(client) {
  if (attached) return;
  attached = true;

  const warm = () => Promise.all(client.guilds.cache.map(snapshot)).catch(() => null);
  if (client.isReady?.()) warm();
  else client.once(Events.ClientReady, warm);

  client.on(Events.InviteCreate, invite => snapshot(invite.guild));
  client.on(Events.InviteDelete, invite => snapshot(invite.guild));
  client.on(Events.GuildCreate, snapshot);
  client.on(Events.GuildMemberAdd, async member => {
    const result = await detect(member);
    client.emit('goliathInviteUsed', member, result);
  });
}

module.exports = { attach, snapshot, detect };
