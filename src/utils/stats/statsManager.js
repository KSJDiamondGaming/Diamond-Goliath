const {
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const store = require('./statsStore');

const STAT_DEFINITIONS = {
  members: {
    key: 'members',
    label: 'Members',
    buildName: (counts) => `👥 ${counts.humans} MEMBERS`,
  },
  online: {
    key: 'online',
    label: 'Online',
    buildName: (counts) => `🟢 ${counts.online} ONLINE`,
  },
  idle: {
    key: 'idle',
    label: 'Idle',
    buildName: (counts) => `🌙 ${counts.idle} IDLE`,
  },
  dnd: {
    key: 'dnd',
    label: 'Do Not Disturb',
    buildName: (counts) => `🔴 ${counts.dnd} DND`,
  },
  services: {
    key: 'services',
    label: 'Discord Services',
    buildName: (counts) => `🔧 ${counts.bots} DISCORD SERVICES`,
  },
  gems: {
    key: 'gems',
    label: 'Gems',
    buildName: (counts) => `💎 ${counts.gems} GEMS`,
  },
};

function getDefaultConfig() {
  return {
    enabled: true,
    categoryId: null,
    channels: {},
    selectedStat: 'members',
  };
}

function getGuildConfig(guildId) {
  return store.get(guildId) || getDefaultConfig();
}

function saveGuildConfig(guildId, config) {
  store.set(guildId, config);
}

async function fetchMembers(guild) {
  try {
    await guild.members.fetch();
  } catch (error) {
    console.error(`Failed to fetch members for guild ${guild.id}:`, error);
  }
}

function getPresenceCounts(guild) {
  let online = 0;
  let idle = 0;
  let dnd = 0;

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;

    const status = member.presence?.status;

    if (status === 'online') online += 1;
    else if (status === 'idle') idle += 1;
    else if (status === 'dnd') dnd += 1;
  }

  return { online, idle, dnd };
}

function getMemberCounts(guild) {
  const humans = guild.members.cache.filter((member) => !member.user.bot).size;
  const bots = guild.members.cache.filter((member) => member.user.bot).size;

  return { humans, bots };
}

async function getGemCount(guild) {
  return guild.members.cache.filter((member) => !member.user.bot).size;
}

async function getStatCounts(guild) {
  await fetchMembers(guild);

  const presence = getPresenceCounts(guild);
  const memberCounts = getMemberCounts(guild);
  const gems = await getGemCount(guild);

  return {
    ...presence,
    ...memberCounts,
    gems,
  };
}

async function createStatsCategory(guild) {
  const config = getGuildConfig(guild.id);

  if (config.categoryId) {
    const existingCategory = guild.channels.cache.get(config.categoryId);
    if (existingCategory) {
      return { ok: true, msg: 'Stats category already exists.' };
    }
  }

  const category = await guild.channels.create({
    name: 'server stats',
    type: ChannelType.GuildCategory,
  });

  config.categoryId = category.id;
  saveGuildConfig(guild.id, config);

  return { ok: true, msg: 'Stats category created.' };
}

async function createStatChannel(guild, statKey) {
  const config = getGuildConfig(guild.id);
  const stat = STAT_DEFINITIONS[statKey];

  if (!stat) {
    return { ok: false, msg: 'Invalid stat selected.' };
  }

  if (!config.categoryId) {
    const categoryResult = await createStatsCategory(guild);
    if (!categoryResult.ok) {
      return categoryResult;
    }

    const refreshedConfig = getGuildConfig(guild.id);
    config.categoryId = refreshedConfig.categoryId;
  }

  const existingChannelId = config.channels[statKey];
  if (existingChannelId) {
    const existingChannel = guild.channels.cache.get(existingChannelId);
    if (existingChannel) {
      await updateSingleStatChannel(guild, statKey);
      return {
        ok: true,
        msg: `${stat.label} channel already exists. Updated it instead.`,
      };
    }
  }

  const counts = await getStatCounts(guild);
  const channelName = stat.buildName(counts);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.CreatePublicThreads,
          PermissionsBitField.Flags.CreatePrivateThreads,
          PermissionsBitField.Flags.SendMessagesInThreads,
        ],
      },
    ],
  });

  config.channels[statKey] = channel.id;
  config.enabled = true;
  saveGuildConfig(guild.id, config);

  return { ok: true, msg: `${stat.label} channel created.` };
}

async function renameChannel(channel, newName) {
  if (!channel) return;
  if (channel.name === newName) return;

  try {
    await channel.setName(newName);
  } catch (error) {
    console.error(`Failed to rename channel ${channel.id}:`, error);
  }
}

async function updateSingleStatChannel(guild, statKey) {
  const config = getGuildConfig(guild.id);
  const stat = STAT_DEFINITIONS[statKey];

  if (!stat) {
    return { ok: false, msg: 'Invalid stat selected.' };
  }

  const channelId = config.channels[statKey];
  if (!channelId) {
    return { ok: false, msg: `${stat.label} channel does not exist.` };
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    delete config.channels[statKey];
    saveGuildConfig(guild.id, config);
    return { ok: false, msg: `${stat.label} channel is missing. Removed stale config.` };
  }

  const counts = await getStatCounts(guild);
  await renameChannel(channel, stat.buildName(counts));

  return { ok: true, msg: `${stat.label} channel updated.` };
}

async function updateAllStatChannels(guild) {
  const config = getGuildConfig(guild.id);
  const statKeys = Object.keys(config.channels || {});

  if (!config.enabled) {
    return { ok: false, msg: 'Stats system is disabled.' };
  }

  if (!statKeys.length) {
    return { ok: false, msg: 'No stat channels have been created yet.' };
  }

  const counts = await getStatCounts(guild);

  for (const statKey of statKeys) {
    const stat = STAT_DEFINITIONS[statKey];
    if (!stat) continue;

    const channel = guild.channels.cache.get(config.channels[statKey]);

    if (!channel) {
      delete config.channels[statKey];
      continue;
    }

    await renameChannel(channel, stat.buildName(counts));
  }

  saveGuildConfig(guild.id, config);

  return { ok: true, msg: 'All stat channels updated.' };
}

async function removeSingleStatChannel(guild, statKey) {
  const config = getGuildConfig(guild.id);
  const stat = STAT_DEFINITIONS[statKey];

  if (!stat) {
    return { ok: false, msg: 'Invalid stat selected.' };
  }

  const channelId = config.channels[statKey];
  if (!channelId) {
    return { ok: false, msg: `${stat.label} channel does not exist.` };
  }

  const channel = guild.channels.cache.get(channelId);

  if (channel) {
    await channel.delete('Removing selected stats channel').catch(() => null);
  }

  delete config.channels[statKey];
  saveGuildConfig(guild.id, config);

  return { ok: true, msg: `${stat.label} channel removed.` };
}

async function removeAllStatChannels(guild) {
  const config = getGuildConfig(guild.id);

  for (const channelId of Object.values(config.channels || {})) {
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      await channel.delete('Removing all stats channels').catch(() => null);
    }
  }

  if (config.categoryId) {
    const category = guild.channels.cache.get(config.categoryId);
    if (category) {
      await category.delete('Removing stats category').catch(() => null);
    }
  }

  store.remove(guild.id);

  return { ok: true, msg: 'All stats channels removed.' };
}

function setSelectedStat(guildId, statKey) {
  const config = getGuildConfig(guildId);

  if (!STAT_DEFINITIONS[statKey]) {
    return config.selectedStat || 'members';
  }

  config.selectedStat = statKey;
  saveGuildConfig(guildId, config);

  return config.selectedStat;
}

function getSelectedStat(guildId) {
  const config = getGuildConfig(guildId);
  return config.selectedStat || 'members';
}

function getConfiguredStats(guildId) {
  const config = getGuildConfig(guildId);
  return Object.keys(config.channels || {});
}

function hasCategory(guildId) {
  const config = getGuildConfig(guildId);
  return Boolean(config.categoryId);
}

let statsInterval = null;

function start(client) {
  if (statsInterval) return;

  statsInterval = setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = getGuildConfig(guild.id);

        if (!config.enabled) continue;
        if (!Object.keys(config.channels || {}).length) continue;

        await updateAllStatChannels(guild);
      } catch (error) {
        console.error(`Stats updater failed for guild ${guild.id}:`, error);
      }
    }
  }, 60000);
}

module.exports = {
  STAT_DEFINITIONS,
  getGuildConfig,
  createStatsCategory,
  createStatChannel,
  updateSingleStatChannel,
  updateAllStatChannels,
  removeSingleStatChannel,
  removeAllStatChannels,
  setSelectedStat,
  getSelectedStat,
  getConfiguredStats,
  hasCategory,
  start,
};