import React, { useEffect, useMemo, useState } from 'react';

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

const LOG_SECTIONS = [
  {
    key: 'adminLogs',
    label: 'Admin Logs',
    description: 'Configuration, permission, role, webhook, application and server management logs.',
    categories: [
      ['applications', 'Applications', 'admin', [['appAdd', 'App Add'], ['appCommandPermissionUpdate', 'App Command Permission Update'], ['appRemove', 'App Remove']]],
      ['roles', 'Roles', 'admin', [['roleColorUpdate', 'Role Color Update'], ['roleCreate', 'Role Create'], ['roleDelete', 'Role Delete'], ['roleNameUpdate', 'Role Name Update'], ['rolePermissionsUpdate', 'Role Permissions Update'], ['rolePositionUpdate', 'Role Position Update']]],
      ['server', 'Server', 'admin', [['guildBannerUpdate', 'Server Banner Update'], ['guildBoostUpdate', 'Server Boost Update'], ['guildIconUpdate', 'Server Icon Update'], ['guildNameUpdate', 'Server Name Update'], ['guildOwnerUpdate', 'Server Owner Update'], ['guildVerificationLevelUpdate', 'Verification Level Update']]],
      ['webhooks', 'Webhooks', 'admin', [['webhookAvatarUpdate', 'Webhook Avatar Update'], ['webhookChannelUpdate', 'Webhook Channel Update'], ['webhookCreate', 'Webhook Create'], ['webhookDelete', 'Webhook Delete'], ['webhookNameUpdate', 'Webhook Name Update']]],
    ],
  },
  {
    key: 'discordLogs',
    label: 'Discord Logs',
    description: 'Native Discord activity such as channels, messages, members, voice and thread updates.',
    categories: [
      ['channels', 'Channels', 'general', [['channelBitrateUpdate', 'Channel Bitrate Update'], ['channelCreate', 'Channel Create'], ['channelDefaultArchiveDurationUpdate', 'Channel Default Archive Duration Update'], ['channelDefaultReactionEmojiUpdate', 'Channel Default Reaction Emoji Update'], ['channelDefaultSortOrderUpdate', 'Channel Default Sort Order Update'], ['channelDefaultThreadSlowModeUpdate', 'Channel Default Thread Slow Mode Update'], ['channelDelete', 'Channel Delete'], ['channelForumLayoutUpdate', 'Channel Forum Layout Update'], ['channelForumTagsUpdate', 'Channel Forum Tags Update'], ['channelNameUpdate', 'Channel Name Update'], ['channelNsfwUpdate', 'Channel NSFW Update'], ['channelParentUpdate', 'Channel Parent Update'], ['channelPermissionsUpdate', 'Channel Permissions Update'], ['channelPinsUpdate', 'Channel Pins Update'], ['channelRtcRegionUpdate', 'Channel RTC Region Update'], ['channelSlowModeUpdate', 'Channel Slow Mode Update'], ['channelTopicUpdate', 'Channel Topic Update'], ['channelTypeUpdate', 'Channel Type Update'], ['channelUserLimitUpdate', 'Channel User Limit Update'], ['channelVideoQualityUpdate', 'Channel Video Quality Update'], ['channelVoiceStatusUpdate', 'Channel Voice Status Update']]],
      ['emojis', 'Emojis', 'general', [['emojiCreate', 'Emoji Create'], ['emojiDelete', 'Emoji Delete'], ['emojiNameUpdate', 'Emoji Name Update'], ['emojiRolesUpdate', 'Emoji Roles Update']]],
      ['events', 'Events', 'general', [['eventCreate', 'Event Create'], ['eventDelete', 'Event Delete'], ['eventNameUpdate', 'Event Name Update'], ['eventStatusUpdate', 'Event Status Update'], ['eventUserAdd', 'Event User Add'], ['eventUserRemove', 'Event User Remove']]],
      ['invites', 'Invites', 'general', [['inviteCreate', 'Invite Create'], ['inviteDelete', 'Invite Delete'], ['inviteUse', 'Invite Use']]],
      ['messages', 'Messages', 'messageDelete', [['messageBulkDelete', 'Message Bulk Delete'], ['messageDelete', 'Message Delete'], ['messageEdit', 'Message Edit'], ['messagePin', 'Message Pin'], ['messageUnpin', 'Message Unpin']]],
      ['polls', 'Polls', 'general', [['pollCreate', 'Poll Create'], ['pollDelete', 'Poll Delete'], ['pollVoteAdd', 'Poll Vote Add'], ['pollVoteRemove', 'Poll Vote Remove']]],
      ['soundboard', 'Soundboard', 'general', [['soundboardSoundCreate', 'Soundboard Sound Create'], ['soundboardSoundDelete', 'Soundboard Sound Delete'], ['soundboardSoundEmojiUpdate', 'Soundboard Sound Emoji Update'], ['soundboardSoundNameUpdate', 'Soundboard Sound Name Update']]],
      ['stage', 'Stage', 'voice', [['stageCreate', 'Stage Create'], ['stageDelete', 'Stage Delete'], ['stagePrivacyLevelUpdate', 'Stage Privacy Level Update'], ['stageTopicUpdate', 'Stage Topic Update']]],
      ['threads', 'Threads', 'general', [['threadArchiveUpdate', 'Thread Archive Update'], ['threadCreate', 'Thread Create'], ['threadDelete', 'Thread Delete'], ['threadLockedUpdate', 'Thread Locked Update'], ['threadMemberAdd', 'Thread Member Add'], ['threadMemberRemove', 'Thread Member Remove'], ['threadNameUpdate', 'Thread Name Update']]],
      ['users', 'Users', 'member', [['memberJoin', 'Member Join'], ['memberLeave', 'Member Leave'], ['memberNicknameUpdate', 'Member Nickname Update'], ['memberRolesUpdate', 'Member Roles Update'], ['memberTimeoutUpdate', 'Member Timeout Update'], ['userAvatarUpdate', 'User Avatar Update'], ['userUsernameUpdate', 'Username Update']]],
      ['voice', 'Voice', 'voice', [['voiceDeafUpdate', 'Voice Deaf Update'], ['voiceJoin', 'Voice Join'], ['voiceLeave', 'Voice Leave'], ['voiceMove', 'Voice Move'], ['voiceMuteUpdate', 'Voice Mute Update'], ['voiceStreamUpdate', 'Voice Stream Update'], ['voiceVideoUpdate', 'Voice Video Update']]],
    ],
  },
  {
    key: 'generalLogs',
    label: 'General Logs',
    description: 'General-purpose activity that does not need specialist moderation or admin routing.',
    categories: [
      ['generalActivity', 'General Activity', 'general', [['generalActivity', 'General Activity'], ['guildSync', 'Guild Sync'], ['resourceUpdate', 'Resource Update']]],
    ],
  },
  {
    key: 'modLogs',
    label: 'Mod Logs',
    description: 'Moderation, cases, warnings, lockdown and quarantine logs.',
    categories: [
      ['moderation', 'Moderation', 'moderation', [['caseCreate', 'Case Create'], ['lockdownStart', 'Lockdown Start'], ['moderationActions', 'Moderation Actions'], ['quarantineAdd', 'Quarantine Add'], ['warningCreate', 'Warning Create']]],
    ],
  },
  {
    key: 'moduleLogs',
    label: 'Module Logs',
    description: 'Goliath module output such as AutoMod, forms, tickets, sticky, translation and verification.',
    categories: [
      ['automod', 'AutoMod', 'automod', [['automodActions', 'Goliath AutoMod Actions'], ['autoModRuleActionsUpdate', 'Discord AutoMod Actions Update'], ['autoModRuleChannelsUpdate', 'Discord AutoMod Channels Update'], ['autoModRuleContentUpdate', 'Discord AutoMod Content Update'], ['autoModRuleCreate', 'Discord AutoMod Rule Create'], ['autoModRuleDelete', 'Discord AutoMod Rule Delete'], ['autoModRuleNameUpdate', 'Discord AutoMod Name Update'], ['autoModRuleRolesUpdate', 'Discord AutoMod Roles Update'], ['autoModRuleToggle', 'Discord AutoMod Rule Toggle'], ['autoModRuleWhitelistUpdate', 'Discord AutoMod Whitelist Update']]],
      ['forms', 'Forms', 'admin', [['formCreated', 'Form Created'], ['formSubmitted', 'Form Submitted'], ['formUpdated', 'Form Updated']]],
      ['giveaways', 'Giveaways', 'general', [['giveawayCreated', 'Giveaway Created'], ['giveawayEnded', 'Giveaway Ended'], ['giveawayRerolled', 'Giveaway Rerolled']]],
      ['sticky', 'Sticky Messages', 'general', [['stickyCreated', 'Sticky Created'], ['stickyDeleted', 'Sticky Deleted'], ['stickyUpdated', 'Sticky Updated']]],
      ['tickets', 'Tickets', 'moderation', [['ticketClosed', 'Ticket Closed'], ['ticketCreated', 'Ticket Created'], ['ticketDeleted', 'Ticket Deleted'], ['ticketReopened', 'Ticket Reopened'], ['ticketUpdated', 'Ticket Updated']]],
      ['translation', 'Translation', 'general', [['translationChannelUpdated', 'Translation Channel Updated'], ['translationProviderUpdated', 'Translation Provider Updated'], ['translationThreadCreated', 'Translation Thread Created']]],
      ['verification', 'Verification', 'admin', [['verificationPanelDeployed', 'Verification Panel Deployed'], ['verificationSettingsUpdated', 'Verification Settings Updated'], ['verificationSuccess', 'Verification Success']]],
    ],
  },
].map((section) => ({
  ...section,
  categories: section.categories
    .map(([key, label, defaultChannelKey, items]) => ({
      key,
      label,
      defaultChannelKey,
      items: items
        .map(([eventKey, labelText]) => ({ eventKey, channelKey: eventKey, label: labelText }))
        .sort((a, b) => a.label.localeCompare(b.label)),
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

const SETTINGS = [
  ['applyIgnoreToUsersInVoice', 'Apply ignore to users in voice', 'Voice logs are not sent when a user is ignored from Logging.'],
  ['ignoreEmbeds', 'Ignore embeds', 'Messages containing embeds are ignored from Logging.'],
  ['logDeletedForwardedMessages', 'Log deleted forwarded messages', 'Forwarded messages are logged by Message Delete.'],
  ['logDeletedPollsWithMessageDelete', 'Log deleted polls with Message Delete', 'If disabled, only poll-specific delete logs are used for deleted polls.'],
  ['logDeletedStickyMessages', 'Log deleted sticky messages', 'Disable this to avoid noisy sticky message delete logs.'],
  ['logUnrecognizableMessageDeletions', 'Log unrecognizable message deletions', 'Usually noisy. These are old uncached deletions without a known executor.'],
  ['useWebhooks', 'Use webhooks', 'Goliath can use webhook-style messages for cleaner log output.'],
].sort((a, b) => a[1].localeCompare(b[1]));

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

function cleanChannels(channels = []) {
  return (Array.isArray(channels) ? channels : [])
    .filter((channel) => channel?.id && channel?.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
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

function CategorySelect({ theme, channels, value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value || null)}
      style={{
        width: 220,
        maxWidth: '100%',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(15,23,42,0.95)',
        color: theme.cardText,
        borderRadius: 10,
        padding: '8px 10px',
        outline: 'none',
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      <option value="">Set category destination</option>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>#{channel.name}</option>
      ))}
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
  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState(DEFAULT_LOGS);
  const [search, setSearch] = useState('');
  const [bulkChannel, setBulkChannel] = useState('');
  const [open, setOpen] = useState({ adminLogs: true, discordLogs: true, generalLogs: true, modLogs: true, moduleLogs: true });
  const [openCategories, setOpenCategories] = useState(CATEGORY_OPEN_DEFAULTS);
  const [ignoredUser, setIgnoredUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    let mounted = true;

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
        const [logsRes, channelsRes] = await Promise.all([api.getLogConfig(guildId), api.getGuildChannels(guildId)]);
        if (!mounted) return;
        setLogs(normalizeLogs(logsRes?.config || logsRes || {}));
        setChannels(cleanChannels(channelsRes));
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
    return () => { mounted = false; };
  }, [guildId]);

  useEffect(() => {
    if (!guildId) return undefined;
    joinGuildRoom(guildId);
    return listenForGuildUpdate(guildId, 'logs', (data, payload = {}) => {
      setLogs(normalizeLogs(data));
      setSaveMessage(payload.source === 'dashboard' ? '✅ Logs synced live.' : '🔄 Logs updated live.');
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
    setLogs((prev) => normalizeLogs({ ...prev, enabled }));
  }

  function updateEvent(eventKey, enabled) {
    setLogs((prev) => normalizeLogs({ ...prev, events: { ...prev.events, [eventKey]: enabled } }));
  }

  function updateSetting(key, value) {
    setLogs((prev) => normalizeLogs({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }

  function setAllCategories(channelId) {
    setLogs((prev) => {
      const next = { ...prev.channels };
      allItems.forEach((item) => { next[item.channelKey] = channelId || null; });
      return normalizeLogs({ ...prev, channels: next });
    });
  }

  function setCategoryDestination(category, channelId) {
    setLogs((prev) => {
      const next = { ...prev.channels, [category.defaultChannelKey]: channelId || null };
      category.items.forEach((item) => { next[item.channelKey] = channelId || null; });
      return normalizeLogs({ ...prev, channels: next });
    });
  }

  function setCategoryEvents(category, enabled) {
    setLogs((prev) => {
      const next = { ...prev.events };
      category.items.forEach((item) => { next[item.eventKey] = enabled; });
      return normalizeLogs({ ...prev, events: next });
    });
  }

  function isCategoryEnabled(category) {
    return category.items.every((item) => logs.events?.[item.eventKey] !== false);
  }

  function setAllEvents(enabled) {
    setLogs((prev) => {
      const next = { ...prev.events };
      allItems.forEach((item) => { next[item.eventKey] = enabled; });
      return normalizeLogs({ ...prev, events: next });
    });
  }

  function addIgnoredUser() {
    const value = ignoredUser.trim();
    if (!value) return;
    updateSetting('ignoredUsers', Array.from(new Set([...(logs.settings.ignoredUsers || []), value])));
    setIgnoredUser('');
  }

  async function handleSave() {
    if (!guildId) return;
    try {
      setSaving(true);
      setError('');
      setSaveMessage('');
      const saved = await api.saveLogConfig(guildId, normalizeLogs(logs));
      if (saved?.config) setLogs(normalizeLogs(saved.config));
      setSaveMessage('✅ Logging saved successfully.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save logging.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="Logging"
      subtitle="Configure server logging categories, destinations and noise-control settings on one page."
      theme={theme}
      guild={{ id: guildId, name: selectedGuild?.name || selectedGuild?.guildName || 'Logging' }}
      actions={<><Toggle checked={logs.enabled} onChange={setEnabled} disabled={!guildId || saving} /><PrimaryButton onClick={handleSave} disabled={!guildId || saving}>{saving ? 'Saving...' : 'Save Changes'}</PrimaryButton></>}
    >
      {!selectedGuild ? <EmptyState theme={theme} title="Select a guild" text="Select a guild to manage logging." /> : null}
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>{saveMessage}</Notice> : null}
      {selectedGuild && loading ? <LoadingPanel theme={theme} text="Loading logging page..." /> : null}

      {selectedGuild && !loading ? (
        <>
          <StatGrid min="170px">
            <SummaryStat theme={theme} label="Logging" value={logs.enabled ? 'Enabled' : 'Disabled'} accent={logs.enabled ? theme.success : theme.danger} description="Global logging state" />
            <SummaryStat theme={theme} label="Types Enabled" value={`${enabledEvents}/${allItems.length}`} accent="#60a5fa" description="Tracked log types" />
            <SummaryStat theme={theme} label="Types Routed" value={routedEvents} accent="#f59e0b" description="Types with a destination" />
            <SummaryStat theme={theme} label="Categories" value={`${configuredCategories}/${CATEGORY_DATA.length}`} accent="#22c55e" description="Configured destinations" />
          </StatGrid>

          <section style={{ background: 'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))', border: `1px solid ${theme.cardBorder}`, borderRadius: 22, padding: 'clamp(16px, 2vw, 22px)', boxShadow: theme.shadow, display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: theme.cardText, fontWeight: 950, fontSize: 26 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)' }}>▰</span>
                Logging
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <CategorySelect theme={theme} channels={channels} value={bulkChannel} onChange={setBulkChannel} />
                <Button theme={theme} onClick={() => setAllCategories(bulkChannel)} disabled={!bulkChannel}>Set destination for all</Button>
                <Button theme={theme} onClick={() => setAllCategories(null)}>Clear destinations</Button>
                <Button theme={theme} onClick={() => setAllEvents(true)}>Enable all</Button>
                <Button theme={theme} onClick={() => setAllEvents(false)}>Disable all</Button>
              </div>
            </div>

            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search log categories or types" style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.86)', color: theme.cardText, borderRadius: 12, padding: '13px 14px', outline: 'none', fontWeight: 850 }} />

            <div style={{ display: 'grid', gap: 14 }}>
              {filteredSections.map((section) => {
                const sectionOpen = open[section.key] !== false;
                const sectionItems = section.categories.flatMap((category) => category.items);
                const activeCount = sectionItems.filter((item) => logs.events?.[item.eventKey] !== false).length;

                return (
                  <div key={section.key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 18, overflow: 'hidden', background: 'rgba(15,23,42,0.38)' }}>
                    <button type="button" onClick={() => setOpen((prev) => ({ ...prev, [section.key]: !sectionOpen }))} style={{ width: '100%', border: 0, background: 'rgba(15,23,42,0.84)', color: theme.cardText, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ display: 'grid', gap: 4 }}>
                        <strong style={{ fontSize: 18 }}>{section.label}</strong>
                        <span style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.4 }}>{section.description}</span>
                      </span>
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
                                <button type="button" onClick={() => setOpenCategories((prev) => ({ ...prev, [category.key]: !categoryOpen }))} style={{ border: 0, background: 'transparent', color: theme.cardText, padding: 0, cursor: 'pointer', textAlign: 'left', display: 'grid', gap: 3 }}>
                                  <strong>{category.label}</strong>
                                  <span style={{ color: theme.mutedText, fontSize: 12 }}>{categoryActiveCount}/{category.items.length} enabled</span>
                                </button>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  <CategorySelect theme={theme} channels={channels} value={firstChannel} onChange={(value) => setCategoryDestination(category, value)} />
                                  <Toggle checked={categoryEnabled} onChange={(value) => setCategoryEvents(category, value)} />
                                </div>
                              </div>

                              {categoryOpen ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 8, padding: '0 12px 12px' }}>
                                  {category.items.map((item) => {
                                    const enabled = logs.events?.[item.eventKey] !== false;
                                    return (
                                      <button key={item.eventKey} type="button" onClick={() => updateEvent(item.eventKey, !enabled)} style={{ border: `1px solid ${enabled ? 'rgba(59,130,246,0.32)' : theme.cardBorder}`, background: enabled ? 'rgba(59,130,246,0.12)' : 'rgba(15,23,42,0.44)', color: enabled ? theme.cardText : theme.mutedText, borderRadius: 10, padding: '9px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 900, textAlign: 'left' }}>
                                        {item.label}
                                      </button>
                                    );
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
          </section>

          <section style={{ background: 'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))', border: `1px solid ${theme.cardBorder}`, borderRadius: 22, padding: 'clamp(16px, 2vw, 22px)', boxShadow: theme.shadow, display: 'grid', gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Logging Settings</h2>
              <p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>Noise controls merged into the main logging page.</p>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {SETTINGS.map(([key, title, text]) => (
                <SettingRow key={key} theme={theme} title={title} text={text} checked={Boolean(logs.settings[key])} onChange={(value) => updateSetting(key, value)} />
              ))}

              <div style={{ background: 'rgba(15,23,42,0.72)', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
                <h3 style={{ margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 950 }}>Ignore users</h3>
                <p style={{ margin: 0, color: theme.mutedText, fontSize: 13 }}>Actions from users listed below are ignored from Logging.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={ignoredUser} onChange={(event) => setIgnoredUser(event.target.value)} placeholder="User ID" style={{ flex: '1 1 260px', border: `1px solid ${theme.cardBorder}`, background: 'rgba(6,12,24,0.9)', color: theme.cardText, borderRadius: 10, padding: '10px 12px', outline: 'none' }} />
                  <PrimaryButton onClick={addIgnoredUser}>Add</PrimaryButton>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {logs.settings.ignoredUsers.length ? logs.settings.ignoredUsers.map((value) => (
                    <button key={value} type="button" onClick={() => updateSetting('ignoredUsers', logs.settings.ignoredUsers.filter((item) => item !== value))} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 999, padding: '7px 10px', cursor: 'pointer', fontWeight: 850 }}>{value} ×</button>
                  )) : <span style={{ color: theme.mutedText, fontWeight: 800 }}>No users added</span>}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
