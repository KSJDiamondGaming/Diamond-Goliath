import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function formatNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number.toLocaleString() : String(fallback);
}

function formatDuration(ms) {
  const number = Number(ms || 0);
  if (!Number.isFinite(number) || number <= 0) return 'None';
  if (number >= 3600000) return `${Math.round(number / 3600000)}h`;
  if (number >= 60000) return `${Math.round(number / 60000)}m`;
  if (number >= 1000) return `${Math.round(number / 1000)}s`;
  return `${number}ms`;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function DetailRow({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: theme.cardText, fontWeight: 950, overflowWrap: 'anywhere' }}>{value || 'None'}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function RewardCard({ theme, reward, index }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 13, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: theme.cardText }}>Level {reward.level ?? reward.requiredLevel ?? index + 1}</strong>
        <span style={{ color: reward.enabled === false ? '#fcd34d' : '#86efac', fontWeight: 950, textTransform: 'uppercase', fontSize: 12 }}>{reward.enabled === false ? 'disabled' : 'active'}</span>
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
        <div><strong style={{ color: theme.cardText }}>Role:</strong> {reward.roleName || reward.roleId || 'No role'}</div>
        <div><strong style={{ color: theme.cardText }}>XP:</strong> {formatNumber(reward.xpRequired || reward.requiredXp || reward.xp || 0)}</div>
      </div>
    </div>
  );
}

function LeaderboardRow({ theme, user, index }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 13, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 12 }}>
      <strong style={{ color: '#93c5fd' }}>#{index + 1}</strong>
      <div>
        <div style={{ color: theme.cardText, fontWeight: 950 }}>{user.username || user.tag || user.userId || user.id || 'Unknown user'}</div>
        <div style={{ color: theme.mutedText, fontSize: 12 }}>Level {user.level ?? 0}</div>
      </div>
      <div style={{ color: theme.cardText, fontWeight: 950 }}>{formatNumber(user.xp ?? user.totalXp ?? 0)} XP</div>
    </div>
  );
}

export default function Leveling({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config.settings || config.config || {};
  const analytics = config.analytics || {};
  const rewards = useMemo(() => asArray(config.rewards || config.levelRoles || settings.rewards || settings.levelRoles), [config, settings]);
  const leaderboard = useMemo(() => asArray(config.leaderboard || config.users || analytics.topUsers).sort((a, b) => Number(b.xp || b.totalXp || 0) - Number(a.xp || a.totalXp || 0)).slice(0, 10), [config, analytics]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.getGuildModules(guildId);
      const modules = payload.modules || {};
      setConfig(modules.leveling || { enabled: false, settings: {}, rewards: {}, leaderboard: {}, analytics: {} });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Leveling.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  async function toggleEnabled() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const enabled = config.enabled !== true;
      const result = await api.setGuildModuleEnabled(guildId, 'leveling', enabled);
      setConfig(result.modules?.leveling || { ...config, enabled });
      setNotice(`Leveling ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Leveling status.');
    } finally {
      setLoading(false);
    }
  }

  if (!guildId) {
    return (
      <PageShell title="Leveling" subtitle="Select a server to manage XP and levels." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage leveling." />
      </PageShell>
    );
  }

  const trackedUsers = analytics.trackedUsers ?? analytics.users ?? asArray(config.users).length;
  const multiplier = settings.multiplier ?? settings.xpMultiplier ?? config.multiplier ?? 1;
  const cooldown = settings.cooldown ?? settings.cooldownMs ?? config.cooldown ?? 0;
  const levelCap = settings.levelCap ?? settings.maxLevel ?? config.levelCap ?? 'Unlimited';

  return (
    <PageShell
      title="Leveling"
      subtitle="Manage XP settings, rewards, level roles and leaderboards."
      theme={theme}
      guild={{ id: guildId, name: 'Leveling' }}
      actions={<SecondaryButton theme={theme} onClick={toggleEnabled} disabled={loading}>{config.enabled === true ? 'Disable' : 'Enable'}</SecondaryButton>}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Leveling..." /> : null}

      <StatGrid min="min(190px, 100%)">
        <SummaryStat theme={theme} label="Status" value={config.enabled === true ? 'Enabled' : 'Disabled'} accent={config.enabled === true ? '#22c55e' : '#f59e0b'} description="modules.leveling.enabled" />
        <SummaryStat theme={theme} label="Tracked Users" value={formatNumber(trackedUsers)} accent="#3b82f6" description="Users with XP records" />
        <SummaryStat theme={theme} label="Multiplier" value={`${multiplier}x`} accent="#a855f7" description="XP rate" />
        <SummaryStat theme={theme} label="Cooldown" value={formatDuration(cooldown)} accent="#f59e0b" description="Message XP cooldown" />
        <SummaryStat theme={theme} label="Level Cap" value={levelCap} accent="#22c55e" description="Maximum level" />
      </StatGrid>

      <SectionCard theme={theme} title="Analytics" subtitle="XP and level analytics from modules.leveling.analytics.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Messages Processed" value={formatNumber(analytics.messagesProcessed ?? analytics.messages ?? 0)} />
          <DetailRow theme={theme} label="XP Awarded" value={formatNumber(analytics.xpAwarded ?? analytics.totalXpAwarded ?? 0)} />
          <DetailRow theme={theme} label="Level Ups" value={formatNumber(analytics.levelUps ?? analytics.usersLeveledUp ?? 0)} />
          <DetailRow theme={theme} label="Highest Level" value={formatNumber(analytics.highestLevel ?? 0)} />
          <DetailRow theme={theme} label="Last XP" value={formatDate(analytics.lastXpAt || analytics.lastMessageAt)} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Configuration Summary" subtitle="Current XP rules and reward settings.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="XP Per Message" value={`${settings.minXp ?? settings.xpPerMessage ?? 5} - ${settings.maxXp ?? settings.xpPerMessageMax ?? 15}`} />
          <DetailRow theme={theme} label="Cooldown" value={formatDuration(cooldown)} />
          <DetailRow theme={theme} label="Multiplier" value={`${multiplier}x`} />
          <DetailRow theme={theme} label="Role Rewards" value={rewards.length} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Level Rewards" subtitle="Configured level role rewards from modules.leveling.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {rewards.length ? rewards.map((reward, index) => (
            <RewardCard key={reward.id || reward.roleId || index} theme={theme} reward={reward} index={index} />
          )) : <EmptyState theme={theme} text="No level rewards configured yet." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Leaderboard" subtitle="Top users by XP when leaderboard data is available.">
        <div style={{ display: 'grid', gap: 10 }}>
          {leaderboard.length ? leaderboard.map((user, index) => (
            <LeaderboardRow key={user.userId || user.id || index} theme={theme} user={user} index={index} />
          )) : <EmptyState theme={theme} text="No leaderboard data stored yet." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Management Roadmap" subtitle="This dashboard is ready for the leveling backend editor actions.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="XP Rules" value="Next" hint="Edit XP per message, cooldowns and multipliers." />
          <DetailRow theme={theme} label="Role Rewards" value="Next" hint="Create level role rewards stored in modules.leveling.rewards." />
          <DetailRow theme={theme} label="Leaderboard" value="Ready" hint="Leaderboard data is surfaced when available." />
          <DetailRow theme={theme} label="Analytics" value="Ready" hint="Messages, XP and level-up data are surfaced here." />
        </div>
      </SectionCard>
    </PageShell>
  );
}
