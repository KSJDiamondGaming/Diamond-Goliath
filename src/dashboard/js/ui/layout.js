import Overview from '../pages/Overview';
import AutoMod from '../pages/AutoMod';
import Admin from '../pages/Admin';
import Moderation from '../pages/Moderation';
import GeneralSettings from '../pages/GeneralSettings';
import Cases from '../pages/Cases';
import Warnings from '../pages/Warnings';
import Messages from '../pages/Messages';
import Forms from '../pages/Forms';
import Restore from '../pages/Restore';
import Security from '../pages/Security';
import Logs from '../pages/Logs';
import OwnerGlobalView from '../pages/OwnerGlobalView';

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
  {
    key: 'overview',
    label: 'Overview',
    icon: 'overview',
    path: '/overview',
  },

  {
    key: 'admin',
    label: 'Admin',
    icon: 'admin',

    children: [
      {
        key: 'generalSettings',
        label: 'General Settings',
        icon: 'generalSettings',
        path: '/generalSettings',
      },

      {
        key: 'automod',
        label: 'Auto Mod',
        icon: 'automod',
        path: '/automod',
      },

      {
        key: 'adminPage',
        label: 'Admin',
        icon: 'admin',
        path: '/admin',
      },

      {
        key: 'moderation',
        label: 'Moderation',
        icon: 'admin',
        path: '/moderation',
      },
    ],
  },

  {
    key: 'modules',
    label: 'Modules',
    icon: 'modules',

    children: [
      {
        key: 'cases',
        label: 'Cases',
        icon: 'cases',
        path: '/cases',
      },

      {
        key: 'warnings',
        label: 'Warnings',
        icon: 'warnings',
        path: '/warnings',
      },

      {
        key: 'messages',
        label: 'Welcome & Leave',
        icon: 'messages',
        path: '/messages',
      },

      {
        key: 'forms',
        label: 'Forms',
        icon: 'modules',
        path: '/forms',
      },
    ],
  },
];

export const NAV_BOTTOM = [
  {
    key: 'securityCenter',
    label: 'Security Center',
    icon: 'admin',

    children: [
      {
        key: 'security',
        label: 'Security',
        icon: 'admin',
        path: '/security',
      },

      {
        key: 'restore',
        label: 'Restore',
        icon: 'admin',
        path: '/restore',
      },
    ],
  },

  {
    key: 'logs',
    label: 'Logs',
    icon: 'logs',
    path: '/logs',
  },
];

export const ROUTES = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'overview',
    path: '/overview',
    component: Overview,
  },

  {
    key: 'ownerView',
    label: 'Owner View',
    icon: 'admin',
    path: '/owner',
    component: OwnerGlobalView,
    ownerOnly: true,
  },

  {
    key: 'generalSettings',
    label: 'General Settings',
    icon: 'generalSettings',
    path: '/generalSettings',
    component: GeneralSettings,
  },

  {
    key: 'automod',
    label: 'Auto Mod',
    icon: 'automod',
    path: '/automod',
    component: AutoMod,
  },

  {
    key: 'admin',
    label: 'Admin',
    icon: 'admin',
    path: '/admin',
    component: Admin,
  },

  {
    key: 'moderation',
    label: 'Moderation',
    icon: 'admin',
    path: '/moderation',
    component: Moderation,
  },

  {
    key: 'cases',
    label: 'Cases',
    icon: 'cases',
    path: '/cases',
    component: Cases,
  },

  {
    key: 'warnings',
    label: 'Warnings',
    icon: 'warnings',
    path: '/warnings',
    component: Warnings,
  },

  {
    key: 'messages',
    label: 'Welcome & Leave',
    icon: 'messages',
    path: '/messages',
    component: Messages,
  },

  {
    key: 'forms',
    label: 'Forms',
    icon: 'modules',
    path: '/forms',
    component: Forms,
  },

  {
    key: 'security',
    label: 'Security',
    icon: 'admin',
    path: '/security',
    component: Security,
  },

  {
    key: 'restore',
    label: 'Restore',
    icon: 'admin',
    path: '/restore',
    component: Restore,
  },

  {
    key: 'logs',
    label: 'Logs',
    icon: 'logs',
    path: '/logs',
    component: Logs,
  },
];

export const navItems = NAV_ITEMS;
export const navBottomItems = NAV_BOTTOM;

export const PAGE_LAYOUTS = {
  overview: {
    title: 'Overview',
    description: 'Server insights & activity',

    sections: [
      {
        id: 'stats',
        type: 'stats',
      },

      {
        id: 'activity',
        type: 'list',
      },
    ],
  },

  ownerView: {
    title: 'Owner View',
    description: 'KSJ-only administrative access across Goliath deployments.',
    sections: [],
  },

  generalSettings: {
    title: 'General Settings',

    description:
      'Manage dashboard and server configuration for the selected server.',

    emptyDescription:
      'Select a server to manage settings.',

    sections: [
      {
        id: 'generalConfig',
        type: 'config',
      },
    ],
  },

  automod: {
    title: 'AutoMod',
    description: 'Manage filters & rules',

    sections: [
      {
        id: 'rules',
        type: 'config',
      },

      {
        id: 'filters',
        type: 'config',
      },
    ],
  },

  admin: {
    title: 'Admin',

    description:
      'Core system configuration and control panel.',

    emptyDescription:
      'Select a server to manage admin settings.',

    sections: [
      {
        id: 'adminHub',
        type: 'future',
      },
    ],
  },

  moderation: {
    title: 'Moderation',

    description:
      'Central moderation tools & controls for this server.',

    emptyDescription:
      'Select a server to manage moderation.',

    sections: [
      {
        id: 'moderationHub',
        type: 'future',
      },
    ],
  },

  cases: {
    title: 'Cases',
    description: 'Moderation history',

    sections: [
      {
        id: 'caseTable',
        type: 'table',
      },
    ],
  },

  warnings: {
    title: 'Warnings',

    description:
      'View and manage warning records for the selected server.',

    emptyDescription:
      'Select a server to view warnings.',

    sections: [
      {
        id: 'warningTable',
        type: 'table',
      },
    ],
  },

  messages: {
    title: 'Welcome & Leave',

    description:
      'Manage join and leave messages for the selected server.',

    emptyDescription:
      'Select a server to manage welcome and leave messages.',

    sections: [
      {
        id: 'welcome',
        type: 'config',
      },

      {
        id: 'leave',
        type: 'config',
      },
    ],
  },

  forms: {
    title: 'Forms',

    description:
      'Manage universal forms for appeals, applications, reports, support and custom workflows.',

    emptyDescription:
      'Select a server to manage forms.',

    sections: [
      {
        id: 'formsManager',
        type: 'dashboard',
      },
    ],
  },

  security: {
    title: 'Security Center',

    description:
      'Live anti-nuke, incidents, lockdowns, quarantines, and recovery systems.',

    emptyDescription:
      'Select a server to view security status.',

    sections: [
      {
        id: 'securityOverview',
        type: 'dashboard',
      },
    ],
  },

  restore: {
    title: 'Server Restore',

    description:
      'Preview and safely restore server backups.',

    emptyDescription:
      'Select a server to restore from backup.',

    sections: [
      {
        id: 'restoreManager',
        type: 'config',
      },
    ],
  },

  logs: {
    title: 'Logs',

    description:
      'Manage log channels for the selected guild.',

    emptyDescription:
      'Select a server to manage log channels.',

    sections: [
      {
        id: 'logManager',
        type: 'config',
      },
    ],
  },
};

export const SECTION_DEFS = {
  stats: {
    title: 'Server Stats',

    description:
      'Live system, guild, and moderation status for the selected server.',
  },

  activity: {
    title: 'Recent Activity',

    description:
      'Quick visual indicators for moderation health and performance.',
  },

  rules: {
    title: 'Rules',
    description: 'Manage core automod rules.',
  },

  filters: {
    title: 'Filters',

    description:
      'Manage filters, bad words, repeated messages, and logs.',
  },

  caseTable: {
    title: 'Cases',

    description:
      'Browse case history and open a record to inspect full moderation details.',
  },

  warningTable: {
    title: 'Warnings',

    description:
      'Browse warning history and open a record to inspect full details.',
  },

  welcome: {
    title: 'Welcome Message',

    description:
      'Configure the welcome message sent when a new user joins.',
  },

  leave: {
    title: 'Leave Message',

    description:
      'Configure the leave message sent when a user leaves the server.',
  },

  formsManager: {
    title: 'Forms Manager',

    description:
      'Create, edit, disable and connect universal forms to ticket workflows.',
  },

  generalConfig: {
    title: 'General Config',

    description:
      'Core dashboard, moderation, and server-wide configuration.',
  },

  securityOverview: {
    title: 'Security Overview',

    description:
      'Live protection status, threat monitoring, incidents, and recovery systems.',
  },

  restoreManager: {
    title: 'Restore Manager',

    description:
      'Preview backup contents, confirm restore actions, and safely recover server structure.',
  },

  logManager: {
    title: 'Log Manager',

    description:
      'Choose which channel each log group should use.',
  },
};
