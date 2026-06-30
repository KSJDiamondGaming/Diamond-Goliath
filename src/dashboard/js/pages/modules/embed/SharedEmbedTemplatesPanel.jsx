import React, { useMemo, useState } from 'react';

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function fieldStyle(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.55)',
    color: theme.cardText,
    borderRadius: 12,
    padding: '10px 11px',
    fontWeight: 850,
    outline: 'none',
    width: '100%',
  };
}

function buttonStyle(theme, variant = 'soft', disabled = false) {
  const variants = {
    soft: { background: 'rgba(15,23,42,0.35)', color: theme.cardText, border: `1px solid ${theme.cardBorder}` },
    primary: { background: 'rgba(37,99,235,0.24)', color: theme.cardText, border: '1px solid rgba(147,197,253,0.35)' },
    success: { background: 'rgba(34,197,94,0.14)', color: '#86efac', border: '1px solid rgba(134,239,172,0.35)' },
  };

  return {
    ...variants[variant],
    borderRadius: 12,
    padding: '10px 12px',
    fontWeight: 950,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

function Pill({ children, tone = '#93c5fd' }) {
  return <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</span>;
}

function MiniStat({ theme, label, value, accent = '#93c5fd' }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 12 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 950, color: accent }}>{value}</div>
    </div>
  );
}

function TemplateCard({ theme, template }) {
  const unsupported = safeArray(template.unsupportedVariables);
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 13, display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: theme.cardText }}>{template.name || template.templateId}</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill>{template.module || 'global'}</Pill>
          <Pill tone={unsupported.length ? '#fca5a5' : '#86efac'}>{unsupported.length ? 'Check vars' : 'Ready'}</Pill>
        </div>
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>{template.embed?.title || template.title || 'Untitled embed'}</div>
      <div style={{ color: theme.mutedText, fontSize: 12 }}>Updated: {formatDate(template.updatedAt)} • Version {template.version || 1}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {safeArray(template.usedVariables).slice(0, 8).map((variable) => <span key={variable} style={{ color: theme.mutedText, border: `1px solid ${theme.cardBorder}`, borderRadius: 999, padding: '3px 7px', fontSize: 11 }}>{variable}</span>)}
      </div>
      {unsupported.length ? <div style={{ color: '#fca5a5', fontSize: 12 }}>Unsupported: {unsupported.join(', ')}</div> : null}
    </div>
  );
}

export default function SharedEmbedTemplatesPanel({ theme, payload = {}, busy = false, onSaveTemplate, onBindTemplate, onReload }) {
  const templates = useMemo(() => Object.values(safeObject(payload.templates)).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name))), [payload]);
  const bindings = safeObject(payload.bindings);
  const variables = safeObject(payload.variables);
  const summary = safeObject(payload.summary);
  const [moduleKey, setModuleKey] = useState('welcome');
  const [slot, setSlot] = useState('welcome');
  const [templateId, setTemplateId] = useState('welcome_default');

  async function saveCurrentAsTemplate() {
    const draft = payload.draft || payload.builder?.draft || {};
    await onSaveTemplate?.({
      templateId,
      name: templateId,
      module: moduleKey,
      templateType: slot,
      content: draft.content || '',
      embed: draft.embed || draft,
    });
  }

  async function bindTemplate() {
    await onBindTemplate?.(moduleKey, slot, templateId);
  }

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 20, boxShadow: theme.shadow, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Embed Studio 2.0</div>
          <h3 style={{ margin: '6px 0 0' }}>Shared Module Templates</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>One template library for Welcome, Leave, DM Welcome, Tickets, Forms and future modules.</p>
        </div>
        <button type="button" onClick={onReload} style={buttonStyle(theme, 'soft', busy)} disabled={busy}>Reload</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        <MiniStat theme={theme} label="Templates" value={summary.templateCount ?? templates.length} />
        <MiniStat theme={theme} label="Bindings" value={summary.bindingCount ?? Object.keys(bindings).length} accent="#a855f7" />
        <MiniStat theme={theme} label="Presets" value={summary.presetCount ?? 0} accent="#22c55e" />
        <MiniStat theme={theme} label="Deployments" value={summary.deploymentCount ?? 0} accent="#f59e0b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Module</span><select value={moduleKey} onChange={(event) => setModuleKey(event.target.value)} style={fieldStyle(theme)}><option value="welcome">Welcome / Leave</option><option value="tickets">Tickets</option><option value="forms">Forms</option><option value="moderation">Moderation</option><option value="global">Global</option></select></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Slot</span><input value={slot} onChange={(event) => setSlot(event.target.value)} placeholder="welcome, leave, dmWelcome, ticketPanel" style={fieldStyle(theme)} /></label>
        <label style={{ display: 'grid', gap: 6 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Template</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} style={fieldStyle(theme)}>{templates.map((template) => <option key={template.templateId || template.id} value={template.templateId || template.id}>{template.name}</option>)}</select></label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || !templateId} onClick={bindTemplate} style={buttonStyle(theme, 'success', busy || !templateId)}>Bind Template</button>
        <button type="button" disabled={busy || !templateId} onClick={saveCurrentAsTemplate} style={buttonStyle(theme, 'primary', busy || !templateId)}>Save Draft as Template</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
        {templates.map((template) => <TemplateCard key={template.templateId || template.id} theme={theme} template={template} />)}
      </div>

      <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 12, display: 'grid', gap: 8 }}>
        <strong>Current Bindings</strong>
        {Object.keys(bindings).length ? Object.entries(bindings).map(([moduleName, map]) => (
          <div key={moduleName} style={{ color: theme.mutedText, fontSize: 13 }}>{moduleName}: {Object.entries(safeObject(map)).map(([slotName, id]) => `${slotName} → ${id}`).join(', ')}</div>
        )) : <span style={{ color: theme.mutedText }}>No module bindings yet.</span>}
      </div>

      <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 12, display: 'grid', gap: 8 }}>
        <strong>Supported Variables</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {safeArray(variables[moduleKey] || variables.global).map((variable) => <span key={variable} style={{ color: theme.mutedText, border: `1px solid ${theme.cardBorder}`, borderRadius: 999, padding: '3px 7px', fontSize: 11 }}>{variable}</span>)}
        </div>
      </div>
    </section>
  );
}
