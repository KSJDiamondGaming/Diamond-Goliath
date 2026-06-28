import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';

const PAGE_KEY = 'forms';
const MAX_FIELDS = 5;

const QUESTION_TYPES = [
  { value: 'short', label: 'Short Text' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'user_mention', label: 'User Select' },
  { value: 'role_mention', label: 'Role Select' },
];

const EMPTY_FORM = {
  formId: '',
  enabled: true,
  name: 'New Form',
  description: 'Submit this form for staff review.',
  buttonLabel: 'Open Form',
  action: 'create_ticket',
  ticketType: '',
  panelId: '',
  staffRoleIds: [],
  logChannelId: '',
  outputCategoryId: '',
  fields: [],
};

const EMPTY_PANEL = {
  panelId: '',
  enabled: true,
  title: 'Forms',
  description: 'Choose a form below.',
  channelId: '',
  formIds: [],
};

const FORM_TEMPLATES = [
  {
    key: 'staff_application',
    name: 'Staff Application',
    description: 'Apply to join the server staff team.',
    buttonLabel: 'Apply Now',
    action: 'create_ticket',
    fields: [
      { id: 'age', type: 'number', label: 'How old are you?', placeholder: 'Enter your age', required: true, maxLength: 10 },
      { id: 'timezone', type: 'short', label: 'What is your timezone?', placeholder: 'GMT / EST / etc', required: true, maxLength: 80 },
      { id: 'experience', type: 'paragraph', label: 'What staff experience do you have?', placeholder: 'Tell us about previous experience.', required: true, maxLength: 1000 },
      { id: 'why_you', type: 'paragraph', label: 'Why should we choose you?', placeholder: 'Explain why you are a good fit.', required: true, maxLength: 1000 },
    ],
  },
  {
    key: 'ban_appeal',
    name: 'Ban Appeal',
    description: 'Appeal a ban, timeout or moderation action.',
    buttonLabel: 'Submit Appeal',
    action: 'create_ticket',
    fields: [
      { id: 'username', type: 'short', label: 'Discord username', placeholder: 'Your Discord username', required: true, maxLength: 100 },
      { id: 'reason', type: 'paragraph', label: 'Why were you punished?', placeholder: 'Explain what happened.', required: true, maxLength: 1000 },
      { id: 'appeal', type: 'paragraph', label: 'Why should this be reviewed?', placeholder: 'Explain your appeal.', required: true, maxLength: 1000 },
    ],
  },
  {
    key: 'support_request',
    name: 'Support Request',
    description: 'Get help from the support team.',
    buttonLabel: 'Get Support',
    action: 'create_ticket',
    fields: [
      { id: 'topic', type: 'select', label: 'Support topic', required: true, options: ['Account', 'Discord', 'Website', 'Bot', 'Other'], maxLength: 400 },
      { id: 'issue', type: 'paragraph', label: 'What do you need help with?', placeholder: 'Describe the issue.', required: true, maxLength: 1200 },
    ],
  },
  {
    key: 'report_player',
    name: 'Report Player',
    description: 'Report another member or player to staff.',
    buttonLabel: 'Report Player',
    action: 'create_ticket',
    fields: [
      { id: 'reported_user', type: 'user_mention', label: 'Who are you reporting?', placeholder: 'User ID or mention', required: true, maxLength: 100 },
      { id: 'reason', type: 'paragraph', label: 'What happened?', placeholder: 'Include details and evidence.', required: true, maxLength: 1200 },
      { id: 'evidence', type: 'short', label: 'Evidence link', placeholder: 'Optional screenshot/video link', required: false, maxLength: 300 },
    ],
  },
  {
    key: 'generic_form',
    name: 'Generic Form',
    description: 'A clean blank form for custom workflows.',
    buttonLabel: 'Open Form',
    action: 'create_ticket',
    fields: [
      { id: 'message', type: 'paragraph', label: 'Message', placeholder: 'Write your response here.', required: true, maxLength: 1000 },
    ],
  },
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function makeSafeId(value, fallback = 'form') {
  return String(value || fallback)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function createField(index) {
  return {
    id: `field-${index + 1}`,
    type: 'short',
    label: `Question ${index + 1}`,
    placeholder: '',
    required: true,
    options: [],
    minLength: 0,
    maxLength: 400,
  };
}

function normalizeFormForEditor(form = {}) {
  return {
    ...EMPTY_FORM,
    ...form,
    panelId: form.panelId || '',
    logChannelId: form.logChannelId || '',
    outputCategoryId: form.outputCategoryId || '',
    ticketType: form.ticketType || form.formId || '',
    staffRoleIds: safeArray(form.staffRoleIds),
    fields: safeArray(form.fields),
  };
}

function normalizePanelForEditor(panel = {}) {
  return {
    ...EMPTY_PANEL,
    ...panel,
    channelId: panel.channelId || '',
    formIds: safeArray(panel.formIds),
  };
}

function cloneTemplate(template) {
  return normalizeFormForEditor({
    ...EMPTY_FORM,
    formId: '',
    name: template.name,
    description: template.description,
    buttonLabel: template.buttonLabel,
    action: template.action,
    ticketType: template.key,
    fields: safeArray(template.fields).slice(0, MAX_FIELDS).map((field, index) => ({
      ...createField(index),
      ...field,
      id: makeSafeId(field.id || `field-${index + 1}`, `field-${index + 1}`),
    })),
  });
}

function inputStyle(theme) {
  return {
    width: '100%',
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 12,
    background: theme.softBg,
    color: theme.cardText,
    padding: '11px 12px',
    fontWeight: 800,
    outline: 'none',
    minWidth: 0,
  };
}

function buttonStyle(theme, variant = 'default') {
  const variants = {
    default: { background: 'linear-gradient(135deg, rgba(59,130,246,0.92), rgba(37,99,235,0.92))', color: '#fff', border: '1px solid rgba(147,197,253,0.25)' },
    soft: { background: theme.softBg, color: theme.cardText, border: `1px solid ${theme.cardBorder}` },
    danger: { background: 'rgba(239,68,68,0.12)', color: theme.dangerText || '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' },
    success: { background: 'rgba(34,197,94,0.12)', color: theme.successText || '#86efac', border: '1px solid rgba(34,197,94,0.25)' },
    warning: { background: 'rgba(245,158,11,0.13)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.28)' },
  };

  return {
    ...variants[variant],
    borderRadius: 12,
    padding: '10px 13px',
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function FieldLabel({ theme, children }) {
  return (
    <label style={{ display: 'grid', gap: 7, color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 0 }}>
      {children}
    </label>
  );
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function formType(form = {}) {
  return String(form.ticketType || form.type || form.formId || 'custom').replace(/[-_]+/g, ' ');
}

function statusPill(theme, active, label) {
  const color = active ? '#86efac' : '#fcd34d';
  return {
    border: `1px solid ${color}`,
    color,
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 12,
    fontWeight: 950,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'inline-flex',
    justifyContent: 'center',
  };
}

function DetailCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.26)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <span style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <strong style={{ color: theme.cardText, overflowWrap: 'anywhere' }}>{value}</strong>
      {hint ? <span style={{ color: theme.mutedText, fontSize: 12 }}>{hint}</span> : null}
    </div>
  );
}

function FormPreview({ theme, form }) {
  const fields = safeArray(form.fields);

  return (
    <div style={{ display: 'grid', gap: 14, padding: 16, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, background: 'rgba(15,23,42,0.30)' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <strong style={{ color: theme.cardText, fontSize: 18 }}>{form.name || 'Untitled Form'}</strong>
        <span style={{ color: theme.mutedText, lineHeight: 1.5 }}>{form.description || 'No description set.'}</span>
      </div>

      {fields.length ? fields.map((field, index) => (
        <div key={`${field.id || index}-preview`} style={{ display: 'grid', gap: 7 }}>
          <strong style={{ color: theme.cardText, fontSize: 13 }}>{field.label || `Question ${index + 1}`} {field.required !== false ? <span style={{ color: '#fca5a5' }}>*</span> : null}</strong>
          {field.type === 'paragraph' ? (
            <textarea disabled rows={3} placeholder={field.placeholder || 'Long answer'} style={{ ...inputStyle(theme), opacity: 0.8 }} />
          ) : field.type === 'select' || field.type === 'checkbox' || field.type === 'boolean' ? (
            <select disabled style={{ ...inputStyle(theme), opacity: 0.8 }}>
              <option>{safeArray(field.options)[0] || (field.type === 'boolean' ? 'Yes / No' : 'Select an option')}</option>
            </select>
          ) : (
            <input disabled placeholder={field.placeholder || QUESTION_TYPES.find((type) => type.value === field.type)?.label || 'Answer'} style={{ ...inputStyle(theme), opacity: 0.8 }} />
          )}
        </div>
      )) : <EmptyState theme={theme} title="No preview fields" text="Add questions to preview the Discord modal fields." />}

      <button type="button" disabled style={{ ...buttonStyle(theme), opacity: 0.75, cursor: 'not-allowed', justifySelf: 'start' }}>{form.buttonLabel || 'Open Form'}</button>
    </div>
  );
}

function FormEditor({ theme, form, setForm, channels, roles }) {
  const textChannels = channels.filter((channel) => channel.type === 0 || channel.type === 'text' || channel.type === 'GUILD_TEXT');
  const styles = useMemo(() => ({
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 14 },
    block: { display: 'grid', gap: 14, padding: 16, border: `1px solid ${theme.cardBorder}`, background: theme.softBg, borderRadius: 18, minWidth: 0 },
    heading: { margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 900 },
  }), [theme]);

  const update = useCallback((field, value) => setForm((prev) => ({ ...prev, [field]: value })), [setForm]);
  const updateField = useCallback((index, patch) => setForm((prev) => ({
    ...prev,
    fields: safeArray(prev.fields).map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field),
  })), [setForm]);
  const addQuestion = useCallback(() => setForm((prev) => {
    const fields = safeArray(prev.fields);
    if (fields.length >= MAX_FIELDS) return prev;
    return { ...prev, fields: [...fields, createField(fields.length)] };
  }), [setForm]);
  const removeQuestion = useCallback((index) => setForm((prev) => ({ ...prev, fields: safeArray(prev.fields).filter((_, fieldIndex) => fieldIndex !== index) })), [setForm]);
  const moveQuestion = useCallback((index, direction) => setForm((prev) => {
    const fields = [...safeArray(prev.fields)];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return prev;
    const [item] = fields.splice(index, 1);
    fields.splice(targetIndex, 0, item);
    return { ...prev, fields };
  }), [setForm]);
  const toggleRole = useCallback((roleId) => setForm((prev) => {
    const current = safeArray(prev.staffRoleIds);
    const exists = current.includes(roleId);
    return { ...prev, staffRoleIds: exists ? current.filter((id) => id !== roleId) : [...current, roleId] };
  }), [setForm]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(min(360px, 100%), 0.65fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <div style={styles.block}>
          <h3 style={styles.heading}>Form Info</h3>
          <div style={styles.grid}>
            <FieldLabel theme={theme}>Title<input style={inputStyle(theme)} value={form.name} onChange={(event) => update('name', event.target.value)} /></FieldLabel>
            <FieldLabel theme={theme}>Button Text<input style={inputStyle(theme)} value={form.buttonLabel} onChange={(event) => update('buttonLabel', event.target.value)} /></FieldLabel>
            <FieldLabel theme={theme}>Action<select style={inputStyle(theme)} value={form.action} onChange={(event) => update('action', event.target.value)}><option value="create_ticket">Create Ticket</option><option value="log_only">Log Only</option><option value="store_only">Store Only</option></select></FieldLabel>
            <FieldLabel theme={theme}>Form Type<input style={inputStyle(theme)} value={form.ticketType} onChange={(event) => update('ticketType', makeSafeId(event.target.value, 'form'))} placeholder="application / appeal / support" /></FieldLabel>
            <FieldLabel theme={theme}>Log Channel<select style={inputStyle(theme)} value={form.logChannelId} onChange={(event) => update('logChannelId', event.target.value)}><option value="">No log channel</option>{textChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name || channel.id}</option>)}</select></FieldLabel>
            <FieldLabel theme={theme}>Output Category<input style={inputStyle(theme)} value={form.outputCategoryId} onChange={(event) => update('outputCategoryId', event.target.value)} placeholder="Discord category ID" /></FieldLabel>
          </div>
          <FieldLabel theme={theme}>Description<textarea rows={4} style={inputStyle(theme)} value={form.description} onChange={(event) => update('description', event.target.value)} /></FieldLabel>
        </div>

        <div style={styles.block}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={styles.heading}>Questions</h3>
            <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{safeArray(form.fields).length}/{MAX_FIELDS} Discord modal fields</span>
          </div>

          {safeArray(form.fields).length === 0 ? <EmptyState theme={theme} title="No questions yet" text="Add questions to build this universal form." /> : safeArray(form.fields).map((field, index) => (
            <div key={`${field.id}-${index}`} style={{ display: 'grid', gap: 12, padding: 14, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ color: theme.cardText }}>Question {index + 1}</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => moveQuestion(index, -1)} disabled={index === 0}>↑ Move Up</button>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => moveQuestion(index, 1)} disabled={index === safeArray(form.fields).length - 1}>↓ Move Down</button>
                </div>
              </div>
              <div style={styles.grid}>
                <FieldLabel theme={theme}>Question Label<input style={inputStyle(theme)} value={field.label || ''} onChange={(event) => updateField(index, { label: event.target.value })} /></FieldLabel>
                <FieldLabel theme={theme}>Field ID<input style={inputStyle(theme)} value={field.id || ''} onChange={(event) => updateField(index, { id: makeSafeId(event.target.value, `field-${index + 1}`) })} /></FieldLabel>
                <FieldLabel theme={theme}>Question Type<select style={inputStyle(theme)} value={field.type || 'short'} onChange={(event) => updateField(index, { type: event.target.value })}>{QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></FieldLabel>
                <FieldLabel theme={theme}>Placeholder<input style={inputStyle(theme)} value={field.placeholder || ''} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></FieldLabel>
                <FieldLabel theme={theme}>Options, comma separated<input style={inputStyle(theme)} value={safeArray(field.options).join(', ')} onChange={(event) => updateField(index, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></FieldLabel>
                <FieldLabel theme={theme}>Max Length<input type="number" style={inputStyle(theme)} value={field.maxLength || 400} onChange={(event) => updateField(index, { maxLength: Number(event.target.value || 400) })} /></FieldLabel>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" style={buttonStyle(theme, field.required !== false ? 'success' : 'soft')} onClick={() => updateField(index, { required: field.required === false })}>{field.required !== false ? 'Required' : 'Optional'}</button>
                <button type="button" style={buttonStyle(theme, 'danger')} onClick={() => removeQuestion(index)}>Remove</button>
              </div>
            </div>
          ))}

          <button type="button" style={buttonStyle(theme, safeArray(form.fields).length >= MAX_FIELDS ? 'soft' : 'default')} onClick={addQuestion} disabled={safeArray(form.fields).length >= MAX_FIELDS}>
            Add Question
          </button>
        </div>

        <div style={styles.block}>
          <h3 style={styles.heading}>Staff Roles</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {roles.length ? roles.map((role) => <button key={role.id} type="button" style={buttonStyle(theme, safeArray(form.staffRoleIds).includes(role.id) ? 'success' : 'soft')} onClick={() => toggleRole(role.id)}>{role.name || role.id}</button>) : <span style={{ color: theme.mutedText }}>No roles loaded.</span>}
          </div>
        </div>
      </div>

      <FormPreview theme={theme} form={form} />
    </div>
  );
}

function PanelEditor({ theme, panel, setPanel, forms, channels }) {
  const textChannels = channels.filter((channel) => channel.type === 0 || channel.type === 'text' || channel.type === 'GUILD_TEXT');
  const update = useCallback((field, value) => setPanel((prev) => ({ ...prev, [field]: value })), [setPanel]);
  const toggleForm = useCallback((formId) => setPanel((prev) => {
    const current = safeArray(prev.formIds);
    const exists = current.includes(formId);
    return { ...prev, formIds: exists ? current.filter((id) => id !== formId) : [...current, formId].slice(0, 25) };
  }), [setPanel]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
        <FieldLabel theme={theme}>Panel Title<input style={inputStyle(theme)} value={panel.title} onChange={(event) => update('title', event.target.value)} /></FieldLabel>
        <FieldLabel theme={theme}>Target Channel<select style={inputStyle(theme)} value={panel.channelId} onChange={(event) => update('channelId', event.target.value)}><option value="">Select channel</option>{textChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name || channel.id}</option>)}</select></FieldLabel>
        <FieldLabel theme={theme}>Description<textarea rows={4} style={inputStyle(theme)} value={panel.description} onChange={(event) => update('description', event.target.value)} /></FieldLabel>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <strong style={{ color: theme.cardText }}>Forms on this panel</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {forms.length ? forms.map((form) => <button key={form.formId} type="button" style={buttonStyle(theme, safeArray(panel.formIds).includes(form.formId) ? 'success' : 'soft')} onClick={() => toggleForm(form.formId)}>{form.name}</button>) : <span style={{ color: theme.mutedText }}>Create forms before building a panel.</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, padding: 15, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, background: 'rgba(15,23,42,0.30)' }}>
        <strong style={{ color: theme.cardText }}>Panel Preview</strong>
        <span style={{ color: theme.mutedText }}>{panel.title || 'Forms'}</span>
        <span style={{ color: theme.mutedText }}>{panel.description || 'Choose a form below.'}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {safeArray(panel.formIds).map((formId) => forms.find((form) => form.formId === formId)).filter(Boolean).map((form) => <span key={form.formId} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 999, padding: '6px 10px', color: theme.cardText }}>{form.buttonLabel || form.name}</span>)}
        </div>
      </div>
    </div>
  );
}

function FormsInsights({ theme, overview, forms, submissions }) {
  const analytics = overview?.analytics || {};
  const enabledForms = forms.filter((form) => form.enabled !== false).length;
  const disabledForms = Math.max(forms.length - enabledForms, 0);
  const pending = submissions.filter((submission) => submission.status === 'pending').length;
  const approved = submissions.filter((submission) => submission.status === 'approved').length;
  const denied = submissions.filter((submission) => submission.status === 'denied').length;
  const reviewed = approved + denied;
  const approvalRate = reviewed ? `${Math.round((approved / reviewed) * 100)}%` : '0%';

  return (
    <SectionCard theme={theme} title="Forms Overview" subtitle="A professional snapshot of forms, review workload and workflow health.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        <DetailCard theme={theme} label="Enabled" value={enabledForms} hint="Available to users" />
        <DetailCard theme={theme} label="Disabled" value={disabledForms} hint="Hidden from users" />
        <DetailCard theme={theme} label="Pending Reviews" value={overview?.pendingSubmissionCount ?? pending} hint="Needs staff action" />
        <DetailCard theme={theme} label="Approval Rate" value={approvalRate} hint="Approved vs denied in loaded queue" />
        <DetailCard theme={theme} label="Tickets Created" value={analytics.ticketsCreated || 0} hint="Form → ticket workflow" />
        <DetailCard theme={theme} label="Denied" value={analytics.denied || denied || 0} hint="Rejected submissions" />
      </div>
    </SectionCard>
  );
}

function SubmissionViewer({ theme, submissions, forms, onStatus }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = submissions.find((submission) => submission.submissionId === selectedId) || submissions[0] || null;
  const formName = useCallback((formId) => forms.find((form) => form.formId === formId)?.name || formId || 'Unknown form', [forms]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 360px), 0.85fr) minmax(0, 1.15fr)', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        {submissions.length ? submissions.map((submission) => (
          <button key={submission.submissionId} type="button" onClick={() => setSelectedId(submission.submissionId)} style={{ textAlign: 'left', border: `1px solid ${selected?.submissionId === submission.submissionId ? '#93c5fd' : theme.cardBorder}`, background: selected?.submissionId === submission.submissionId ? 'rgba(59,130,246,0.13)' : theme.softBg, color: theme.cardText, borderRadius: 16, padding: 13, display: 'grid', gap: 6, cursor: 'pointer' }}>
            <strong>{formName(submission.formId)}</strong>
            <span style={{ color: theme.mutedText, fontSize: 12 }}>User: {submission.userTag || submission.userId || 'Unknown'} • {formatDate(submission.createdAt)}</span>
            <span style={statusPill(theme, submission.status === 'approved', submission.status || 'pending')}>{submission.status || 'pending'}</span>
          </button>
        )) : <EmptyState theme={theme} title="No submissions found" text="Submitted forms will appear here for staff review." />}
      </div>

      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 16, background: 'rgba(15,23,42,0.24)', display: 'grid', gap: 14 }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: theme.cardText, fontSize: 18 }}>{formName(selected.formId)}</strong>
                <div style={{ color: theme.mutedText, marginTop: 5, fontSize: 13 }}>Ref: {selected.submissionId}</div>
              </div>
              <span style={statusPill(theme, selected.status === 'approved', selected.status || 'pending')}>{selected.status || 'pending'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <DetailCard theme={theme} label="Applicant" value={selected.userTag || selected.userId || 'Unknown'} />
              <DetailCard theme={theme} label="Submitted" value={formatDate(selected.createdAt)} />
              <DetailCard theme={theme} label="Reviewed" value={formatDate(selected.reviewedAt)} />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <strong style={{ color: theme.cardText }}>Answers</strong>
              {Object.entries(asObject(selected.answers)).length ? Object.entries(asObject(selected.answers)).map(([key, value]) => (
                <div key={key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 11, background: theme.softBg }}>
                  <strong style={{ color: theme.cardText }}>{key}</strong>
                  <p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{String(value || '')}</p>
                </div>
              )) : <EmptyState theme={theme} text="No answers stored for this submission." />}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={buttonStyle(theme, 'success')} onClick={() => onStatus(selected, 'approved')}>Approve</button>
              <button type="button" style={buttonStyle(theme, 'danger')} onClick={() => onStatus(selected, 'denied')}>Deny</button>
              <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => onStatus(selected, 'closed')}>Close</button>
            </div>
          </>
        ) : <EmptyState theme={theme} title="Select a submission" text="Choose a submission to review answers and update status." />}
      </div>
    </div>
  );
}

export default function Forms({ selectedGuild, selectedGuildData, theme }) {
  const page = PAGE_LAYOUTS[PAGE_KEY] || { title: 'Forms', description: 'Manage universal forms for appeals, applications, reports, support and custom workflows.' };
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState(null);
  const [forms, setForms] = useState([]);
  const [panels, setPanels] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingForm, setEditingForm] = useState(null);
  const [editingPanel, setEditingPanel] = useState(null);
  const [submissionFilter, setSubmissionFilter] = useState('pending');
  const guild = selectedGuildData || (selectedGuild ? { id: selectedGuild } : null);

  const loadForms = useCallback(async () => {
    if (!selectedGuild) return;

    try {
      setLoading(true);
      setError('');
      setNotice('');
      const query = submissionFilter === 'all' ? 'limit=50' : `status=${submissionFilter}&limit=50`;
      const [overviewResult, formsResult, panelsResult, submissionsResult, channelsResult, rolesResult] = await Promise.all([
        api.getFormsOverview(selectedGuild),
        api.getForms(selectedGuild),
        api.getFormPanels(selectedGuild).catch(() => ({ panels: [] })),
        api.getFormSubmissions(selectedGuild, query).catch(() => ({ submissions: [] })),
        api.getGuildChannels(selectedGuild).catch(() => []),
        api.getGuildRoles(selectedGuild).catch(() => []),
      ]);

      setOverview(overviewResult?.overview || null);
      setForms(safeArray(formsResult?.forms));
      setPanels(safeArray(panelsResult?.panels));
      setSubmissions(safeArray(submissionsResult?.submissions));
      setChannels(Array.isArray(channelsResult) ? channelsResult : safeArray(channelsResult?.channels));
      setRoles(Array.isArray(rolesResult) ? rolesResult : safeArray(rolesResult?.roles));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load forms.');
    } finally {
      setLoading(false);
    }
  }, [selectedGuild, submissionFilter]);

  useEffect(() => {
    if (!selectedGuild) {
      setForms([]);
      setOverview(null);
      setPanels([]);
      setSubmissions([]);
      setChannels([]);
      setRoles([]);
      return;
    }
    loadForms();
  }, [selectedGuild, loadForms]);

  const startCreate = useCallback(() => setEditingForm(normalizeFormForEditor({ ...EMPTY_FORM, formId: '', name: 'New Form', fields: [createField(0)] })), []);
  const startTemplate = useCallback((template) => setEditingForm(cloneTemplate(template)), []);
  const startEdit = useCallback((form) => setEditingForm(normalizeFormForEditor(form)), []);
  const startPanel = useCallback((panel = {}) => setEditingPanel(normalizePanelForEditor(panel)), []);

  const saveForm = useCallback(async () => {
    if (!selectedGuild || !editingForm) return;

    try {
      setSaving(true);
      setError('');
      setNotice('');
      const payload = {
        ...editingForm,
        panelId: editingForm.panelId || null,
        logChannelId: editingForm.logChannelId || null,
        outputCategoryId: editingForm.outputCategoryId || null,
        ticketType: editingForm.ticketType || editingForm.formId || makeSafeId(editingForm.name, 'form'),
        staffRoleIds: safeArray(editingForm.staffRoleIds),
        fields: safeArray(editingForm.fields).slice(0, MAX_FIELDS).map((field, index) => ({
          ...field,
          id: makeSafeId(field.id || `field-${index + 1}`, `field-${index + 1}`),
          label: field.label || `Question ${index + 1}`,
        })),
      };

      if (payload.formId) await api.updateForm(selectedGuild, payload.formId, payload);
      else await api.createForm(selectedGuild, payload);
      setEditingForm(null);
      setNotice('✅ Form saved.');
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not save form.');
    } finally {
      setSaving(false);
    }
  }, [editingForm, loadForms, selectedGuild]);

  const savePanel = useCallback(async () => {
    if (!selectedGuild || !editingPanel) return;

    try {
      setSaving(true);
      setError('');
      setNotice('');
      const payload = { ...editingPanel, channelId: editingPanel.channelId || null, formIds: safeArray(editingPanel.formIds) };
      if (payload.panelId) await api.request(`/api/forms/${selectedGuild}/panels/${payload.panelId}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await api.request(`/api/forms/${selectedGuild}/panels`, { method: 'POST', body: JSON.stringify(payload) });
      setEditingPanel(null);
      setNotice('✅ Panel saved.');
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not save panel.');
    } finally {
      setSaving(false);
    }
  }, [editingPanel, loadForms, selectedGuild]);

  const deployPanel = useCallback(async (panel) => {
    if (!selectedGuild || !panel?.panelId) return;

    try {
      setSaving(true);
      setError('');
      setNotice('');
      await api.request(`/api/forms/${selectedGuild}/panels/${panel.panelId}/deploy`, { method: 'POST' });
      setNotice('✅ Panel deployed to Discord.');
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not deploy panel.');
    } finally {
      setSaving(false);
    }
  }, [loadForms, selectedGuild]);

  const refreshPanel = useCallback(async (panel) => {
    if (!selectedGuild || !panel?.panelId) return;

    try {
      setSaving(true);
      setError('');
      setNotice('');
      await api.request(`/api/forms/${selectedGuild}/panels/${panel.panelId}/refresh`, { method: 'POST' });
      setNotice('✅ Panel refreshed in Discord.');
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not refresh panel.');
    } finally {
      setSaving(false);
    }
  }, [loadForms, selectedGuild]);

  const duplicateForm = useCallback(async (form) => {
    if (!selectedGuild || !form) return;

    try {
      setSaving(true);
      setError('');
      setNotice('');
      await api.createForm(selectedGuild, {
        ...form,
        formId: '',
        id: '',
        name: `${form.name || 'Form'} Copy`,
        ticketType: `${form.ticketType || form.formId || 'form'}-copy`,
        panelId: form.panelId || null,
      });
      setNotice('✅ Form duplicated.');
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not duplicate form.');
    } finally {
      setSaving(false);
    }
  }, [loadForms, selectedGuild]);

  const toggleForm = useCallback(async (form) => {
    if (!selectedGuild || !form?.formId) return;

    try {
      setError('');
      await api.setFormEnabled(selectedGuild, form.formId, form.enabled === false);
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not update form status.');
    }
  }, [loadForms, selectedGuild]);

  const updateSubmissionStatus = useCallback(async (submission, status) => {
    if (!selectedGuild || !submission?.submissionId) return;

    try {
      setError('');
      await api.updateFormSubmissionStatus(selectedGuild, submission.submissionId, status);
      setNotice(`✅ Submission ${status}.`);
      await loadForms();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not update submission.');
    }
  }, [loadForms, selectedGuild]);

  const stats = overview || {};

  return (
    <PageShell
      title={page.title}
      subtitle={page.description}
      theme={theme}
      guild={guild}
      actions={(
        <>
          <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startPanel()}>Create Panel</button>
          <button type="button" style={buttonStyle(theme)} onClick={startCreate}>Create Form</button>
        </>
      )}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Total Forms" value={stats.formCount || forms.length || 0} description="Universal forms configured" />
        <SummaryStat theme={theme} label="Enabled Forms" value={stats.enabledFormCount || forms.filter((form) => form.enabled !== false).length || 0} description="Available to users" />
        <SummaryStat theme={theme} label="Submissions" value={stats.submissionCount || stats.analytics?.submitted || 0} description="All-time submissions" />
        <SummaryStat theme={theme} label="Pending Reviews" value={stats.pendingSubmissionCount || submissions.filter((submission) => submission.status === 'pending').length || 0} description="Needs staff action" />
        <SummaryStat theme={theme} label="Tickets Created" value={stats.analytics?.ticketsCreated || 0} description="Form to ticket workflow" />
      </StatGrid>

      <FormsInsights theme={theme} overview={overview} forms={forms} submissions={submissions} />

      <SectionCard theme={theme} title="Form Templates" subtitle="Create common forms quickly, then customise questions, ticket output and staff roles.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          {FORM_TEMPLATES.map((template) => (
            <div key={template.key} style={{ display: 'grid', gap: 10, padding: 15, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, background: theme.softBg }}>
              <strong style={{ color: theme.cardText }}>{template.name}</strong>
              <span style={{ color: theme.mutedText, lineHeight: 1.45 }}>{template.description}</span>
              <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startTemplate(template)}>Use Template</button>
            </div>
          ))}
        </div>
      </SectionCard>

      {editingForm ? (
        <SectionCard
          theme={theme}
          title={editingForm.formId ? `Edit ${editingForm.name}` : 'Create Form'}
          subtitle="Build one universal form that can power appeals, applications, reports, support or custom workflows."
          actions={(
            <>
              <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => setEditingForm(null)}>Cancel</button>
              <button type="button" style={buttonStyle(theme)} onClick={saveForm} disabled={saving}>{saving ? 'Saving...' : 'Save Form'}</button>
            </>
          )}
        >
          <FormEditor theme={theme} form={editingForm} setForm={setEditingForm} channels={channels} roles={roles} />
        </SectionCard>
      ) : null}

      {editingPanel ? (
        <SectionCard
          theme={theme}
          title={editingPanel.panelId ? `Edit ${editingPanel.title}` : 'Create Form Panel'}
          subtitle="Build the public Discord panel that lists one or more forms."
          actions={(
            <>
              <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => setEditingPanel(null)}>Cancel</button>
              <button type="button" style={buttonStyle(theme)} onClick={savePanel} disabled={saving}>{saving ? 'Saving...' : 'Save Panel'}</button>
            </>
          )}
        >
          <PanelEditor theme={theme} panel={editingPanel} setPanel={setEditingPanel} forms={forms} channels={channels} />
        </SectionCard>
      ) : null}

      <SectionCard theme={theme} title="Submission Queue" subtitle="Review submissions, inspect answers and update status." actions={<><select value={submissionFilter} onChange={(event) => setSubmissionFilter(event.target.value)} style={inputStyle(theme)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="closed">Closed</option><option value="all">All</option></select><button type="button" style={buttonStyle(theme, 'soft')} onClick={loadForms}>Refresh</button></>}>
        {loading ? <LoadingPanel theme={theme} text="Loading submissions..." /> : <SubmissionViewer theme={theme} submissions={submissions} forms={forms} onStatus={updateSubmissionStatus} />}
      </SectionCard>

      <SectionCard theme={theme} title="Form Panels" subtitle="Panels group forms into a Discord-facing menu. Save, deploy, then refresh them from here." actions={<button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startPanel()}>New Panel</button>}>
        {panels.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {panels.map((panel) => (
              <div key={panel.panelId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: 16, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, background: theme.softBg }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ color: theme.cardText }}>{panel.title}</strong>
                  <span style={{ color: theme.mutedText }}>{panel.description}</span>
                  <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>Forms: {safeArray(panel.formIds).length} • Channel: {panel.channelId ? `<#${panel.channelId}>` : 'Not selected'} • Message: {panel.messageId || 'Not deployed'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startPanel(panel)}>Edit Panel</button>
                  <button type="button" style={buttonStyle(theme)} onClick={() => deployPanel(panel)} disabled={saving || !panel.channelId}>{panel.messageId ? 'Redeploy' : 'Deploy'}</button>
                  <button type="button" style={buttonStyle(theme, 'success')} onClick={() => refreshPanel(panel)} disabled={saving || !panel.channelId || !panel.messageId}>Refresh</button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState theme={theme} title="No form panels yet" text="Create a panel to group forms together for Discord users." />}
      </SectionCard>

      <SectionCard theme={theme} title="All Forms" subtitle="Manage every form from the same universal Forms system." actions={<button type="button" style={buttonStyle(theme, 'soft')} onClick={loadForms}>Refresh</button>}>
        {loading ? <LoadingPanel theme={theme} text="Loading forms..." /> : forms.length === 0 ? <EmptyState theme={theme} title="No forms yet" text="Create your first universal form to start building panels and workflows." /> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {forms.map((form) => (
              <div key={form.formId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: 16, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, background: theme.softBg }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <strong style={{ color: theme.cardText, fontSize: 16 }}>{form.name}</strong>
                  <span style={{ color: theme.mutedText, lineHeight: 1.5 }}>{form.description}</span>
                  <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>ID: {form.formId} • Type: {formType(form)} • Questions: {safeArray(form.fields).length} • Action: {form.action}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" style={buttonStyle(theme, form.enabled !== false ? 'success' : 'soft')} onClick={() => toggleForm(form)}>{form.enabled !== false ? 'Enabled' : 'Disabled'}</button>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startEdit(form)}>Edit</button>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => duplicateForm(form)} disabled={saving}>Duplicate</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
