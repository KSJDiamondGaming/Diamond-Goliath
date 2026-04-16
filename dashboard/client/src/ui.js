export const DASHBOARD_LAYOUT = {
  sidebarExpandedWidth: '280px',
  sidebarCollapsedWidth: '88px',
  topPanelMinHeight: '136px',
  topPanelRadius: '24px',
};

export function shellStyles(theme, options = {}) {
  const { sidebarExpanded = true } = options;

  return {
    app: {
      minHeight: '100vh',
      background: theme.pageBg,
      color: theme.cardText,
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    },
    main: {
      flex: 1,
      minWidth: 0,
      padding: '24px',
      transition: 'padding 0.2s ease',
    },
    card: {
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '20px',
      padding: '24px',
      color: theme.cardText,
      boxShadow: theme.shadow,
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
      transition: 'border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
    },
  };
}

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
    themeSwitch(isLight = false, isHovered = false) {
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
        border: `1px solid ${isHovered ? 'rgba(239,68,68,0.28)' : 'transparent'}`,
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

export function heroStyles(theme) {
  return {
    root: {
      background: theme.heroBg,
      border: `1px solid ${theme.heroBorder}`,
      borderRadius: DASHBOARD_LAYOUT.topPanelRadius,
      padding: '18px 24px',
      minHeight: DASHBOARD_LAYOUT.topPanelMinHeight,
      boxShadow: theme.shadow,
      marginBottom: '24px',
      display: 'grid',
      gap: '12px',
      alignContent: 'center',
      overflow: 'hidden',
      position: 'relative',
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
    metaDot: {
      width: '7px',
      height: '7px',
      borderRadius: '999px',
      background: '#22c55e',
      flexShrink: 0,
    },
    text: {
      maxWidth: '720px',
      fontSize: '15px',
      lineHeight: 1.6,
      color: theme.mutedText,
      margin: 0,
    },
    meta: {
      fontSize: '13px',
      color: theme.mutedText,
      fontWeight: 700,
      margin: 0,
    },
    loginButton: {
      marginTop: '2px',
      padding: '14px 18px',
      borderRadius: '14px',
      border: '1px solid rgba(59,130,246,0.35)',
      background: 'rgba(59,130,246,0.18)',
      color: '#ffffff',
      fontWeight: 800,
      cursor: 'pointer',
      transition: 'transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease',
      justifySelf: 'start',
    },
  };
}