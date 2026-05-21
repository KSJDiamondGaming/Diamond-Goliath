import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../services/apiClient';

import {
  joinGuildRoom,
  listenForGuildUpdate,
} from '../services/socketClient';

import PageShell, {
  SectionCard,
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  StatGrid,
  SummaryStat,
} from '../shared/PageShell';

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';

  if (typeof selectedGuild === 'string') {
    return selectedGuild;
  }

  return selectedGuild.id || selectedGuild.guildId || '';
}

function SearchInput({
  theme,
  value,
  onChange,
}) {
  return (
    <input
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      placeholder="Search warnings..."
      style={{
        width: 'min(320px, 100%)',
        maxWidth: '100%',
        border: `1px solid ${theme.cardBorder}`,
        background:
          'rgba(10,18,35,0.96)',
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

function Badge({
  theme,
  tone = 'soft',
  children,
}) {
  const tones = {
    warning: {
      bg: 'rgba(245,158,11,0.14)',
      border:
        'rgba(245,158,11,0.28)',
      text: '#fcd34d',
    },

    success: {
      bg: 'rgba(34,197,94,0.13)',
      border:
        'rgba(34,197,94,0.28)',
      text: '#86efac',
    },

    soft: {
      bg: theme.softBg,
      border: theme.cardBorder,
      text: theme.mutedText,
    },
  };

  const current =
    tones[tone] || tones.soft;

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
        maxWidth: '100%',
      }}
    >
      {children}
    </span>
  );
}

export default function Warnings({
  selectedGuild,
  theme,
}) {
  const guildId =
    getGuildId(selectedGuild);

  const [warnings, setWarnings] =
    useState([]);

  const [
    selectedWarning,
    setSelectedWarning,
  ] = useState(null);

  const [search, setSearch] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  const [syncMessage, setSyncMessage] =
    useState('');

  const loadWarnings =
    useCallback(
      async ({
        quiet = false,
      } = {}) => {
        if (!guildId) {
          setWarnings([]);
          setSelectedWarning(null);
          setError('');
          setSyncMessage('');
          return;
        }

        try {
          if (quiet)
            setRefreshing(true);
          else setLoading(true);

          setError('');

          const data =
            await api.getWarnings(
              guildId,
            );

          const nextWarnings =
            normalizeWarnings(
              data,
              guildId,
            );

          setWarnings(nextWarnings);

          setSelectedWarning(
            (current) => {
              if (!current)
                return null;

              const currentKey =
                getWarningKey(
                  current,
                );

              return (
                nextWarnings.find(
                  (item) =>
                    getWarningKey(
                      item,
                    ) === currentKey,
                ) || null
              );
            },
          );
        } catch (err) {
          console.error(err);

          setWarnings([]);
          setSelectedWarning(
            null,
          );

          setError(
            'Could not load warnings.',
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [guildId],
    );

  useEffect(() => {
    loadWarnings();
  }, [loadWarnings]);

  useEffect(() => {
    if (!guildId)
      return undefined;

    joinGuildRoom(guildId);

    return listenForGuildUpdate(
      guildId,
      'warnings',
      (data) => {
        const nextWarnings =
          normalizeWarnings(
            data,
            guildId,
          );

        setWarnings(nextWarnings);

        setSelectedWarning(
          (current) => {
            if (!current)
              return null;

            const currentKey =
              getWarningKey(
                current,
              );

            return (
              nextWarnings.find(
                (item) =>
                  getWarningKey(
                    item,
                  ) === currentKey,
              ) || null
            );
          },
        );

        setSyncMessage(
          '✅ Warnings synced live.',
        );
      },
    );
  }, [guildId]);

  useEffect(() => {
    if (!syncMessage)
      return undefined;

    const timeout =
      setTimeout(() => {
        setSyncMessage('');
      }, 3000);

    return () =>
      clearTimeout(timeout);
  }, [syncMessage]);

  const filteredWarnings =
    useMemo(() => {
      const query = search
        .trim()
        .toLowerCase();

      if (!query) return warnings;

      return warnings.filter((w) =>
        [
          w.id,
          w.caseNumber,
          w.userTag,
          w.userId,
          w.moderatorTag,
          w.reason,
          w.cleared
            ? 'cleared'
            : 'active',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
    }, [warnings, search]);

  const stats = useMemo(() => {
    return {
      total: warnings.length,

      active: warnings.filter(
        (w) => !w.cleared,
      ).length,

      cleared: warnings.filter(
        (w) => w.cleared,
      ).length,
    };
  }, [warnings]);

  const formatDate =
    useCallback((value) => {
      if (!value) return 'Unknown';

      const d = new Date(value);

      return Number.isNaN(
        d.getTime(),
      )
        ? 'Unknown'
        : d.toLocaleString();
    }, []);

  return (
    <PageShell
      title="Warnings"
      subtitle={
        guildId
          ? 'Active and cleared warning records for this guild.'
          : 'Select a server to view warnings.'
      }
      theme={theme}
      guild={{
        id: guildId,
        name: 'Warnings',
      }}
      actions={
        guildId ? (
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems:
                'center',
              flexWrap: 'wrap',
              width: '100%',
              maxWidth: '100%',
            }}
          >
            <SearchInput
              theme={theme}
              value={search}
              onChange={setSearch}
            />

            <SecondaryButton
              theme={theme}
              onClick={() =>
                loadWarnings({
                  quiet: true,
                })
              }
              disabled={refreshing}
            >
              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </SecondaryButton>
          </div>
        ) : null
      }
    >
      {!guildId ? (
        <EmptyState
          theme={theme}
          text="Select a server to view warnings."
        />
      ) : null}

      {error ? (
        <Notice
          theme={theme}
          tone="danger"
        >
          {error}
        </Notice>
      ) : null}

      {syncMessage ? (
        <Notice
          theme={theme}
          tone="success"
        >
          {syncMessage}
        </Notice>
      ) : null}

      {guildId ? (
        <StatGrid min="min(220px, 100%)">
          <SummaryStat
            theme={theme}
            label="Total Warnings"
            value={stats.total}
            accent="#3b82f6"
            description="Stored warning records"
          />

          <SummaryStat
            theme={theme}
            label="Active"
            value={stats.active}
            accent="#f59e0b"
            description="Warnings currently active"
          />

          <SummaryStat
            theme={theme}
            label="Cleared"
            value={stats.cleared}
            accent="#22c55e"
            description="Warnings already cleared"
          />

          <SummaryStat
            theme={theme}
            label="Results"
            value={
              filteredWarnings.length
            }
            description="Filtered warning list"
          />
        </StatGrid>
      ) : null}

      {guildId && loading ? (
        <LoadingPanel
          theme={theme}
          text="Loading warnings..."
        />
      ) : null}

      {guildId && !loading ? (
        <>
          {filteredWarnings.length ===
          0 ? (
            <EmptyState
              theme={theme}
              title="No warnings found"
              text="No warning records match this server or search."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
                gap:
                  'clamp(16px, 3vw, 24px)',
                alignItems:
                  'start',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              <SectionCard
                theme={theme}
                title="Warning History"
                subtitle="Select a warning to inspect the full warning record."
                actions={
                  <Badge
                    theme={theme}
                    tone="soft"
                  >
                    {
                      filteredWarnings.length
                    }
                  </Badge>
                }
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  {filteredWarnings.map(
                    (w) => {
                      const key =
                        getWarningKey(
                          w,
                        );

                      return (
                        <WarningItem
                          key={key}
                          item={w}
                          active={
                            getWarningKey(
                              selectedWarning,
                            ) === key
                          }
                          theme={
                            theme
                          }
                          formatDate={
                            formatDate
                          }
                          onClick={() =>
                            setSelectedWarning(
                              w,
                            )
                          }
                        />
                      );
                    },
                  )}
                </div>
              </SectionCard>

              {selectedWarning ? (
                <WarningDetail
                  item={
                    selectedWarning
                  }
                  theme={theme}
                  formatDate={
                    formatDate
                  }
                  onClose={() =>
                    setSelectedWarning(
                      null,
                    )
                  }
                />
              ) : (
                <EmptyState
                  theme={theme}
                  title="No warning selected"
                  text="Select a warning to view full details."
                />
              )}
            </div>
          )}
        </>
      ) : null}
    </PageShell>
  );
}

const WarningItem = memo(
  function WarningItem({
    item,
    active,
    theme,
    formatDate,
    onClick,
  }) {
    const tone = item.cleared
      ? 'success'
      : 'warning';

    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,

          border: `1px solid ${
            active
              ? theme.primaryBorder
              : theme.cardBorder
          }`,

          background: active
            ? theme.primarySoft
            : theme.softBg,

          borderRadius: 16,

          padding:
            'clamp(14px, 3vw, 16px)',

          cursor: 'pointer',

          textAlign: 'left',

          display: 'grid',

          gap: 9,

          boxShadow: active
            ? theme.shadow
            : 'none',

          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems:
              'flex-start',
            justifyContent:
              'space-between',
            gap: 12,
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          <h4
            style={{
              margin: 0,
              color:
                theme.cardText,
              fontSize: 15,
              fontWeight: 900,
              overflowWrap:
                'break-word',
            }}
          >
            Warning #
            {item.id ||
              item.caseNumber ||
              '—'}
          </h4>

          <Badge
            theme={theme}
            tone={tone}
          >
            {item.cleared
              ? 'Cleared'
              : 'Active'}
          </Badge>
        </div>

        <p
          style={{
            margin: 0,
            color:
              theme.mutedText,
            fontSize: 13,
            fontWeight: 700,
            wordBreak:
              'break-word',
          }}
        >
          User:{' '}
          {item.userTag ||
            item.userId ||
            'Unknown'}
        </p>

        <p
          style={{
            margin: 0,
            color:
              theme.cardText,
            fontSize: 14,
            lineHeight: 1.45,
            fontWeight: 700,
            wordBreak:
              'break-word',
          }}
        >
          {item.reason ||
            'No reason provided'}
        </p>

        <p
          style={{
            margin: 0,
            color:
              theme.mutedText,
            fontSize: 12,
            fontWeight: 700,
            wordBreak:
              'break-word',
          }}
        >
          {formatDate(
            item.createdAt,
          )}
        </p>
      </button>
    );
  },
);

const WarningDetail = memo(
  function WarningDetail({
    item,
    theme,
    formatDate,
    onClose,
  }) {
    const tone = item.cleared
      ? 'success'
      : 'warning';

    return (
      <SectionCard
        theme={theme}
        title={`Warning #${
          item.id ||
          item.caseNumber ||
          '—'
        }`}
        subtitle="Full warning details."
        actions={
          <Badge
            theme={theme}
            tone={tone}
          >
            {item.cleared
              ? 'Cleared'
              : 'Active'}
          </Badge>
        }
      >
        <div
          style={{
            display: 'grid',
            gap: 12,
            minWidth: 0,
          }}
        >
          <DetailRow
            theme={theme}
            label="User"
            value={
              item.userTag ||
              item.userId ||
              'Unknown'
            }
          />

          <DetailRow
            theme={theme}
            label="Moderator"
            value={
              item.moderatorTag ||
              'Unknown'
            }
          />

          <DetailRow
            theme={theme}
            label="Date"
            value={formatDate(
              item.createdAt,
            )}
          />

          <DetailRow
            theme={theme}
            label="Reason"
            value={
              item.reason ||
              'No reason provided'
            }
          />

          <DetailRow
            theme={theme}
            label="Status"
            value={
              item.cleared
                ? 'Cleared'
                : 'Active'
            }
            accent={
              item.cleared
                ? '#22c55e'
                : '#f59e0b'
            }
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <SecondaryButton
            theme={theme}
            onClick={onClose}
          >
            Close
          </SecondaryButton>
        </div>
      </SectionCard>
    );
  },
);

const DetailRow = memo(
  function DetailRow({
    label,
    value,
    theme,
    accent = null,
  }) {
    return (
      <div
        style={{
          display: 'grid',
          gap: 6,

          padding:
            '13px 14px',

          borderRadius: 14,

          background:
            theme.softBg,

          border: `1px solid ${theme.cardBorder}`,

          minWidth: 0,

          overflow: 'hidden',
        }}
      >
        <p
          style={{
            margin: 0,

            color:
              theme.mutedText,

            fontSize: 11,

            fontWeight: 900,

            textTransform:
              'uppercase',

            letterSpacing:
              '0.08em',
          }}
        >
          {label}
        </p>

        <p
          style={{
            margin: 0,

            color:
              accent ||
              theme.cardText,

            fontSize: 14,

            fontWeight: 800,

            lineHeight: 1.45,

            wordBreak:
              'break-word',
          }}
        >
          {value}
        </p>
      </div>
    );
  },
);

function normalizeWarnings(
  data,
  guildId,
) {
  if (!data) return [];

  let rawWarnings = [];

  if (Array.isArray(data)) {
    rawWarnings = data;
  } else if (
    Array.isArray(data.warnings)
  ) {
    rawWarnings =
      data.warnings;
  } else if (
    data.warnings &&
    typeof data.warnings ===
      'object'
  ) {
    rawWarnings =
      Object.values(
        data.warnings,
      );
  } else if (
    guildId &&
    data[guildId]
  ) {
    return normalizeWarnings(
      data[guildId],
      guildId,
    );
  } else if (
    typeof data === 'object'
  ) {
    rawWarnings =
      Object.values(data).filter(
        (item) =>
          item &&
          typeof item ===
            'object' &&
          !Array.isArray(item),
      );
  }

  return rawWarnings
    .map((w, index) =>
      normalizeWarning(
        w,
        guildId,
        index,
      ),
    )
    .sort((a, b) => {
      const aNumber = Number(
        a.caseNumber ||
          a.id ||
          0,
      );

      const bNumber = Number(
        b.caseNumber ||
          b.id ||
          0,
      );

      if (
        aNumber !== bNumber
      ) {
        return (
          bNumber - aNumber
        );
      }

      const aTime =
        new Date(
          a.createdAt || 0,
        ).getTime() || 0;

      const bTime =
        new Date(
          b.createdAt || 0,
        ).getTime() || 0;

      return bTime - aTime;
    });
}

function normalizeWarning(
  w,
  guildId,
  index = 0,
) {
  const id =
    w.id ||
    w.warningId ||
    w.caseNumber ||
    w.case ||
    index + 1;

  return {
    ...w,

    guildId:
      w.guildId || guildId,

    id,

    caseNumber:
      w.caseNumber ||
      w.case ||
      id,

    userTag:
      w.userTag ||
      w.user ||
      w.targetTag ||
      w.target,

    userId:
      w.userId ||
      w.targetId,

    moderatorTag:
      w.moderatorTag ||
      w.moderator,

    reason: w.reason,

    cleared:
      w.cleared === true,

    createdAt:
      w.createdAt ||
      w.timestamp ||
      w.date,
  };
}

function getWarningKey(w) {
  if (!w) return '';

  return `${w.guildId}-${
    w.id ||
    w.caseNumber ||
    w.createdAt
  }`;
}