import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  DetailGrid,
  DetailRow,
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  SectionCard,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const PAGE_KEY = 'cases';

export default function Cases({ selectedGuild, theme }) {
  const [cases, setCases] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Cases',
    description: 'Moderation case history across the selected guild.',
    emptyDescription: 'Select a server to view moderation case history.',
    sections: [{ id: 'caseTable', type: 'table' }],
  };

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
        if (mounted) setLoading(false);
      }
    }

    loadCases();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const sortedCases = useMemo(() => {
    const flatCases = normalizeCases(cases, selectedGuild);
    return flatCases.sort((a, b) => Number(b?.caseNumber ?? 0) - Number(a?.caseNumber ?? 0));
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

  return (
    <PageShell
      title={page.title || 'Cases'}
      subtitle={
        selectedGuild
          ? page.description || 'Moderation case history across the selected guild.'
          : page.emptyDescription || 'Select a server to view moderation case history.'
      }
      theme={theme}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.caseTable?.title || 'Cases'}
        subtitle={
          SECTION_DEFS?.caseTable?.description ||
          'Browse case history and open a record to inspect full moderation details.'
        }
        padding="20px"
      >
        {!selectedGuild ? (
          <EmptyState theme={theme} text="Select a guild to view cases." />
        ) : loading ? (
          <LoadingPanel theme={theme} text="Loading cases..." />
        ) : sortedCases.length === 0 ? (
          <EmptyState theme={theme} text="No cases found." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selectedCase ? 'minmax(0, 1fr) minmax(320px, 0.82fr)' : '1fr',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
              {sortedCases.map((caseItem) => {
                const caseKey = `${caseItem.guildId}-${caseItem.caseNumber}`;
                const isSelected = selectedCaseKey === caseKey;
                const actionColor = getActionColor(caseItem.action);

                return (
                  <button
                    key={caseKey}
                    type="button"
                    onClick={() => setSelectedCase(caseItem)}
                    style={{
                      background: theme.cardBg,
                      padding: '18px',
                      borderRadius: '18px',
                      boxShadow: theme.shadow,
                      borderLeft: `6px solid ${actionColor}`,
                      borderTop: `1px solid ${isSelected ? actionColor : theme.cardBorder}`,
                      borderRight: `1px solid ${isSelected ? actionColor : theme.cardBorder}`,
                      borderBottom: `1px solid ${isSelected ? actionColor : theme.cardBorder}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, color: theme.cardText, fontSize: '18px' }}>
                          Case #{caseItem.caseNumber}
                        </h3>
                        <span
                          style={{
                            background: actionColor,
                            color: '#fff',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 800,
                          }}
                        >
                          {caseItem.action}
                        </span>
                      </div>

                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>Target:</strong> {caseItem.targetTag || 'Unknown'}
                      </p>
                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>Moderator:</strong> {caseItem.moderatorTag || 'Unknown'}
                      </p>
                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>Reason:</strong> {caseItem.reason || 'No reason provided'}
                      </p>
                      <p style={{ margin: 0, color: theme.mutedText, fontSize: '13px' }}>
                        {formatDate(caseItem.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedCase ? (
              <SectionCard
                theme={theme}
                title={`Case #${selectedCase.caseNumber}`}
                actions={
                  <SecondaryButton onClick={() => setSelectedCase(null)} theme={theme}>
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
                  <DetailRow label="Reason" value={selectedCase.reason || 'No reason provided'} theme={theme} />
                </DetailGrid>
              </SectionCard>
            ) : null}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

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