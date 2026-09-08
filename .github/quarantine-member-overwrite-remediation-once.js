'use strict';
const fs = require('fs');
const path = 'src/core/security/protection/quarantine.js';
let s = fs.readFileSync(path, 'utf8');

const oldGuard = `    // A member-specific ViewChannel allow wins over a role-level deny in Discord's\n    // overwrite hierarchy. Refuse to claim guaranteed isolation if one exists.\n    // This check runs before the role-level skip so private channels cannot leak\n    // through a personal allow that would otherwise override the quarantine role.\n    if (targetMemberId) {\n      const memberOverwrite = channel.permissionOverwrites.cache?.get(targetMemberId);\n      if (memberOverwrite?.allow?.has(PermissionFlagsBits.ViewChannel)) {\n        failed += 1;\n        failures.push({\n          channelId: channel.id,\n          channelName: channel.name || null,\n          error: 'Target has an explicit member View Channel allow that overrides role quarantine isolation.',\n        });\n        continue;\n      }\n    }`;
const newGuard = `    // A member-specific ViewChannel allow wins over a role-level deny. Rather than\n    // rejecting a valid investigation, temporarily replace that allow with a deny\n    // and remember it so restoreQuarantinedMember can put the original allow back.\n    if (targetMemberId) {\n      const memberOverwrite = channel.permissionOverwrites.cache?.get(targetMemberId);\n      if (memberOverwrite?.allow?.has(PermissionFlagsBits.ViewChannel)) {\n        const botPermissions = channel.permissionsFor?.(botMember);\n        if (!botPermissions?.has(PermissionFlagsBits.ManageRoles)) {\n          failed += 1;\n          failures.push({ channelId: channel.id, channelName: channel.name || null, error: 'Goliath cannot temporarily contain the target member overwrite in this channel.' });\n          continue;\n        }\n        try {\n          await channel.permissionOverwrites.edit(\n            targetMemberId,\n            { ViewChannel: false },\n            { reason: 'Goliath quarantine: temporarily contain explicit member channel access' }\n          );\n          memberViewAllowRestores.push(channel.id);\n        } catch (error) {\n          failed += 1;\n          failures.push({ channelId: channel.id, channelName: channel.name || null, error: String(error?.message || error).slice(0, 250) });\n          continue;\n        }\n      }\n    }`;
if (!s.includes(oldGuard)) throw new Error('member overwrite guard anchor not found');
s = s.replace(oldGuard, newGuard);

const vars = `  const failures = [];\n  const targetMemberId = options.targetMemberId ? String(options.targetMemberId) : null;`;
const varsNew = `  const failures = [];\n  const memberViewAllowRestores = [];\n  const targetMemberId = options.targetMemberId ? String(options.targetMemberId) : null;`;
if (!s.includes(vars)) throw new Error('sync vars anchor not found');
s = s.replace(vars, varsNew);

const failReturn = `      failures,\n    };\n  }\n  return { success: true, roleId: role.id, roleName: role.name, updated, skipped, failed: 0, failures };`;
const failReturnNew = `      failures,\n      memberViewAllowRestores,\n    };\n  }\n  return { success: true, roleId: role.id, roleName: role.name, updated, skipped, failed: 0, failures, memberViewAllowRestores };`;
if (!s.includes(failReturn)) throw new Error('sync return anchor not found');
s = s.replace(failReturn, failReturnNew);

const snapshot = `      roles: snapshotRoles,\n      quarantinedBy: options.quarantinedBy || null,`;
const snapshotNew = `      roles: snapshotRoles,\n      memberViewAllowRestores: isolation.memberViewAllowRestores || [],\n      quarantinedBy: options.quarantinedBy || null,`;
if (!s.includes(snapshot)) throw new Error('snapshot anchor not found');
s = s.replace(snapshot, snapshotNew);

const restoreAnchor = `async function archiveInvestigationRoom(guild, snapshot, options = {}) {`;
const restoreHelper = `async function restoreMemberViewAllows(guild, memberId, channelIds = [], options = {}) {\n  const restored = [];\n  const failed = [];\n  for (const channelId of [...new Set((channelIds || []).map(String))]) {\n    let channel = guild.channels.cache.get(channelId);\n    if (!channel) channel = await guild.channels.fetch(channelId).catch(() => null);\n    if (!channel?.permissionOverwrites?.edit) continue;\n    try {\n      await channel.permissionOverwrites.edit(\n        String(memberId),\n        { ViewChannel: true },\n        { reason: options.reason || 'Restoring pre-quarantine member channel access' }\n      );\n      restored.push(channelId);\n    } catch (error) {\n      failed.push({ channelId, error: String(error?.message || error).slice(0, 250) });\n    }\n  }\n  return { restored, failed };\n}\n\n${restoreAnchor}`;
if (!s.includes(restoreAnchor)) throw new Error('restore helper anchor not found');
s = s.replace(restoreAnchor, restoreHelper);

const restoreRoles = `    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');\n    const archive = mode === QUARANTINE_MODES.INVESTIGATION`;
const restoreRolesNew = `    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');\n    const memberAccess = await restoreMemberViewAllows(guild, member.id, snapshot.memberViewAllowRestores, options);\n    if (memberAccess.failed.length) {\n      return { success: false, mode, reason: 'Member roles were restored but one or more pre-quarantine channel allows could not be restored.', memberAccess };\n    }\n    const archive = mode === QUARANTINE_MODES.INVESTIGATION`;
if (!s.includes(restoreRoles)) throw new Error('restore call anchor not found');
s = s.replace(restoreRoles, restoreRolesNew);

const restoreReturn = `      archive,\n    });\n    return { success: true, mode, restoredRoles: roles.restored.length, restoredRoleIds: roles.restored, skippedRoles: roles.skipped, archive };`;
const restoreReturnNew = `      archive,\n      restoredMemberChannelAllows: memberAccess.restored.length,\n    });\n    return { success: true, mode, restoredRoles: roles.restored.length, restoredRoleIds: roles.restored, skippedRoles: roles.skipped, memberAccess, archive };`;
if (!s.includes(restoreReturn)) throw new Error('restore return anchor not found');
s = s.replace(restoreReturn, restoreReturnNew);

// Startup recovery must evaluate each target independently so explicit member allows are contained.
const recovery = `  const isolation = await syncQuarantineIsolation(guild, { role });\n  let reapplied = 0;\n  let restored = 0;\n  let failed = isolation.success ? 0 : 1;`;
const recoveryNew = `  let reapplied = 0;\n  let restored = 0;\n  let failed = 0;`;
if (!s.includes(recovery)) throw new Error('recovery bulk isolation anchor not found');
s = s.replace(recovery, recoveryNew);

fs.writeFileSync(path, s);
console.log('Installed quarantine member-overwrite remediation and restoration.');
