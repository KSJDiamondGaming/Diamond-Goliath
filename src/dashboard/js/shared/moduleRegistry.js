export const MODULE_CATEGORIES = {
  automation: 'Automation',
  community: 'Community',
  moderation: 'Moderation',
  support: 'Support',
  utility: 'Utility',
};

export const moduleRegistry = [
  { key: 'autoRoles', name: 'Auto Roles', icon: 'AR', route: '/auto-roles', category: MODULE_CATEGORIES.automation, enabled: false },
  { key: 'forms', name: 'Forms', icon: 'FM', route: '/forms', category: MODULE_CATEGORIES.support, enabled: false },
  { key: 'giveaways', name: 'Giveaways', icon: 'GW', route: '/giveaways', category: MODULE_CATEGORIES.community, enabled: false },
  { key: 'starboard', name: 'Starboard', icon: 'ST', route: '/starboard', category: MODULE_CATEGORIES.community, enabled: false },
  { key: 'sticky', name: 'Sticky Messages', icon: 'SM', route: '/sticky', category: MODULE_CATEGORIES.utility, enabled: false },
  { key: 'tempVoice', name: 'Temp Voice', icon: 'TV', route: '/temp-voice', category: MODULE_CATEGORIES.community, enabled: false },
  { key: 'tickets', name: 'Tickets', icon: 'TK', route: '/tickets', category: MODULE_CATEGORIES.support, enabled: false },
  { key: 'timeline', name: 'Timeline', icon: 'TL', route: '/timeline', category: MODULE_CATEGORIES.utility, enabled: false },
  { key: 'translation', name: 'Translation', icon: 'TR', route: '/translation', category: MODULE_CATEGORIES.utility, enabled: false },
  { key: 'welcomeLeave', name: 'Welcome & Leave', icon: 'WL', route: '/messages', category: MODULE_CATEGORIES.community, enabled: false },
];

export const futureModules = [
  'AI',
  'Appeals',
  'Applications',
  'Economy',
  'Leveling',
  'Music',
  'Verification',
];

export default moduleRegistry;
