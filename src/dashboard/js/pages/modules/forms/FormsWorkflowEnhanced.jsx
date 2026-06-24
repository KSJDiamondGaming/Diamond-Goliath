import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../../services/apiClient.js';
import LegacyForms from '../Forms.jsx';
import FormsWorkflowPanel from './FormsWorkflowPanel.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '')
    .split(':')
    .pop()
    .trim();
}

export default function FormsWorkflowEnhanced(props) {
  const { selectedGuild, selectedGuildData, theme } = props;
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  const loadWorkflowOverview = useCallback(async () => {
    if (!guildId) {
      setOverview(null);
      setError('');
      return;
    }

    try {
      setError('');
      const result = await api.getFormsWorkflowOverview(guildId);
      setOverview(result?.overview || null);
    } catch (err) {
      setError(err.message || 'Could not load Forms workflow overview.');
    }
  }, [guildId]);

  useEffect(() => {
    loadWorkflowOverview();
  }, [loadWorkflowOverview]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {overview ? <FormsWorkflowPanel theme={theme} overview={overview} /> : null}
      {error ? (
        <section style={{
          border: `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.22)'}`,
          background: theme?.cardBg || 'rgba(15,23,42,0.40)',
          color: '#fca5a5',
          borderRadius: 18,
          padding: 14,
          fontWeight: 850,
        }}>
          {error}
        </section>
      ) : null}
      <LegacyForms {...props} />
    </div>
  );
}
