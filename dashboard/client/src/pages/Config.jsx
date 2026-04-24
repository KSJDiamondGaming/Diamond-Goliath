import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS, createConfigPageStyles } from '../ui';

const PAGE_KEY = 'config';

const DEFAULT_FORM = {
  prefix: '/',
  appealUrl: '',
  dashboardEnabled: true,

  managerRoleIds: [],
  dashboardAccessRoleIds: [],
  commandManagerRoleIds: [],
  restrictedChannelIds: [],

  commandNotFoundEnabled: true,
  wrongCommandUsageEnabled: true,
  noCommandPermissionsEnabled: true,
  disabledInChannelEnabled: false,
  commandCooldownEnabled: true,

  instantDeleteDataEnabled: false,
};

const DEFAULT_OPEN_SECTIONS = {
  general: false,
  commands: false,
  errorMessages: false,
  permissions: false,
  data: false,
};

export default function Config({ selectedGuild, theme }) {
  const styles = useMemo(() => createConfigPageStyles(theme), [theme]);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'General Settings',
    description: 'Manage dashboard and server configuration for the selected server.',
    emptyDescription: 'Select a server to manage settings.',
  };

  const loadDiscordData = useCallback(async () => {
    if (!selectedGuild) return;

    try {
      setSyncing(true);

      const channelsResult = await api.getGuildChannels(selectedGuild);
      const channelList = Array.isArray(channelsResult) ? channelsResult : [];

      setChannels(channelList);

      if (typeof api.getGuildRoles === 'function') {
        const rolesResult = await api.getGuildRoles(selectedGuild);
        setRoles(Array.isArray(rolesResult) ? rolesResult : []);
      } else {
        setRoles([]);
      }

      setSaveMessage('✅ Roles/channels synced from Discord.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to sync roles/channels.');
    } finally {
      setSyncing(false);
    }
  }, [selectedGuild]);

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      if (!selectedGuild) {
        if (mounted) {
          setForm(DEFAULT_FORM);
          setError('');
          setSaveMessage('');
          setLoading(false);
          setChannels([]);
          setRoles([]);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const [data, channelsResult] = await Promise.all([
          api.getConfig(selectedGuild),
          api.getGuildChannels(selectedGuild).catch(() => []),
        ]);

        if (!mounted) return;

        setChannels(Array.isArray(channelsResult) ? channelsResult : []);

        setForm({
          prefix: data?.prefix || '/',
          appealUrl: data?.appealUrl || '',
          dashboardEnabled: data?.dashboardEnabled !== false,

          managerRoleIds: safeArray(data?.managerRoleIds),
          dashboardAccessRoleIds: safeArray(data?.dashboardAccessRoleIds),
          commandManagerRoleIds: safeArray(data?.commandManagerRoleIds),
          restrictedChannelIds: safeArray(data?.restrictedChannelIds),

          commandNotFoundEnabled: data?.commandNotFoundEnabled !== false,
          wrongCommandUsageEnabled: data?.wrongCommandUsageEnabled !== false,
          noCommandPermissionsEnabled: data?.noCommandPermissionsEnabled !== false,
          disabledInChannelEnabled: data?.disabledInChannelEnabled === true,
          commandCooldownEnabled: data?.commandCooldownEnabled !== false,

          instantDeleteDataEnabled: data?.instantDeleteDataEnabled === true,
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

  const handleMultiToggle = useCallback((field, id) => {
    setForm((prev) => {
      const current = safeArray(prev[field]);
      const exists = current.includes(id);

      return {
        ...prev,
        [field]: exists ? current.filter((item) => item !== id) : [...current, id],
      };
    });
  }, []);

  const toggleSection = useCallback((sectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
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
        appealUrl: form.appealUrl || '',
        dashboardEnabled: Boolean(form.dashboardEnabled),

        managerRoleIds: safeArray(form.managerRoleIds),
        dashboardAccessRoleIds: safeArray(form.dashboardAccessRoleIds),
        commandManagerRoleIds: safeArray(form.commandManagerRoleIds),
        restrictedChannelIds: safeArray(form.restrictedChannelIds),

        commandNotFoundEnabled: Boolean(form.commandNotFoundEnabled),
        wrongCommandUsageEnabled: Boolean(form.wrongCommandUsageEnabled),
        noCommandPermissionsEnabled: Boolean(form.noCommandPermissionsEnabled),
        disabledInChannelEnabled: Boolean(form.disabledInChannelEnabled),
        commandCooldownEnabled: Boolean(form.commandCooldownEnabled),

        instantDeleteDataEnabled: Boolean(form.instantDeleteDataEnabled),
      });

      setSaveMessage('✅ General settings saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save general settings.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  const enabledErrorMessages = useMemo(() => {
    return [
      form.commandNotFoundEnabled,
      form.wrongCommandUsageEnabled,
      form.noCommandPermissionsEnabled,
      form.disabledInChannelEnabled,
      form.commandCooldownEnabled,
    ].filter(Boolean).length;
  }, [form]);

  const textChannels = useMemo(() => channels.filter(isTextChannel), [channels]);

  const roleOptions = useMemo(() => {
    if (roles.length > 0) return roles;

    return [
      ...form.managerRoleIds.map((id) => ({ id, name: `Role ${id}` })),
      ...form.dashboardAccessRoleIds.map((id) => ({ id, name: `Role ${id}` })),
      ...form.commandManagerRoleIds.map((id) => ({ id, name: `Role ${id}` })),
    ].filter((role, index, arr) => arr.findIndex((item) => item.id === role.id) === index);
  }, [roles, form.managerRoleIds, form.dashboardAccessRoleIds, form.commandManagerRoleIds]);

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'General Settings'}
        subtitle={page.emptyDescription || 'Select a server to manage settings.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild from the sidebar to continue." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'General Settings'}
      subtitle={page.description || 'Manage dashboard and server configuration for the selected server.'}
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
        <SummaryStat theme={theme} label="Error Messages" value={`${enabledErrorMessages}/5`} />
        <DashboardAccessStat
          styles={styles}
          enabled={form.dashboardEnabled}
          onToggle={() => handleToggle('dashboardEnabled')}
        />
      </StatGrid>

      {loading ? (
        <LoadingPanel theme={theme} text="Loading general settings..." />
      ) : (
        <>
          <CollapsibleSection
            styles={styles}
            title={SECTION_DEFS?.generalConfig?.title || 'General Config'}
            subtitle="Core dashboard and Discord sync settings."
            open={openSections.general}
            onToggle={() => toggleSection('general')}
          >
            <div style={styles.grid}>
              <div style={styles.row}>
                <div style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
                  <span style={styles.inlineTitle}>Sync Discord Data</span>
                  <span style={styles.inlineText}>
                    Refresh cached Discord roles and channels for dropdown menus.
                  </span>
                </div>

                <ThemeButton styles={styles} onClick={loadDiscordData} disabled={syncing}>
                  {syncing ? 'Syncing...' : 'Sync roles/channels'}
                </ThemeButton>
              </div>

              <Field styles={styles} label="Appeal URL">
                <input
                  value={form.appealUrl}
                  onChange={(e) => handleChange('appealUrl', e.target.value)}
                  style={styles.input}
                  placeholder="https://..."
                />
              </Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            styles={styles}
            title="Roles & Permissions"
            subtitle="Choose which roles can access and manage dashboard features."
            open={openSections.permissions}
            onToggle={() => toggleSection('permissions')}
          >
            <div style={styles.gridSmall}>
              <MultiSelectPanel
                styles={styles}
                title="Manager Roles"
                description="Roles selected here can manage General Settings and bot features."
                emptyText="No roles synced yet. Click Sync roles/channels in General Config."
                options={roleOptions}
                selectedIds={form.managerRoleIds}
                onToggle={(id) => handleMultiToggle('managerRoleIds', id)}
                type="role"
              />

              <MultiSelectPanel
                styles={styles}
                title="Dashboard Access Roles"
                description="Roles selected here are allowed to access this dashboard."
                emptyText="No roles synced yet. Click Sync roles/channels in General Config."
                options={roleOptions}
                selectedIds={form.dashboardAccessRoleIds}
                onToggle={(id) => handleMultiToggle('dashboardAccessRoleIds', id)}
                type="role"
              />

              <MultiSelectPanel
                styles={styles}
                title="Command Manager Roles"
                description="Roles selected here can manage command permissions."
                emptyText="No roles synced yet. Click Sync roles/channels in General Config."
                options={roleOptions}
                selectedIds={form.commandManagerRoleIds}
                onToggle={(id) => handleMultiToggle('commandManagerRoleIds', id)}
                type="role"
              />

              <MultiSelectPanel
                styles={styles}
                title="Restricted Command Channels"
                description="Choose channels where command permissions should be restricted or reviewed."
                emptyText="No text channels found. Click Sync roles/channels in General Config."
                options={textChannels}
                selectedIds={form.restrictedChannelIds}
                onToggle={(id) => handleMultiToggle('restrictedChannelIds', id)}
                type="channel"
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            styles={styles}
            title="Commands"
            subtitle="Manage command behaviour, prefixes, and command access."
            open={openSections.commands}
            onToggle={() => toggleSection('commands')}
          >
            <div style={styles.gridSmall}>
              <ActionRow
                styles={styles}
                icon="⌘"
                title="Custom Commands"
                description="Create and manage your own commands."
                actionLabel="Create new command"
              />

              <ActionRow
                styles={styles}
                icon="▦"
                title="Default Commands"
                description="Update permissions, aliases and more for all default commands. You can also enable or disable slash commands here."
                rightIcon="›"
              />

              <PrefixPanel
                styles={styles}
                prefix={form.prefix || '/'}
                onPrefixChange={(value) => handleChange('prefix', value)}
                onAddPrefix={() =>
                  setSaveMessage('ℹ️ Multi-prefix support can be added in the next stage.')
                }
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            styles={styles}
            title="Error Messages"
            subtitle="Choose which command error responses the bot should send."
            open={openSections.errorMessages}
            onToggle={() => toggleSection('errorMessages')}
          >
            <div style={styles.gridSmall}>
              <SwitchRow
                styles={styles}
                title="Command not found"
                description="Sent when an executed command doesn't exist."
                checked={form.commandNotFoundEnabled}
                onChange={() => handleToggle('commandNotFoundEnabled')}
              />

              <SwitchRow
                styles={styles}
                title="Wrong command usage"
                description="Sent when an existing command is used incorrectly."
                checked={form.wrongCommandUsageEnabled}
                onChange={() => handleToggle('wrongCommandUsageEnabled')}
              />

              <SwitchRow
                styles={styles}
                title="No command permissions"
                description='Sent when an unpermitted user is executing an existing command. If disabled, "Command not found" will be sent instead.'
                checked={form.noCommandPermissionsEnabled}
                onChange={() => handleToggle('noCommandPermissionsEnabled')}
              />

              <SwitchRow
                styles={styles}
                title="Disabled in channel"
                description="Sent when an existing command is executed in channels where it's disabled."
                checked={form.disabledInChannelEnabled}
                onChange={() => handleToggle('disabledInChannelEnabled')}
              />

              <SwitchRow
                styles={styles}
                title="Command on cooldown"
                description="Sent when an existing command is executed while the user is on cooldown."
                checked={form.commandCooldownEnabled}
                onChange={() => handleToggle('commandCooldownEnabled')}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            styles={styles}
            title="Data Deletion Behaviour"
            subtitle="Choose what happens to configuration data if the bot is kicked."
            open={openSections.data}
            onToggle={() => toggleSection('data')}
          >
            <ToggleRow
              styles={styles}
              label="Instantly delete data when bot is kicked"
              description="By default, data is kept temporarily so it can be restored. Enable this to delete configuration instantly."
              checked={form.instantDeleteDataEnabled}
              onChange={() => handleToggle('instantDeleteDataEnabled')}
            />
          </CollapsibleSection>

          <div>
            <ThemeButton styles={styles} onClick={handleSave} disabled={!selectedGuild || saving}>
              {saving ? 'Saving...' : 'Save General Settings'}
            </ThemeButton>
          </div>
        </>
      )}
    </PageShell>
  );
}

const DashboardAccessStat = memo(function DashboardAccessStat({
  styles,
  enabled,
  onToggle,
}) {
  return (
    <div style={styles.rowGrid}>
      <div style={{ minWidth: 0 }}>
        <p style={styles.label}>DASHBOARD</p>

        <button
          type="button"
          onClick={onToggle}
          style={styles.dashboardInlineToggle(enabled)}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  );
});

const CollapsibleSection = memo(function CollapsibleSection({
  styles,
  title,
  subtitle,
  open,
  onToggle,
  children,
}) {
  return (
    <section style={styles.section}>
      <button type="button" onClick={onToggle} style={styles.sectionHeader}>
        <span style={styles.sectionTitleWrap}>
          <span style={styles.sectionTitle}>{title}</span>
          {subtitle ? <span style={styles.sectionSubtitle}>{subtitle}</span> : null}
        </span>

        <span style={styles.chevron(open)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? <div style={styles.sectionBody}>{children}</div> : null}
    </section>
  );
});

const Field = memo(function Field({ styles, label, children }) {
  return (
    <div>
      <p style={styles.label}>{label}</p>
      {children}
    </div>
  );
});

const ToggleRow = memo(function ToggleRow({ styles, label, description, checked, onChange }) {
  return (
    <div style={styles.row}>
      <div style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
        <span style={styles.inlineTitle}>{label}</span>
        {description ? <span style={styles.inlineText}>{description}</span> : null}
      </div>

      <ThemeButton styles={styles} onClick={onChange} tone={checked ? 'success' : 'soft'}>
        {checked ? 'Enabled' : 'Disabled'}
      </ThemeButton>
    </div>
  );
});

const SwitchRow = memo(function SwitchRow({ styles, title, description, checked, onChange }) {
  return (
    <div style={styles.rowGrid}>
      <div style={{ minWidth: 0 }}>
        <h3 style={styles.rowTitle}>{title}</h3>
        <p style={styles.rowText}>{description}</p>
      </div>

      <Switch styles={styles} checked={checked} onChange={onChange} />
    </div>
  );
});

const Switch = memo(function Switch({ styles, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={checked ? 'Disable setting' : 'Enable setting'}
      style={styles.switchTrack(checked)}
    >
      <span style={styles.switchThumb(checked)} />
    </button>
  );
});

const ActionRow = memo(function ActionRow({
  styles,
  icon,
  title,
  description,
  actionLabel,
  rightIcon,
}) {
  return (
    <div style={styles.actionRow}>
      <div style={styles.actionIcon}>{icon}</div>

      <div style={{ minWidth: 0 }}>
        <h3 style={styles.actionTitle}>{title}</h3>
        <p style={styles.actionText}>{description}</p>
      </div>

      {actionLabel ? (
        <ThemeButton styles={styles}>{actionLabel}</ThemeButton>
      ) : (
        <span style={styles.rightIcon}>{rightIcon}</span>
      )}
    </div>
  );
});

const PrefixPanel = memo(function PrefixPanel({
  styles,
  prefix,
  onPrefixChange,
  onAddPrefix,
}) {
  return (
    <div style={styles.prefixPanel}>
      <div style={styles.prefixHeader}>
        <div>
          <div style={styles.prefixTitleRow}>
            <h3 style={styles.prefixTitle}>Prefixes</h3>
            <span style={styles.prefixCount}>1/5</span>
          </div>

          <p style={styles.prefixText}>
            Put one of the following prefixes in front of your message to execute bot commands.
          </p>
        </div>

        <ThemeButton styles={styles} onClick={onAddPrefix}>
          Add prefix
        </ThemeButton>
      </div>

      <input
        value={prefix}
        onChange={(e) => onPrefixChange(e.target.value)}
        style={styles.input}
        placeholder="/"
        maxLength={5}
      />
    </div>
  );
});

const MultiSelectPanel = memo(function MultiSelectPanel({
  styles,
  title,
  description,
  emptyText,
  options,
  selectedIds,
  onToggle,
  type,
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div style={styles.infoRow}>
      <div>
        <h3 style={styles.actionTitle}>{title}</h3>
        <p style={styles.actionText}>{description}</p>
      </div>

      {options.length === 0 ? (
        <p style={styles.actionText}>{emptyText}</p>
      ) : (
        <div style={styles.gridSmall}>
          <div style={styles.chipsWrap}>
            {selectedIds.length === 0 ? (
              <span style={styles.chip}>None selected</span>
            ) : (
              selectedIds.map((id) => {
                const item = options.find((option) => option.id === id);
                return (
                  <span key={id} style={styles.chip}>
                    {formatOptionLabel(item, id, type)}
                  </span>
                );
              })
            )}
          </div>

          <div style={styles.gridSmall}>
            {options.map((option) => {
              const checked = selectedSet.has(option.id);

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggle(option.id)}
                  style={styles.permissionOption(checked)}
                >
                  <span>{formatOptionLabel(option, option.id, type)}</span>
                  <span>{checked ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

const ThemeButton = memo(function ThemeButton({
  styles,
  children,
  onClick,
  disabled = false,
  tone = 'primary',
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={styles.button(tone, disabled)}>
      {children}
    </button>
  );
});

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatOptionLabel(item, fallbackId, type) {
  if (!item) return type === 'channel' ? `#${fallbackId}` : `@${fallbackId}`;
  if (type === 'channel') return `#${item.name || item.id || fallbackId}`;
  return `@${item.name || item.id || fallbackId}`;
}

function isTextChannel(channel) {
  const type = channel?.type;
  return type === 0 || type === 'GUILD_TEXT' || type === 'text';
}