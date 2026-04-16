import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import DashboardPage, {
  DetailGrid,
  DetailRow,
  EmptyState,
  SecondaryButton,
  SectionCard,
  StatGrid,
} from '../components/Dashboard';

export default function Warnings({ selectedGuild, theme }) {
  const [warnings, setWarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWarning, setSelectedWarning] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadWarnings() {
      if (!selectedGuild) {
        if (mounted) {
          setWarnings(null);
          setLoading(false);
          setError('');
          setSelectedWarning(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSelectedWarning(null);

        const data = await api.getWarnings(selectedGuild);

        if (!mounted) return;

        setWarnings(data || null);
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setWarnings(null);
        setError('Could not load warnings.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadWarnings();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const warningList = useMemo(() => {
    const normalized = normalizeWarnings(warnings, selectedGuild);

    return normalized.sort((a, b) => {
      const caseNumberA = Number(a?.caseNumber ?? 0);
      const caseNumberB = Number(b?.caseNumber ?? 0);
      return caseNumberB - caseNumberA;
    });
  }, [warnings, selectedGuild]);

  const stats = useMemo(() => {
    const active = warningList.filter((warning) => warning.cleared !== true);
    const cleared = warningList.filter((warning) => warning.cleared === true);

    return {
      total: warningList.length,
      active: active.length,
      cleared: cleared.length,
    };
  }, [warningList]);

  const selectedWarningKey = useMemo(() => {
    if (!selectedWarning) return null;
    return `${selectedWarning.guildId}-${selectedWarning.caseNumber}`;
  }, [selectedWarning]);

  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  }, []);

  const getWarningStyle = useCallback(
    (warning) => {
      if (warning.cleared === true) {
        return {
          bg: theme.softBg,
          badgeBg: '#bbf7d0',
          badgeColor: '#166534',
          border: '#16a34a',
        };
      }

      return {
        bg: theme.softBg,
        badgeBg: '#bfdbfe',
        badgeColor: '#1d4ed8',
        border: '#2563eb',
      };
    },
    [theme.softBg]
  );

  return (
    <DashboardPage
      title="Warnings"
      subtitle={
        selectedGuild
          ? 'Warning history, active counts, and cleared records.'
          : 'Select a server to view warning history.'
      }
      theme={theme}
    >
      {error ? <p style={{ color: '#ef4444', margin: 0 }}>{error}</p> : null}

      <StatGrid>
        <StatCard title="Total Warnings" value={loading ? '...' : stats.total} theme={theme} />
        <StatCard
          title="Active Warnings"
          value={loading ? '...' : stats.active}
          theme={theme}
          color="#1d4ed8"
        />
        <StatCard
          title="Cleared Warnings"
          value={loading ? '...' : stats.cleared}
          theme={theme}
          color="#166534"
        />
      </StatGrid>

      <div
        className="warnings-responsive-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: selectedWarning ? 'minmax(0, 1fr) minmax(320px, 0.82fr)' : '1fr',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0, display: 'grid', gap: '12px' }}>
          {!selectedGuild ? (
            <EmptyState theme={theme} text="Select a guild to view warnings." />
          ) : loading ? (
            <EmptyState theme={theme} text="Loading warnings..." />
          ) : warningList.length === 0 ? (
            <EmptyState theme={theme} text="No warnings found." />
          ) : (
            warningList.map((warning) => {
              const warningKey = `${warning.guildId}-${warning.caseNumber}`;
              const style = getWarningStyle(warning);

              return (
                <WarningRow
                  key={warningKey}
                  warning={warning}
                  theme={theme}
                  rowStyle={style}
                  isSelected={selectedWarningKey === warningKey}
                  onSelect={setSelectedWarning}
                  formatDate={formatDate}
                />
              );
            })
          )}
        </div>

        {selectedWarning ? (
          <WarningDetails
            selectedWarning={selectedWarning}
            theme={theme}
            onClose={() => setSelectedWarning(null)}
            formatDate={formatDate}
          />
        ) : null}
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .warnings-responsive-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </DashboardPage>
  );
}

const WarningRow = memo(function WarningRow({
  warning,
  theme,
  rowStyle,
  isSelected,
  onSelect,
  formatDate,
}) {
  const handleClick = useCallback(() => {
    onSelect(warning);
  }, [onSelect, warning]);

  const borderColor = isSelected ? rowStyle.border : theme.cardBorder;

  return (
    <button
      onClick={handleClick}
      style={{
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `6px solid ${rowStyle.border}`,
        borderRadius: '18px',
        padding: '16px',
        background: rowStyle.bg,
        textAlign: 'left',
        cursor: 'pointer',
        outline: 'none',
        boxShadow: theme.shadow,
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <strong style={{ color: theme.cardText, fontSize: '18px' }}>
              Case #{warning.caseNumber}
            </strong>

            <span
              style={{
                background: rowStyle.badgeBg,
                color: rowStyle.badgeColor,
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              {warning.cleared === true ? 'Cleared' : 'Active'}
            </span>
          </div>

          <p style={{ margin: '10px 0 0 0', color: theme.cardText }}>
            <strong>Target:</strong> {warning.targetTag || 'Unknown'}
          </p>

          <p style={{ margin: '6px 0 0 0', color: theme.cardText }}>
            <strong>Moderator:</strong> {warning.moderatorTag || 'Unknown'}
          </p>

          <p style={{ margin: '6px 0 0 0', color: theme.cardText }}>
            <strong>Reason:</strong> {warning.reason || 'No reason provided'}
          </p>
        </div>

        <div style={{ minWidth: '180px', textAlign: 'right' }}>
          <p
            style={{
              margin: 0,
              color: theme.mutedText,
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Created
          </p>
          <p
            style={{
              margin: '6px 0 0 0',
              color: theme.cardText,
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            {formatDate(warning.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
});

const WarningDetails = memo(function WarningDetails({
  selectedWarning,
  theme,
  onClose,
  formatDate,
}) {
  return (
    <SectionCard
      theme={theme}
      title={`Warning #${selectedWarning.caseNumber}`}
      actions={
        <SecondaryButton onClick={onClose} theme={theme}>
          Close
        </SecondaryButton>
      }
      padding="20px"
    >
      <DetailGrid>
        <DetailRow label="Server" value={selectedWarning.guildId} theme={theme} />
        <DetailRow
          label="Status"
          value={selectedWarning.cleared === true ? 'Cleared' : 'Active'}
          theme={theme}
        />
        <DetailRow
          label="Target"
          value={`${selectedWarning.targetTag || 'Unknown'} (${selectedWarning.targetId || 'Unknown'})`}
          theme={theme}
        />
        <DetailRow
          label="Moderator"
          value={`${selectedWarning.moderatorTag || 'Unknown'} (${selectedWarning.moderatorId || 'Unknown'})`}
          theme={theme}
        />
        <DetailRow label="Created" value={formatDate(selectedWarning.createdAt)} theme={theme} />
        <DetailRow
          label="Reason"
          value={selectedWarning.reason || 'No reason provided'}
          theme={theme}
        />

        {selectedWarning.evidence ? (
          <DetailRow label="Evidence" value={selectedWarning.evidence} theme={theme} />
        ) : null}

        {selectedWarning.cleared === true ? (
          <>
            <DetailRow
              label="Cleared By"
              value={selectedWarning.clearedByTag || 'Unknown'}
              theme={theme}
            />
            <DetailRow
              label="Cleared At"
              value={formatDate(selectedWarning.clearedAt)}
              theme={theme}
            />
            {selectedWarning.clearReason ? (
              <DetailRow
                label="Clear Reason"
                value={selectedWarning.clearReason}
                theme={theme}
              />
            ) : null}
          </>
        ) : null}
      </DetailGrid>

      {selectedWarning.notes && selectedWarning.notes.length > 0 ? (
        <div style={{ display: 'grid', gap: '10px' }}>
          <h3 style={{ margin: 0, color: theme.cardText }}>Notes</h3>

          <div style={{ display: 'grid', gap: '10px' }}>
            {selectedWarning.notes.map((note, index) => (
              <div
                key={index}
                style={{
                  background: theme.softBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '14px',
                  padding: '14px',
                }}
              >
                <p style={{ margin: 0, color: theme.cardText }}>{note.text}</p>
                <p style={{ margin: '8px 0 0 0', color: theme.mutedText, fontSize: '13px' }}>
                  {note.moderatorTag} • {formatDate(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
});

const StatCard = memo(function StatCard({ title, value, theme, color }) {
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        padding: '20px',
        borderRadius: '18px',
        boxShadow: theme.shadow,
        minWidth: '180px',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '24px',
          fontWeight: 800,
          margin: '10px 0 0 0',
          color: color || theme.cardText,
        }}
      >
        {value}
      </p>
    </div>
  );
});

function normalizeWarnings(data, selectedGuild) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((warning) => ({
      ...warning,
      guildId: warning.guildId || selectedGuild || 'Unknown',
    }));
  }

  if (typeof data !== 'object') {
    return [];
  }

  if (selectedGuild && data[selectedGuild]) {
    return normalizeWarningCollection(data[selectedGuild], selectedGuild);
  }

  const objectValues = Object.values(data);
  const looksLikeSingleGuildArray = objectValues.some((value) => value && typeof value === 'object' && 'caseNumber' in value);

  if (looksLikeSingleGuildArray) {
    return normalizeWarningCollection(data, selectedGuild || 'Unknown');
  }

  return Object.entries(data).flatMap(([guildId, guildWarnings]) =>
    normalizeWarningCollection(guildWarnings, guildId)
  );
}

function normalizeWarningCollection(collection, guildId) {
  if (!collection) return [];

  if (Array.isArray(collection)) {
    return collection.map((warning) => ({
      ...warning,
      guildId: warning.guildId || guildId,
    }));
  }

  if (typeof collection !== 'object') {
    return [];
  }

  return Object.values(collection).map((warning) => ({
    ...warning,
    guildId: warning.guildId || guildId,
  }));
}