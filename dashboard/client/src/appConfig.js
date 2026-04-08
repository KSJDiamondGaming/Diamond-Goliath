export function getTheme(darkMode) {
  return {
    pageBg: darkMode ? '#0b1220' : '#f3f4f6',
    sidebarBg: darkMode
      ? 'linear-gradient(180deg, #111827 0%, #0f172a 100%)'
      : '#1f2937',
    sidebarBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    sidebarText: '#e5e7eb',
    sidebarMuted: darkMode ? '#94a3b8' : '#9ca3af',
    topbarBg: darkMode ? 'rgba(10, 17, 31, 0.84)' : 'rgba(255, 255, 255, 0.88)',
    topbarBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    heroBg: darkMode
      ? 'radial-gradient(circle at top right, rgba(59,130,246,0.18), transparent 26%), linear-gradient(180deg, #1f2937 0%, #111827 100%)'
      : '#ffffff',
    heroBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    cardBg: darkMode ? '#111827' : '#ffffff',
    cardBorder: darkMode ? 'rgba(148, 163, 184, 0.08)' : '#e5e7eb',
    cardText: darkMode ? '#f8fafc' : '#111827',
    mutedText: darkMode ? '#94a3b8' : '#6b7280',
    softBg: darkMode ? '#0f172a' : '#f9fafb',
    inputBg: darkMode ? '#1f2937' : '#ffffff',
    inputText: darkMode ? '#f8fafc' : '#111827',
    inputBorder: darkMode ? 'rgba(148, 163, 184, 0.14)' : '#d1d5db',
    primarySoft: 'rgba(59, 130, 246, 0.16)',
    primaryBorder: 'rgba(59,130,246,0.28)',
    shadow: darkMode
      ? '0 10px 30px rgba(0,0,0,0.22)'
      : '0 10px 30px rgba(0,0,0,0.08)',
    menuBorder: darkMode ? 'rgba(148, 163, 184, 0.12)' : '#e5e7eb',
    dangerSoft: 'rgba(239,68,68,0.12)',
    dangerText: '#fca5a5',
    topbarSoft: darkMode ? 'rgba(255,255,255,0.035)' : 'rgba(17,24,39,0.03)',
    topbarSoftBorder: darkMode ? 'rgba(148,163,184,0.1)' : '#e5e7eb',
    dropdownBg: darkMode ? 'rgba(17,24,39,0.97)' : 'rgba(255,255,255,0.98)',
  };
}

export const navItems = [
  { key: 'overview', label: 'Overview', icon: '⌂' },
  { key: 'cases', label: 'Cases', icon: '🛡' },
  { key: 'warnings', label: 'Warnings', icon: '⚠' },
  { key: 'automod', label: 'AutoMod', icon: '🤖' },
  { key: 'config', label: 'Embed Config', icon: '✦' },
  { key: 'messages', label: 'Welcome & Leave', icon: '✉' },
];