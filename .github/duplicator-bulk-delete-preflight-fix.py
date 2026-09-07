from pathlib import Path

p = Path('src/owner/dev/duplicator/selective.js')
s = p.read_text()

old = r'''async function recoverBulkDeleteAccess(guild, channel, me, actorId) {
  let current = channel;
  let state = bulkDeleteAccessState(current, me);
  if (state.administrator || state.manageChannels) return { ok: true, channel: current, repaired: false, state };

  const reason = `Goliath Duplicator bulk delete access repair by ${actorId}`;
  const tryRepair = async (target) => {
    if (!target?.permissionOverwrites?.edit) return false;
    const targetState = bulkDeleteAccessState(target, me);
    if (!targetState.administrator && !targetState.manageRoles) return false;
    try {
      await target.permissionOverwrites.edit(me.id, {
        ViewChannel: true,
        ManageChannels: true,
        ManageRoles: true,
      }, { type: 1, reason });
      return true;
    } catch {
      try {
        await target.permissionOverwrites.edit(me, {
          ViewChannel: true,
          ManageChannels: true,
          ManageRoles: true,
        }, reason);
        return true;
      } catch {
        return false;
      }
    }
  };

  if (current.parent) await tryRepair(current.parent);
  current = await guild.channels.fetch(current.id).catch(() => current);
  state = bulkDeleteAccessState(current, me);
  if (state.administrator || state.manageChannels) return { ok: true, channel: current, repaired: true, state };

  await tryRepair(current);
  current = await guild.channels.fetch(current.id).catch(() => current);
  state = bulkDeleteAccessState(current, me);
  return { ok: state.administrator || state.manageChannels, channel: current, repaired: true, state };
}
'''

new = r'''async function recoverBulkDeleteAccess(guild, channel, me, actorId) {
  let current = channel;
  let currentMe = guild.members.me || me;
  let state = bulkDeleteAccessState(current, currentMe);
  if (state.administrator || state.manageChannels) return { ok: true, channel: current, repaired: false, state };

  const reason = `Goliath Duplicator bulk delete access repair by ${actorId}`;
  const tryRepair = async (target) => {
    if (!target?.permissionOverwrites?.edit) return false;

    // Do not short-circuit when local permission calculations say Manage Roles is denied.
    // Legacy exact-copy ACLs can strand Goliath before this preflight runs. The Duplicator
    // history module wraps PermissionOverwriteManager.edit and can temporarily attach a
    // manageable Administrator role after Discord returns 50001/50013. We must actually
    // attempt the edit so that rescue path gets a chance to run.
    try {
      await target.permissionOverwrites.edit(currentMe.id, {
        ViewChannel: true,
        ManageChannels: true,
        ManageRoles: true,
      }, { type: 1, reason });
      return true;
    } catch {
      try {
        currentMe = guild.members.me || currentMe;
        await target.permissionOverwrites.edit(currentMe, {
          ViewChannel: true,
          ManageChannels: true,
          ManageRoles: true,
        }, reason);
        return true;
      } catch {
        return false;
      }
    }
  };

  if (current.parent) await tryRepair(current.parent);
  await guild.members.fetchMe().catch(() => null);
  currentMe = guild.members.me || currentMe;
  current = await guild.channels.fetch(current.id).catch(() => current);
  state = bulkDeleteAccessState(current, currentMe);
  if (state.administrator || state.manageChannels) return { ok: true, channel: current, repaired: true, state };

  await tryRepair(current);
  await guild.members.fetchMe().catch(() => null);
  currentMe = guild.members.me || currentMe;
  current = await guild.channels.fetch(current.id).catch(() => current);
  state = bulkDeleteAccessState(current, currentMe);
  return { ok: state.administrator || state.manageChannels, channel: current, repaired: true, state };
}
'''

if old not in s:
    raise SystemExit('recoverBulkDeleteAccess anchor not found; refusing to patch')

s = s.replace(old, new, 1)
p.write_text(s)
