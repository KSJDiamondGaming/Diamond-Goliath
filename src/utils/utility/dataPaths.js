const path = require('path');

const base = path.join(
  __dirname,
  '../../../dashboard/server/data'
);

module.exports = {
  base,

  automod: path.join(base, 'automod.json'),
  cases: path.join(base, 'cases.json'),
  modCases: path.join(base, 'modCases.json'),
  modCaseDetails: path.join(base, 'modCaseDetails.json'),

  guilds: path.join(base, 'guilds.json'),
  guildConfigs: path.join(base, 'guildConfigs.json'),

  logs: path.join(base, 'logChannels.json'),

  stats: path.join(base, 'stats.json'),
  tempPunishments: path.join(base, 'tempPunishments.json'),

  embedConfigs: path.join(base, 'embedConfigs.json'),
  embedTemplates: path.join(base, 'embedTemplates.json'),

  welcomeChannels: path.join(base, 'welcomeChannels.json'),
  welcomeMessages: path.join(base, 'welcomeMessages.json'),
  welcomeTitles: path.join(base, 'welcomeTitles.json'),

  leaveChannels: path.join(base, 'leaveChannels.json'),
  leaveMessages: path.join(base, 'leaveMessages.json'),
  leaveTitles: path.join(base, 'leaveTitles.json'),
};