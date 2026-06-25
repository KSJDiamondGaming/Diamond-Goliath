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

const CATEGORY_DATA = [
  ['applications', 'Applications', 'admin', [['appAdd', 'App Add'], ['appRemove', 'App Remove'], ['appCommandPermissionUpdate', 'App Command Permission Update']]],
  ['channels', 'Channels', 'general', [
    ['channelCreate', 'Channel Create'], ['channelDelete', 'Channel Delete'], ['channelPinsUpdate', 'Channel Pins Update'], ['channelNameUpdate', 'Channel Name Update'],
    ['channelTopicUpdate', 'Channel Topic Update'], ['channelNsfwUpdate', 'Channel NSFW Update'], ['channelParentUpdate', 'Channel Parent Update'],
    ['channelPermissionsUpdate', 'Channel Permissions Update'], ['channelTypeUpdate', 'Channel Type Update'], ['channelBitrateUpdate', 'Channel Bitrate Update'],
    ['channelUserLimitUpdate', 'Channel User Limit Update'], ['channelSlowModeUpdate', 'Channel Slow Mode Update'], ['channelRtcRegionUpdate', 'Channel RTC Region Update'],
    ['channelVideoQualityUpdate', 'Channel Video Quality Update'], ['channelDefaultArchiveDurationUpdate', 'Channel Default Archive Duration Update'],
    ['channelDefaultThreadSlowModeUpdate', 'Channel Default Thread Slow Mode Update'], ['channelDefaultReactionEmojiUpdate', 'Channel Default Reaction Emoji Update'],
    ['channelDefaultSortOrderUpdate', 'Channel Default Sort Order Update'], ['channelForumTagsUpdate', 'Channel Forum Tags Update'], ['channelForumLayoutUpdate', 'Channel Forum Layout Update'],
    ['channelVoiceStatusUpdate', 'Channel Voice Status Update'],
  ]],
  ['discordAutomod', 'Discord AutoMod', 'automod', [
    ['autoModRuleCreate', 'Discord AutoMod Rule Create'], ['autoModRuleDelete', 'Discord AutoMod Rule Delete'], ['autoModRuleToggle', 'Discord AutoMod Rule Toggle'],
    ['autoModRuleNameUpdate', 'Discord AutoMod Rule Name Update'], ['autoModRuleActionsUpdate', 'Discord AutoMod Rule Actions Update'],
    ['autoModRuleContentUpdate', 'Discord AutoMod Rule Content Update'], ['autoModRuleRolesUpdate', 'Discord AutoMod Rule Roles Update'],
    ['autoModRuleChannelsUpdate', 'Discord AutoMod Rule Channels Update'], ['autoModRuleWhitelistUpdate', 'Discord AutoMod Rule Whitelist Update'],
  ]],
  ['emojis', 'Emojis', 'general', [['emojiCreate', 'Emoji Create'], ['emojiDelete', 'Emoji Delete'], ['emojiNameUpdate', 'Emoji Name Update'], ['emojiRolesUpdate', 'Emoji Roles Update']]],
  ['events', 'Events', 'general', [['eventCreate', 'Event Create'], ['eventDelete', 'Event Delete'], ['eventNameUpdate', 'Event Name Update'], ['eventStatusUpdate', 'Event Status Update'], ['eventUserAdd', 'Event User Add'], ['eventUserRemove', 'Event User Remove']]],
  ['invites', 'Invites', 'general', [['inviteCreate', 'Invite Create'], ['inviteDelete', 'Invite Delete'], ['inviteUse', 'Invite Use']]],
  ['messages', 'Messages', 'messageDelete', [['messageDelete', 'Message Delete'], ['messageBulkDelete', 'Message Bulk Delete'], ['messageEdit', 'Message Edit'], ['messagePin', 'Message Pin'], ['messageUnpin', 'Message Unpin']]],
  ['polls', 'Polls', 'general', [['pollCreate', 'Poll Create'], ['pollDelete', 'Poll Delete'], ['pollVoteAdd', 'Poll Vote Add'], ['pollVoteRemove', 'Poll Vote Remove']]],
  ['roles', 'Roles', 'admin', [['roleCreate', 'Role Create'], ['roleDelete', 'Role Delete'], ['roleNameUpdate', 'Role Name Update'], ['roleColorUpdate', 'Role Color Update'], ['rolePermissionsUpdate', 'Role Permissions Update'], ['rolePositionUpdate', 'Role Position Update']]],
  ['stage', 'Stage', 'voice', [['stageCreate', 'Stage Create'], ['stageDelete', 'Stage Delete'], ['stageTopicUpdate', 'Stage Topic Update'], ['stagePrivacyLevelUpdate', 'Stage Privacy Level Update']]],
  ['server', 'Server', 'admin', [['guildNameUpdate', 'Server Name Update'], ['guildIconUpdate', 'Server Icon Update'], ['guildBannerUpdate', 'Server Banner Update'], ['guildOwnerUpdate', 'Server Owner Update'], ['guildBoostUpdate', 'Server Boost Update'], ['guildVerificationLevelUpdate', 'Verification Level Update']]],
  ['soundboard', 'Soundboard', 'general', [['soundboardSoundCreate', 'Soundboard Sound Create'], ['soundboardSoundDelete', 'Soundboard Sound Delete'], ['soundboardSoundNameUpdate', 'Soundboard Sound Name Update'], ['soundboardSoundEmojiUpdate', 'Soundboard Sound Emoji Update']]],
  ['threads', 'Threads', 'general', [['threadCreate', 'Thread Create'], ['threadDelete', 'Thread Delete'], ['threadNameUpdate', 'Thread Name Update'], ['threadArchiveUpdate', 'Thread Archive Update'], ['threadLockedUpdate', 'Thread Locked Update'], ['threadMemberAdd', 'Thread Member Add'], ['threadMemberRemove', 'Thread Member Remove']]],
  ['users', 'Users', 'member', [['memberJoin', 'Member Join'], ['memberLeave', 'Member Leave'], ['memberNicknameUpdate', 'Member Nickname Update'], ['memberRolesUpdate', 'Member Roles Update'], ['memberTimeoutUpdate', 'Member Timeout Update'], ['userUsernameUpdate', 'Username Update'], ['userAvatarUpdate', 'User Avatar Update']]],
  ['voice', 'Voice', 'voice', [['voiceJoin', 'Voice Join'], ['voiceLeave', 'Voice Leave'], ['voiceMove', 'Voice Move'], ['voiceMuteUpdate', 'Voice Mute Update'], ['voiceDeafUpdate', 'Voice Deaf Update'], ['voiceStreamUpdate', 'Voice Stream Update'], ['voiceVideoUpdate', 'Voice Video Update']]],
  ['webhooks', 'Webhooks', 'admin', [['webhookCreate', 'Webhook Create'], ['webhookDelete', 'Webhook Delete'], ['webhookNameUpdate', 'Webhook Name Update'], ['webhookChannelUpdate', 'Webhook Channel Update'], ['webhookAvatarUpdate', 'Webhook Avatar Update']]],
  ['moderation', 'Moderation', 'moderation', [['moderationActions', 'Moderation Actions'], ['adminActions', 'Admin Actions'], ['automodActions', 'Goliath AutoMod Actions'], ['caseCreate', 'Case Create'], ['warningCreate', 'Warning Create'], ['lockdownStart', 'Lockdown Start'], ['quarantineAdd', 'Quarantine Add']]],
].map(([key, label, defaultChannelKey, items]) => ({
  key,
  label,
  defaultChannelKey,
  items: items.map(([eventKey, labelText]) => ({ eventKey, channelKey: eventKey, label: labelText })),
}));

const CHANNEL_DEFAULTS = CATEGORY_DATA.reduce((acc, category) => {
  acc[category.defaultChannelKey] = null;
  category.items.forEach((item) => { acc[item.channelKey] = null; });
  return acc;
}, { general: null, moderation: null, admin: null, automod: null, member: null, messageDelete: null, messageEdit: null, voice: null });

const EVENT_DEFAULTS = CATEGORY_DATA.reduce((acc, category) => {
  category.items.forEach((item) => { acc[item.eventKey] = true; });
  return acc;
}, {});

const DEFAULT_SETTINGS = {
  useWebhooks: true,
  ignoreEmbeds: false,
  applyIgnoreToUsersInVoice: false,
  logDeletedPollsWithMessageDelete: true,
  logDeletedStickyMessages: true,
  logDeletedForwardedMessages: true,
  logUnrecognizableMessageDeletions: false,
  ignoredChannels: [],
  ignoredRoles: [],
  ignoredUsers: [],
};

const DEFAULT_LOGS = { enabled: true, channels: CHANNEL_DEFAULTS, events: EVENT_DEFAULTS, settings: DEFAULT_SETTINGS };

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
    channels: { ...CHANNEL_DEFAULTS, ...channels, messageDelete: channels.messageDelete || channels.message || null, messageEdit: channels.messageEdit || channels.message || null },
    events: { ...EVENT_DEFAULTS, ...(safe.events || {}) },
    settings: { ...DEFAULT_SETTINGS, ...settings, ignoredChannels: list(settings.ignoredChannels), ignoredRoles: list(settings.ignoredRoles), ignoredUsers: list(settings.ignoredUsers) },
  };
}

function cleanChannels(channels = []) {
  return (Array.isArray(channels) ? channels : []).filter((channel) => channel?.id && channel?.name).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 999, border: checked ? '1px solid rgba(34,197,94,0.55)' : '1px solid rgba(148,163,184,0.24)', background: checked ? 'rgba(34,197,94,0.9)' : 'rgba(148,163,184,0.24)', cursor: disabled ? 'not-allowed' : 'pointer', padding: 2, display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }} />
    </button>
  );
}

function Button({ theme, children, onClick, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ border: `1px solid ${theme.cardBorder}`, background: disabled ? 'rgba(15,23,42,0.42)' : 'rgba(15,23,42,0.82)', color: disabled ? theme.mutedText : theme.cardText, borderRadius: 10, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 950, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function ChannelSelect({ theme, channels, value, onChange }) {
  return (
    <select value={value || ''} onChange={(event) => onChange(event.target.value || null)} style={{ width: 190, maxWidth: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.95)', color: theme.cardText, borderRadius: 10, padding: '8px 10px', outline: 'none', fontSize: 12, fontWeight: 900 }}>
      <option value="">Set channel</option>
      {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
    </select>
  );
}

function SettingRow({ theme, title, text, checked, onChange, children }) {
  return (
    <div style={{ background: 'rgba(15,23,42,0.72)', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'grid', gap: 4, flex: '1 1 360px', minWidth: 0 }}>
        <h3 style={{ margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 950 }}>{title}</h3>
        <p style={{ margin: 0, color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>{text}</p>
        {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function Logs({ selectedGuild, theme }) {
  const guildId = getGuildId(selectedGuild);
  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState(DEFAULT_LOGS);
  const [tab, setTab] = useState('types');
  const [search, setSearch] = useState('');
  const [bulkChannel, setBulkChannel] = useState('');
  const [open, setOpen] = useState({ applications: true, channels: true });
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
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return CATEGORY_DATA;
    return CATEGORY_DATA.map((category) => ({ ...category, items: category.items.filter((item) => category.label.toLowerCase().includes(term) || item.label.toLowerCase().includes(term) || item.eventKey.toLowerCase().includes(term)) })).filter((category) => category.items.length);
  }, [search]);

  const enabledEvents = allItems.filter((item) => logs.events?.[item.eventKey] !== false).length;
  const routedEvents = allItems.filter((item) => Boolean(logs.channels?.[item.channelKey])).length;
  const configuredChannels = Object.values(logs.channels || {}).filter(Boolean).length;

  function setEnabled(enabled) {
    setLogs((prev) => normalizeLogs({ ...prev, enabled }));
  }

  function updateEvent(eventKey, enabled) {
    setLogs((prev) => normalizeLogs({ ...prev, events: { ...prev.events, [eventKey]: enabled } }));
  }

  function updateChannel(channelKey, channelId) {
    setLogs((prev) => normalizeLogs({ ...prev, channels: { ...prev.channels, [channelKey]: channelId || null } }));
  }

  function updateSetting(key, value) {
    setLogs((prev) => normalizeLogs({ ...prev, settings: { ...prev.settings, [key]: value } }));
  }

  function setAllChannels(channelId) {
    setLogs((prev) => {
      const next = { ...prev.channels };
      allItems.forEach((item) => { next[item.channelKey] = channelId || null; });
      return normalizeLogs({ ...prev, channels: next });
    });
  }

  function setCategoryChannel(category, channelId) {
    setLogs((prev) => {
      const next = { ...prev.channels, [category.defaultChannelKey]: channelId || null };
      category.items.forEach((item) => { next[item.channelKey] = channelId || null; });
      return normalizeLogs({ ...prev, channels: next });
    });
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
      subtitle="Configure server logging types, category channels and noise-control settings."
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
            <SummaryStat theme={theme} label="Types Routed" value={routedEvents} accent="#f59e0b" description="Types with a channel" />
            <SummaryStat theme={theme} label="Saved Channels" value={configuredChannels} accent="#22c55e" description="Stored destinations" />
          </StatGrid>

          <section style={{ background: 'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))', border: `1px solid ${theme.cardBorder}`, borderRadius: 22, padding: 'clamp(16px, 2vw, 22px)', boxShadow: theme.shadow, display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: theme.cardText, fontWeight: 950, fontSize: 26 }}><span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)' }}>▰</span>Logging</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {['types', 'settings'].map((item) => <button key={item} type="button" onClick={() => setTab(item)} style={{ border: 0, borderBottom: tab === item ? '2px solid #3b82f6' : '2px solid transparent', background: 'transparent', color: tab === item ? '#ffffff' : theme.mutedText, padding: '9px 10px', fontWeight: 950, cursor: 'pointer', textTransform: 'capitalize' }}>{item}</button>)}
              </div>
            </div>

            {tab === 'types' ? (
              <>
                <div style={{ borderLeft: '3px solid rgba(191,219,254,0.9)', paddingLeft: 14, color: theme.cardText, fontWeight: 850, lineHeight: 1.45 }}>Log all actions happening in this server.<br />Click a category name to see all its log types.</div>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for types" style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.86)', color: theme.cardText, borderRadius: 12, padding: '13px 14px', outline: 'none', fontWeight: 850 }} />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ChannelSelect theme={theme} channels={channels} value={bulkChannel} onChange={setBulkChannel} />
                  <Button theme={theme} onClick={() => setAllChannels(bulkChannel)} disabled={!bulkChannel}>Set channel for all types</Button>
                  <Button theme={theme} onClick={() => setAllChannels(null)}>Remove channel for all types</Button>
                  <Button theme={theme} onClick={() => setAllEvents(true)}>Enable all</Button>
                  <Button theme={theme} onClick={() => setAllEvents(false)}>Mass disable</Button>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  {filtered.map((category) => {
                    const isOpen = Boolean(open[category.key]);
                    const firstChannel = logs.channels?.[category.items[0]?.channelKey] || '';
                    const activeCount = category.items.filter((item) => logs.events?.[item.eventKey] !== false).length;

                    return (
                      <div key={category.key} style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 16, marginTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => setOpen((prev) => ({ ...prev, [category.key]: !prev[category.key] }))} style={{ border: 0, background: 'transparent', color: theme.cardText, fontSize: 20, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
                            {category.label}<span style={{ color: theme.mutedText, fontSize: 14 }}>{isOpen ? '⌃' : '⌄'}</span><span style={{ color: theme.mutedText, fontSize: 12 }}>({activeCount}/{category.items.length})</span>
                          </button>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ChannelSelect theme={theme} channels={channels} value={firstChannel} onChange={(value) => setCategoryChannel(category, value)} /><Button theme={theme} onClick={() => setCategoryChannel(category, firstChannel)} disabled={!firstChannel}>Set category channel</Button></div>
                        </div>

                        {isOpen ? <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>{category.items.map((item) => {
                          const enabled = logs.events?.[item.eventKey] !== false;
                          const channelValue = logs.channels?.[item.channelKey] || '';
                          return (
                            <div key={item.eventKey} style={{ background: 'rgba(15,23,42,0.62)', border: `1px solid ${theme.cardBorder}`, borderRadius: 10, padding: '8px 9px', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: 10, alignItems: 'center' }}>
                              <div style={{ color: enabled ? theme.cardText : theme.mutedText, fontWeight: 900, fontSize: 13 }}>{item.label}</div>
                              <Toggle checked={enabled} onChange={(value) => updateEvent(item.eventKey, value)} />
                              <ChannelSelect theme={theme} channels={channels} value={channelValue} onChange={(value) => updateChannel(item.channelKey, value)} />
                            </div>
                          );
                        })}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {tab === 'settings' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <SettingRow theme={theme} title="Use webhooks" text="If enabled, Goliath can use webhook-style messages for cleaner log output." checked={logs.settings.useWebhooks} onChange={(value) => updateSetting('useWebhooks', value)} />
                <SettingRow theme={theme} title="Ignore embeds" text="If enabled, messages containing embeds are ignored from Logging." checked={logs.settings.ignoreEmbeds} onChange={(value) => updateSetting('ignoreEmbeds', value)} />
                <SettingRow theme={theme} title="Apply ignore to users in voice" text="Voice logs are not sent when the user is ignored from Logging." checked={logs.settings.applyIgnoreToUsersInVoice} onChange={(value) => updateSetting('applyIgnoreToUsersInVoice', value)} />
                <SettingRow theme={theme} title="Log deleted polls with Message Delete" text="If disabled, only poll-specific delete logs are used for deleted polls." checked={logs.settings.logDeletedPollsWithMessageDelete} onChange={(value) => updateSetting('logDeletedPollsWithMessageDelete', value)} />
                <SettingRow theme={theme} title="Log deleted sticky messages" text="Disable this to avoid noisy sticky message delete logs." checked={logs.settings.logDeletedStickyMessages} onChange={(value) => updateSetting('logDeletedStickyMessages', value)} />
                <SettingRow theme={theme} title="Log deleted forwarded messages" text="If disabled, forwarded messages are not logged by Message Delete." checked={logs.settings.logDeletedForwardedMessages} onChange={(value) => updateSetting('logDeletedForwardedMessages', value)} />
                <SettingRow theme={theme} title="Log unrecognizable message deletions" text="Usually noisy. These are old uncached deletions without a known executor." checked={logs.settings.logUnrecognizableMessageDeletions} onChange={(value) => updateSetting('logUnrecognizableMessageDeletions', value)} />
                <div style={{ background: 'rgba(15,23,42,0.72)', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
                  <h3 style={{ margin: 0, color: theme.cardText, fontSize: 16, fontWeight: 950 }}>Ignore users</h3>
                  <p style={{ margin: 0, color: theme.mutedText, fontSize: 13 }}>Actions from users listed below are ignored from Logging.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input value={ignoredUser} onChange={(event) => setIgnoredUser(event.target.value)} placeholder="User ID" style={{ flex: '1 1 260px', border: `1px solid ${theme.cardBorder}`, background: 'rgba(6,12,24,0.9)', color: theme.cardText, borderRadius: 10, padding: '10px 12px', outline: 'none' }} /><PrimaryButton onClick={addIgnoredUser}>Add</PrimaryButton></div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{logs.settings.ignoredUsers.length ? logs.settings.ignoredUsers.map((value) => <button key={value} type="button" onClick={() => updateSetting('ignoredUsers', logs.settings.ignoredUsers.filter((item) => item !== value))} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 999, padding: '7px 10px', cursor: 'pointer', fontWeight: 850 }}>{value} ×</button>) : <span style={{ color: theme.mutedText, fontWeight: 800 }}>No users added</span>}</div>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
