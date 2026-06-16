export const OWNER_NAV_ITEMS = [
  { key: 'ownerOverview', label: 'Owner Overview', icon: 'overview', path: '/owner' },
  { key: 'ownerServers', label: 'Global Servers', icon: 'modules', path: '/owner/servers' },
  { key: 'ownerRuntime', label: 'Runtime Monitor', icon: 'admin', path: '/owner/runtime' },
  { key: 'ownerSecurity', label: 'Global Security', icon: 'admin', path: '/owner/security' },
  { key: 'ownerForms', label: 'Forms Hub', icon: 'modules', path: '/owner/forms' },
  { key: 'ownerTickets', label: 'Tickets Hub', icon: 'modules', path: '/owner/tickets' },
  { key: 'ownerTranslation', label: 'Translation Hub', icon: 'modules', path: '/owner/translation' },
  { key: 'ownerBackups', label: 'Backup Center', icon: 'admin', path: '/owner/backups' },
  { key: 'ownerDeployments', label: 'Deployment Center', icon: 'modules', path: '/owner/deployments' },
];

export const OWNER_NAV_GROUPS = [
  {
    title: 'Control Centre',
    items: ['ownerOverview', 'ownerServers', 'ownerRuntime'],
  },
  {
    title: 'Operations',
    items: ['ownerSecurity', 'ownerForms', 'ownerTickets', 'ownerTranslation'],
  },
  {
    title: 'Infrastructure',
    items: ['ownerBackups', 'ownerDeployments'],
  },
];
