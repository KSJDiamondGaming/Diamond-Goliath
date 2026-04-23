import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const PAGE_KEY = 'config';

const DEFAULT_FORM = {
  prefix: '/',
  muteRoleId: '',
  staffRoleId: '',
  appealUrl: '',
  dashboardEnabled: true,
  deleteDataOnKick: false,
};

export default function Config({ selectedGuild, theme }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'General Settings',
    description: 'Manage dashboard, permission, and server-wide configuration for the selected server.',
    emptyDescription: 'Select a server to manage general settings.',
  };

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      if (!selectedGuild) {
        if (mounted) {
          setForm(DEFAULT_FORM);
          setError('');
          setSaveMessage('');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const data = await api.getConfig(selectedGuild);

        if (!mounted) return;

        setForm({
          prefix: data?.prefix || '/',
          muteRoleId: data?.muteRoleId || '',
          staffRoleId: data?.staffRoleId || '',
          appealUrl: data?.appealUrl || '',
          dashboardEnabled: data?.dashboardEnabled !== false,
          deleteDataOnKick: Boolean(data?.deleteDataOnKick || data?.deleteDataWhenKicked),
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setForm(DEFAULT_FORM);
        setError('Could not load general settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleToggle = useCallback((field) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedGuild) {
      setSaveMessage('❌ Select a guild first.');
      return;
    }

    try {
      setSaving(true);
      setSaveMessage('');
      setError('');

      await api.updateConfig(selectedGuild, {
        prefix: form.prefix || '/',
        muteRoleId: form.muteRoleId || null,
        staffRoleId: form.staffRoleId || null,
        appealUrl: form.appealUrl || '',
        dashboardEnabled: Boolean(form.dashboardEnabled),
        deleteDataOnKick: Boolean(form.deleteDataOnKick),
      });

      setSaveMessage('✅ General settings saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save general settings.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  const roleSummary = useMemo(() => {
    return [form.muteRoleId, form.staffRoleId].filter(Boolean).length;
  }, [form.muteRoleId, form.staffRoleId]);

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'General Settings'}
        subtitle={page.emptyDescription || 'Select a server to manage general settings.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild from the sidebar to continue." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'General Settings'}
      subtitle={page.description || 'Manage dashboard, permission, and server-wide configuration for the selected server.'}
      theme={theme}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? (
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Prefix" value={form.prefix || '/'} />
        <SummaryStat theme={theme} label="Configured Roles" value={`${roleSummary}/2`} />
        <SummaryStat
          theme={theme}
          label="Dashboard"
          value={form.dashboardEnabled ? 'Enabled' : 'Disabled'}
          accent={form.dashboardEnabled ? '#22c55e' : '#ef4444'}
        />
      </StatGrid>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.generalConfig?.title || 'General Config'}
        subtitle={SECTION_DEFS?.generalConfig?.description || 'Core dashboard, moderation, and server-wide configuration.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading general settings..." />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Field theme={theme} label="Command Prefix">
              <input
                value={form.prefix}
                onChange={(e) => handleChange('prefix', e.target.value)}
                style={inputStyle(theme)}
                placeholder="/"
                maxLength={5}
              />
            </Field>

            <Field theme={theme} label="Appeal URL">
              <input
                value={form.appealUrl}
                onChange={(e) => handleChange('appealUrl', e.target.value)}
                style={inputStyle(theme)}
                placeholder="https://..."
              />
            </Field>

            <ToggleRow
              label="Enable Dashboard Access"
              description="Allow this server to use the dashboard configuration pages."
              checked={form.dashboardEnabled}
              onChange={() => handleToggle('dashboardEnabled')}
              theme={theme}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.permissionConfig?.title || 'Permissions'}
        subtitle={SECTION_DEFS?.permissionConfig?.description || 'Control dashboard access and staff role configuration.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading permissions..." />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Field theme={theme} label="Mute Role ID">
              <input
                value={form.muteRoleId}
                onChange={(e) => handleChange('muteRoleId', e.target.value)}
                style={inputStyle(theme)}
                placeholder="Mute role ID"
              />
            </Field>

            <Field theme={theme} label="Staff Role ID">
              <input
                value={form.staffRoleId}
                onChange={(e) => handleChange('staffRoleId', e.target.value)}
                style={inputStyle(theme)}
                placeholder="Staff role ID"
              />
            </Field>
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.dataDeletionConfig?.title || 'Data Deletion Behavior'}
        subtitle={SECTION_DEFS?.dataDeletionConfig?.description || 'Choose how server configuration is handled if the bot is kicked.'}
        padding="20px"
      >
        <ToggleRow
          label="Instantly delete data when bot is kicked"
          description="When enabled, this server's configuration is deleted immediately instead of waiting for a restore window."
          checked={form.deleteDataOnKick}
          onChange={() => handleToggle('deleteDataOnKick')}
          theme={theme}
        />
      </SectionCard>

      <div>
        <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving || loading}>
          {saving ? 'Saving...' : 'Save General Settings'}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}

const Field = memo(function Field({ theme, label, children }) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 6px 0',
          fontSize: '12px',
          fontWeight: 800,
          color: theme.mutedText,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
});

const ToggleRow = memo(function ToggleRow({ label, description = '', checked, onChange, theme }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <span style={{ display: 'grid', gap: '4px' }}>
        <span style={{ color: theme.cardText, fontWeight: 800 }}>{label}</span>
        {description ? (
          <span style={{ color: theme.mutedText, fontSize: '13px', lineHeight: 1.45 }}>
            {description}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        onClick={onChange}
        style={{
          flexShrink: 0,
          padding: '8px 12px',
          borderRadius: '999px',
          border: checked ? '1px solid rgba(34,197,94,0.3)' : `1px solid ${theme.cardBorder}`,
          background: checked ? 'rgba(34,197,94,0.14)' : theme.softBg,
          color: checked ? '#16a34a' : theme.cardText,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        {checked ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );
});

function inputStyle(theme) {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
}
