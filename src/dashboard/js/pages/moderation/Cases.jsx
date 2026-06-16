import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';

import {
  joinGuildRoom,
  listenForGuildUpdate,
} from '../../services/socketClient';

import PageShell, {
  SectionCard,
  StatGrid,
  SummaryStat,
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
} from '../../shared/PageShell';

const ACTION_TONES = {
  ban: 'danger',
  kick: 'warning',
  timeout: 'warning',
  warn: 'primary',
  warning: 'primary',
  mute: 'warning',
  clearwarnings: 'soft',
};

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

function getActionAccent(theme, action = '') {
  const tone = getActionTone(action);

  if (tone === 'danger') return theme.danger || '#ef4444';
  if (tone === 'warning') return theme.warning || '#f59e0b';
  if (tone === 'primary') return theme.primary || '#3b82f6';

  return theme.mutedText;
}

function SearchInput({ theme, value, onChange }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search cases..."
      style={{
        width: 'min(320px, 100%)',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(10,18,35,0.96)',
        color: theme.cardText,
        borderRadius: 14,
        padding: '11px 13px',
        outline: 'none',
        fontWeight: 700,
        boxSizing: 'border-box',
      }}
    />
  );
}

function Badge({ theme, tone = 'soft', children }) {
  const tones = {
    primary: {
      bg: 'rgba(59,130,246,0.14)',
      border: 'rgba(59,130,246,0.3)',
      text: '#bfdbfe',
    },
    warning: {
      bg: 'rgba(245,158,11,0.14)',
      border: 'rgba(245,158,11,0.3)',
      text: '#fcd34d',
    },
    danger: {
      bg: 'rgba(239,68,68,0.14)',
      border: 'rgba(239,68,68,0.3)',
      text: '#fca5a5',
    },
    soft: {
      bg: theme.softBg,
      border: theme.cardBorder,
      text: theme.mutedText,
    },
    success: {
      bg: 'rgba(34,197,94,0.13)',
      border: 'rgba(34,197,94,0.28)',
      text: '#86efac',
    },
  };

  const current = tones[tone] || tones.soft;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 28,
        padding: '5px 10px',
        borderRadius: 999,
        border: `1px solid ${current.border}`,
        background: current.bg,
        color: current.text,
        fontSize: 12,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function Cases({ selectedGuild, theme }) {
  const guildId = getGuildId(selectedGuild);

  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [clearingCase, setClearingCase] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const loadCases = useCallback(
    async ({ quiet = false } = {}) => {
      if (!guildId) {
        setCases([]);
        setSelectedCase(null);
        setError('');
        setSyncMessage('');
        return;
      }

      try {
        if (quiet) setRefreshing(true);
        else setLoading(true);

        setError('');

        const data = await api.getCases(guildId);
        const nextCases = normalizeCases(data, guildId);

        setCases(nextCases);

        setSelectedCase((current) => {
          if (!current) return null;

          const currentKey = getCaseKey(current);

          return nextCases.find((item) => getCaseKey(item) === currentKey) || null;
        });
      } catch (err) {
        console.error(err);

        setCases([]);
        setSelectedCase(null);
        setError('Could not load cases.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [guildId],
  );

  const handleClearCase = useCallback(
    async (item) => {
      if (!guildId || !item?.caseNumber) return;

      try {
        setClearingCase(String(item.caseNumber));
        setError('');
        setSyncMessage('');

        const result = await api.clearCase(guildId, item.caseNumber);
        const nextCases = normalizeCases(result?.cases || result?.data || result, guildId);

        if (nextCases.length > 0) {
          setCases(nextCases);

          setSelectedCase(
            nextCases.find(
              (caseItem) => String(caseItem.caseNumber) === String(item.caseNumber),
            ) || null,
          );
        } else {
          await loadCases({ quiet: true });
        }

        setSyncMessage('✅ Case cleared.');
      } catch (err) {
        console.error(err);
        setError('Failed to clear case.');
      } finally {
        setClearingCase('');
      }
    },
    [guildId, loadCases],
  );

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    return listenForGuildUpdate(guildId, 'cases', (data) => {
      const nextCases = normalizeCases(data, guildId);

      setCases(nextCases);

      setSelectedCase((current) => {
        if (!current) return null;

        const currentKey = getCaseKey(current);

        return nextCases.find((item) => getCaseKey(item) === currentKey) || null;
      });

      setSyncMessage('✅ Cases synced live.');
    });
  }, [guildId]);

  useEffect(() => {
    if (!syncMessage) return undefined;

    const timeout = setTimeout(() => {
      setSyncMessage('');
    }, 3000);

    return () => clearTimeout(timeout);
  }, [syncMessage]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return cases;

    return cases.filter((item) =>
      [
        item.caseNumber,
        item.action,
        item.targetTag,
        item.targetId,
        item.moderatorTag,
        item.moderatorId,
        item.reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [cases, search]);

  const caseStats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((item) => item.cleared !== true).length;
    const cleared = cases.filter((item) => item.cleared === true).length;

    return { total, active, cleared };
  }, [cases]);

  const formatDate = useCallback((value) => {
    if (!value) return 'Unknown';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleString();
  }, []);

  return (
    <PageShell
      title="Cases"
      subtitle={
        guildId
          ? 'Moderation case history, actions, targets, moderators, and clear status.'
          : 'Select a server to view moderation cases.'
      }
      theme={theme}
      guild={{
        id: guildId,
        name: 'Cases',
      }}
      actions={
        guildId ? (
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              maxWidth: '100%',
            }}
          >
            <SearchInput theme={theme} value={search} onChange={setSearch} />

            <SecondaryButton
              theme={theme}
              onClick={() => loadCases({ quiet: true })}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </SecondaryButton>
          </div>
        ) : null
      }
    >
      {!guildId ? (
        <EmptyState theme={theme} text="Select a guild to view cases." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {syncMessage ? (
        <Notice theme={theme} tone="success">
          {syncMessage}
        </Notice>
      ) : null}

      {guildId && loading ? (
        <LoadingPanel theme={theme} text="Loading cases..." />
      ) : null}

      {guildId && !loading ? (
        <>
          <StatGrid min="min(200px, 100%)">
            <SummaryStat
              theme={theme}
              label="Total Cases"
              value={caseStats.total}
              accent="#3b82f6"
              description="Stored moderation records"
            />

            <SummaryStat
              theme={theme}
              label="Active"
              value={caseStats.active}
              accent="#f59e0b"
              description="Cases not cleared"
            />

            <SummaryStat
              theme={theme}
              label="Cleared"
              value={caseStats.cleared}
              accent="#22c55e"
              description="Cleared case records"
            />

            <SummaryStat
              theme={theme}
              label="Results"
              value={filteredCases.length}
              description="Current filtered list"
            />
          </StatGrid>

          {filteredCases.length === 0 ? (
            <EmptyState
              theme={theme}
              title="No cases found"
              text="No moderation cases match this server or search."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
                gap: 'clamp(16px, 3vw, 24px)',
                alignItems: 'start',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              <SectionCard
                theme={theme}
                title="Case History"
                subtitle="Select a case to inspect the full moderation record."
                actions={
                  <Badge theme={theme} tone="soft">
                    {filteredCases.length}
                  </Badge>
                }
              >
                <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                  {filteredCases.map((item) => (
                    <CaseListItem
                      key={getCaseKey(item)}
                      item={item}
                      active={getCaseKey(selectedCase) === getCaseKey(item)}
                      theme={theme}
                      formatDate={formatDate}
                      onClick={() => setSelectedCase(item)}
                    />
                  ))}
                </div>
              </SectionCard>

              {selectedCase ? (
                <CaseDetail
                  item={selectedCase}
                  theme={theme}
                  formatDate={formatDate}
                  onClose={() => setSelectedCase(null)}
                  onClear={() => handleClearCase(selectedCase)}
                  clearing={clearingCase === String(selectedCase.caseNumber)}
                />
              ) : (
                <EmptyState
                  theme={theme}
                  title="No case selected"
                  text="Select a case from the list to view full details."
                />
              )}
            </div>
          )}
        </>
      ) : null}
    </PageShell>
  );
}

const CaseListItem = memo(function CaseListItem({
  item,
  active,
  theme,
  formatDate,
  onClick,
}) {
  const tone = getActionTone(item.action);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        border: `1px solid ${active ? theme.primaryBorder : theme.cardBorder}`,
        background: active ? theme.primarySoft : theme.softBg,
        borderRadius: 16,
        padding: 'clamp(14px, 3vw, 16px)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'grid',
        gap: 9,
        boxShadow: active ? theme.shadow : 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <h4
          style={{
            margin: 0,
            color: theme.cardText,
            fontSize: 15,
            fontWeight: 900,
            overflowWrap: 'break-word',
          }}
        >
          Case #{item.caseNumber || item.id || 'Unknown'}
        </h4>

        <Badge theme={theme} tone={tone}>
          {formatAction(item.action)}
        </Badge>
      </div>

      <p
        style={{
          margin: 0,
          color: theme.mutedText,
          fontSize: 13,
          fontWeight: 700,
          wordBreak: 'break-word',
        }}
      >
        Target: {item.targetTag || item.userTag || item.user || item.targetId || 'Unknown'}
      </p>

      <p
        style={{
          margin: 0,
          color: theme.cardText,
          fontSize: 14,
          lineHeight: 1.45,
          fontWeight: 700,
          wordBreak: 'break-word',
        }}
      >
        {item.reason || 'No reason provided'}
      </p>

      <p
        style={{
          margin: 0,
          color: theme.mutedText,
          fontSize: 12,
          fontWeight: 700,
          wordBreak: 'break-word',
        }}
      >
        {formatDate(item.createdAt || item.date || item.timestamp)}
      </p>
    </button>
  );
});

const CaseDetail = memo(function CaseDetail({
  item,
  theme,
  formatDate,
  onClose,
  onClear,
  clearing,
}) {
  const tone = getActionTone(item.action);

  return (
    <SectionCard
      theme={theme}
      title={`Case #${item.caseNumber || item.id || 'Unknown'}`}
      subtitle={item.cleared ? 'This case has been cleared.' : 'Full moderation case details.'}
      actions={
        <Badge theme={theme} tone={tone}>
          {formatAction(item.action)}
        </Badge>
      }
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <DetailRow theme={theme} label="Action" value={formatAction(item.action)} />

        <DetailRow
          theme={theme}
          label="Target"
          value={formatUser(
            item.targetTag || item.userTag || item.user,
            item.targetId || item.userId,
          )}
        />

        <DetailRow
          theme={theme}
          label="Moderator"
          value={formatUser(item.moderatorTag || item.moderator, item.moderatorId)}
        />

        <DetailRow
          theme={theme}
          label="Date"
          value={formatDate(item.createdAt || item.date || item.timestamp)}
        />

        <DetailRow
          theme={theme}
          label="Reason"
          value={item.reason || 'No reason provided'}
        />

        <DetailRow
          theme={theme}
          label="Status"
          value={item.cleared ? 'Cleared' : 'Active'}
          accent={item.cleared ? theme.success : getActionAccent(theme, item.action)}
        />

        {item.cleared ? (
          <DetailRow
            theme={theme}
            label="Cleared At"
            value={formatDate(item.clearedAt)}
          />
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <SecondaryButton theme={theme} onClick={onClose}>
          Close
        </SecondaryButton>

        {!item.cleared ? (
          <SecondaryButton theme={theme} onClick={onClear} disabled={clearing}>
            {clearing ? 'Clearing...' : 'Clear Case'}
          </SecondaryButton>
        ) : null}
      </div>
    </SectionCard>
  );
});

const DetailRow = memo(function DetailRow({ theme, label, value, accent = null }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        padding: '13px 14px',
        borderRadius: 14,
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        minWidth: 0,
      }}
    >
      <p
        style={{
          margin: 0,
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin: 0,
          color: accent || theme.cardText,
          fontSize: 14,
          fontWeight: 800,
          lineHeight: 1.45,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </p>
    </div>
  );
});

function normalizeCases(data, guildId) {
  if (!data) return [];

  let rawCases = [];

  if (Array.isArray(data)) {
    rawCases = data;
  } else if (Array.isArray(data.cases)) {
    rawCases = data.cases;
  } else if (data.cases && typeof data.cases === 'object') {
    rawCases = Object.values(data.cases);
  } else if (typeof data === 'object') {
    rawCases = Object.values(data).filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
  }

  return rawCases
    .map((item, index) => normalizeCase(item, guildId, index))
    .sort((a, b) => {
      const aNumber = Number(a.caseNumber || 0);
      const bNumber = Number(b.caseNumber || 0);

      if (aNumber !== bNumber) return bNumber - aNumber;

      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;

      return bTime - aTime;
    });
}

function normalizeCase(item = {}, guildId, index = 0) {
  const caseNumber = item.caseNumber || item.case || item.number || item.id || index + 1;

  return {
    ...item,
    guildId: item.guildId || guildId,
    caseNumber,
    action: item.action || item.type || item.punishment || 'unknown',
    targetTag: item.targetTag || item.userTag || item.user || item.target,
    targetId: item.targetId || item.userId,
    moderatorTag: item.moderatorTag || item.moderator,
    moderatorId: item.moderatorId,
    createdAt: item.createdAt || item.date || item.timestamp,
    reason: item.reason,
    cleared: item.cleared === true,
    clearedAt: item.clearedAt,
    stableKey:
      item.id ||
      item.caseId ||
      `${item.guildId || guildId}-${caseNumber}-${item.createdAt || item.timestamp || index}`,
  };
}

function getCaseKey(item) {
  if (!item) return '';
  return item.stableKey || `${item.guildId || 'guild'}-${item.caseNumber || item.id || 'case'}`;
}

function getActionTone(action = '') {
  return ACTION_TONES[String(action).toLowerCase()] || 'soft';
}

function formatAction(action = '') {
  const normalized = String(action || 'unknown').trim();

  if (!normalized) return 'Unknown';

  return normalized
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatUser(tag, id) {
  if (tag && id) return `${tag} (${id})`;
  if (tag) return tag;
  if (id) return id;
  return 'Unknown';
}
