export function createTheme(darkMode = true) {
  const dark = {
    mode: 'dark',

    pageBg: '#070A12',
    appBg: '#070A12',
    bodyBg: '#070A12',

    navbarBg: 'rgba(9, 13, 24, 0.96)',
    navbarBorder: 'rgba(148, 163, 184, 0.14)',
    navbarText: '#E5E7EB',
    navbarMutedText: '#94A3B8',
    navbarActiveBg: 'rgba(59, 130, 246, 0.16)',
    navbarActiveText: '#FFFFFF',
    navbarHoverBg: 'rgba(148, 163, 184, 0.10)',

    topbarBg: 'rgba(9, 13, 24, 0.82)',
    topbarBorder: 'rgba(148, 163, 184, 0.14)',
    topbarSoft: 'rgba(15, 23, 42, 0.76)',

    cardBg: 'rgba(15, 23, 42, 0.78)',
    cardBgSolid: '#0F172A',
    cardBorder: 'rgba(148, 163, 184, 0.14)',
    cardText: '#F8FAFC',

    text: '#F8FAFC',
    textSoft: '#E2E8F0',
    mutedText: '#94A3B8',
    faintText: '#64748B',

    softBg: 'rgba(148, 163, 184, 0.08)',
    softBorder: 'rgba(148, 163, 184, 0.14)',

    inputBg: 'rgba(15, 23, 42, 0.86)',
    inputBorder: 'rgba(148, 163, 184, 0.18)',
    inputText: '#F8FAFC',
    inputPlaceholder: '#64748B',

    dropdownBg: '#0F172A',
    menuBg: '#0F172A',
    menuBorder: 'rgba(148, 163, 184, 0.16)',

    primary: '#3B82F6',
    primaryHover: '#2563EB',
    primaryText: '#FFFFFF',
    primarySoft: 'rgba(59, 130, 246, 0.14)',
    primaryBorder: 'rgba(59, 130, 246, 0.34)',

    success: '#22C55E',
    successSoft: 'rgba(34, 197, 94, 0.14)',
    successBorder: 'rgba(34, 197, 94, 0.32)',
    successText: '#86EFAC',

    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.14)',
    warningBorder: 'rgba(245, 158, 11, 0.34)',
    warningText: '#FCD34D',

    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.14)',
    dangerBorder: 'rgba(239, 68, 68, 0.34)',
    dangerText: '#FCA5A5',

    info: '#38BDF8',
    infoSoft: 'rgba(56, 189, 248, 0.14)',
    infoBorder: 'rgba(56, 189, 248, 0.32)',
    infoText: '#7DD3FC',

    shadow: '0 18px 60px rgba(0, 0, 0, 0.36)',
    softShadow: '0 12px 35px rgba(0, 0, 0, 0.22)',
    glow: '0 0 0 1px rgba(59, 130, 246, 0.16), 0 20px 50px rgba(59, 130, 246, 0.10)',

    radius: '18px',
    radiusLg: '24px',
  };

  const light = {
    ...dark,
    mode: 'light',

    pageBg: '#F8FAFC',
    appBg: '#F8FAFC',
    bodyBg: '#F8FAFC',

    navbarBg: 'rgba(255, 255, 255, 0.96)',
    navbarBorder: 'rgba(15, 23, 42, 0.10)',
    navbarText: '#0F172A',
    navbarMutedText: '#64748B',
    navbarActiveBg: 'rgba(37, 99, 235, 0.10)',
    navbarActiveText: '#1D4ED8',
    navbarHoverBg: 'rgba(15, 23, 42, 0.06)',

    topbarBg: 'rgba(255, 255, 255, 0.84)',
    topbarBorder: 'rgba(15, 23, 42, 0.10)',
    topbarSoft: 'rgba(241, 245, 249, 0.86)',

    cardBg: 'rgba(255, 255, 255, 0.86)',
    cardBgSolid: '#FFFFFF',
    cardBorder: 'rgba(15, 23, 42, 0.10)',
    cardText: '#0F172A',

    text: '#0F172A',
    textSoft: '#334155',
    mutedText: '#64748B',
    faintText: '#94A3B8',

    softBg: 'rgba(15, 23, 42, 0.05)',
    softBorder: 'rgba(15, 23, 42, 0.10)',

    inputBg: '#FFFFFF',
    inputBorder: 'rgba(15, 23, 42, 0.14)',
    inputText: '#0F172A',
    inputPlaceholder: '#94A3B8',

    dropdownBg: '#FFFFFF',
    menuBg: '#FFFFFF',
    menuBorder: 'rgba(15, 23, 42, 0.12)',

    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primarySoft: 'rgba(37, 99, 235, 0.10)',
    primaryBorder: 'rgba(37, 99, 235, 0.26)',

    shadow: '0 18px 50px rgba(15, 23, 42, 0.10)',
    softShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
    glow: '0 0 0 1px rgba(37, 99, 235, 0.12), 0 18px 45px rgba(37, 99, 235, 0.08)',
  };

  return darkMode ? dark : light;
}

export const getTheme = createTheme;

