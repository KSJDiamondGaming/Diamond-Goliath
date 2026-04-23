// ==============================
// KSJ GOLIATH - UI SYSTEM
// SINGLE SOURCE OF TRUTH
// ==============================

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
  { key: 'overview', label: 'Overview', icon: 'overview', path: '/overview' },
  { key: 'cases', label: 'Cases', icon: 'cases', path: '/cases' },
  { key: 'warnings', label: 'Warnings', icon: 'warnings', path: '/warnings' },
  { key: 'automod', label: 'AutoMod', icon: 'automod', path: '/automod' },
  { key: 'config', label: 'Config', icon: 'config', path: '/config' },
  { key: 'messages', label: 'Welcome & Leave', icon: 'messages', path: '/messages' },
];

export const ROUTES = NAV_ITEMS.map((item) => ({
  key: item.key,
  path: item.path,
}));

export const navItems = NAV_ITEMS;

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
    title: 'Config',
    description: 'Manage dashboard and moderation configuration for the selected server.',
    emptyDescription: 'Select a server to manage config.',
    sections: [
      { id: 'generalConfig', type: 'config' },
      { id: 'logConfig', type: 'config' },
    ],
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
  logConfig: {
    title: 'Log Channels',
    description: 'Choose where different bot logs should be sent.',
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
      gridTemplateColumns: `${sidebarExpanded ? DASHBOARD_LAYOUT.sidebarExpandedWidth : DASHBOARD_LAYOUT.sidebarCollapsedWidth} minmax(0, 1fr)`,
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
    collapseButton: {
      width: '40px',
      height: '24px',
      borderRadius: '999px',
      border: `1px solid ${theme.topbarSoftBorder}`,
      background: theme.topbarSoft,
      color: theme.sidebarText,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: theme.shadow,
    },
    collapseButtonIcon(expanded = true) {
      return {
        display: 'inline-block',
        fontSize: '14px',
        lineHeight: 1,
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s ease',
      };
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
    },
    userButton(isActive = false) {
      return {
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
    },
    userName: {
      fontSize: '14px',
      fontWeight: 700,
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
    },
    menu: {
      position: 'absolute',
      top: '56px',
      right: 0,
      width: '220px',
      background: theme.dropdownBg,
      border: `1px solid ${theme.menuBorder}`,
      borderRadius: '16px',
      boxShadow: theme.shadow,
      padding: '8px',
      display: 'grid',
      gap: '8px',
    },
    themeRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '10px 12px',
      borderRadius: '12px',
      border: `1px solid ${theme.topbarSoftBorder}`,
      background: theme.topbarSoft,
    },
    themeCopy: {
      display: 'grid',
      gap: '2px',
    },
    themeLabel: {
      fontSize: '14px',
      fontWeight: 700,
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
        borderRadius: '12px',
        border: `1px solid ${isHovered ? theme.dangerBorder : 'transparent'}`,
        background: isHovered ? 'rgba(239,68,68,0.18)' : theme.dangerSoft,
        color: theme.dangerText,
        cursor: 'pointer',
        fontWeight: 600,
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