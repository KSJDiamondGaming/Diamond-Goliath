from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    count = s.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 anchor, found {count}')
    p.write_text(s.replace(old, new, 1))


def replace_after(path, marker, old, new, label):
    p = Path(path)
    s = p.read_text()
    start = s.find(marker)
    if start < 0:
        raise RuntimeError(f'{label}: marker not found')
    pos = s.find(old, start)
    if pos < 0:
        raise RuntimeError(f'{label}: anchor not found after marker')
    p.write_text(s[:pos] + new + s[pos + len(old):])


q = 'src/core/security/protection/quarantine.js'

# Roll back pre-existing member allows when an INITIAL quarantine preflight fails.
old = """  if (failed) {
    const firstError = failures[0]?.error || null;
    console.warn(`[QuarantineSystem] Isolation sync incomplete in ${guild.id}: ${failed} channel(s) failed.${firstError ? ` First error: ${firstError}` : ''}`);
    return {
      success: false,
      reason: `${failed} channel(s) failed${firstError ? `; first error: ${firstError}` : ''}`,
      roleId: role.id,
      roleName: role.name,
      updated,
      skipped,
      failed,
      failures,
      memberViewAllowRestores,
    };
  }
  return { success: true, roleId: role.id, roleName: role.name, updated, skipped, failed: 0, failures, memberViewAllowRestores };
}"""
new = """  if (failed) {
    const firstError = failures[0]?.error || null;
    let memberAccessRollback = { restored: [], failed: [] };
    if (targetMemberId && memberViewAllowRestores.length && options.rollbackMemberAllowsOnFailure !== false) {
      memberAccessRollback = await restoreMemberViewAllows(guild, targetMemberId, memberViewAllowRestores, {
        reason: 'Rolling back failed quarantine preflight',
      });
    }
    console.warn(`[QuarantineSystem] Isolation sync incomplete in ${guild.id}: ${failed} channel(s) failed.${firstError ? ` First error: ${firstError}` : ''}${memberAccessRollback.failed.length ? ` Rollback failures: ${memberAccessRollback.failed.length}.` : ''}`);
    return {
      success: false,
      reason: `${failed} channel(s) failed${firstError ? `; first error: ${firstError}` : ''}${memberAccessRollback.failed.length ? `; ${memberAccessRollback.failed.length} member-access rollback(s) also failed` : ''}`,
      roleId: role.id,
      roleName: role.name,
      updated,
      skipped,
      failed,
      failures,
      memberViewAllowRestores,
      memberAccessRollback,
    };
  }
  return { success: true, roleId: role.id, roleName: role.name, updated, skipped, failed: 0, failures, memberViewAllowRestores };
}"""
replace_once(q, old, new, 'sync rollback')

# Effective containment verification catches managed-role and overwrite leaks.
anchor = "async function createInvestigationRoom(guild, member, quarantineRole, options = {}) {"
helper = """async function verifyMemberContainment(guild, member, allowedChannelIds = []) {
  const allowed = new Set((allowedChannelIds || []).filter(Boolean).map(String));
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  const leaks = [];
  for (const [, channel] of channels || []) {
    if (!channel || channel.type === ChannelType.GuildCategory || channel.isThread?.()) continue;
    if (allowed.has(String(channel.id))) continue;
    const permissions = channel.permissionsFor?.(member);
    if (permissions?.has(PermissionFlagsBits.ViewChannel)) {
      leaks.push({ channelId: channel.id, channelName: channel.name || null });
      if (leaks.length >= 25) break;
    }
  }
  return { success: leaks.length === 0, leaks };
}

""" + anchor
replace_once(q, anchor, helper, 'containment verifier')

# Initial application is transactional: room, roles, state and user overwrites roll back together.
old = """  let interviewRoom = null;
  let snapshotRoles = [];
  try {
    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role, targetMemberId: member.id });
    if (!isolation.success) {
      return {
        success: false,
        mode,
        reason: `Quarantine isolation could not be guaranteed: ${isolation.reason || `${isolation.failed} channel(s) failed`}`,
        isolation,
      };
    }

    snapshotRoles = member.roles.cache
      .filter((entry) => entry.id !== guild.id && entry.id !== role.id)
      .map((entry) => entry.id);

    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      try {
        interviewRoom = await createInvestigationRoom(guild, member, role, options);
      } catch (error) {
        return { success: false, mode, reason: `Investigation room could not be created: ${error.message}` };
      }
    }

    try {
      await member.roles.set([role.id], options.reason || 'Goliath quarantine applied.');
    } catch (error) {
      if (interviewRoom) await interviewRoom.delete('Rolling back failed investigation isolation').catch(() => null);
      throw error;
    }

    const state = getQuarantineState(guild.id);
    state.roleId = role.id;
    state.roleName = role.name;
    state.users[member.id] = {
      memberId: member.id,
      memberTag: member.user?.tag || null,
      mode,
      quarantinedAt: Date.now(),
      reason: options.reason || 'No reason provided',
      roles: snapshotRoles,
      memberViewAllowRestores: isolation.memberViewAllowRestores || [],
      quarantinedBy: options.quarantinedBy || null,
      source: options.source || (options.quarantinedBy === 'anti_nuke' ? 'anti_nuke' : 'moderation'),
      caseId: options.caseId || null,
      interviewChannelId: interviewRoom?.id || null,
      expiresAt: options.durationMs && Number(options.durationMs) > 0 ? Date.now() + Number(options.durationMs) : null,
    };
    try {
      saveQuarantineState(guild, state);
    } catch (error) {
      await member.roles.set(snapshotRoles, 'Rolling back failed quarantine state persistence').catch(() => null);
      if (interviewRoom) await interviewRoom.delete('Rolling back failed investigation state persistence').catch(() => null);
      throw error;
    }
    emitCurrentQuarantineState(guild, 'member_quarantined', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: role.id, interviewChannelId: interviewRoom?.id || null, snapshotRoles, isolation };
  } catch (error) {
    return { success: false, mode, error: error.message };
  }"""
new = """  let interviewRoom = null;
  let snapshotRoles = [];
  let snapshotCaptured = false;
  let isolation = null;
  let quarantineRole = null;
  let rolesReplaced = false;
  try {
    quarantineRole = await ensureQuarantineRole(guild, options);
    isolation = await syncQuarantineIsolation(guild, { ...options, role: quarantineRole, targetMemberId: member.id });
    if (!isolation.success) {
      return {
        success: false,
        mode,
        reason: `Quarantine isolation could not be guaranteed: ${isolation.reason || `${isolation.failed} channel(s) failed`}`,
        isolation,
      };
    }

    snapshotRoles = member.roles.cache
      .filter((entry) => entry.id !== guild.id && entry.id !== quarantineRole.id)
      .map((entry) => entry.id);
    snapshotCaptured = true;

    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      try {
        interviewRoom = await createInvestigationRoom(guild, member, quarantineRole, options);
      } catch (error) {
        throw new Error(`Investigation room could not be created: ${error.message}`);
      }
    }

    await member.roles.set([quarantineRole.id], options.reason || 'Goliath quarantine applied.');
    rolesReplaced = true;

    const verification = await verifyMemberContainment(
      guild,
      member,
      mode === QUARANTINE_MODES.INVESTIGATION && interviewRoom ? [interviewRoom.id] : [],
    );
    if (!verification.success) {
      throw new Error(`Containment verification failed: ${verification.leaks.length} channel(s) remain visible (${verification.leaks.slice(0, 3).map((entry) => entry.channelName || entry.channelId).join(', ')}).`);
    }

    const state = getQuarantineState(guild.id);
    state.roleId = quarantineRole.id;
    state.roleName = quarantineRole.name;
    state.users[member.id] = {
      memberId: member.id,
      memberTag: member.user?.tag || null,
      mode,
      quarantinedAt: Date.now(),
      reason: options.reason || 'No reason provided',
      roles: snapshotRoles,
      memberViewAllowRestores: isolation.memberViewAllowRestores || [],
      quarantinedBy: options.quarantinedBy || null,
      source: options.source || (options.quarantinedBy === 'anti_nuke' ? 'anti_nuke' : 'moderation'),
      caseId: options.caseId || null,
      interviewChannelId: interviewRoom?.id || null,
      expiresAt: options.durationMs && Number(options.durationMs) > 0 ? Date.now() + Number(options.durationMs) : null,
    };
    saveQuarantineState(guild, state);
    emitCurrentQuarantineState(guild, 'member_quarantined', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: quarantineRole.id, interviewChannelId: interviewRoom?.id || null, snapshotRoles, isolation, verification };
  } catch (error) {
    const rollback = { roles: null, memberAccess: null, roomDeleted: false };
    if (snapshotCaptured && quarantineRole) {
      const manageable = await getRestorableRoleIds(guild, snapshotRoles, quarantineRole.id);
      rollback.roles = await member.roles.set(manageable.restored, 'Rolling back failed quarantine transaction')
        .then(() => ({ success: true, restored: manageable.restored, skipped: manageable.skipped }))
        .catch((roleError) => ({ success: false, error: String(roleError?.message || roleError), skipped: manageable.skipped }));
    }
    if (interviewRoom) {
      rollback.roomDeleted = await interviewRoom.delete('Rolling back failed investigation isolation').then(() => true).catch(() => false);
    }
    if (isolation?.memberViewAllowRestores?.length) {
      rollback.memberAccess = await restoreMemberViewAllows(guild, member.id, isolation.memberViewAllowRestores, {
        reason: 'Rolling back failed quarantine transaction',
      });
    }
    return { success: false, mode, error: error.message, rollback };
  }"""
replace_once(q, old, new, 'quarantine transaction')

# Fail-closed release helper.
anchor = "async function archiveInvestigationRoom(guild, snapshot, options = {}) {"
helper = """async function recontainMemberViewAllows(guild, memberId, channelIds = [], options = {}) {
  const contained = [];
  const failed = [];
  for (const channelId of [...new Set((channelIds || []).map(String))]) {
    let channel = guild.channels.cache.get(channelId);
    if (!channel) channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.permissionOverwrites?.edit) continue;
    try {
      await channel.permissionOverwrites.edit(
        String(memberId),
        { ViewChannel: false },
        { reason: options.reason || 'Re-containing member after failed quarantine release' },
      );
      contained.push(channelId);
    } catch (error) {
      failed.push({ channelId, error: String(error?.message || error).slice(0, 250) });
    }
  }
  return { contained, failed };
}

""" + anchor
replace_once(q, anchor, helper, 'recontain helper')

# Release is fail-closed if original direct channel access cannot be fully restored.
old = """    const quarantineRoleId = state.roleId || null;
    const roles = await getRestorableRoleIds(guild, snapshot.roles, quarantineRoleId);
    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');
    const memberAccess = await restoreMemberViewAllows(guild, member.id, snapshot.memberViewAllowRestores, options);
    if (memberAccess.failed.length) {
      return { success: false, mode, reason: 'Member roles were restored but one or more pre-quarantine channel allows could not be restored.', memberAccess };
    }
    const archive = mode === QUARANTINE_MODES.INVESTIGATION
      ? await archiveInvestigationRoom(guild, snapshot, options)
      : { success: true, archived: false };"""
new = """    const quarantineRoleId = state.roleId || null;
    const roles = await getRestorableRoleIds(guild, snapshot.roles, quarantineRoleId);
    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');
    const memberAccess = await restoreMemberViewAllows(guild, member.id, snapshot.memberViewAllowRestores, options);
    if (memberAccess.failed.length) {
      const recontained = await recontainMemberViewAllows(guild, member.id, memberAccess.restored, {
        reason: 'Rollback after incomplete quarantine release',
      });
      let quarantineRole = quarantineRoleId ? guild.roles.cache.get(String(quarantineRoleId)) : null;
      if (!quarantineRole?.editable) quarantineRole = await ensureQuarantineRole(guild, options).catch(() => null);
      const roleRollback = quarantineRole
        ? await member.roles.set([quarantineRole.id], 'Rollback after incomplete quarantine release').then(() => ({ success: true })).catch((error) => ({ success: false, error: String(error?.message || error) }))
        : { success: false, error: 'Quarantine role was unavailable for rollback.' };
      const rollbackVerification = quarantineRole
        ? await verifyMemberContainment(guild, member, mode === QUARANTINE_MODES.INVESTIGATION && snapshot.interviewChannelId ? [snapshot.interviewChannelId] : [])
        : { success: false, leaks: [] };
      return {
        success: false,
        mode,
        reason: 'Pre-quarantine channel access could not be fully restored. Goliath re-contained the member and kept the quarantine snapshot for a safe retry.',
        memberAccess,
        rollback: { recontained, roleRollback, verification: rollbackVerification },
      };
    }
    const shouldArchive = Boolean(snapshot.interviewChannelId || snapshot.previousInterviewChannelId);
    const archive = shouldArchive
      ? await archiveInvestigationRoom(guild, snapshot, options)
      : { success: true, archived: false };"""
replace_once(q, old, new, 'release fail closed')

# Absent-member expiry restores persistent direct channel overwrites before deleting state.
old = """async function clearExpiredAbsentMember(guild, userId, state) {
  const snapshot = state.users?.[userId];
  if (snapshot && getQuarantineMode(snapshot) === QUARANTINE_MODES.INVESTIGATION) {
    await archiveInvestigationRoom(guild, snapshot, { reason: 'Automatic investigation quarantine expiry while member absent', system: true });
  }
  const latest = getQuarantineState(guild.id);
  delete latest.users[userId];
  saveQuarantineState(guild, latest);
  emitCurrentQuarantineState(guild, 'member_quarantine_expired_absent', { memberId: userId, mode: snapshot ? getQuarantineMode(snapshot) : null });
}"""
new = """async function clearExpiredAbsentMember(guild, userId, state) {
  const snapshot = state.users?.[userId];
  if (!snapshot) return { success: true, cleared: false, reason: 'No quarantine snapshot.' };
  const memberAccess = await restoreMemberViewAllows(guild, userId, snapshot.memberViewAllowRestores, {
    reason: 'Restoring pre-quarantine channel access for expired absent member',
    system: true,
  });
  if (memberAccess.failed.length) {
    return { success: false, cleared: false, reason: 'Could not restore all persistent member channel overwrites; snapshot retained for retry.', memberAccess };
  }
  const shouldArchive = Boolean(snapshot.interviewChannelId || snapshot.previousInterviewChannelId);
  const archive = shouldArchive
    ? await archiveInvestigationRoom(guild, snapshot, { reason: 'Automatic quarantine expiry while member absent', system: true })
    : { success: true, archived: false };
  if (archive?.success === false) {
    return { success: false, cleared: false, reason: 'Could not archive the investigation room; snapshot retained for retry.', memberAccess, archive };
  }
  const latest = getQuarantineState(guild.id);
  delete latest.users[userId];
  saveQuarantineState(guild, latest);
  emitCurrentQuarantineState(guild, 'member_quarantine_expired_absent', { memberId: userId, mode: getQuarantineMode(snapshot) });
  return { success: true, cleared: true, memberAccess, archive };
}"""
replace_once(q, old, new, 'absent expiry')

old = """        if (!member) {
          await clearExpiredAbsentMember(guild, userId, state);
          result.clearedAbsent += 1;
          state = getQuarantineState(guild.id);
          continue;
        }"""
new = """        if (!member) {
          const cleared = await clearExpiredAbsentMember(guild, userId, state);
          if (cleared.success) result.clearedAbsent += 1;
          else result.failed += 1;
          state = getQuarantineState(guild.id);
          continue;
        }"""
replace_once(q, old, new, 'scheduled absent expiry result')

# A PRESENT expired member must get roles restored; the old path only cleared DB/overwrites.
old = """  if (snapshot.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
    await clearExpiredAbsentMember(guild, member.id, state);
    return { success: true, mode, expired: true, executed: false };
  }"""
new = """  if (snapshot.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
    const restored = await restoreQuarantinedMember(guild, member, { reason: 'Automatic quarantine expiry during enforcement', system: true });
    return restored.success
      ? { ...restored, expired: true, executed: false }
      : { ...restored, expired: true, executed: false, success: false };
  }"""
replace_once(q, old, new, 'present expiry restoration')

# Active enforcement stays fail-closed on newly introduced bypasses and verifies effective visibility.
old = """    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role, targetMemberId: member.id });
    if (!isolation.success) return { success: false, mode, reason: 'Quarantine isolation sync failed.', isolation };
    let interviewRoom = null;
    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      interviewRoom = await ensureInvestigationRoomForSnapshot(guild, member, role, snapshot, options);
    }
    await member.roles.set([role.id], `Reapplying active Goliath ${mode} quarantine`);
    emitCurrentQuarantineState(guild, 'member_quarantine_reapplied', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: role.id, interviewChannelId: interviewRoom?.id || null, isolation };"""
new = """    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role, targetMemberId: member.id, rollbackMemberAllowsOnFailure: false });
    if (!isolation.success) return { success: false, mode, reason: 'Quarantine isolation sync failed.', isolation };
    let interviewRoom = null;
    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      interviewRoom = await ensureInvestigationRoomForSnapshot(guild, member, role, snapshot, options);
    }
    await member.roles.set([role.id], `Reapplying active Goliath ${mode} quarantine`);
    const verification = await verifyMemberContainment(
      guild,
      member,
      mode === QUARANTINE_MODES.INVESTIGATION && interviewRoom ? [interviewRoom.id] : [],
    );
    if (!verification.success) return { success: false, mode, reason: 'Effective containment verification failed.', isolation, verification };
    emitCurrentQuarantineState(guild, 'member_quarantine_reapplied', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: role.id, interviewChannelId: interviewRoom?.id || null, isolation, verification };"""
replace_once(q, old, new, 'active enforcement')

# Startup recovery must respect failed absent-member cleanup and must not return an undefined variable.
old = """        const latest = getQuarantineState(guild.id);
        await clearExpiredAbsentMember(guild, userId, latest);
        restored += 1;"""
new = """        const latest = getQuarantineState(guild.id);
        const cleared = await clearExpiredAbsentMember(guild, userId, latest);
        if (cleared.success) restored += 1;
        else failed += 1;"""
replace_once(q, old, new, 'startup absent recovery')
replace_once(q,
    "  return { success: failed === 0, active: entries.length, reapplied, restored, failed, isolation };",
    "  return { success: failed === 0, active: entries.length, reapplied, restored, failed };",
    'undefined recovery variable')

# A manual clear may perform many Discord writes; acknowledge before starting.
qi = 'src/core/administration/mod/quarantineInteractions.js'
old = """  const result = await restoreQuarantinedMember(interaction.guild, target, {
    reason: `Investigation Isolation cleared by ${interaction.user?.tag || interaction.user?.id || 'staff'}`,
    restoredBy: interaction.user.id,
    source: 'moderation',
  });"""
new = """  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
  }

  const result = await restoreQuarantinedMember(interaction.guild, target, {
    reason: `Investigation Isolation cleared by ${interaction.user?.tag || interaction.user?.id || 'staff'}`,
    restoredBy: interaction.user.id,
    source: 'moderation',
  });"""
replace_once(qi, old, new, 'mod clear defer')
replace_once(qi,
    """    return safeReply(interaction, {
      content: `❌ Failed to clear Investigation Isolation from **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`,
      flags: 64,
    });""",
    """    return safeEditReply(interaction, {
      content: `❌ Failed to clear Investigation Isolation from **${target.user.tag}**: ${result.error || result.reason || 'Unknown error'}`,
      flags: 64,
    });""",
    'mod clear failure edit')
replace_once(qi,
    """  await safeReply(interaction, {
    content: `🔓 **Investigation cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s)${archiveText}.`,
    flags: 64,
  });""",
    """  await safeEditReply(interaction, {
    content: `🔓 **Investigation cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s)${archiveText}.`,
    flags: 64,
  });""",
    'mod clear success edit')

# Full Security apply/release has the same long modal path.
admin = 'src/core/administration/admin/command.js'
replace_once(admin,
    """    const reason = fieldValue(interaction, 'reason');
    const before = getQuarantineState(interaction.guild.id).users?.[target.id] || null;
    const beforeMode = before ? getQuarantineMode(before) : null;
    const result = await quarantineMember(interaction.guild, target, {""",
    """    const reason = fieldValue(interaction, 'reason');
    const before = getQuarantineState(interaction.guild.id).users?.[target.id] || null;
    const beforeMode = before ? getQuarantineMode(before) : null;
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const result = await quarantineMember(interaction.guild, target, {""",
    'admin apply defer')
replace_once(admin,
    "      await interaction.reply({ content: `❌ Full Security Isolation failed: ${result?.error || result?.reason || 'Unknown error'}`, flags: 64 });",
    "      await interaction.editReply({ content: `❌ Full Security Isolation failed: ${result?.error || result?.reason || 'Unknown error'}` });",
    'admin apply failure')
replace_once(admin,
    """    await interaction.reply({
      content: result.dryRun
        ? `🧪 Security isolation dry-run completed for **${target.user.tag}**.`
        : `${result.escalated ? '🚨 **Investigation escalated to Full Security Isolation**' : '🚨 **Full Security Isolation applied**'} for **${target.user.tag}**${caseId ? ` • Case **#${caseId}**` : ''}.`,
      flags: 64,
    });""",
    """    await interaction.editReply({
      content: result.dryRun
        ? `🧪 Security isolation dry-run completed for **${target.user.tag}**.`
        : `${result.escalated ? '🚨 **Investigation escalated to Full Security Isolation**' : '🚨 **Full Security Isolation applied**'} for **${target.user.tag}**${caseId ? ` • Case **#${caseId}**` : ''}.`,
    });""",
    'admin apply success')
replace_once(admin,
    """    const result = await restoreQuarantinedMember(interaction.guild, target, {
      reason: `Full Security Isolation cleared by ${interaction.user.tag}: ${reason}`,""",
    """    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const result = await restoreQuarantinedMember(interaction.guild, target, {
      reason: `Full Security Isolation cleared by ${interaction.user.tag}: ${reason}`,""",
    'admin release defer')
replace_once(admin,
    "      await interaction.reply({ content: `❌ Failed to clear Full Security Isolation: ${result?.error || result?.reason || 'Unknown error'}`, flags: 64 });",
    "      await interaction.editReply({ content: `❌ Failed to clear Full Security Isolation: ${result?.error || result?.reason || 'Unknown error'}` });",
    'admin release failure')
replace_once(admin,
    """    await interaction.reply({
      content: `🔓 **Full Security Isolation cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s).`,
      flags: 64,
    });""",
    """    await interaction.editReply({
      content: `🔓 **Full Security Isolation cleared** for **${target.user.tag}** • restored **${result.restoredRoles || 0}** role(s).`,
    });""",
    'admin release success')
replace_once(admin,
    """      if (!interaction?.replied && !interaction?.deferred) {
        await interaction?.reply?.({ content: '❌ Failed to process the admin control.', flags: 64 }).catch(() => null);
      }""",
    """      if (interaction?.deferred || interaction?.replied) {
        await interaction?.editReply?.({ content: '❌ Failed to process the admin control.' }).catch(() => null);
      } else {
        await interaction?.reply?.({ content: '❌ Failed to process the admin control.', flags: 64 }).catch(() => null);
      }""",
    'admin deferred catch')

# Court execution: acknowledge after fast validation, before DB claim and external actions.
court = 'src/core/administration/mod/caseCourt.js'
marker = "if (key === 'mod_court_execute_submit') {"
replace_after(court, marker,
    """    if (action === 'ban' && (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7)) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }
    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);""",
    """    if (action === 'ban' && (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7)) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);""",
    'court execution defer')
for old_reply, new_reply, label in [
    ("await interaction.reply({ content: '❌ This sanction is already being executed. Duplicate execution is blocked.', flags: 64 });", "await interaction.editReply({ content: '❌ This sanction is already being executed. Duplicate execution is blocked.' });", 'court local lock'),
    ("await interaction.reply({ content: '❌ This sanction is already being executed by another reviewer.', flags: 64 });", "await interaction.editReply({ content: '❌ This sanction is already being executed by another reviewer.' });", 'court persisted lock'),
    ("await interaction.reply({ content: message, flags: 64 });", "await interaction.editReply({ content: message });", 'court atomic claim'),
    ("await interaction.reply({ content: '❌ The member is not currently available in this server, so this action cannot be executed from Case Management.', flags: 64 });", "await interaction.editReply({ content: '❌ The member is not currently available in this server, so this action cannot be executed from Case Management.' });", 'court missing target'),
]:
    replace_after(court, marker, old_reply, new_reply, label)

# Appeal approval/retry can run quarantine restoration, unban and DM work.
cases = 'src/core/administration/mod/cases.js'
replace_once(cases,
    "const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');",
    "const { safeReply, safeEditReply, ephemeralError } = require('../../../core/ui/interactionResponse');",
    'cases safe edit import')
replace_once(cases,
    """    const [, caseIdRaw, appealId] = id.split(':');
    const result = await retryApprovedCourtAppealRemedy(interaction, Number(caseIdRaw), appealId, fetchTarget);
    if (!result.ok) return safeReply(interaction, ephemeralError(result.error || 'Failed to retry appeal remedy.'));
    return safeReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });""",
    """    const [, caseIdRaw, appealId] = id.split(':');
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const result = await retryApprovedCourtAppealRemedy(interaction, Number(caseIdRaw), appealId, fetchTarget);
    if (!result.ok) return safeEditReply(interaction, ephemeralError(result.error || 'Failed to retry appeal remedy.'));
    return safeEditReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });""",
    'appeal retry defer')
replace_once(cases,
    """    const [, caseIdRaw, appealId, decision] = id.split(':');
    const result = await resolveAppeal(interaction, Number(caseIdRaw), appealId, decision, interaction.fields.getTextInputValue('review_note'), fetchTarget);
    if (!result.ok) return safeReply(interaction, ephemeralError(result.error || 'Failed to decide appeal.'));
    return safeReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });""",
    """    const [, caseIdRaw, appealId, decision] = id.split(':');
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const result = await resolveAppeal(interaction, Number(caseIdRaw), appealId, decision, interaction.fields.getTextInputValue('review_note'), fetchTarget);
    if (!result.ok) return safeEditReply(interaction, ephemeralError(result.error || 'Failed to decide appeal.'));
    return safeEditReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });""",
    'appeal decision defer')

print('Applied full quarantine lifecycle hardening.')
