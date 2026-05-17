export const DASHBOARD_LAYOUT = {
  sidebarExpandedWidth: '280px',
  sidebarCollapsedWidth: '72px',
  topBarHeight: '72px',
  pageGap: '20px',
  cardRadius: '20px',
  cardPadding: '24px',
  sectionPadding: '18px',
};

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: 'overview', path: '/overview' },
  {
    key: 'admin',
    label: 'Admin',
    icon: 'admin',
    children: [
      { key: 'config', label: 'General Settings', icon: 'config', path: '/config' },
      { key: 'automod', label: 'Auto Mod', icon: 'automod', path: '/automod' },
      { key: 'admin', label: 'Admin', icon: 'admin', path: '/admin' },
      { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation' },
    ],
  },
  {
    key: 'modules',
    label: 'Modules',
    icon: 'modules',
    children: [
      { key: 'cases', label: 'Cases', icon: 'cases', path: '/cases' },
      { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings' },
      { key: 'messages', label: 'Welcome & Leave', icon: 'messages', path: '/messages' },
    ],
  },
];

export const NAV_BOTTOM = [
  { key: 'restore', label: 'Restore', icon: 'admin', path: '/restore' },
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs' },
];

export const ROUTES = [
  { key: 'overview', label: 'Overview', icon: 'overview', path: '/overview' },
  { key: 'config', label: 'General Settings', icon: 'config', path: '/config' },
  { key: 'automod', label: 'Auto Mod', icon: 'automod', path: '/automod' },
  { key: 'admin', label: 'Admin', icon: 'admin', path: '/admin' },
  { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation' },
  { key: 'cases', label: 'Cases', icon: 'cases', path: '/cases' },
  { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings' },
  { key: 'messages', label: 'Welcome & Leave', icon: 'messages', path: '/messages' },
  { key: 'restore', label: 'Restore', icon: 'admin', path: '/restore' },
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs' },
];

export const navItems = NAV_ITEMS;
export const navBottomItems = NAV_BOTTOM;

export const PAGE_LAYOUTS = {
  overview: {
    title: 'Overview',
    description: 'Server insights & activity',
    sections: [
      { id: 'stats', type: 'stats' },
      { id: 'activity', type: 'list' },
    ],
  },

  automod: {
    title: 'AutoMod',
    description: 'Manage filters & rules',
    emptyDescription: 'Select a server to manage AutoMod.',
    sections: [
      { id: 'rules', type: 'config' },
      { id: 'filters', type: 'config' },
    ],
  },

  admin: {
    title: 'Admin',
    description: 'Core system configuration and control panel.',
    emptyDescription: 'Select a server to manage admin settings.',
    sections: [{ id: 'adminHub', type: 'future' }],
  },

  moderation: {
    title: 'Moderation',
    description: 'Central moderation tools & controls for this server.',
    emptyDescription: 'Select a server to manage moderation.',
    sections: [{ id: 'moderationHub', type: 'future' }],
  },

  cases: {
    title: 'Cases',
    description: 'Moderation history',
    emptyDescription: 'Select a server to view cases.',
    sections: [{ id: 'caseTable', type: 'table' }],
  },

  warnings: {
    title: 'Warnings',
    description: 'View and manage warning records for the selected server.',
    emptyDescription: 'Select a server to view warnings.',
    sections: [{ id: 'warningTable', type: 'table' }],
  },

  config: {
    title: 'General Settings',
    description: 'Manage dashboard and server configuration for the selected server.',
    emptyDescription: 'Select a server to manage settings.',
    sections: [{ id: 'generalConfig', type: 'config' }],
  },

  messages: {
    title: 'Welcome & Leave',
    description: 'Manage join and leave messages for the selected server.',
    emptyDescription: 'Select a server to manage welcome and leave messages.',
    sections: [
      { id: 'welcome', type: 'config' },
      { id: 'leave', type: 'config' },
    ],
  },

  restore: {
    title: 'Server Restore',
    description: 'Preview and safely restore server backups.',
    emptyDescription: 'Select a server to restore from backup.',
    sections: [{ id: 'restoreManager', type: 'config' }],
  },

  logs: {
    title: 'Logs',
    description: 'Manage log channels for the selected guild.',
    emptyDescription: 'Select a server to manage log channels.',
    sections: [{ id: 'logManager', type: 'config' }],
  },
};

export const SECTION_DEFS = {
  stats: {
    title: 'Server Stats',
    description: 'Live system, guild, and moderation status for the selected server.',
  },

  activity: {
    title: 'Recent Activity',
    description: 'Quick visual indicators for moderation health and performance.',
  },

  rules: {
    title: 'Rules',
    description: 'Manage core automod rules.',
  },

  filters: {
    title: 'Filters',
    description: 'Manage filters, bad words, repeated messages, and logs.',
  },

  caseTable: {
    title: 'Cases',
    description: 'Browse case history and open a record to inspect full moderation details.',
  },

  warningTable: {
    title: 'Warnings',
    description: 'Browse warning history and open a record to inspect full details.',
  },

  welcome: {
    title: 'Welcome Message',
    description: 'Configure the welcome message sent when a new user joins.',
  },

  leave: {
    title: 'Leave Message',
    description: 'Configure the leave message sent when a user leaves the server.',
  },

  generalConfig: {
    title: 'General Config',
    description: 'Core dashboard, moderation, and server-wide configuration.',
  },

  restoreManager: {
    title: 'Restore Manager',
    description: 'Preview backup contents, confirm restore actions, and safely recover server structure.',
  },

  logManager: {
    title: 'Log Manager',
    description: 'Choose which channel each log group should use.',
  },
};