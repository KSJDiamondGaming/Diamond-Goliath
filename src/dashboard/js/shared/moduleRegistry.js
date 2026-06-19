export const MODULE_CATEGORIES = {
  feature: 'Features',
};

export const MODULE_STATUSES = {
  live: 'Live',
  backendReady: 'Backend Ready',
  uiPending: 'UI Pending',
  planned: 'Planned',
};

export const MODULE_STATUS_META = {
  [MODULE_STATUSES.live]: { label: 'Live', tone: 'success' },
  [MODULE_STATUSES.backendReady]: { label: 'Backend Ready', tone: 'info' },
  [MODULE_STATUSES.uiPending]: { label: 'Coming Soon', tone: 'warning' },
  [MODULE_STATUSES.planned]: { label: 'Coming Soon', tone: 'muted' },
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
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Create and manage server giveaways.',
  },
  {
    key: 'prefix',
    name: 'Prefix',
    icon: 'PX',
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.live,
    enabled: true,
    summary: 'Configure the server command prefix and prefix command behaviour.',
  },
  {
    key: 'roles',
    name: 'Roles',
    icon: 'RL',
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Role utilities, role automation and future reaction-role controls.',
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
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Highlight popular server messages in a starboard channel.',
  },
  {
    key: 'sticky',
    name: 'Sticky Messages',
    icon: 'SM',
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Keep important channel messages pinned to the bottom of chat.',
  },
  {
    key: 'suggestions',
    name: 'Suggestions',
    icon: 'SG',
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Collect, review and manage community suggestions.',
  },
  {
    key: 'tempVoice',
    name: 'Temp Voice',
    icon: 'TV',
    route: null,
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
    route: null,
    category: MODULE_CATEGORIES.feature,
    status: MODULE_STATUSES.backendReady,
    enabled: false,
    summary: 'Timeline storage and timeline-driven server updates.',
  },
  {
    key: 'translation',
    name: 'Translation',
    icon: 'TR',
    route: null,
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
].sort((a, b) => a.name.localeCompare(b.name));

export const futureModules = [];

export function getModuleStatusMeta(status) {
  return MODULE_STATUS_META[status] || MODULE_STATUS_META[MODULE_STATUSES.planned];
}

export default moduleRegistry;
