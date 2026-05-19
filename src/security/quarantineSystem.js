const guildManager = require('../guild/guildManager');

function emptyQuarantineState() {
  return {
    users: {},
  };
}

function getQuarantineState(guildId) {
  const security =
    guildManager.getSecurityConfig(guildId);

  return {
    ...emptyQuarantineState(),
    ...(security.quarantine || {}),
  };
}

function saveQuarantineState(guild, state) {
  return guildManager.updateSecurityConfig(
    guild.id,
    (security) => ({
      ...security,
      quarantine: state,
    }),
    guild
  );
}

async function ensureQuarantineRole(guild) {
  let role = guild.roles.cache.find(
    (r) => r.name === 'Goliath Quarantine'
  );

  if (role) return role;

  role = await guild.roles.create({
    name: 'Goliath Quarantine',
    color: 0x991b1b,
    permissions: [],
    reason:
      'Goliath emergency quarantine role',
  });

  return role;
}

async function quarantineMember(
  guild,
  member,
  options = {}
) {
  if (!guild || !member) {
    return {
      success: false,
      reason: 'Missing guild/member',
    };
  }

  const role = await ensureQuarantineRole(guild);

  const snapshotRoles = member.roles.cache
    .filter(
      (r) =>
        r.id !== guild.id &&
        r.id !== role.id
    )
    .map((r) => r.id);

  try {
    await member.roles.set([role.id], options.reason);

    const state = getQuarantineState(guild.id);

    state.users[member.id] = {
      memberId: member.id,

      quarantinedAt: Date.now(),

      reason:
        options.reason || 'No reason provided',

      roles: snapshotRoles,

      quarantinedBy:
        options.quarantinedBy || null,

      expiresAt:
        options.durationMs
          ? Date.now() +
            Number(options.durationMs)
          : null,
    };

    saveQuarantineState(guild, state);

    return {
      success: true,
      roleId: role.id,
      snapshotRoles,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function restoreQuarantinedMember(
  guild,
  member,
  options = {}
) {
  const state = getQuarantineState(guild.id);

  const snapshot =
    state.users?.[member.id];

  if (!snapshot) {
    return {
      success: false,
      reason: 'No quarantine snapshot',
    };
  }

  try {
    await member.roles.set(
      snapshot.roles,
      options.reason ||
        'Restoring quarantined member'
    );

    delete state.users[member.id];

    saveQuarantineState(guild, state);

    return {
      success: true,
      restoredRoles: snapshot.roles.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function restoreExpiredQuarantines(
  client
) {
  if (!client) return;

  for (const [, guild] of client.guilds.cache) {
    try {
      const state =
        getQuarantineState(guild.id);

      if (!state.users) continue;

      for (const userId of Object.keys(
        state.users
      )) {
        const snapshot =
          state.users[userId];

        if (!snapshot?.expiresAt)
          continue;

        if (
          Date.now() <
          Number(snapshot.expiresAt)
        ) {
          continue;
        }

        const member =
          await guild.members
            .fetch(userId)
            .catch(() => null);

        if (!member) continue;

        console.log(
          `[QuarantineSystem] Auto restoring ${member.user.tag}`
        );

        await restoreQuarantinedMember(
          guild,
          member,
          {
            reason:
              'Automatic quarantine expiry',
          }
        );
      }
    } catch (error) {
      console.warn(
        `[QuarantineSystem] Failed restore cycle for guild ${guild.id}:`,
        error.message
      );
    }
  }
}

module.exports = {
  emptyQuarantineState,
  getQuarantineState,
  saveQuarantineState,

  ensureQuarantineRole,

  quarantineMember,
  restoreQuarantinedMember,
  restoreExpiredQuarantines,
};