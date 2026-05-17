export function createTheme(darkMode = true) {
  const dark = {
    pageBg:
      'radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 34%), #020617',

    sidebarBg: 'rgba(2, 6, 23, 0.96)',
    sidebarBorder: 'rgba(148, 163, 184, 0.16)',
    sidebarText: '#cbd5e1',
    sidebarMuted: '#64748b',

    topbarBg: 'rgba(2, 6, 23, 0.82)',
    topbarBorder: 'rgba(148, 163, 184, 0.14)',
    topbarSoft: 'rgba(15, 23, 42, 0.78)',
    topbarSoftBorder: 'rgba(148, 163, 184, 0.14)',

    cardBg: 'rgba(15, 23, 42, 0.86)',
    cardBorder: 'rgba(148, 163, 184, 0.16)',
    cardText: '#f8fafc',
    mutedText: '#94a3b8',

    softBg: 'rgba(30, 41, 59, 0.72)',

    inputBg: 'rgba(15, 23, 42, 0.88)',
    inputBorder: 'rgba(148, 163, 184, 0.20)',
    inputText: '#f8fafc',

    dropdownBg: 'rgba(15, 23, 42, 0.96)',

    primary: '#3b82f6',
    primarySoft: 'rgba(59, 130, 246, 0.16)',
    primaryBorder: 'rgba(96, 165, 250, 0.34)',
    primaryText: '#bfdbfe',

    success: '#22c55e',
    successSoft: 'rgba(34, 197, 94, 0.14)',
    successBorder: 'rgba(34, 197, 94, 0.30)',
    successText: '#86efac',

    warning: '#f59e0b',
    warningSoft: 'rgba(245, 158, 11, 0.14)',
    warningBorder: 'rgba(245, 158, 11, 0.30)',
    warningText: '#fbbf24',

    danger: '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.14)',
    dangerBorder: 'rgba(239, 68, 68, 0.30)',
    dangerText: '#fca5a5',

    shadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
    softShadow: '0 10px 28px rgba(0, 0, 0, 0.18)',
  };

  const light = {
    pageBg:
      'radial-gradient(circle at top left, rgba(37,99,235,0.10), transparent 34%), #f8fafc',

    sidebarBg: 'rgba(255, 255, 255, 0.96)',
    sidebarBorder: 'rgba(15, 23, 42, 0.10)',
    sidebarText: '#334155',
    sidebarMuted: '#64748b',

    topbarBg: 'rgba(248, 250, 252, 0.82)',
    topbarBorder: 'rgba(15, 23, 42, 0.10)',
    topbarSoft: 'rgba(241, 245, 249, 0.86)',
    topbarSoftBorder: 'rgba(15, 23, 42, 0.10)',

    cardBg: 'rgba(255, 255, 255, 0.92)',
    cardBorder: 'rgba(15, 23, 42, 0.10)',
    cardText: '#0f172a',
    mutedText: '#64748b',

    softBg: 'rgba(241, 245, 249, 0.90)',

    inputBg: 'rgba(255, 255, 255, 0.96)',
    inputBorder: 'rgba(15, 23, 42, 0.14)',
    inputText: '#0f172a',

    dropdownBg: 'rgba(255, 255, 255, 0.98)',

    primary: '#2563eb',
    primarySoft: 'rgba(37, 99, 235, 0.12)',
    primaryBorder: 'rgba(37, 99, 235, 0.26)',
    primaryText: '#1d4ed8',

    success: '#16a34a',
    successSoft: 'rgba(22, 163, 74, 0.12)',
    successBorder: 'rgba(22, 163, 74, 0.24)',
    successText: '#15803d',

    warning: '#d97706',
    warningSoft: 'rgba(217, 119, 6, 0.12)',
    warningBorder: 'rgba(217, 119, 6, 0.24)',
    warningText: '#b45309',

    danger: '#dc2626',
    dangerSoft: 'rgba(220, 38, 38, 0.12)',
    dangerBorder: 'rgba(220, 38, 38, 0.24)',
    dangerText: '#b91c1c',

    shadow: '0 18px 48px rgba(15, 23, 42, 0.10)',
    softShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
  };

  return darkMode ? dark : light;
}

export const getTheme = createTheme;

export default createTheme;