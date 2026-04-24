// ==============================
// KSJ GOLIATH - UI SYSTEM
// ==============================

import Overview from './pages/Overview';
import Cases from './pages/Cases';
import Warnings from './pages/Warnings';
import AutoMod from './pages/AutoMod';
import Config from './pages/Config';
import Messages from './pages/Messages';
import Logs from './pages/Logs';

// ------------------------------
// LAYOUT CONSTANTS
// ------------------------------
export const DASHBOARD_LAYOUT = {
  sidebarExpandedWidth: '280px',
  sidebarCollapsedWidth: '72px',
  topBarHeight: '72px',
  pageGap: '20px',
  cardRadius: '20px',
  cardPadding: '24px',
  sectionPadding: '18px',
};

// ------------------------------
// THEME
// ------------------------------
export function createTheme(darkMode = true) {
  return {
    mode: darkMode ? 'dark' : 'light',

    pageBg: darkMode ? '#0b1220' : '#f3f4f6',

    sidebarBg: darkMode
      ? 'linear-gradient(180deg, #111827 0%, #0f172a 100%)'
      : '#1f2937',
    sidebarBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    sidebarText: '#e5e7eb',
    sidebarMuted: darkMode ? '#94a3b8' : '#9ca3af',

    topbarBg: darkMode ? 'rgba(10, 17, 31, 0.84)' : 'rgba(255,255,255,0.88)',
    topbarBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    topbarSoft: darkMode ? 'rgba(255,255,255,0.035)' : 'rgba(17,24,39,0.03)',
    topbarSoftBorder: darkMode ? 'rgba(148,163,184,0.1)' : '#e5e7eb',

    cardBg: darkMode ? '#111827' : '#ffffff',
    cardBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    cardText: darkMode ? '#f8fafc' : '#111827',
    mutedText: darkMode ? '#94a3b8' : '#6b7280',

    softBg: darkMode ? '#0f172a' : '#f9fafb',

    inputBg: darkMode ? '#1f2937' : '#ffffff',
    inputText: darkMode ? '#f8fafc' : '#111827',
    inputBorder: darkMode ? 'rgba(148, 163, 184, 0.14)' : '#d1d5db',

    dropdownBg: darkMode ? 'rgba(17,24,39,0.97)' : 'rgba(255,255,255,0.98)',
    menuBorder: darkMode ? 'rgba(148, 163, 184, 0.12)' : '#e5e7eb',

    primary: '#3b82f6',
    primarySoft: 'rgba(59,130,246,0.16)',
    primaryBorder: 'rgba(59,130,246,0.28)',

    success: '#22c55e',
    successSoft: 'rgba(34,197,94,0.14)',
    successText: darkMode ? '#86efac' : '#166534',
    successBorder: 'rgba(34,197,94,0.26)',

    warning: '#f59e0b',
    warningSoft: 'rgba(245,158,11,0.14)',
    warningText: darkMode ? '#fcd34d' : '#92400e',
    warningBorder: 'rgba(245,158,11,0.26)',

    danger: '#ef4444',
    dangerSoft: 'rgba(239,68,68,0.12)',
    dangerText: darkMode ? '#fca5a5' : '#b91c1c',
    dangerBorder: 'rgba(239,68,68,0.28)',

    shadow: darkMode
      ? '0 10px 30px rgba(0,0,0,0.22)'
      : '0 10px 30px rgba(0,0,0,0.08)',
  };
}

export const getTheme = createTheme;

// ------------------------------
// NAV + ROUTES
// ------------------------------
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
      { key: 'config', label: 'General Settings', icon: 'config', path: '/config' },
      { key: 'automod', label: 'Auto Mod', icon: 'automod', path: '/automod' },
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
  { key: 'logs', label: 'Logs', icon: 'logs', path: '/logs' },
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
    key: 'config',
    label: 'General Settings',
    icon: 'config',
    path: '/config',
    component: Config,
  },
  {
    key: 'automod',
    label: 'Auto Mod',
    icon: 'automod',
    path: '/automod',
    component: AutoMod,
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
    key: 'logs',
    label: 'Logs',
    icon: 'logs',
    path: '/logs',
    component: Logs,
  },
];

export const navItems = NAV_ITEMS;
export const navBottomItems = NAV_BOTTOM;

// ------------------------------
// PAGE STRUCTURE
// ------------------------------
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
    sections: [
      { id: 'rules', type: 'config' },
      { id: 'filters', type: 'config' },
    ],
  },

  cases: {
    title: 'Cases',
    description: 'Moderation history',
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

  logs: {
    title: 'Logs',
    description: 'Assign log channels for the selected server and filter log groups quickly.',
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
  logManager: {
    title: 'Log Manager',
    description: 'Choose which channel each log group should use.',
  },
};

// ------------------------------
// GLOBAL STYLES
// ------------------------------
export function appBaseStyles(theme) {
  return {
    app: {
      minHeight: '100vh',
      background: theme.pageBg,
      color: theme.cardText,
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    globalCss: `
      * { box-sizing: border-box; }
      html, body, #root {
        margin: 0;
        padding: 0;
        min-height: 100%;
        width: 100%;
        background: ${theme.pageBg};
        overflow-x: hidden;
      }
      body {
        color: ${theme.cardText};
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button, input, select, textarea {
        font: inherit;
      }
      img {
        max-width: 100%;
      }
    `,
  };
}

// ------------------------------
// SHELL
// ------------------------------
export function shellStyles(theme, { sidebarExpanded = true } = {}) {
  return {
    app: {
      minHeight: '100vh',
      background: theme.pageBg,
      color: theme.cardText,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: `${
        sidebarExpanded
          ? DASHBOARD_LAYOUT.sidebarExpandedWidth
          : DASHBOARD_LAYOUT.sidebarCollapsedWidth
      } minmax(0, 1fr)`,
      minHeight: '100vh',
      transition: 'grid-template-columns 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
    },
    mainColumn: {
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    },
    main: {
      flex: 1,
      minWidth: 0,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    pageLoader: {
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: DASHBOARD_LAYOUT.cardRadius,
      padding: DASHBOARD_LAYOUT.cardPadding,
      color: theme.cardText,
      boxShadow: theme.shadow,
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
    },
  };
}

// ------------------------------
// NAVBAR
// ------------------------------
export function navbarStyles(theme) {
  return {
    root(expanded = true) {
      return {
        minHeight: '100vh',
        background: theme.sidebarBg,
        borderRight: `1px solid ${theme.sidebarBorder}`,
        padding: expanded ? '8px' : '8px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflow: 'hidden',
      };
    },
    top: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    middle: {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      overflow: 'hidden',
    },
    bottom: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '4px',
    },
    guildWrap: {
      display: 'grid',
      gap: '8px',
    },
    guildSelectWrap: {
      position: 'relative',
      width: '100%',
    },
    guildSelect(canPickGuild = true) {
      return {
        width: '100%',
        minHeight: '42px',
        padding: '10px 38px 10px 12px',
        borderRadius: '12px',
        border: `1px solid ${theme.inputBorder}`,
        background: theme.inputBg,
        color: theme.inputText,
        appearance: 'none',
        outline: 'none',
        cursor: canPickGuild ? 'pointer' : 'not-allowed',
      };
    },
    guildChevron: {
      position: 'absolute',
      top: '50%',
      right: '12px',
      transform: 'translateY(-50%)',
      color: theme.mutedText,
      fontSize: '13px',
      lineHeight: 1,
      pointerEvents: 'none',
    },
    guildMini: {
      width: '42px',
      height: '42px',
      borderRadius: '14px',
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      boxShadow: theme.shadow,
      margin: '0 auto',
    },
    guildMiniAvatar: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    guildMiniFallback: {
      fontWeight: 800,
      color: theme.cardText,
      fontSize: '14px',
    },
    guildError: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.5,
      color: theme.dangerText,
    },
    nav: {
      display: 'grid',
      gap: '8px',
      alignContent: 'start',
      overflowY: 'auto',
      paddingRight: '2px',
    },
    navItem(active = false, expanded = true, canNavigate = true) {
      return {
        width: '100%',
        minHeight: '44px',
        padding: expanded ? '10px 12px' : '10px',
        borderRadius: '14px',
        border: active ? `1px solid ${theme.primaryBorder}` : '1px solid transparent',
        background: active ? theme.primarySoft : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: '10px',
        color: active ? '#93c5fd' : theme.sidebarText,
        cursor: canNavigate ? 'pointer' : 'not-allowed',
        textAlign: 'left',
        fontSize: '14px',
        fontWeight: active ? 700 : 600,
        opacity: canNavigate ? 1 : 0.5,
        transition:
          'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease',
        outline: 'none',
        appearance: 'none',
      };
    },
    navIcon: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      flexShrink: 0,
    },
    navLabel: {
      minWidth: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },

    collapseButton(isHovered = false) {
      return {
        width: '36px',
        height: '36px',
        borderRadius: '999px',
        border: `1px solid ${isHovered ? theme.primaryBorder : theme.topbarSoftBorder}`,
        background: isHovered ? theme.softBg : theme.topbarSoft,
        color: theme.sidebarText,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        boxShadow: isHovered ? theme.shadow : '0 6px 18px rgba(0,0,0,0.16)',
        transition:
          'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
      };
    },
    collapseButtonIcon: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      lineHeight: 1,
    },
    collapseButtonGlyph(expanded = true) {
      return expanded ? '🔓' : '🔒';
    },
  };
}

// ------------------------------
// BOT AVATAR
// ------------------------------
export function botAvatarStyles(theme) {
  return {
    wrap(expanded = true) {
      return {
        width: '100%',
        minHeight: '44px',
        padding: expanded ? '10px 12px' : '8px',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: '10px',
        background: theme.topbarSoft,
        border: `1px solid ${theme.topbarSoftBorder}`,
        boxShadow: theme.shadow,
      };
    },
    avatar: {
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      objectFit: 'cover',
      display: 'block',
      flexShrink: 0,
    },
    fallback: {
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      background: theme.softBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 900,
      fontSize: '14px',
      color: theme.cardText,
      flexShrink: 0,
    },
    label: {
      minWidth: 0,
      fontWeight: 800,
      fontSize: '14px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: theme.sidebarText,
    },
  };
}

// ------------------------------
// TOPBAR
// ------------------------------
export function topbarStyles(theme) {
  return {
    root: {
      position: 'sticky',
      top: 0,
      zIndex: 20,
      backdropFilter: 'blur(10px)',
      background: theme.topbarBg,
      borderBottom: `1px solid ${theme.topbarBorder}`,
    },
    inner: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: '14px',
      padding: '14px 24px',
    },
    left: {},
    actionsWrap: {
      justifySelf: 'end',
      position: 'relative',
      display: 'inline-grid',
      justifyItems: 'stretch',
    },
    userButton(isActive = false) {
      return {
        minWidth: '240px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '46px',
        padding: '6px 10px 6px 12px',
        background: isActive ? theme.softBg : theme.topbarSoft,
        border: `1px solid ${isActive ? theme.primaryBorder : theme.topbarSoftBorder}`,
        borderRadius: '14px',
        color: theme.cardText,
        cursor: 'pointer',
        transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: isActive ? theme.shadow : 'none',
        transition:
          'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
      };
    },
    userText: {
      textAlign: 'right',
      minWidth: 0,
      flex: 1,
    },
    userName: {
      fontSize: '14px',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    chevron(isOpen = false) {
      return {
        color: theme.mutedText,
        fontSize: '13px',
        lineHeight: 1,
        flexShrink: 0,
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.18s ease, color 0.18s ease',
      };
    },
    avatar: {
      width: '34px',
      height: '34px',
      borderRadius: '50%',
      objectFit: 'cover',
      flexShrink: 0,
    },
    avatarFallback: {
      width: '34px',
      height: '34px',
      borderRadius: '50%',
      background: theme.softBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      flexShrink: 0,
    },
    menu: {
      position: 'absolute',
      top: '58px',
      right: 0,
      width: '100%',
      minWidth: '100%',
      background: theme.dropdownBg,
      border: `1px solid ${theme.primaryBorder}`,
      borderRadius: '18px',
      boxShadow: theme.shadow,
      padding: '10px',
      display: 'grid',
      gap: '8px',
      backdropFilter: 'blur(12px)',
    },
    menuButton(isHovered = false) {
      return {
        width: '100%',
        minHeight: '44px',
        padding: '11px 12px',
        borderRadius: '13px',
        border: `1px solid ${isHovered ? theme.primaryBorder : 'transparent'}`,
        background: isHovered ? theme.primarySoft : 'transparent',
        color: isHovered ? '#bfdbfe' : theme.cardText,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'left',
        fontSize: '14px',
        fontWeight: 800,
        transition:
          'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
        transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
      };
    },
    menuButtonIcon: {
      width: '22px',
      height: '22px',
      borderRadius: '9px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'inherit',
      flexShrink: 0,
      background: theme.topbarSoft,
      border: `1px solid ${theme.topbarSoftBorder}`,
      fontSize: '13px',
    },
    menuButtonLabel: {
      minWidth: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    themeRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '12px',
      borderRadius: '14px',
      border: `1px solid ${theme.topbarSoftBorder}`,
      background: theme.topbarSoft,
    },
    themeCopy: {
      display: 'grid',
      gap: '2px',
    },
    themeLabel: {
      fontSize: '14px',
      fontWeight: 800,
      color: theme.cardText,
    },
    themeSwitch(_isLight = false, isHovered = false) {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: `1px solid ${isHovered ? theme.primaryBorder : theme.topbarSoftBorder}`,
        background: 'transparent',
        borderRadius: '999px',
        cursor: 'pointer',
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: isHovered ? theme.shadow : 'none',
      };
    },
    themeSwitchTrack: {
      position: 'relative',
      width: '72px',
      height: '36px',
      borderRadius: '999px',
      background: theme.softBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 10px',
      overflow: 'hidden',
    },
    themeIconLeft: {
      position: 'relative',
      zIndex: 2,
      fontSize: '14px',
      lineHeight: 1,
      color: theme.mutedText,
      userSelect: 'none',
      pointerEvents: 'none',
    },
    themeIconRight: {
      position: 'relative',
      zIndex: 2,
      fontSize: '14px',
      lineHeight: 1,
      color: theme.mutedText,
      userSelect: 'none',
      pointerEvents: 'none',
    },
    themeThumb(isLight = false) {
      return {
        position: 'absolute',
        top: '3px',
        left: isLight ? '39px' : '3px',
        width: '30px',
        height: '30px',
        borderRadius: '999px',
        background: theme.cardBg,
        border: `1px solid ${theme.topbarSoftBorder}`,
        boxShadow: theme.shadow,
        transition: 'left 0.22s ease, background 0.22s ease, border-color 0.22s ease',
      };
    },
    logoutButton(isHovered = false) {
      return {
        width: '100%',
        padding: '12px 14px',
        borderRadius: '14px',
        border: `1px solid ${theme.dangerBorder}`,
        background: isHovered ? 'rgba(239,68,68,0.2)' : theme.dangerSoft,
        color: theme.dangerText,
        cursor: 'pointer',
        fontWeight: 900,
        fontSize: '14px',
        transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
        transition:
          'transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease',
        boxShadow: isHovered ? theme.shadow : 'none',
      };
    },
  };
}

// ------------------------------
// LOGIN PAGE
// ------------------------------
export function loginPageStyles(theme) {
  return {
    page: {
      minHeight: 'calc(100vh - 120px)',
      display: 'grid',
      placeItems: 'center',
      padding: '24px 0 8px',
    },
    card: {
      width: '100%',
      maxWidth: '920px',
      display: 'grid',
    },
    root: {
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '24px',
      padding: '18px 24px',
      boxShadow: theme.shadow,
      display: 'grid',
      gap: '12px',
      alignContent: 'center',
    },
    guildRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      minWidth: 0,
      flexWrap: 'wrap',
    },
    guildAvatar: {
      width: '56px',
      height: '56px',
      borderRadius: '18px',
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.cardText,
      fontWeight: 900,
      fontSize: '22px',
      flexShrink: 0,
      boxShadow: theme.shadow,
    },
    guildInfo: {
      minWidth: 0,
      display: 'grid',
      gap: '6px',
    },
    title: {
      fontSize: 'clamp(28px, 3.4vw, 38px)',
      lineHeight: 1.04,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: theme.cardText,
      wordBreak: 'break-word',
      margin: 0,
    },
    metaRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
    },
    metaPill: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      minHeight: '30px',
      padding: '6px 10px',
      borderRadius: '999px',
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      color: theme.mutedText,
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.02em',
    },
    text: {
      maxWidth: '720px',
      fontSize: '15px',
      lineHeight: 1.6,
      color: theme.mutedText,
      margin: 0,
    },
    loginButton: {
      marginTop: '2px',
      padding: '14px 18px',
      borderRadius: '14px',
      border: `1px solid ${theme.primaryBorder}`,
      background: theme.primarySoft,
      color: '#ffffff',
      fontWeight: 800,
      cursor: 'pointer',
      transition: 'transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease',
      justifySelf: 'start',
    },
  };
}

// ------------------------------
// OVERVIEW PAGE SYSTEM
// ------------------------------
export const OVERVIEW_UI = {
  hero: {
    fallbackTitle: 'KSJ DIAMOND GAMING',
    subtitle: 'Manage your server configurations.',
    minHeight: '142px',
  },

  cards: {
    statGridMin: '220px',
    snapshotGridMin: '210px',
    chartGridMin: '280px',
    topStatHeight: '92px',
    snapshotHeight: '82px',
  },

  labels: {
    guildId: 'Guild ID',
    overviewTitle: 'Overview',
    overviewSubtitle: 'Guild Stats',
    moderationTitle: 'Moderation Snapshot',
    moderationSubtitle:
      'A breakdown of current warning records and moderation activity for this guild.',
    chartsTitle: 'Live Charts',
    chartsSubtitle: 'Quick visual indicators for health, moderation, and performance.',
    totalCases: 'Total Cases',
    totalWarnings: 'Total Warnings',
    activeWarnings: 'Active Warnings',
    clearedWarnings: 'Cleared Warnings',
  },

  topStats: [
    {
      key: 'botStatus',
      label: 'Bot Status',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
      successColorKey: 'success',
      dangerColorKey: 'danger',
    },
    {
      key: 'backend',
      label: 'Backend',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
      successColorKey: 'success',
      dangerColorKey: 'danger',
    },
    {
      key: 'apiStatus',
      label: 'API Status',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
      successColorKey: 'success',
      dangerColorKey: 'danger',
    },
    {
      key: 'members',
      label: 'Members',
      type: 'metric',
      format: 'number',
    },
    {
      key: 'bots',
      label: 'Bots',
      type: 'metric',
      format: 'number',
    },
  ],

  chartGroups: [
    {
      key: 'system',
      title: 'System',
      subtitle: 'Backend, API, Bot',
      bars: [
        { key: 'backend', label: 'Backend', valueKey: 'backendScore', format: 'integer' },
        { key: 'api', label: 'API', valueKey: 'apiScore', format: 'integer' },
        { key: 'bot', label: 'Bot', valueKey: 'botScore', format: 'integer' },
      ],
    },
    {
      key: 'moderation',
      title: 'Moderation',
      subtitle: 'Cases and warnings',
      bars: [
        { key: 'cases', label: 'Cases', valueKey: 'totalCases', format: 'integer' },
        { key: 'warnings', label: 'Warnings', valueKey: 'totalWarnings', format: 'integer' },
        { key: 'active', label: 'Active', valueKey: 'activeWarnings', format: 'integer' },
        { key: 'cleared', label: 'Cleared', valueKey: 'clearedWarnings', format: 'integer' },
      ],
    },
    {
      key: 'performance',
      title: 'Performance',
      subtitle: 'Latency, request speed, humans, bots',
      bars: [
        { key: 'latency', label: 'Latency', valueKey: 'latencyMs', format: 'integer' },
        { key: 'request', label: 'Request', valueKey: 'requestRate', format: 'integer' },
        { key: 'members', label: 'Members', valueKey: 'members', format: 'integer' },
        { key: 'bots', label: 'Bots', valueKey: 'bots', format: 'integer' },
      ],
    },
  ],
};

function clampOverviewNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function truthyOnline(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['online', 'up', 'ok', 'healthy', 'connected', 'ready', 'true'].includes(normalized)) {
      return true;
    }

    if (['offline', 'down', 'error', 'disconnected', 'false'].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === 'number') return value > 0;

  return defaultValue;
}

function getSafeObjectSize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.keys(value).length;
}

export function buildOverviewMetrics({
  selectedGuild = '',
  selectedGuildData = null,
  statusData = null,
  casesData = null,
  warningsData = null,
} = {}) {
  const nestedGuildData =
    selectedGuild && statusData?.guilds && typeof statusData.guilds === 'object'
      ? statusData.guilds[selectedGuild] || null
      : null;

  const guildName =
    selectedGuildData?.name ||
    statusData?.guildName ||
    statusData?.guild?.name ||
    nestedGuildData?.name ||
    OVERVIEW_UI.hero.fallbackTitle;

  const guildId =
    selectedGuildData?.id ||
    statusData?.guildId ||
    statusData?.guild?.id ||
    nestedGuildData?.id ||
    selectedGuild ||
    '—';

  const members =
    clampOverviewNumber(statusData?.humans, NaN) ||
    clampOverviewNumber(statusData?.guild?.humans, NaN) ||
    clampOverviewNumber(nestedGuildData?.humans, NaN) ||
    clampOverviewNumber(statusData?.members, NaN) ||
    clampOverviewNumber(statusData?.memberCount, NaN) ||
    clampOverviewNumber(statusData?.guild?.memberCount, NaN) ||
    clampOverviewNumber(nestedGuildData?.memberCount, NaN) ||
    clampOverviewNumber(selectedGuildData?.approximateMemberCount, 0) ||
    0;

  const bots =
    clampOverviewNumber(statusData?.bots, NaN) ||
    clampOverviewNumber(statusData?.guild?.bots, NaN) ||
    clampOverviewNumber(nestedGuildData?.bots, 0) ||
    0;

  const totalCases = Array.isArray(casesData)
    ? casesData.length
    : Array.isArray(casesData?.cases)
      ? casesData.cases.length
      : clampOverviewNumber(casesData?.total, NaN) ||
        clampOverviewNumber(casesData?.count, 0);

  const warningsArray = Array.isArray(warningsData)
    ? warningsData
    : Array.isArray(warningsData?.warnings)
      ? warningsData.warnings
      : [];

  const totalWarnings = Array.isArray(warningsData)
    ? warningsData.length
    : Array.isArray(warningsData?.warnings)
      ? warningsData.warnings.length
      : clampOverviewNumber(warningsData?.total, NaN) ||
        clampOverviewNumber(warningsData?.count, 0);

  const activeWarnings =
    warningsArray.length > 0
      ? warningsArray.filter((warning) => warning?.cleared !== true).length
      : clampOverviewNumber(warningsData?.active, 0);

  const clearedWarnings =
    warningsArray.length > 0
      ? warningsArray.filter((warning) => warning?.cleared === true).length
      : clampOverviewNumber(warningsData?.cleared, 0);

  const latencyMs =
    clampOverviewNumber(statusData?.latency, NaN) ||
    clampOverviewNumber(statusData?.latencyMs, NaN) ||
    clampOverviewNumber(statusData?.botLatencyMs, NaN) ||
    clampOverviewNumber(statusData?.ping, NaN) ||
    clampOverviewNumber(statusData?.wsPing, 106) ||
    106;

  const requestRate =
    clampOverviewNumber(statusData?.requestRate, NaN) ||
    clampOverviewNumber(statusData?.requestsPerMinute, NaN) ||
    clampOverviewNumber(statusData?.apiRequests, NaN) ||
    clampOverviewNumber(statusData?.requests, 15) ||
    15;

  const botOnline = truthyOnline(
    statusData?.botOnline ?? statusData?.botStatus ?? statusData?.bot?.online,
    true,
  );

  const backendOnline = truthyOnline(
    statusData?.backendOnline ?? statusData?.backendStatus ?? statusData?.backend?.online,
    true,
  );

  const apiOnline = truthyOnline(
    statusData?.apiOnline ?? statusData?.apiStatus ?? statusData?.api?.online,
    true,
  );

  const botScore = botOnline ? 100 : 0;
  const backendScore = backendOnline ? 100 : 0;
  const apiScore = apiOnline ? 100 : 0;

  return {
    guildName,
    guildId,
    members,
    bots,
    botOnline,
    backendOnline,
    apiOnline,
    totalCases,
    totalWarnings,
    activeWarnings,
    clearedWarnings,
    latencyMs,
    requestRate,
    botScore,
    backendScore,
    apiScore,
  };
}

export function createOverviewPageStyles(theme) {
  const baseCard = {
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: DASHBOARD_LAYOUT.cardRadius,
    boxShadow: theme.shadow,
  };

  return {
    page: {
      display: 'grid',
      gap: '20px',
    },

    hero: {
      ...baseCard,
      position: 'relative',
      overflow: 'hidden',
      minHeight: OVERVIEW_UI.hero.minHeight,
      padding: '22px 24px',
      display: 'grid',
      alignContent: 'center',
      gap: '10px',
      background: `linear-gradient(120deg, ${theme.cardBg} 0%, ${theme.cardBg} 55%, rgba(59,130,246,0.16) 100%)`,
    },

    heroGlow: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: 'radial-gradient(circle at 85% 50%, rgba(96,165,250,0.22), transparent 34%)',
    },

    heroTitle: {
      margin: 0,
      position: 'relative',
      zIndex: 1,
      fontSize: 'clamp(30px, 4vw, 56px)',
      lineHeight: 0.94,
      fontWeight: 950,
      letterSpacing: '-0.045em',
      color: theme.cardText,
      textTransform: 'uppercase',
      textShadow: '0 3px 0 rgba(0,0,0,0.28)',
      wordBreak: 'break-word',
    },

    heroMeta: {
      position: 'relative',
      zIndex: 1,
      display: 'grid',
      gap: '8px',
    },

    heroMetaText: {
      margin: 0,
      fontSize: '15px',
      lineHeight: 1.45,
      color: theme.mutedText,
      fontWeight: 600,
    },

    sectionCard: {
      ...baseCard,
      padding: '20px',
      display: 'grid',
      gap: '18px',
    },

    sectionHeadingWrap: {
      display: 'grid',
      gap: '8px',
    },

    sectionTitle: {
      margin: 0,
      fontSize: 'clamp(24px, 3vw, 38px)',
      lineHeight: 1,
      fontWeight: 950,
      letterSpacing: '-0.04em',
      color: theme.cardText,
      textShadow: '0 2px 0 rgba(0,0,0,0.24)',
    },

    sectionSubtitle: {
      margin: 0,
      fontSize: '15px',
      lineHeight: 1.55,
      color: theme.mutedText,
      maxWidth: '900px',
    },

    topStatsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '16px',
      alignItems: 'stretch',
    },

    topStatsGridItem: () => ({
      minWidth: 0,
      gridColumn: 'span 1',
    }),

    topStatCard: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '18px',
      minHeight: OVERVIEW_UI.cards.topStatHeight,
      padding: '18px 20px',
      display: 'grid',
      alignContent: 'space-between',
      gap: '10px',
    },

    topStatLabel: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.2,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: theme.mutedText,
    },

    topStatValueRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
    },

    statusDot: (color) => ({
      width: '10px',
      height: '10px',
      borderRadius: '999px',
      background: color,
      boxShadow: `0 0 0 4px ${color}22`,
      flexShrink: 0,
    }),

    topStatValue: (color = theme.cardText) => ({
      margin: 0,
      fontSize: '22px',
      lineHeight: 1,
      fontWeight: 900,
      color,
      letterSpacing: '-0.02em',
    }),

    snapshotGrid: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${OVERVIEW_UI.cards.snapshotGridMin}, 1fr))`,
      gap: '14px',
    },

    snapshotCard: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      minHeight: OVERVIEW_UI.cards.snapshotHeight,
      padding: '14px 16px',
      display: 'grid',
      gap: '10px',
      alignContent: 'space-between',
    },

    snapshotLabel: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.2,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: theme.mutedText,
    },

    snapshotValue: {
      margin: 0,
      fontSize: '20px',
      lineHeight: 1,
      fontWeight: 900,
      color: theme.cardText,
    },

    chartsGrid: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${OVERVIEW_UI.cards.chartGridMin}, 1fr))`,
      gap: '16px',
      alignItems: 'stretch',
    },

    chartCard: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '18px',
      padding: '16px',
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
    },

    chartHeading: {
      display: 'grid',
      gap: '6px',
    },

    chartTitle: {
      margin: 0,
      fontSize: '17px',
      lineHeight: 1.1,
      fontWeight: 900,
      color: theme.cardText,
    },

    chartSubtitle: {
      margin: 0,
      fontSize: '14px',
      lineHeight: 1.45,
      color: theme.mutedText,
    },

    barsWrap: {
      display: 'grid',
      gap: '14px',
      alignContent: 'end',
      minHeight: '170px',
    },

    barsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
      gap: '10px',
      alignItems: 'end',
      minHeight: '126px',
    },

    barColumn: {
      display: 'grid',
      gap: '8px',
      alignItems: 'end',
      justifyItems: 'stretch',
    },

    barTrack: {
      height: '100px',
      display: 'flex',
      alignItems: 'flex-end',
      padding: '0 4px',
    },

    barFill: (heightPercent) => ({
      width: '100%',
      height: `${Math.max(14, Math.min(100, heightPercent))}%`,
      borderRadius: '10px',
      background:
        'linear-gradient(180deg, rgba(59,130,246,0.95) 0%, rgba(37,99,235,0.72) 100%)',
      border: '1px solid rgba(147,197,253,0.26)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
      transition: 'height 0.24s ease',
    }),

    barLabel: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.2,
      fontWeight: 800,
      color: theme.cardText,
      textAlign: 'left',
    },

    barValue: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.2,
      color: theme.mutedText,
      fontWeight: 700,
    },
  };
}

export function getOverviewChartValue(value, chartKey) {
  const safe = clampOverviewNumber(value, 0);

  if (chartKey === 'moderation') {
    return Math.max(0, Math.min(100, safe * 12));
  }

  if (chartKey === 'performance') {
    if (safe <= 0) return 12;
    return Math.max(12, Math.min(100, safe));
  }

  return Math.max(0, Math.min(100, safe));
}

export function formatOverviewDisplayValue(value, format = 'integer') {
  const safe = clampOverviewNumber(value, 0);

  if (format === 'number' || format === 'integer') {
    return String(Math.round(safe));
  }

  return String(safe);
}

// ------------------------------
// CONFIG / GENERAL SETTINGS PAGE
// ------------------------------
export const CONFIG_UI = {
  sectionKeys: {
    general: 'general',
    commands: 'commands',
    errorMessages: 'errorMessages',
    permissions: 'permissions',
    data: 'data',
  },
};

export function createConfigPageStyles(theme) {
  return {
    dashboardToggleWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },

    dashboardStatusText(enabled = false) {
      return {
        color: enabled ? theme.success : theme.danger,
        fontWeight: 800,
        fontSize: '18px',
      };
    },

    dashboardToggle(enabled = false) {
      return {
        width: '50px',
        height: '26px',
        borderRadius: '999px',
        border: `1px solid ${enabled ? theme.successBorder : theme.cardBorder}`,
        background: enabled ? theme.successSoft : 'rgba(148,163,184,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: enabled ? 'flex-end' : 'flex-start',
        padding: '3px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      };
    },

    dashboardToggleThumb(enabled = false) {
      return {
        width: '18px',
        height: '18px',
        borderRadius: '999px',
        background: enabled ? theme.success : theme.mutedText,
        transition: 'all 0.2s ease',
      };
    },

    section: {
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '20px',
      boxShadow: theme.shadow,
      overflow: 'hidden',
    },

    sectionHeader: {
      width: '100%',
      border: 0,
      background: 'transparent',
      color: theme.cardText,
      padding: '20px',
      cursor: 'pointer',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: '16px',
      textAlign: 'left',
    },

    sectionTitleWrap: {
      display: 'grid',
      gap: '7px',
      minWidth: 0,
    },

    sectionTitle: {
      fontSize: '19px',
      lineHeight: 1.1,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      color: theme.cardText,
    },

    sectionSubtitle: {
      fontSize: '14px',
      lineHeight: 1.45,
      color: theme.mutedText,
      fontWeight: 600,
    },

    sectionBody: {
      borderTop: `1px solid ${theme.cardBorder}`,
      padding: '20px',
    },

    chevron(open = false) {
      return {
        width: '36px',
        height: '36px',
        borderRadius: '12px',
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${open ? theme.primaryBorder : theme.cardBorder}`,
        background: open ? theme.primarySoft : theme.softBg,
        color: open ? '#bfdbfe' : theme.mutedText,
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition:
          'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
      };
    },

    grid: {
      display: 'grid',
      gap: '16px',
    },

    gridSmall: {
      display: 'grid',
      gap: '12px',
    },

    label: {
      margin: '0 0 6px 0',
      fontSize: '12px',
      fontWeight: 800,
      color: theme.mutedText,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },

    input: {
      width: '100%',
      padding: '11px 12px',
      borderRadius: '12px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.inputText,
      outline: 'none',
      fontSize: '14px',
      boxSizing: 'border-box',
    },

    row: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
    },

    rowGrid: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      padding: '16px 18px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: '16px',
    },

    inlineTitle: {
      color: theme.cardText,
      fontWeight: 900,
      fontSize: '15px',
      lineHeight: 1.2,
    },

    inlineText: {
      color: theme.mutedText,
      fontSize: '14px',
      lineHeight: 1.45,
      fontWeight: 600,
    },

    rowTitle: {
      margin: 0,
      color: theme.cardText,
      fontSize: '18px',
      lineHeight: 1.15,
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },

    rowText: {
      margin: '5px 0 0',
      color: theme.mutedText,
      fontSize: '14px',
      lineHeight: 1.4,
      fontWeight: 600,
    },

    actionRow: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      padding: '18px 20px',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: '18px',
    },

    actionIcon: {
      width: '26px',
      height: '26px',
      display: 'grid',
      placeItems: 'center',
      color: theme.cardText,
      fontWeight: 900,
      fontSize: '18px',
    },

    actionTitle: {
      margin: 0,
      color: theme.cardText,
      fontSize: '19px',
      lineHeight: 1.1,
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },

    actionText: {
      margin: '6px 0 0',
      color: theme.mutedText,
      fontSize: '14px',
      lineHeight: 1.45,
      fontWeight: 600,
    },

    rightIcon: {
      color: theme.cardText,
      fontSize: '30px',
      lineHeight: 1,
      fontWeight: 500,
    },

    prefixPanel: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      padding: '18px 20px',
      display: 'grid',
      gap: '14px',
    },

    prefixHeader: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: '16px',
      alignItems: 'start',
    },

    prefixTitleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
    },

    prefixTitle: {
      margin: 0,
      color: theme.cardText,
      fontSize: '19px',
      lineHeight: 1.1,
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },

    prefixCount: {
      padding: '3px 8px',
      borderRadius: '999px',
      background: theme.topbarSoft,
      border: `1px solid ${theme.cardBorder}`,
      color: theme.mutedText,
      fontSize: '12px',
      fontWeight: 900,
    },

    prefixText: {
      margin: '8px 0 0',
      color: theme.mutedText,
      fontSize: '14px',
      lineHeight: 1.45,
      fontWeight: 600,
    },

    prefixChip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 12px',
      borderRadius: '10px',
      background: theme.topbarSoft,
      border: `1px solid ${theme.cardBorder}`,
      color: theme.cardText,
      fontWeight: 900,
    },

    prefixDelete: {
      color: theme.mutedText,
    },

    infoRow: {
      background: theme.softBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '16px',
      padding: '18px 20px',
      display: 'grid',
      gap: '10px',
    },

    chipsWrap: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
    },

    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: '26px',
      padding: '5px 9px',
      borderRadius: '8px',
      background: theme.topbarSoft,
      border: `1px solid ${theme.cardBorder}`,
      color: theme.cardText,
      fontSize: '13px',
      fontWeight: 800,
    },

    button(tone = 'primary', disabled = false) {
      const success = tone === 'success';
      const soft = tone === 'soft';

      return {
        borderRadius: '12px',
        border: success
          ? `1px solid ${theme.successBorder}`
          : soft
            ? `1px solid ${theme.cardBorder}`
            : `1px solid ${theme.primaryBorder}`,
        background: success ? theme.successSoft : soft ? theme.softBg : theme.primarySoft,
        color: success ? theme.successText : soft ? theme.cardText : '#bfdbfe',
        padding: '10px 14px',
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow: disabled ? 'none' : '0 8px 18px rgba(0,0,0,0.14)',
        whiteSpace: 'nowrap',
      };
    },

    switchTrack(checked = false) {
      return {
        width: '48px',
        height: '26px',
        borderRadius: '999px',
        border: checked ? `1px solid ${theme.successBorder}` : `1px solid ${theme.cardBorder}`,
        background: checked ? theme.successSoft : 'rgba(148,163,184,0.18)',
        padding: '3px',
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 0.18s ease, border-color 0.18s ease',
      };
    },

    switchThumb(checked = false) {
      return {
        width: '18px',
        height: '18px',
        borderRadius: '999px',
        background: checked ? theme.success : theme.mutedText,
        display: 'block',
        boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
      };
    },

    permissionOption(checked = false) {
      return {
        width: '100%',
        borderRadius: '12px',
        border: checked ? `1px solid ${theme.primaryBorder}` : `1px solid ${theme.cardBorder}`,
        background: checked ? theme.primarySoft : theme.softBg,
        color: checked ? '#bfdbfe' : theme.cardText,
        padding: '11px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        fontWeight: 800,
        cursor: 'pointer',
        textAlign: 'left',
      };
    },

    dashboardInlineToggle(enabled = false) {
      return {
        border: `1px solid ${enabled ? theme.successBorder : theme.cardBorder}`,
        background: enabled ? theme.successSoft : 'rgba(148,163,184,0.15)',
        color: enabled ? theme.success : theme.mutedText,
        padding: '6px 12px',
        borderRadius: '8px',
        fontWeight: 800,
        fontSize: '18px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      };
    },
  };
}