import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import DashboardPage, {
  DetailGrid,
  DetailRow,
  EmptyState,
  SecondaryButton,
  SectionCard,
} from '../components/DashboardPage';

export default function Cases({ selectedGuild, theme }) {
  const [cases, setCases] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadCases() {
      if (!selectedGuild) {
        if (mounted) {
          setCases(null);
          setLoading(false);
          setError('');
          setSelectedCase(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSelectedCase(null);

        const data = await api.getCases(selectedGuild);

        if (!mounted) return;

        setCases(data || null);
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setCases(null);
        setError('Could not load cases.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCases();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const sortedCases = useMemo(() => {
    const flatCases = normalizeCases(cases, selectedGuild);

    return flatCases.sort((a, b) => {
      const caseNumberA = Number(a?.caseNumber ?? 0);
      const caseNumberB = Number(b?.caseNumber ?? 0);
      return caseNumberB - caseNumberA;
    });
  }, [cases, selectedGuild]);

  const selectedCaseKey = useMemo(() => {
    if (!selectedCase) return null;
    return `${selectedCase.guildId}-${selectedCase.caseNumber}`;
  }, [selectedCase]);

  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  }, []);

  const getActionColor = useCallback((action) => {
    switch (action) {
      case 'Ban':
        return '#dc2626';
      case 'Kick':
        return '#ea580c';
      case 'Timeout':
        return '#ca8a04';
      case 'Warn':
        return '#2563eb';
      case 'ClearWarnings':
        return '#6b7280';
      default:
        return '#374151';
    }
  }, []);

  const handleSelectCase = useCallback((caseItem) => {
    setSelectedCase(caseItem);
  }, []);

  const handleCloseCase = useCallback(() => {
    setSelectedCase(null);
  }, []);

  const leftPanel = (
    <div style={{ display: 'grid', gap: '14px' }}>
      {!selectedGuild ? (
        <EmptyState theme={theme} text="Select a guild to view cases." />
      ) : loading ? (
        <EmptyState theme={theme} text="Loading cases..." />
      ) : sortedCases.length === 0 ? (
        <EmptyState theme={theme} text="No cases found." />
      ) : (
        sortedCases.map((caseItem) => {
          const caseKey = `${caseItem.guildId}-${caseItem.caseNumber}`;

          return (
            <CaseRow
              key={caseKey}
              caseItem={caseItem}
              theme={theme}
              isSelected={selectedCaseKey === caseKey}
              actionColor={getActionColor(caseItem.action)}
              onSelect={handleSelectCase}
              formatDate={formatDate}
            />
          );
        })
      )}
    </div>
  );

  const rightPanel = selectedCase ? (
    <CaseDetails
      selectedCase={selectedCase}
      theme={theme}
      onClose={handleCloseCase}
      formatDate={formatDate}
    />
  ) : null;

  return (
    <DashboardPage
      title="Cases"
      subtitle={
        selectedGuild
          ? 'Moderation case history across the selected guild.'
          : 'Select a server to view moderation case history.'
      }
      theme={theme}
    >
      {error ? <p style={{ color: '#ef4444', margin: 0 }}>{error}</p> : null}

      <div
        className="cases-responsive-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: selectedCase ? 'minmax(0, 1fr) minmax(320px, 0.82fr)' : '1fr',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>{leftPanel}</div>
        {selectedCase ? <div style={{ minWidth: 0 }}>{rightPanel}</div> : null}
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .cases-responsive-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </DashboardPage>
  );
}

const CaseRow = memo(function CaseRow({
  caseItem,
  theme,
  isSelected,
  actionColor,
  onSelect,
  formatDate,
}) {
  const handleClick = useCallback(() => {
    onSelect(caseItem);
  }, [onSelect, caseItem]);

  const borderColor = isSelected ? actionColor : theme.cardBorder;

  return (
    <button
      onClick={handleClick}
      style={{
        background: theme.cardBg,
        padding: '18px',
        borderRadius: '18px',
        boxShadow: theme.shadow,
        borderLeft: `6px solid ${actionColor}`,
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        textAlign: 'left',
        cursor: 'pointer',
        outline: 'none',
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
            <h3 style={{ margin: 0, color: theme.cardText, fontSize: '18px' }}>
              Case #{caseItem.caseNumber}
            </h3>

            <span
              style={{
                background: actionColor,
                color: 'white',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              {caseItem.action}
            </span>

            {caseItem.cleared === true ? (
              <span
                style={{
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                Cleared
              </span>
            ) : null}
          </div>

          <p style={{ margin: '10px 0 0 0', color: theme.cardText }}>
            <strong>Target:</strong> {caseItem.targetTag || 'Unknown'}
          </p>

          <p style={{ margin: '6px 0 0 0', color: theme.cardText }}>
            <strong>Moderator:</strong> {caseItem.moderatorTag || 'Unknown'}
          </p>

          <p style={{ margin: '6px 0 0 0', color: theme.cardText }}>
            <strong>Reason:</strong> {caseItem.reason || 'No reason provided'}
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
            Case record
          </p>
          <p
            style={{
              margin: '8px 0 0 0',
              color: theme.cardText,
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            {formatDate(caseItem.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
});

const CaseDetails = memo(function CaseDetails({ selectedCase, theme, onClose, formatDate }) {
  return (
    <SectionCard
      theme={theme}
      title={`Case #${selectedCase.caseNumber}`}
      actions={
        <SecondaryButton onClick={onClose} theme={theme}>
          Close
        </SecondaryButton>
      }
      padding="20px"
    >
      <DetailGrid>
        <DetailRow label="Server" value={selectedCase.guildId} theme={theme} />
        <DetailRow label="Action" value={selectedCase.action || 'Unknown'} theme={theme} />
        <DetailRow
          label="Target"
          value={`${selectedCase.targetTag || 'Unknown'} (${selectedCase.targetId || 'Unknown'})`}
          theme={theme}
        />
        <DetailRow
          label="Moderator"
          value={`${selectedCase.moderatorTag || 'Unknown'} (${selectedCase.moderatorId || 'Unknown'})`}
          theme={theme}
        />
        <DetailRow label="Created" value={formatDate(selectedCase.createdAt)} theme={theme} />
        <DetailRow
          label="Reason"
          value={selectedCase.reason || 'No reason provided'}
          theme={theme}
        />
        {selectedCase.duration ? (
          <DetailRow label="Duration" value={selectedCase.duration} theme={theme} />
        ) : null}
        {selectedCase.evidence ? (
          <DetailRow label="Evidence" value={selectedCase.evidence} theme={theme} />
        ) : null}
        {selectedCase.cleared === true ? (
          <>
            <DetailRow label="Cleared" value="Yes" theme={theme} />
            <DetailRow
              label="Cleared By"
              value={selectedCase.clearedByTag || 'Unknown'}
              theme={theme}
            />
            <DetailRow
              label="Cleared At"
              value={formatDate(selectedCase.clearedAt)}
              theme={theme}
            />
            {selectedCase.clearReason ? (
              <DetailRow
                label="Clear Reason"
                value={selectedCase.clearReason}
                theme={theme}
              />
            ) : null}
          </>
        ) : null}
      </DetailGrid>

      <div style={{ display: 'grid', gap: '10px' }}>
        <h3 style={{ margin: 0, color: theme.cardText }}>Notes</h3>

        {!selectedCase.notes || selectedCase.notes.length === 0 ? (
          <div
            style={{
              background: theme.softBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '14px',
              padding: '14px',
              color: theme.mutedText,
            }}
          >
            No notes on this case.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {selectedCase.notes.map((note, index) => (
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
        )}
      </div>
    </SectionCard>
  );
});

function normalizeCases(data, selectedGuild) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((caseItem) => ({
      ...caseItem,
      guildId: caseItem.guildId || selectedGuild || 'Unknown',
    }));
  }

  if (typeof data !== 'object') {
    return [];
  }

  if (selectedGuild && data[selectedGuild]) {
    return normalizeCaseCollection(data[selectedGuild], selectedGuild);
  }

  const looksLikeSingleGuildCollection = Object.values(data).every(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );

  if (looksLikeSingleGuildCollection && Object.values(data).some((value) => 'caseNumber' in value)) {
    return normalizeCaseCollection(data, selectedGuild || 'Unknown');
  }

  return Object.entries(data).flatMap(([guildId, guildCases]) =>
    normalizeCaseCollection(guildCases, guildId)
  );
}

function normalizeCaseCollection(collection, guildId) {
  if (!collection) return [];

  if (Array.isArray(collection)) {
    return collection.map((caseItem) => ({
      ...caseItem,
      guildId: caseItem.guildId || guildId,
    }));
  }

  if (typeof collection !== 'object') {
    return [];
  }

  return Object.values(collection).map((caseItem) => ({
    ...caseItem,
    guildId: caseItem.guildId || guildId,
  }));
}