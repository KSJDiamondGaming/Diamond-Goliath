import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { joinGuildRoom, listenForGuildUpdate } from '../../services/socketClient';
import { api } from '../../services/apiClient';

import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  StatGrid,
  SummaryStat,
} from '../../shared/PageShell';

const SECTION_BLUEPRINTS = [
  ['adminLogs', 'Admin Logs', 'Configuration, permission, role, webhook, application and server management logs.', [
    ['applications', 'Applications', 'admin', ['App Add', 'App Command Permission Update', 'App Remove']],
    ['roles', 'Roles', 'admin', ['Role Color Update', 'Role Create', 'Role Delete', 'Role Name Update', 'Role Permissions Update', 'Role Position Update']],
    ['server', 'Server', 'admin', ['Server Banner Update', 'Server Boost Update', 'Server Icon Update', 'Server Name Update', 'Server Owner Update', 'Verification Level Update']],
    ['webhooks', 'Webhooks', 'admin', ['Webhook Avatar Update', 'Webhook Channel Update', 'Webhook Create', 'Webhook Delete', 'Webhook Name Update']],
  ]],
  ['discordLogs', 'Discord Logs', 'Native Discord activity such as channels, messages, members, voice and thread updates.', [
    ['channels', 'Channels', 'general', ['Channel Bitrate Update', 'Channel Create', 'Channel Default Archive Duration Update', 'Channel Default Reaction Emoji Update', 'Channel Default Sort Order Update', 'Channel Default Thread Slow Mode Update', 'Channel Delete', 'Channel Forum Layout Update', 'Channel Forum Tags Update', 'Channel Name Update', 'Channel NSFW Update', 'Channel Parent Update', 'Channel Permissions Update', 'Channel Pins Update', 'Channel RTC Region Update', 'Channel Slow Mode Update', 'Channel Topic Update', 'Channel Type Update', 'Channel User Limit Update', 'Channel Video Quality Update', 'Channel Voice Status Update']],
    ['emojis', 'Emojis', 'general', ['Emoji Create', 'Emoji Delete', 'Emoji Name Update', 'Emoji Roles Update']],
    ['events', 'Events', 'general', ['Event Create', 'Event Delete', 'Event Name Update', 'Event Status Update', 'Event User Add', 'Event User Remove']],
    ['invites', 'Invites', 'general', ['Invite Create', 'Invite Delete', 'Invite Use']],
    ['messages', 'Messages', 'messageDelete', ['Message Bulk Delete', 'Message Delete', 'Message Edit', 'Message Pin', 'Message Unpin']],
    ['polls', 'Polls', 'general', ['Poll Create', 'Poll Delete', 'Poll Vote Add', 'Poll Vote Remove']],
    ['soundboard', 'Soundboard', 'general', ['Soundboard Sound Create', 'Soundboard Sound Delete', 'Soundboard Sound Emoji Update', 'Soundboard Sound Name Update']],
    ['stage', 'Stage', 'voice', ['Stage Create', 'Stage Delete', 'Stage Privacy Level Update', 'Stage Topic Update']],
    ['threads', 'Threads', 'general', ['Thread Archive Update', 'Thread Create', 'Thread Delete', 'Thread Locked Update', 'Thread Member Add', 'Thread Member Remove', 'Thread Name Update']],
    ['users', 'Users', 'member', ['Member Join', 'Member Leave', 'Member Nickname Update', 'Member Roles Update', 'Member Timeout Update', 'User Avatar Update', 'Username Update']],
    ['voice', 'Voice', 'voice', ['Voice Deaf Update', 'Voice Join', 'Voice Leave', 'Voice Move', 'Voice Mute Update', 'Voice Stream Update', 'Voice Video Update']],
  ]],
  ['generalLogs', 'General Logs', 'General-purpose activity that does not need specialist moderation or admin routing.', [
    ['generalActivity', 'General Activity', 'general', ['General Activity', 'Guild Sync', 'Resource Update']],
  ]],
  ['modLogs', 'Mod Logs', 'Moderation, cases, warnings, lockdown and quarantine logs.', [
    ['moderation', 'Moderation', 'moderation', ['Case Create', 'Lockdown Start', 'Moderation Actions', 'Quarantine Add', 'Warning Create']],
  ]],
  ['moduleLogs', 'Module Logs', 'Goliath module output such as AutoMod, forms, tickets, sticky, translation and verification.', [
    ['automod', 'AutoMod', 'automod', ['Discord AutoMod Actions Update', 'Discord AutoMod Channels Update', 'Discord AutoMod Content Update', 'Discord AutoMod Name Update', 'Discord AutoMod Roles Update', 'Discord AutoMod Rule Create', 'Discord AutoMod Rule Delete', 'Discord AutoMod Rule Toggle', 'Discord AutoMod Whitelist Update', 'Goliath AutoMod Actions']],
    ['forms', 'Forms', 'admin', ['Form Created', 'Form Submitted', 'Form Updated']],
    ['giveaways', 'Giveaways', 'general', ['Giveaway Created', 'Giveaway Ended', 'Giveaway Rerolled']],
    ['sticky', 'Sticky Messages', 'general', ['Sticky Created', 'Sticky Deleted', 'Sticky Updated']],
    ['tickets', 'Tickets', 'moderation', ['Ticket Closed', 'Ticket Created', 'Ticket Deleted', 'Ticket Reopened', 'Ticket Updated']],
    ['translation', 'Translation', 'general', ['Translation Channel Updated', 'Translation Provider Updated', 'Translation Thread Created']],
    ['verification', 'Verification', 'admin', ['Verification Panel Deployed', 'Verification Settings Updated', 'Verification Success']],
  ]],
];

const SETTINGS = [
  ['applyIgnoreToUsersInVoice', 'Apply ignore to users in voice', 'Voice logs are not sent when a user is ignored from Logging.'],
  ['ignoreEmbeds', 'Ignore embeds', 'Messages containing embeds are ignored from Logging.'],
  ['logDeletedForwardedMessages', 'Log deleted forwarded messages', 'Forwarded messages are logged by Message Delete.'],
  ['logDeletedPollsWithMessageDelete', 'Log deleted polls with Message Delete', 'If disabled, only poll-specific delete logs are used for deleted polls.'],
  ['logDeletedStickyMessages', 'Log deleted sticky messages', 'Disable this to avoid noisy sticky message delete logs.'],
  ['logUnrecognizableMessageDeletions', 'Log unrecognizable message deletions', 'Usually noisy. These are old uncached deletions without a known executor.'],
  ['useWebhooks', 'Use webhooks', 'Goliath can use webhook-style messages for cleaner log output.'],
].sort((a, b) => a[1].localeCompare(b[1]));

function keyFromLabel(label = '') {
  return String(label)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join('');
}

const LOG_SECTIONS = SECTION_BLUEPRINTS.map(([key, label, description, categories]) => ({
  key,
  label,
  description,
  categories: categories
    .map(([categoryKey, categoryLabel, defaultChannelKey, labels]) => ({
      key: categoryKey,
      label: categoryLabel,
      defaultChannelKey,
      items: labels.map((labelText) => ({ label: labelText, eventKey: keyFromLabel(labelText), channelKey: keyFromLabel(labelText) })).sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
})).sort((a, b) => a.label.localeCompare(b.label));

const CATEGORY_DATA = LOG_SECTIONS.flatMap((section) => section.categories);
const CATEGORY_OPEN_DEFAULTS = CATEGORY_DATA.reduce((acc, category) => ({ ...acc, [category.key]: false }), {});

const CHANNEL_DEFAULTS = CATEGORY_DATA.reduce((acc, category) => {
  acc[category.defaultChannelKey] = null;
  category.items.forEach((item) => {
    acc[item.channelKey] = null;
  });
  return acc;
}, {
  admin: null,
  automod: null,
  general: null,
  member: null,
  messageDelete: null,
  messageEdit: null,
  moderation: null,
  voice: null,
});

const EVENT_DEFAULTS = CATEGORY_DATA.reduce((acc, category) => {
  category.items.forEach((item) => {
    acc[item.eventKey] = true;
  });
  return acc;
}, {});

const DEFAULT_SETTINGS = {
  applyIgnoreToUsersInVoice: false,
  ignoreEmbeds: false,
  ignoredChannels: [],
  ignoredRoles: [],
  ignoredUsers: [],
  logDeletedForwardedMessages: true,
  logDeletedPollsWithMessageDelete: true,
  logDeletedStickyMessages: true,
  logUnrecognizableMessageDeletions: false,
  useWebhooks: true,
};

const DEFAULT_LOGS = {
  enabled: true,
  channels: CHANNEL_DEFAULTS,
  events: EVENT_DEFAULTS,
  settings: DEFAULT_SETTINGS,
};

const disclosureHintStyles = `
  .logs-page [data-disclosure-hint] {
    opacity: 0;
    transform: translateX(4px);
    transition: opacity 160ms ease, transform 160ms ease;
  }

  .logs-page [data-disclosure-button]:hover [data-disclosure-hint],
  .logs-page [data-disclosure-button]:focus-visible [data-disclosure-hint] {
    opacity: 1;
    transform: translateX(0);
  }
`;

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function normalizeLogs(config = {}) {
  const safe = config && typeof config === 'object' ? config : {};
  const channels = safe.channels && typeof safe.channels === 'object' ? safe.channels : {};
  const settings = safe.settings && typeof safe.settings === 'object' ? safe.settings : {};

  return {
    ...DEFAULT_LOGS,
    ...safe,
    enabled: safe.enabled !== false,
    channels: {
      ...CHANNEL_DEFAULTS,
      ...channels,
      messageDelete: channels.messageDelete || channels.message || null,
      messageEdit: channels.messageEdit || channels.message || null,
    },
    events: {
      ...EVENT_DEFAULTS,
      ...(safe.events || {}),
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      ignoredChannels: list(settings.ignoredChannels),
      ignoredRoles: list(settings.ignoredRoles),
      ignoredUsers: list(settings.ignoredUsers),
    },
  };
}

function extractList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.resources?.[key])) return payload.resources[key];
  return [];
}

function cleanChannels(payload = []) {
  return extractList(payload, 'channels')
    .filter((channel) => channel?.id && channel?.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function hint(isOpen) {
  return isOpen ? 'Collapse' : 'Expand';
}

function tooltipHint(isOpen) {
  return isOpen ? 'Click to collapse' : 'Click to expand';
}

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        border: checked ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(239,68,68,0.45)',
        background: checked ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
        color: checked ? '#86efac' : '#fca5a5',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        borderRadius: 999,
        padding: '8px 12px',
        minWidth: 96,
        fontSize: 12,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {checked ? 'Enabled' : 'Disabled'}
    </button>
  );
}

function Button({ theme, children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: disabled ? 'rgba(15,23,42,0.42)' : 'rgba(15,23,42,0.82)',
        color: disabled ? theme.mutedText : theme.cardText,
        borderRadius: 10,
        padding: '10px 12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 950,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function CategorySelect({ theme, channels, value, onChange, disabled = false }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value || null)}
      disabled={disabled}
      style={{
        width: 230,
        maxWidth: '100%',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(15,23,42,0.95)',
        color: theme.cardText,
        borderRadius: 10,
        padding: '8px 10px',
        outline: 'none',
        fontSize: 12,
        fontWeight: 900,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <option value="">{channels.length ? 'Set category destination' : 'No channels loaded'}</option>
      {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
    </select>
  );
}

function SettingRow({ theme, title, text, checked, onChange }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.72)', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'grid', gap: 4, flex: '1 1 360px', minWidth: 0 }}>
        <h3 style={{ margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 950 }}>{title}</h3>
        <p style={{ margin: 0, color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>{text}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function Logs({ selectedGuild, theme }) {
  const guildId = getGuildId(selectedGuild);
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState(DEFAULT_LOGS);
  const [search, setSearch] = useState('');
  const [bulkChannel, setBulkChannel] = useState('');
  const [openPanels, setOpenPanels] = useState({ logging: false, settings: false });
  const [openSections, setOpenSections] = useState({ adminLogs: false, discordLogs: false, generalLogs: false, modLogs: false, moduleLogs: false });
  const [openCategories, setOpenCategories] = useState(CATEGORY_OPEN_DEFAULTS);
  const [ignoredUser, setIgnoredUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const saveNow = useCallback(async (nextLogs, quiet = false) => {
    if (!guildId) return;

    try {
      setSaving(true);
      setError('');

      const saved = await api.saveLogConfig(guildId, normalizeLogs(nextLogs));

      if (saved?.config) {
        setLogs(normalizeLogs(saved.config));
      }

      setSaveMessage(quiet ? '✅ Auto-saved.' : '✅ Logging saved successfully.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save logging.');
    } finally {
      setSaving(false);
    }
  }, [guildId]);

  const queueSave = useCallback((nextLogs) => {
    if (!loadedRef.current || !guildId) return;

    clearTimeout(saveTimer.current);
    setSaveMessage('Saving...');
    saveTimer.current = setTimeout(() => saveNow(nextLogs, true), 450);
  }, [guildId, saveNow]);

  const updateLogs = useCallback((updater) => {
    setLogs((prev) => {
      const next = normalizeLogs(typeof updater === 'function' ? updater(prev) : updater);
      queueSave(next);
      return next;
    });
  }, [queueSave]);

  const loadChannels = useCallback(async () => {
    const cached = cleanChannels(await api.getGuildChannels(guildId).catch(() => []));
    if (cached.length) return cached;

    return cleanChannels(
      await api.request(`/api/discord/${guildId}/resources/sync`, { method: 'POST' }).catch(() => [])
    );
  }, [guildId]);

  useEffect(() => {
    let mounted = true;
    loadedRef.current = false;
    clearTimeout(saveTimer.current);

    setOpenPanels({ logging: false, settings: false });
    setOpenSections({ adminLogs: false, discordLogs: false, generalLogs: false, modLogs: false, moduleLogs: false });
    setOpenCategories(CATEGORY_OPEN_DEFAULTS);

    async function loadData() {
      if (!guildId) {
        if (mounted) {
          setLogs(DEFAULT_LOGS);
          setChannels([]);
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

        const [logsRes, channelList] = await Promise.all([
          api.getLogConfig(guildId),
          loadChannels(),
        ]);

        if (!mounted) return;

        setLogs(normalizeLogs(logsRes?.config || logsRes || {}));
        setChannels(channelList);
        loadedRef.current = true;
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError(err.message || 'Failed to load logging settings.');
        setChannels([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
      clearTimeout(saveTimer.current);
    };
  }, [guildId, loadChannels]);

  useEffect(() => {
    if (!guildId) return undefined;
    joinGuildRoom(guildId);

    return listenForGuildUpdate(guildId, 'logs', (data, payload = {}) => {
      if (payload.source === 'dashboard') return;
      setLogs(normalizeLogs(data));
      setSaveMessage('🔄 Logs updated live.');
    });
  }, [guildId]);

  const allItems = useMemo(() => CATEGORY_DATA.flatMap((category) => category.items), []);
  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return LOG_SECTIONS;

    return LOG_SECTIONS
      .map((section) => ({
        ...section,
        categories: section.categories
          .map((category) => ({
            ...category,
            items: category.items.filter((item) => (
              section.label.toLowerCase().includes(term) ||
              category.label.toLowerCase().includes(term) ||
              item.label.toLowerCase().includes(term) ||
              item.eventKey.toLowerCase().includes(term)
            )),
          }))
          .filter((category) => category.items.length || category.label.toLowerCase().includes(term)),
      }))
      .filter((section) => section.categories.length || section.label.toLowerCase().includes(term));
  }, [search]);

  const enabledEvents = allItems.filter((item) => logs.events?.[item.eventKey] !== false).length;
  const routedEvents = allItems.filter((item) => Boolean(logs.channels?.[item.channelKey])).length;
  const configuredCategories = CATEGORY_DATA.filter((category) => Boolean(logs.channels?.[category.items[0]?.channelKey])).length;

  function setEnabled(enabled) {
    updateLogs((prev) => ({ ...prev, enabled }));
  }

  function updateEvent(key, enabled) {
    updateLogs((prev) => ({ ...prev, events: { ...prev.events, [key]: enabled } }));
  }

  function updateSetting(key, value) {
    updateLogs((prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }

  function setAllCategories(channelId) {
    updateLogs((prev) => {
      const next = { ...prev.channels };
      allItems.forEach((item) => { next[item.channelKey] = channelId || null; });
      return { ...prev, channels: next };
    });
  }

  function setCategoryDestination(category, channelId) {
    updateLogs((prev) => {
      const next = { ...prev.channels, [category.defaultChannelKey]: channelId || null };
      category.items.forEach((item) => { next[item.channelKey] = channelId || null; });
      return { ...prev, channels: next };
    });
  }

  function setCategoryEvents(category, enabled) {
    updateLogs((prev) => {
      const next = { ...prev.events };
      category.items.forEach((item) => { next[item.eventKey] = enabled; });
      return { ...prev, events: next };
    });
  }

  function isCategoryEnabled(category) {
    return category.items.every((item) => logs.events?.[item.eventKey] !== false);
  }

  function setAllEvents(enabled) {
    updateLogs((prev) => {
      const next = { ...prev.events };
      allItems.forEach((item) => { next[item.eventKey] = enabled; });
      return { ...prev, events: next };
    });
  }

  function addIgnoredUser() {
    const value = ignoredUser.trim();
    if (!value) return;
    updateSetting('ignoredUsers', Array.from(new Set([...(logs.settings.ignoredUsers || []), value])));
    setIgnoredUser('');
  }

  return (
    <PageShell
      title="Logging"
      subtitle="Configure server logging categories, destinations and noise-control settings on one page."
      theme={theme}
      guild={{ id: guildId, name: selectedGuild?.name || selectedGuild?.guildName || 'Logging' }}
      actions={<><Toggle checked={logs.enabled} onChange={setEnabled} disabled={!guildId || saving} /><PrimaryButton onClick={() => saveNow(logs)} disabled={!guildId || saving}>{saving ? 'Saving...' : 'Save Now'}</PrimaryButton></>}
    >
      <style>{disclosureHintStyles}</style>

      {!selectedGuild ? <EmptyState theme={theme} title="Select a guild" text="Select a guild to manage logging." /> : null}
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>{saveMessage}</Notice> : null}
      {selectedGuild && loading ? <LoadingPanel theme={theme} text="Loading logging page..." /> : null}

      {selectedGuild && !loading ? (
        <div className="logs-page" style={{ display: 'grid', gap: 16 }}>
          <StatGrid min="170px">
            <SummaryStat theme={theme} label="Logging" value={logs.enabled ? 'Enabled' : 'Disabled'} accent={logs.enabled ? theme.success : theme.danger} description="Global logging state" />
            <SummaryStat theme={theme} label="Types Enabled" value={`${enabledEvents}/${allItems.length}`} accent="#60a5fa" description="Tracked log types" />
            <SummaryStat theme={theme} label="Types Routed" value={routedEvents} accent="#f59e0b" description="Types with a destination" />
            <SummaryStat theme={theme} label="Categories" value={`${configuredCategories}/${CATEGORY_DATA.length}`} accent="#22c55e" description="Configured destinations" />
          </StatGrid>

          <section style={{ background: 'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))', border: `1px solid ${theme.cardBorder}`, borderRadius: 22, boxShadow: theme.shadow, overflow: 'hidden' }}>
            <button data-disclosure-button type="button" aria-expanded={openPanels.logging} title={tooltipHint(openPanels.logging)} onClick={() => setOpenPanels((prev) => ({ ...prev, logging: !prev.logging }))} style={{ width: '100%', border: 0, background: 'transparent', color: theme.cardText, padding: 'clamp(16px, 2vw, 22px)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 950, fontSize: 26 }}><span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)' }}>▰</span>Logging</span>
              <span data-disclosure-hint style={{ color: theme.mutedText, fontWeight: 950 }}>{hint(openPanels.logging)}</span>
            </button>

            {openPanels.logging ? (
              <div style={{ display: 'grid', gap: 18, padding: '0 clamp(16px, 2vw, 22px) clamp(16px, 2vw, 22px)' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <CategorySelect theme={theme} channels={channels} value={bulkChannel} onChange={setBulkChannel} disabled={!channels.length} />
                  <Button theme={theme} onClick={() => setAllCategories(bulkChannel)} disabled={!bulkChannel}>Set destination for all</Button>
                  <Button theme={theme} onClick={() => setAllCategories(null)}>Clear destinations</Button>
                  <Button theme={theme} onClick={() => setAllEvents(true)}>Enable all</Button>
                  <Button theme={theme} onClick={() => setAllEvents(false)}>Disable all</Button>
                  <Button theme={theme} onClick={async () => setChannels(await loadChannels())}>Refresh Channels</Button>
                </div>

                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search log categories or types" style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.86)', color: theme.cardText, borderRadius: 12, padding: '13px 14px', outline: 'none', fontWeight: 850 }} />

                <div style={{ display: 'grid', gap: 14 }}>
                  {filteredSections.map((section) => {
                    const sectionOpen = Boolean(openSections[section.key]);
                    const sectionItems = section.categories.flatMap((category) => category.items);
                    const activeCount = sectionItems.filter((item) => logs.events?.[item.eventKey] !== false).length;

                    return (
                      <div key={section.key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 18, overflow: 'hidden', background: 'rgba(15,23,42,0.38)' }}>
                        <button type="button" aria-expanded={sectionOpen} title={tooltipHint(sectionOpen)} onClick={() => setOpenSections((prev) => ({ ...prev, [section.key]: !sectionOpen }))} style={{ width: '100%', border: 0, background: 'rgba(15,23,42,0.84)', color: theme.cardText, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ display: 'grid', gap: 4 }}><strong style={{ fontSize: 18 }}>{section.label}</strong><span style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.4 }}>{section.description}</span></span>
                          <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, whiteSpace: 'nowrap' }}>{activeCount}/{sectionItems.length}</span>
                        </button>

                        {sectionOpen ? (
                          <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                            {section.categories.map((category) => {
                              const categoryOpen = Boolean(openCategories[category.key]);
                              const firstChannel = logs.channels?.[category.items[0]?.channelKey] || '';
                              const categoryEnabled = isCategoryEnabled(category);
                              const categoryActiveCount = category.items.filter((item) => logs.events?.[item.eventKey] !== false).length;

                              return (
                                <div key={category.key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, overflow: 'hidden', background: 'rgba(6,12,24,0.40)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: 10, padding: 12, alignItems: 'center' }}>
                                    <button type="button" aria-expanded={categoryOpen} title={tooltipHint(categoryOpen)} onClick={() => setOpenCategories((prev) => ({ ...prev, [category.key]: !categoryOpen }))} style={{ border: 0, background: 'transparent', color: theme.cardText, padding: 0, cursor: 'pointer', textAlign: 'left', display: 'grid', gap: 3 }}><strong>{category.label}</strong><span style={{ color: theme.mutedText, fontSize: 12 }}>{categoryActiveCount}/{category.items.length} enabled</span></button>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}><CategorySelect theme={theme} channels={channels} value={firstChannel} onChange={(value) => setCategoryDestination(category, value)} disabled={!channels.length} /><Toggle checked={categoryEnabled} onChange={(value) => setCategoryEvents(category, value)} /></div>
                                  </div>

                                  {categoryOpen ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 8, padding: '0 12px 12px' }}>
                                      {category.items.map((item) => {
                                        const enabled = logs.events?.[item.eventKey] !== false;
                                        return <button key={item.eventKey} type="button" onClick={() => updateEvent(item.eventKey, !enabled)} style={{ border: `1px solid ${enabled ? 'rgba(59,130,246,0.32)' : theme.cardBorder}`, background: enabled ? 'rgba(59,130,246,0.12)' : 'rgba(15,23,42,0.44)', color: enabled ? theme.cardText : theme.mutedText, borderRadius: 10, padding: '9px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 900, textAlign: 'left' }}>{item.label}</button>;
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section style={{ background: 'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))', border: `1px solid ${theme.cardBorder}`, borderRadius: 22, boxShadow: theme.shadow, overflow: 'hidden' }}>
            <button data-disclosure-button type="button" aria-expanded={openPanels.settings} title={tooltipHint(openPanels.settings)} onClick={() => setOpenPanels((prev) => ({ ...prev, settings: !prev.settings }))} style={{ width: '100%', border: 0, background: 'transparent', color: theme.cardText, padding: 'clamp(16px, 2vw, 22px)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Logging Settings</h2>
              <span data-disclosure-hint style={{ color: theme.mutedText, fontWeight: 950 }}>{hint(openPanels.settings)}</span>
            </button>

            {openPanels.settings ? (
              <div style={{ display: 'grid', gap: 10, padding: '0 clamp(16px, 2vw, 22px) clamp(16px, 2vw, 22px)' }}>
                {SETTINGS.map(([key, title, text]) => <SettingRow key={key} theme={theme} title={title} text={text} checked={Boolean(logs.settings[key])} onChange={(value) => updateSetting(key, value)} />)}
                <div style={{ background: 'rgba(15,23,42,0.72)', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
                  <h3 style={{ margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 950 }}>Ignore users</h3>
                  <p style={{ margin: 0, color: theme.mutedText, fontSize: 13 }}>Actions from users listed below are ignored from Logging.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input value={ignoredUser} onChange={(event) => setIgnoredUser(event.target.value)} placeholder="User ID" style={{ flex: '1 1 260px', border: `1px solid ${theme.cardBorder}`, background: 'rgba(6,12,24,0.9)', color: theme.cardText, borderRadius: 10, padding: '10px 12px', outline: 'none' }} /><PrimaryButton onClick={addIgnoredUser}>Add</PrimaryButton></div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{logs.settings.ignoredUsers.length ? logs.settings.ignoredUsers.map((value) => <button key={value} type="button" onClick={() => updateSetting('ignoredUsers', logs.settings.ignoredUsers.filter((item) => item !== value))} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 999, padding: '7px 10px', cursor: 'pointer', fontWeight: 850 }}>{value} ×</button>) : <span style={{ color: theme.mutedText, fontWeight: 800 }}>No users added</span>}</div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
