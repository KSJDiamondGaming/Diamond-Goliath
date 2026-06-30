import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../../services/apiClient.js';
import LegacyEmbedStudio from '../EmbedStudio.jsx';
import SharedEmbedTemplatesPanel from './SharedEmbedTemplatesPanel.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function noticeStyle(theme, tone = 'success') {
  return {
    border: `1px solid ${tone === 'danger' ? 'rgba(252,165,165,0.35)' : 'rgba(134,239,172,0.35)'}`,
    background: tone === 'danger' ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
    color: tone === 'danger' ? '#fca5a5' : '#86efac',
    borderRadius: 16,
    padding: 14,
    fontWeight: 850,
  };
}

export default function EmbedStudioEnhanced(props) {
  const { selectedGuild, selectedGuildData, theme } = props;
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [payload, setPayload] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!guildId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.getEmbedStudio(guildId);
      setPayload(result || {});
    } catch (loadError) {
      setError(loadError.message || 'Failed to load shared embed templates.');
    } finally {
      setBusy(false);
    }
  }, [guildId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, successMessage) {
    if (!guildId) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      setPayload(result || {});
      setNotice(successMessage);
      return result;
    } catch (actionError) {
      setError(actionError.message || 'Embed template action failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate(template) {
    return run(() => api.saveEmbedTemplate(guildId, template), 'Shared embed template saved.');
  }

  async function bindTemplate(moduleKey, slot, templateId) {
    return run(() => api.bindEmbedTemplate(guildId, moduleKey, slot, templateId), 'Template binding saved.');
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {error ? <section style={noticeStyle(theme, 'danger')}>{error}</section> : null}
      {notice ? <section style={noticeStyle(theme, 'success')}>{notice}</section> : null}
      <SharedEmbedTemplatesPanel
        theme={theme}
        payload={payload}
        busy={busy}
        onReload={load}
        onSaveTemplate={saveTemplate}
        onBindTemplate={bindTemplate}
      />
      <LegacyEmbedStudio {...props} />
    </div>
  );
}
