import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../../services/apiClient.js';
import FormsFinalPolishPanel from './FormsFinalPolishPanel.jsx';
import FormsWorkflowPanel from './FormsWorkflowPanel.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '')
    .split(':')
    .pop()
    .trim();
}

function list(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

export default function FormsWorkflowEnhanced(props) {
  const { selectedGuild, selectedGuildData, theme } = props;
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState(null);
  const [forms, setForms] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadWorkflowOverview = useCallback(async () => {
    if (!guildId) {
      setOverview(null);
      setForms([]);
      setSubmissions([]);
      setError('');
      return;
    }

    try {
      setRefreshing(true);
      setError('');
      const [overviewResult, formsResult, submissionsResult] = await Promise.all([
        api.getFormsOverview(guildId),
        api.getForms(guildId),
        api.getFormSubmissions(guildId, 'limit=200'),
      ]);
      setOverview(overviewResult?.overview || null);
      setForms(list(formsResult, 'forms'));
      setSubmissions(list(submissionsResult, 'submissions'));
    } catch (err) {
      setError(err.message || 'Could not load Forms workflow overview.');
    } finally {
      setRefreshing(false);
    }
  }, [guildId]);

  useEffect(() => {
    loadWorkflowOverview();
  }, [loadWorkflowOverview]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {overview ? <FormsWorkflowPanel theme={theme} overview={overview} guildId={guildId} onRefresh={loadWorkflowOverview} /> : null}
      <FormsFinalPolishPanel
        theme={theme}
        forms={forms}
        submissions={submissions}
        refreshing={refreshing}
        onRefresh={loadWorkflowOverview}
      />
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
    </div>
  );
}
