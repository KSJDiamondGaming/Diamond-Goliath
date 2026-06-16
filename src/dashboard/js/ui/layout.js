import Overview from '../pages/Overview';
import AutoMod from '../pages/AutoMod';
import Admin from '../pages/Admin';
import Moderation from '../pages/Moderation';
import GeneralSettings from '../pages/GeneralSettings';
import Cases from '../pages/Cases';
import Warnings from '../pages/Warnings';
import Messages from '../pages/core/Messages';
import Forms from '../pages/modules/Forms';
import Modules from '../pages/modules/Modules';
import Restore from '../pages/Restore';
import Security from '../pages/Security';
import Logs from '../pages/core/Logs';
import OwnerView from '../pages/owner/OwnerOverview';
import OwnerGlobalServers from '../pages/owner/GlobalServers';
import OwnerRuntimeMonitor from '../pages/owner/RuntimeMonitor';
import OwnerSecurityCenter from '../pages/owner/SecurityCenter';
import OwnerBackupCenter from '../pages/owner/BackupCenter';
import OwnerDeploymentCenter from '../pages/owner/DeploymentCenter';
import OwnerFormsHub from '../pages/owner/FormsHub';
import OwnerTicketsHub from '../pages/owner/TicketsHub';
import OwnerTranslationHub from '../pages/owner/TranslationHub';

export const DASHBOARD_LAYOUT = {
  navbarExpandedWidth: '280px',
  navbarCollapsedWidth: '72px',
  topBarHeight: '72px',
  pageGap: '20px',
  cardRadius: '20px',
  cardPadding: '24px',
  sectionPadding: '18px',
};

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: 'overview', path: '/overview' },
  {
    key: 'administration',
    label: 'Administration',
    icon: 'admin',
    children: [
      { key: 'adminPage', label: 'Admin', icon: 'admin', path: '/admin' },
      { key: 'automod', label: 'AutoMod', icon: 'automod', path: '/automod' },
      { key: 'generalSettings', label: 'General Settings', icon: 'generalSettings', path: '/generalSettings' },
    ],
  },
  {
    key: 'moderationGroup',
    label: 'Moderation',
    icon: 'admin',
    children: [
      { key: 'cases', label: 'Cases', icon: 'cases', path: '/cases' },
      { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation' },
      { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings' },
    ],
  },
  { key: 'modules', label: 'Modules', icon: 'modules', path: '/modules' },
];

export const NAV_BOTTOM = [
  {
    key: 'securityCenter',
    label: 'Security Center',
    icon: 'admin',
    children: [
      { key: 'restore', label: 'Restore', icon: 'admin', path: '/restore' },
      { key: 'security', label: 'Security', icon: 'admin', path: '/security' },
    ],
  },
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs' },
];

export const ROUTES = [
  { key: 'overview', label: 'Overview', icon: 'overview', path: '/overview', component: Overview },
  { key: 'ownerView', label: 'Owner View', icon: 'admin', path: '/owner', component: OwnerView, ownerOnly: true },
  { key: 'ownerServers', label: 'Global Servers', icon: 'modules', path: '/owner/servers', component: OwnerGlobalServers, ownerOnly: true },
  { key: 'ownerRuntime', label: 'Runtime Monitor', icon: 'admin', path: '/owner/runtime', component: OwnerRuntimeMonitor, ownerOnly: true },
  { key: 'ownerSecurity', label: 'Owner Security', icon: 'admin', path: '/owner/security', component: OwnerSecurityCenter, ownerOnly: true },
  { key: 'ownerBackups', label: 'Backup Center', icon: 'admin', path: '/owner/backups', component: OwnerBackupCenter, ownerOnly: true },
  { key: 'ownerDeployments', label: 'Deployment Center', icon: 'modules', path: '/owner/deployments', component: OwnerDeploymentCenter, ownerOnly: true },
  { key: 'ownerForms', label: 'Forms Hub', icon: 'modules', path: '/owner/forms', component: OwnerFormsHub, ownerOnly: true },
  { key: 'ownerTickets', label: 'Tickets Hub', icon: 'modules', path: '/owner/tickets', component: OwnerTicketsHub, ownerOnly: true },
  { key: 'ownerTranslation', label: 'Translation Hub', icon: 'modules', path: '/owner/translation', component: OwnerTranslationHub, ownerOnly: true },
  { key: 'modules', label: 'Modules', icon: 'modules', path: '/modules', component: Modules },
  { key: 'generalSettings', label: 'General Settings', icon: 'generalSettings', path: '/generalSettings', component: GeneralSettings },
  { key: 'automod', label: 'AutoMod', icon: 'automod', path: '/automod', component: AutoMod },
  { key: 'admin', label: 'Admin', icon: 'admin', path: '/admin', component: Admin },
  { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation', component: Moderation },
  { key: 'cases', label: 'Cases', icon: 'cases', path: '/cases', component: Cases },
  { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings', component: Warnings },
  { key: 'messages', label: 'Welcome & Leave', icon: 'messages', path: '/messages', component: Messages },
  { key: 'forms', label: 'Forms', icon: 'modules', path: '/forms', component: Forms },
  { key: 'security', label: 'Security', icon: 'admin', path: '/security', component: Security },
  { key: 'restore', label: 'Restore', icon: 'admin', path: '/restore', component: Restore },
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs', component: Logs },
];

export const navItems = NAV_ITEMS;
export const navBottomItems = NAV_BOTTOM;

export const PAGE_LAYOUTS = {
  overview: { title: 'Overview', description: 'Server insights and activity', sections: [{ id: 'stats', type: 'stats' }, { id: 'activity', type: 'list' }] },
  ownerView: { title: 'Owner View', description: 'Owner-only platform dashboard.', sections: [] },
  ownerServers: { title: 'Global Servers', description: 'Owner-level server registry across all environments.', sections: [] },
  ownerRuntime: { title: 'Runtime Monitor', description: 'Owner-level runtime monitoring across DEV, BETA and PRODUCTION.', sections: [] },
  ownerSecurity: { title: 'Owner Security', description: 'Global security centre across all environments.', sections: [] },
  ownerBackups: { title: 'Backup Center', description: 'Owner-level backup and restore monitoring.', sections: [] },
  ownerDeployments: { title: 'Deployment Center', description: 'Deployment queue, history and environment status.', sections: [] },
  ownerForms: { title: 'Forms Hub', description: 'Global forms and submissions overview.', sections: [] },
  ownerTickets: { title: 'Tickets Hub', description: 'Global tickets overview.', sections: [] },
  ownerTranslation: { title: 'Translation Hub', description: 'Global translation system overview.', sections: [] },
  modules: { title: 'Modules', description: 'Optional Goliath features in one scalable grid.', emptyDescription: 'Select a server to view modules.', sections: [{ id: 'modulesGrid', type: 'dashboard' }] },
  generalSettings: { title: 'General Settings', description: 'Manage server configuration.', emptyDescription: 'Select a server to manage settings.', sections: [{ id: 'generalConfig', type: 'config' }] },
  automod: { title: 'AutoMod', description: 'Manage filters and rules', sections: [{ id: 'rules', type: 'config' }, { id: 'filters', type: 'config' }] },
  admin: { title: 'Admin', description: 'Core system configuration and control panel.', emptyDescription: 'Select a server to manage admin settings.', sections: [{ id: 'adminHub', type: 'future' }] },
  moderation: { title: 'Moderation', description: 'Central moderation tools for this server.', emptyDescription: 'Select a server to manage moderation.', sections: [{ id: 'moderationHub', type: 'future' }] },
  cases: { title: 'Cases', description: 'Moderation history', sections: [{ id: 'caseTable', type: 'table' }] },
  warnings: { title: 'Warnings', description: 'View and manage warning records.', emptyDescription: 'Select a server to view warnings.', sections: [{ id: 'warningTable', type: 'table' }] },
  messages: { title: 'Welcome & Leave', description: 'Manage join and leave messages.', emptyDescription: 'Select a server to manage messages.', sections: [{ id: 'welcome', type: 'config' }, { id: 'leave', type: 'config' }] },
  forms: { title: 'Forms', description: 'Manage universal forms and workflows.', emptyDescription: 'Select a server to manage forms.', sections: [{ id: 'formsManager', type: 'dashboard' }] },
  security: { title: 'Security Center', description: 'Live protection and recovery overview.', emptyDescription: 'Select a server to view security status.', sections: [{ id: 'securityOverview', type: 'dashboard' }] },
  restore: { title: 'Server Restore', description: 'Preview and restore server backups.', emptyDescription: 'Select a server to restore from backup.', sections: [{ id: 'restoreManager', type: 'config' }] },
  logs: { title: 'Logs', description: 'Manage log channels.', emptyDescription: 'Select a server to manage log channels.', sections: [{ id: 'logManager', type: 'config' }] },
};

export const SECTION_DEFS = {
  stats: { title: 'Server Stats', description: 'Live system and guild status.' },
  activity: { title: 'Recent Activity', description: 'Quick status indicators.' },
  modulesGrid: { title: 'Modules Grid', description: 'Browse optional Goliath features.' },
  rules: { title: 'Rules', description: 'Manage core automod rules.' },
  filters: { title: 'Filters', description: 'Manage filters and logs.' },
  caseTable: { title: 'Cases', description: 'Browse case history.' },
  warningTable: { title: 'Warnings', description: 'Browse warning history.' },
  welcome: { title: 'Welcome Message', description: 'Configure the welcome message.' },
  leave: { title: 'Leave Message', description: 'Configure the leave message.' },
  formsManager: { title: 'Forms Manager', description: 'Create and manage forms.' },
  generalConfig: { title: 'General Config', description: 'Core server configuration.' },
  securityOverview: { title: 'Security Overview', description: 'Live protection status.' },
  restoreManager: { title: 'Restore Manager', description: 'Preview and restore backups.' },
  logManager: { title: 'Log Manager', description: 'Choose log channels.' },
};



