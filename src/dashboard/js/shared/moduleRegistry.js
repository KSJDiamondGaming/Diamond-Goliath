export const MODULE_CATEGORIES = {
  feature: 'Features',
};

export const MODULE_STATUSES = {
  live: 'Live',
  backendReady: 'Backend Ready',
};

export const MODULE_STATUS_META = {
  [MODULE_STATUSES.live]: { label: 'Live', tone: 'success' },
  [MODULE_STATUSES.backendReady]: { label: 'Dashboard Ready', tone: 'info' },
};

export const moduleRegistry = [
  {
    key: 'autoRoles',
    name: 'Auto Roles',
    icon: 'AR',
    route: '/autoroles',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Assign roles automatically when members join or meet conditions.',
  },
  {
    key: 'embedBuilder',
    name: 'Embed Studio',
    icon: 'ES',
    route: '/embed-studio',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: true,
    summary: 'Build, preview, save and manage Discord embeds from the dashboard.',
  },
  {
    key: 'forms',
    name: 'Forms',
    icon: 'FM',
    route: '/forms',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: true,
    summary: 'Universal forms, submissions, analytics and workflow foundations.',
  },
  {
    key: 'giveaways',
    name: 'Giveaways',
    icon: 'GW',
    route: '/giveaways',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Create and manage server giveaways.',
  },
  {
    key: 'leveling',
    name: 'Leveling',
    icon: 'LV',
    route: '/leveling',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'XP, levels, leaderboards, rewards and level roles.',
  },
  {
    key: 'reactionRoles',
    name: 'Reaction Roles',
    icon: 'RR',
    route: '/reaction-roles',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Reaction role panels, emoji mappings, deployments and analytics.',
  },
  {
    key: 'social',
    name: 'Social Alerts',
    icon: 'SA',
    route: '/social',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Multi-platform creator alerts for Twitch, YouTube, TikTok, Kick and more.',
  },
  {
    key: 'starboard',
    name: 'Starboard',
    icon: 'ST',
    route: '/starboard',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Highlight popular server messages in a starboard channel.',
  },
  {
    key: 'sticky',
    name: 'Sticky Messages',
    icon: 'SM',
    route: '/sticky',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Keep important channel messages pinned to the bottom of chat.',
  },
  {
    key: 'tempVoice',
    name: 'Temp Voice',
    icon: 'TV',
    route: '/tempvoice',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Temporary voice channels and voice room automation.',
  },
  {
    key: 'tickets',
    name: 'Tickets',
    icon: 'TK',
    route: '/tickets',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Ticket panels, claims, closing, transcripts, recovery and analytics.',
  },
  {
    key: 'timeline',
    name: 'Timeline',
    icon: 'TL',
    route: '/timeline',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Timeline storage and timeline-driven server updates.',
  },
  {
    key: 'translation',
    name: 'Translation',
    icon: 'TR',
    route: '/translation',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Language preferences, provider-ready storage and translation controls.',
  },
  {
    key: 'verification',
    name: 'Verification',
    icon: 'VF',
    route: '/verification',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Member verification and onboarding protection.',
  },
  {
    key: 'welcome',
    name: 'Welcome & Leave',
    icon: 'WL',
    route: '/welcome-leave',
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Welcome messages, leave messages, DM welcomes and join/leave analytics.',
  },
].sort((a, b) => a.name.localeCompare(b.name));

export const futureModules = [];

export function getModuleStatusMeta(status) {
  return MODULE_STATUS_META[status] || MODULE_STATUS_META[MODULE_STATUSES.backendReady];
}

export default moduleRegistry;
