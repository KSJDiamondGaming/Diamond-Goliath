import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/apiClient';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';

const PAGE_KEY = 'forms';

const QUESTION_TYPES = [
  { value: 'short', label: 'Short Text' },
  { value: 'paragraph', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'user_mention', label: 'User Mention' },
  { value: 'role_mention', label: 'Role Mention' },
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function inputStyle(theme) {
  return {
    width: '100%',
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 12,
    background: theme.softBg,
    color: theme.cardText,
    padding: '11px 12px',
    fontWeight: 700,
    outline: 'none',
    minWidth: 0,
  };
}

function buttonStyle(theme, variant = 'default') {
  const variants = {
    default: {
      background: 'linear-gradient(135deg, rgba(59,130,246,0.92), rgba(37,99,235,0.92))',
      color: '#fff',
      border: '1px solid rgba(147,197,253,0.25)',
    },
    soft: {
      background: theme.softBg,
      color: theme.cardText,
      border: `1px solid ${theme.cardBorder}`,
    },
    danger: {
      background: 'rgba(239,68,68,0.12)',
      color: theme.dangerText || '#fca5a5',
      border: '1px solid rgba(239,68,68,0.25)',
    },
    success: {
      background: 'rgba(34,197,94,0.12)',
      color: theme.successText || '#86efac',
      border: '1px solid rgba(34,197,94,0.25)',
    },
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
    <label
      style={{
        display: 'grid',
        gap: 7,
        color: theme.mutedText,
        fontSize: 12,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        minWidth: 0,
      }}
    >
      {children}
    </label>
  );
}

function FormEditor({ theme, form, setForm, channels, roles, panels }) {
  const styles = useMemo(
    () => ({
      grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
        gap: 14,
      },
      block: {
        display: 'grid',
        gap: 14,
        padding: 16,
        border: `1px solid ${theme.cardBorder}`,
        background: theme.softBg,
        borderRadius: 18,
        minWidth: 0,
      },
      heading: {
        margin: 0,
        color: theme.cardText,
        fontSize: 16,
        fontWeight: 900,
      },
    }),
    [theme],
  );

  const update = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, [setForm]);

  const updateField = useCallback((index, patch) => {
    setForm((prev) => ({
      ...prev,
      fields: safeArray(prev.fields).map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    }));
  }, [setForm]);

  const addQuestion = useCallback(() => {
    setForm((prev) => {
      const fields = safeArray(prev.fields);
      if (fields.length >= 5) return prev;
      return { ...prev, fields: [...fields, createField(fields.length)] };
    });
  }, [setForm]);

  const removeQuestion = useCallback((index) => {
    setForm((prev) => ({
      ...prev,
      fields: safeArray(prev.fields).filter((_, fieldIndex) => fieldIndex !== index),
    }));
  }, [setForm]);

  const toggleRole = useCallback((roleId) => {
    setForm((prev) => {
      const current = safeArray(prev.staffRoleIds);
      const exists = current.includes(roleId);
      return {
        ...prev,
        staffRoleIds: exists ? current.filter((id) => id !== roleId) : [...current, roleId],
      };
    });
  }, [setForm]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={styles.block}>
        <h3 style={styles.heading}>Form Info</h3>
        <div style={styles.grid}>
          <FieldLabel theme={theme}>Title<input style={inputStyle(theme)} value={form.name} onChange={(event) => update('name', event.target.value)} /></FieldLabel>
          <FieldLabel theme={theme}>Button Text<input style={inputStyle(theme)} value={form.buttonLabel} onChange={(event) => update('buttonLabel', event.target.value)} /></FieldLabel>
          <FieldLabel theme={theme}>Description<textarea rows={4} style={inputStyle(theme)} value={form.description} onChange={(event) => update('description', event.target.value)} /></FieldLabel>
          <FieldLabel theme={theme}>Log Channel<select style={inputStyle(theme)} value={form.logChannelId} onChange={(event) => update('logChannelId', event.target.value)}><option value="">No log channel</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name || channel.id}</option>)}</select></FieldLabel>
        </div>
      </div>

      <div style={styles.block}>
        <h3 style={styles.heading}>Questions</h3>
        {safeArray(form.fields).length === 0 ? (
          <EmptyState theme={theme} title="No questions yet" text="Add questions to build this universal form." />
        ) : safeArray(form.fields).map((field, index) => (
          <div key={`${field.id}-${index}`} style={{ display: 'grid', gap: 12, padding: 14, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, background: 'rgba(15,23,42,0.45)' }}>
            <div style={styles.grid}>
              <FieldLabel theme={theme}>Question Label<input style={inputStyle(theme)} value={field.label || ''} onChange={(event) => updateField(index, { label: event.target.value })} /></FieldLabel>
              <FieldLabel theme={theme}>Question Type<select style={inputStyle(theme)} value={field.type || 'short'} onChange={(event) => updateField(index, { type: event.target.value })}>{QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></FieldLabel>
              <FieldLabel theme={theme}>Placeholder<input style={inputStyle(theme)} value={field.placeholder || ''} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></FieldLabel>
              <FieldLabel theme={theme}>Options, comma separated<input style={inputStyle(theme)} value={safeArray(field.options).join(', ')} onChange={(event) => updateField(index, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></FieldLabel>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={buttonStyle(theme, field.required !== false ? 'success' : 'soft')} onClick={() => updateField(index, { required: field.required === false })}>{field.required !== false ? 'Required' : 'Optional'}</button>
              <button type="button" style={buttonStyle(theme, 'danger')} onClick={() => removeQuestion(index)}>Remove Question</button>
            </div>
          </div>
        ))}
        <button type="button" style={buttonStyle(theme, 'soft')} onClick={addQuestion} disabled={safeArray(form.fields).length >= 5}>+ Add Question</button>
      </div>

      <div style={styles.block}>
        <h3 style={styles.heading}>Submission Behaviour</h3>
        <div style={styles.grid}>
          <FieldLabel theme={theme}>Action<select style={inputStyle(theme)} value={form.action} onChange={(event) => update('action', event.target.value)}><option value="create_ticket">Create Ticket</option><option value="log_only">Log Only</option><option value="none">No Action</option></select></FieldLabel>
          <FieldLabel theme={theme}>Panel<select style={inputStyle(theme)} value={form.panelId} onChange={(event) => update('panelId', event.target.value)}><option value="">No panel assigned</option>{panels.map((panel) => <option key={panel.panelId} value={panel.panelId}>{panel.title || panel.panelId}</option>)}</select></FieldLabel>
        </div>
      </div>

      <div style={styles.block}>
        <h3 style={styles.heading}>Ticket Integration</h3>
        <div style={styles.grid}>
          <FieldLabel theme={theme}>Ticket Type<input style={inputStyle(theme)} value={form.ticketType} onChange={(event) => update('ticketType', event.target.value)} /></FieldLabel>
          <FieldLabel theme={theme}>Ticket Category<select style={inputStyle(theme)} value={form.outputCategoryId} onChange={(event) => update('outputCategoryId', event.target.value)}><option value="">No category selected</option>{channels.filter((channel) => channel.type === 4 || channel.type === 'category' || channel.type === 'GUILD_CATEGORY').map((channel) => <option key={channel.id} value={channel.id}>{channel.name || channel.id}</option>)}</select></FieldLabel>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Staff Roles</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {roles.length === 0 ? <span style={{ color: theme.mutedText }}>No roles loaded.</span> : roles.map((role) => (
              <button key={role.id} type="button" style={buttonStyle(theme, safeArray(form.staffRoleIds).includes(role.id) ? 'success' : 'soft')} onClick={() => toggleRole(role.id)}>{role.name || role.id}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.block}>
        <h3 style={styles.heading}>Permissions, Cooldowns, Logs & Analytics</h3>
        <Notice theme={theme} tone="info">
          The current backend stores core form details, questions, ticket output, staff roles and log channel. Allowed roles, blocked roles and cooldown UI are reserved for the next backend schema expansion so this page stays aligned with modules.forms.
        </Notice>
      </div>
    </div>
  );
}

export default function Forms({ selectedGuild, selectedGuildData, theme }) {
  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Forms',
    description: 'Manage universal forms for appeals, applications, reports, support and custom workflows.',
  };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overview, setOverview] = useState(null);
  const [forms, setForms] = useState([]);
  const [panels, setPanels] = useState([]);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingForm, setEditingForm] = useState(null);

  const guild = selectedGuildData || (selectedGuild ? { id: selectedGuild } : null);

  const loadForms = useCallback(async () => {
    if (!selectedGuild) return;

    try {
      setLoading(true);
      setError('');
      setNotice('');

      const [overviewResult, formsResult, panelsResult, channelsResult, rolesResult] = await Promise.all([
        api.getFormsOverview(selectedGuild),
        api.getForms(selectedGuild),
        api.getFormPanels(selectedGuild).catch(() => ({ panels: [] })),
        api.getGuildChannels(selectedGuild).catch(() => []),
        api.getGuildRoles(selectedGuild).catch(() => []),
      ]);

      setOverview(overviewResult?.overview || null);
      setForms(safeArray(formsResult?.forms));
      setPanels(safeArray(panelsResult?.panels));
      setChannels(Array.isArray(channelsResult) ? channelsResult : []);
      setRoles(Array.isArray(rolesResult) ? rolesResult : []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load forms.');
    } finally {
      setLoading(false);
    }
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild) {
      setForms([]);
      setOverview(null);
      setPanels([]);
      setChannels([]);
      setRoles([]);
      return;
    }

    loadForms();
  }, [selectedGuild, loadForms]);

  const startCreate = useCallback(() => {
    setEditingForm(normalizeFormForEditor({
      ...EMPTY_FORM,
      formId: '',
      name: 'New Form',
      fields: [createField(0)],
    }));
  }, []);

  const startEdit = useCallback((form) => {
    setEditingForm(normalizeFormForEditor(form));
  }, []);

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
        ticketType: editingForm.ticketType || editingForm.formId || editingForm.name,
        staffRoleIds: safeArray(editingForm.staffRoleIds),
        fields: safeArray(editingForm.fields),
      };

      if (payload.formId) {
        await api.updateForm(selectedGuild, payload.formId, payload);
      } else {
        await api.createForm(selectedGuild, payload);
      }

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

  const stats = overview || {};

  return (
    <PageShell
      title={page.title}
      subtitle={page.description}
      theme={theme}
      guild={guild}
      actions={<button type="button" style={buttonStyle(theme)} onClick={startCreate}>Create Form</button>}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Total Forms" value={stats.formCount || forms.length || 0} description="Universal forms configured" />
        <SummaryStat theme={theme} label="Enabled Forms" value={stats.enabledFormCount || forms.filter((form) => form.enabled !== false).length || 0} description="Available to users" />
        <SummaryStat theme={theme} label="Submissions" value={stats.submissionCount || stats.analytics?.submitted || 0} description="All-time submissions" />
        <SummaryStat theme={theme} label="Tickets Created" value={stats.analytics?.ticketsCreated || 0} description="Form to ticket workflow" />
      </StatGrid>

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
          <FormEditor theme={theme} form={editingForm} setForm={setEditingForm} channels={channels} roles={roles} panels={panels} />
        </SectionCard>
      ) : null}

      <SectionCard
        theme={theme}
        title="All Forms"
        subtitle="Manage every form from the same universal Forms system. No separate hardcoded appeal/application/report/support systems."
        actions={<button type="button" style={buttonStyle(theme, 'soft')} onClick={loadForms}>Refresh</button>}
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading forms..." />
        ) : forms.length === 0 ? (
          <EmptyState theme={theme} title="No forms yet" text="Create your first universal form to start building panels and workflows." />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {forms.map((form) => (
              <div key={form.formId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: 16, border: `1px solid ${theme.cardBorder}`, borderRadius: 18, background: theme.softBg }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <strong style={{ color: theme.cardText, fontSize: 16 }}>{form.name}</strong>
                  <span style={{ color: theme.mutedText, lineHeight: 1.5 }}>{form.description}</span>
                  <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>ID: {form.formId} • Questions: {safeArray(form.fields).length} • Action: {form.action}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" style={buttonStyle(theme, form.enabled !== false ? 'success' : 'soft')} onClick={() => toggleForm(form)}>{form.enabled !== false ? 'Enabled' : 'Disabled'}</button>
                  <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => startEdit(form)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

