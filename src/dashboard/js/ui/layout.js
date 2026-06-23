import { lazy } from 'react';

const Overview = lazy(() => import('../pages/core/Overview'));
const Billing = lazy(() => import('../pages/core/Billing'));
const AutoMod = lazy(() => import('../pages/administration/AutoMod'));
const Admin = lazy(() => import('../pages/administration/Admin'));
const Moderation = lazy(() => import('../pages/moderation/Moderation'));
const Cases = lazy(() => import('../pages/moderation/Cases'));
const GeneralSettings = lazy(() => import('../pages/administration/GeneralSettings'));
const Warnings = lazy(() => import('../pages/moderation/Warnings'));
const Messages = lazy(() => import('../pages/core/Messages'));
const Forms = lazy(() => import('../pages/modules/Forms'));
const Modules = lazy(() => import('../pages/modules/Modules'));
const EmbedStudio = lazy(() => import('../pages/modules/EmbedStudio'));
const Verification = lazy(() => import('../pages/modules/Verification'));
const AutoRoles = lazy(() => import('../pages/modules/AutoRoles'));
const Tickets = lazy(() => import('../pages/modules/Tickets'));
const Social = lazy(() => import('../pages/modules/Social'));
const Giveaways = lazy(() => import('../pages/modules/Giveaways'));
const Starboard = lazy(() => import('../pages/modules/Starboard'));
const Sticky = lazy(() => import('../pages/modules/Sticky'));
const TempVoice = lazy(() => import('../pages/modules/TempVoice'));
const Timeline = lazy(() => import('../pages/modules/Timeline'));
const Translation = lazy(() => import('../pages/modules/Translation'));
const ReactionRoles = lazy(() => import('../pages/modules/ReactionRoles'));
const WelcomeLeave = lazy(() => import('../pages/modules/WelcomeLeave'));
const Leveling = lazy(() => import('../pages/modules/Leveling'));
const Restore = lazy(() => import('../pages/security/Restore'));
const Security = lazy(() => import('../pages/security/Security'));
const Logs = lazy(() => import('../pages/core/Logs'));
const OwnerView = lazy(() => import('../pages/owner/OwnerOverview'));
const OwnerGlobalServers = lazy(() => import('../pages/owner/GlobalServers'));
const OwnerRuntimeMonitor = lazy(() => import('../pages/owner/RuntimeMonitor'));
const OwnerBillingAdmin = lazy(() => import('../pages/owner/BillingAdmin'));
const OwnerSecurityCenter = lazy(() => import('../pages/owner/SecurityCenter'));
const OwnerBackupCenter = lazy(() => import('../pages/owner/BackupCenter'));
const OwnerDeploymentCenter = lazy(() => import('../pages/owner/DeploymentCenter'));
const OwnerFormsHub = lazy(() => import('../pages/owner/FormsHub'));
const OwnerTicketsHub = lazy(() => import('../pages/owner/TicketsHub'));
const OwnerTranslationHub = lazy(() => import('../pages/owner/TranslationHub'));
const OwnerPermissionHealth = lazy(() => import('../pages/owner/PermissionHealth'));

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
      { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation' },
      { key: 'cases', label: 'Cases', icon: 'warnings', path: '/cases' },
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
  { key: 'billing', label: 'Billing', icon: 'admin', path: '/billing', component: Billing, hidden: true },
  { key: 'ownerView', label: 'Owner View', icon: 'admin', path: '/owner', component: OwnerView, ownerOnly: true },
  { key: 'ownerServers', label: 'Global Servers', icon: 'modules', path: '/owner/servers', component: OwnerGlobalServers, ownerOnly: true },
  { key: 'ownerRuntime', label: 'Runtime Monitor', icon: 'admin', path: '/owner/runtime', component: OwnerRuntimeMonitor, ownerOnly: true },
  { key: 'ownerBilling', label: 'Billing Admin', icon: 'admin', path: '/owner/billing', component: OwnerBillingAdmin, ownerOnly: true },
  { key: 'ownerSecurity', label: 'Owner Security', icon: 'admin', path: '/owner/security', component: OwnerSecurityCenter, ownerOnly: true },
  { key: 'ownerPermissionHealth', label: 'Permission Health', icon: 'admin', path: '/owner/permission-health', component: OwnerPermissionHealth, ownerOnly: true },
  { key: 'ownerBackups', label: 'Backup Center', icon: 'admin', path: '/owner/backups', component: OwnerBackupCenter, ownerOnly: true },
  { key: 'ownerDeployments', label: 'Deployment Center', icon: 'modules', path: '/owner/deployments', component: OwnerDeploymentCenter, ownerOnly: true },
  { key: 'ownerForms', label: 'Forms Hub', icon: 'modules', path: '/owner/forms', component: OwnerFormsHub, ownerOnly: true },
  { key: 'ownerTickets', label: 'Tickets Hub', icon: 'modules', path: '/owner/tickets', component: OwnerTicketsHub, ownerOnly: true },
  { key: 'ownerTranslation', label: 'Translation Hub', icon: 'modules', path: '/owner/translation', component: OwnerTranslationHub, ownerOnly: true },
  { key: 'modules', label: 'Modules', icon: 'modules', path: '/modules', component: Modules },
  { key: 'embedStudio', label: 'Embed Studio', icon: 'modules', path: '/embed-studio', component: EmbedStudio, hidden: true },
  { key: 'verification', label: 'Verification', icon: 'modules', path: '/verification', component: Verification, hidden: true },
  { key: 'autoRoles', label: 'Auto Roles', icon: 'modules', path: '/autoroles', component: AutoRoles, hidden: true },
  { key: 'reactionRoles', label: 'Reaction Roles', icon: 'modules', path: '/reaction-roles', component: ReactionRoles, hidden: true },
  { key: 'welcome', label: 'Welcome & Leave', icon: 'messages', path: '/welcome-leave', component: WelcomeLeave, hidden: true },
  { key: 'leveling', label: 'Leveling', icon: 'modules', path: '/leveling', component: Leveling, hidden: true },
  { key: 'forms', label: 'Forms', icon: 'modules', path: '/forms', component: Forms, hidden: true },
  { key: 'giveaways', label: 'Giveaways', icon: 'modules', path: '/giveaways', component: Giveaways, hidden: true },
  { key: 'social', label: 'Social Alerts', icon: 'modules', path: '/social', component: Social, hidden: true },
  { key: 'starboard', label: 'Starboard', icon: 'modules', path: '/starboard', component: Starboard, hidden: true },
  { key: 'sticky', label: 'Sticky Messages', icon: 'modules', path: '/sticky', component: Sticky, hidden: true },
  { key: 'tempVoice', label: 'Temp Voice', icon: 'modules', path: '/tempvoice', component: TempVoice, hidden: true },
  { key: 'tickets', label: 'Tickets', icon: 'modules', path: '/tickets', component: Tickets, hidden: true },
  { key: 'timeline', label: 'Timeline', icon: 'modules', path: '/timeline', component: Timeline, hidden: true },
  { key: 'translation', label: 'Translation', icon: 'modules', path: '/translation', component: Translation, hidden: true },
  { key: 'generalSettings', label: 'General Settings', icon: 'generalSettings', path: '/generalSettings', component: GeneralSettings },
  { key: 'automod', label: 'AutoMod', icon: 'automod', path: '/automod', component: AutoMod },
  { key: 'admin', label: 'Admin', icon: 'admin', path: '/admin', component: Admin },
  { key: 'moderation', label: 'Moderation', icon: 'admin', path: '/moderation', component: Moderation },
  { key: 'cases', label: 'Cases', icon: 'warnings', path: '/cases', component: Cases },
  { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings', component: Warnings },
  { key: 'messages', label: 'Welcome & Leave Legacy', icon: 'messages', path: '/messages', component: Messages },
  { key: 'security', label: 'Security', icon: 'admin', path: '/security', component: Security },
  { key: 'restore', label: 'Restore', icon: 'admin', path: '/restore', component: Restore },
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs', component: Logs },
];

export const navItems = NAV_ITEMS;
export const navBottomItems = NAV_BOTTOM;

export const PAGE_LAYOUTS = {
  overview: { title: 'Overview', description: 'Server insights and activity', sections: [{ id: 'stats', type: 'stats' }, { id: 'activity', type: 'list' }] },
  billing: { title: 'Billing', description: 'Current plan, subscription status and feature entitlements.', emptyDescription: 'Select a server to view billing.', sections: [{ id: 'billingDashboard', type: 'dashboard' }] },
  ownerView: { title: 'Owner View', description: 'Owner-only platform dashboard.', sections: [] },
  ownerServers: { title: 'Global Servers', description: 'Owner-level server registry across all environments.', sections: [] },
  ownerRuntime: { title: 'Runtime Monitor', description: 'Owner-level runtime monitoring across DEV, BETA and PRODUCTION.', sections: [] },
  ownerBilling: { title: 'Billing Admin', description: 'Generate and manage premium access codes.', sections: [] },
  ownerSecurity: { title: 'Owner Security', description: 'Global security centre across all environments.', sections: [] },
  ownerPermissionHealth: { title: 'Permission Health', description: 'Owner-level Goliath access and hierarchy scan.', sections: [] },
  ownerBackups: { title: 'Backup Center', description: 'Owner-level backup and restore monitoring.', sections: [] },
  ownerDeployments: { title: 'Deployment Center', description: 'Deployment queue, history and environment status.', sections: [] },
  ownerForms: { title: 'Forms Hub', description: 'Global forms and submissions overview.', sections: [] },
  ownerTickets: { title: 'Tickets Hub', description: 'Global tickets overview.', sections: [] },
  ownerTranslation: { title: 'Translation Hub', description: 'Global translation system overview.', sections: [] },
  modules: { title: 'Modules', description: 'Optional Goliath features in one scalable grid.', emptyDescription: 'Select a server to view modules.', sections: [{ id: 'modulesGrid', type: 'dashboard' }] },
  embedStudio: { title: 'Embed Studio', description: 'Build, preview and save Discord embeds.', emptyDescription: 'Select a server to manage Embed Studio.', sections: [{ id: 'embedStudioDashboard', type: 'dashboard' }] },
  verification: { title: 'Verification', description: 'Member verification, role settings, panels and analytics.', emptyDescription: 'Select a server to manage verification.', sections: [{ id: 'verificationDashboard', type: 'dashboard' }] },
  autoRoles: { title: 'Auto Roles', description: 'Join roles, bot roles and assignment analytics.', emptyDescription: 'Select a server to manage auto roles.', sections: [{ id: 'autoRolesDashboard', type: 'dashboard' }] },
  reactionRoles: { title: 'Reaction Roles', description: 'Manage role menus, emoji mappings and reaction role panels.', emptyDescription: 'Select a server to manage reaction roles.', sections: [{ id: 'reactionRolesDashboard', type: 'dashboard' }] },
  welcome: { title: 'Welcome & Leave', description: 'Manage welcome, leave and DM welcome messages.', emptyDescription: 'Select a server to manage Welcome & Leave.', sections: [{ id: 'welcomeLeaveDashboard', type: 'dashboard' }] },
  leveling: { title: 'Leveling', description: 'Manage XP, levels, rewards and leaderboards.', emptyDescription: 'Select a server to manage leveling.', sections: [{ id: 'levelingDashboard', type: 'dashboard' }] },
  forms: { title: 'Forms', description: 'Manage universal forms and workflows.', emptyDescription: 'Select a server to manage forms.', sections: [{ id: 'formsManager', type: 'dashboard' }] },
  giveaways: { title: 'Giveaways', description: 'Create, monitor and review server giveaways.', emptyDescription: 'Select a server to manage giveaways.', sections: [{ id: 'giveawaysDashboard', type: 'dashboard' }] },
  social: { title: 'Social Alerts', description: 'Creator alerts across Twitch, YouTube, TikTok, Kick and more.', emptyDescription: 'Select a server to manage social alerts.', sections: [{ id: 'socialDashboard', type: 'dashboard' }] },
  starboard: { title: 'Starboard', description: 'Highlight popular community messages.', emptyDescription: 'Select a server to manage starboard.', sections: [{ id: 'starboardDashboard', type: 'dashboard' }] },
  sticky: { title: 'Sticky Messages', description: 'Keep important messages visible in channels.', emptyDescription: 'Select a server to manage sticky messages.', sections: [{ id: 'stickyDashboard', type: 'dashboard' }] },
  tempVoice: { title: 'Temp Voice', description: 'Manage temporary voice hubs and voice channel automation.', emptyDescription: 'Select a server to manage temp voice.', sections: [{ id: 'tempVoiceDashboard', type: 'dashboard' }] },
  tickets: { title: 'Tickets', description: 'Open tickets, claims, closures, transcripts and analytics.', emptyDescription: 'Select a server to manage tickets.', sections: [{ id: 'ticketsDashboard', type: 'dashboard' }] },
  timeline: { title: 'Timeline', description: 'Review timeline-driven server events and updates.', emptyDescription: 'Select a server to manage timeline.', sections: [{ id: 'timelineDashboard', type: 'dashboard' }] },
  translation: { title: 'Translation', description: 'Manage channels, language preferences and translation settings.', emptyDescription: 'Select a server to manage translation.', sections: [{ id: 'translationDashboard', type: 'dashboard' }] },
  generalSettings: { title: 'General Settings', description: 'Manage server configuration.', emptyDescription: 'Select a server to manage settings.', sections: [{ id: 'generalConfig', type: 'config' }] },
  automod: { title: 'AutoMod', description: 'Manage filters and rules', sections: [{ id: 'rules', type: 'config' }, { id: 'filters', type: 'config' }] },
  admin: { title: 'Admin', description: 'Core system configuration and control panel.', emptyDescription: 'Select a server to manage admin settings.', sections: [{ id: 'adminHub', type: 'future' }] },
  moderation: { title: 'Moderation', description: 'Central moderation tools for this server.', emptyDescription: 'Select a server to manage moderation.', sections: [{ id: 'moderationHub', type: 'future' }] },
  cases: { title: 'Cases', description: 'View moderation case history.', emptyDescription: 'Select a server to view cases.', sections: [{ id: 'caseTable', type: 'table' }] },
  warnings: { title: 'Warnings', description: 'View and manage warning records.', emptyDescription: 'Select a server to view warnings.', sections: [{ id: 'warningTable', type: 'table' }] },
  messages: { title: 'Welcome & Leave Legacy', description: 'Manage join and leave messages.', emptyDescription: 'Select a server to manage messages.', sections: [{ id: 'welcome', type: 'config' }, { id: 'leave', type: 'config' }] },
  security: { title: 'Security Center', description: 'Live protection and recovery overview.', emptyDescription: 'Select a server to view security status.', sections: [{ id: 'securityOverview', type: 'dashboard' }] },
  restore: { title: 'Server Restore', description: 'Preview and restore server backups.', emptyDescription: 'Select a server to restore from backup.', sections: [{ id: 'restoreManager', type: 'config' }] },
  logs: { title: 'Logs', description: 'Manage log channels.', emptyDescription: 'Select a server to manage log channels.', sections: [{ id: 'logManager', type: 'config' }] },
};

export const SECTION_DEFS = {
  stats: { title: 'Server Stats', description: 'Live system and guild status.' },
  activity: { title: 'Recent Activity', description: 'Quick status indicators.' },
  billingDashboard: { title: 'Billing Dashboard', description: 'Current plan, limits and entitlements.' },
  modulesGrid: { title: 'Modules Grid', description: 'Browse optional Goliath features.' },
  embedStudioDashboard: { title: 'Embed Studio', description: 'Build, preview and save Discord embeds.' },
  verificationDashboard: { title: 'Verification Dashboard', description: 'Configure verification roles, panels and analytics.' },
  autoRolesDashboard: { title: 'Auto Roles Dashboard', description: 'Configure join roles, bot roles and analytics.' },
  reactionRolesDashboard: { title: 'Reaction Roles Dashboard', description: 'Configure reaction role panels and emoji mappings.' },
  welcomeLeaveDashboard: { title: 'Welcome & Leave Dashboard', description: 'Configure welcome, leave and DM welcome messages.' },
  levelingDashboard: { title: 'Leveling Dashboard', description: 'Configure XP, levels, rewards and leaderboards.' },
  formsManager: { title: 'Forms Manager', description: 'Create and manage forms.' },
  giveawaysDashboard: { title: 'Giveaways Dashboard', description: 'Create and review server giveaways.' },
  socialDashboard: { title: 'Social Alerts Dashboard', description: 'Manage creator accounts and social notification alerts.' },
  starboardDashboard: { title: 'Starboard Dashboard', description: 'Configure starboard channel and thresholds.' },
  stickyDashboard: { title: 'Sticky Messages Dashboard', description: 'Configure sticky channel messages.' },
  tempVoiceDashboard: { title: 'Temp Voice Dashboard', description: 'Configure temporary voice hubs and settings.' },
  ticketsDashboard: { title: 'Tickets Dashboard', description: 'Review ticket queues, claims, transcripts and analytics.' },
  timelineDashboard: { title: 'Timeline Dashboard', description: 'Review and manage timeline events.' },
  translationDashboard: { title: 'Translation Dashboard', description: 'Configure translation channels and preferences.' },
  rules: { title: 'Rules', description: 'Manage core automod rules.' },
  filters: { title: 'Filters', description: 'Manage filters and logs.' },
  caseTable: { title: 'Cases', description: 'Browse moderation case history.' },
  warningTable: { title: 'Warnings', description: 'Browse warning history.' },
  welcome: { title: 'Welcome Message', description: 'Configure the welcome message.' },
  leave: { title: 'Leave Message', description: 'Configure the leave message.' },
  generalConfig: { title: 'General Config', description: 'Core server configuration.' },
  securityOverview: { title: 'Security Overview', description: 'Live protection status.' },
  restoreManager: { title: 'Restore Manager', description: 'Preview and restore backups.' },
  logManager: { title: 'Log Manager', description: 'Choose log channels.' },
};
