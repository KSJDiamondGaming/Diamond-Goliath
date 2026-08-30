'use strict';

const Discord = require('discord.js');
const { safeReply } = require('../../../core/ui/interactionResponse');
const { db, getCaseById, getCasesForUser, updateCaseStatus, recordCaseAudit } = require('./storage');
const {
  fetchTarget,
  ensurePanelAccess,
  ensureActionAccess,
  requireModeratableTarget,
  recordModerationSystemEvent,
} = require('./permissions');
const { buildPunishmentModal, buildBulkModal, submitPunishmentRequest, submitBulkModal, createConfirmation, executePendingAction } = require('./punishments');
const { getWarningCountForUser, syncExpiredWarningsToCases, showWarningModal, showRemoveWarningModal, submitWarningModal, submitRemoveWarningRequest } = require('./warns');
const { openCaseTool, handleCaseAction, submitCaseModal, handleExternalAppealInteraction } = require('./cases');
const { openCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal } = require('./caseSearch');
const {
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handleSelectUserButton,
  handlePresetInteraction,
  handlePresetModal,
  handleExportInteraction,
  presetIdFromSubmission,
  markPresetUsed,
  getModerationPreset,
} = require('./panel');

const PUNISHMENT_ACTIONS = new Set(['timeout', 'kick', 'ban']);
const BULK_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);
const OPEN_ACTIONS = new Set(['warn', ...PUNISHMENT_ACTIONS]);
const CONFIRM_LOCKS = new Set();
function isModCustomId(customId) { const id = String(customId || ''); return id.startsWith('mod_') || id.startsWith('mod:'); }
function isExternalAppealCustomId(customId) { const id = String(customId || ''); return id === 'mod_appeal_lookup' || id === 'mod_appeal_lookup_submit' || id.startsWith('mod_appeal_external:') || id.startsWith('mod_appeal_external_submit:'); }
function getTargetIdFromCustomId(customId) { return String(customId || '').split(':')[1] || 'none'; }
function getPrefixedAction(customId, prefix, allowedActions) { const id = String(customId || '').split(':')[0]; if (!id.startsWith(prefix)) return null; const action = id.slice(prefix.length); return allowedActions.has(action) ? action : null; }
function getPunishmentSubmitAction(customId) { return getPrefixedAction(customId, 'mod_submit_', PUNISHMENT_ACTIONS); }
function getBulkAction(customId) { return getPrefixedAction(customId, 'mod_submit_bulk_', BULK_ACTIONS) || getPrefixedAction(customId, 'mod_bulk_', BULK_ACTIONS); }
function parseConfirmActionContext(customId) { const parts = String(customId || '').split(':'); const requestedPage = Number(parts[5]); return { token: parts[1] || null, context: { view: parts[2] || 'overview', actionFilter: parts[3] || 'all', statusFilter: parts[4] || 'all', page: Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage)) : 0 } }; }
function fieldValue(i, key) { try { return String(i.fields?.getTextInputValue?.(key) || '').trim(); } catch { return ''; } }
function auditFailure(i, event, action, targetId, reason, metadata = {}) { return recordModerationSystemEvent({ interaction: i, event, action, targetId, reason, metadata }); }
function setInputValueIfPresent(input, value, maxLength) {
  const text = String(value || '').slice(0, maxLength);
  return text ? input.setValue(text) : input;
}
function buildSafePresetEditorModal(preset = null, targetId = 'none') {
  const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = Discord;
  const action = String(preset?.action || 'warn').toLowerCase();
  const secondary = action === 'warn' ? String(preset?.warnExpiry || 'never') : action === 'timeout' ? String(preset?.duration || '1h') : '';
  const numeric = action === 'warn' ? String(preset?.strikeWeight || 1) : action === 'ban' ? String(preset?.deleteDays ?? 0) : '';
  const nameInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('name').setLabel('Preset Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80), preset?.name, 80);
  const actionInput = new TextInputBuilder().setCustomId('action').setLabel('Action: warn / timeout / kick / ban').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(action);
  const reasonInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500), preset?.reason, 500);
  const secondaryInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('secondary').setLabel('Warn expiry OR timeout duration').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('warn: 7d/2w/1m/never • timeout: 1h'), secondary, 10);
  const numericInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('numeric').setLabel('Warn weight (1-5) OR ban delete days (0-7)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1), numeric, 1);
  return new ModalBuilder().setCustomId(`mod_preset_save:${preset?.id || 'new'}:${targetId}`).setTitle(preset ? 'Edit Moderation Preset' : 'Create Moderation Preset').addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(actionInput),
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(secondaryInput),
    new ActionRowBuilder().addComponents(numericInput)
  );
}
async function handlePresetEditorButton(i) {
  const id = String(i.customId || '');
  if (id.startsWith('mod_preset_create:')) {
    const [, targetId = 'none'] = id.split(':');
    await i.showModal(buildSafePresetEditorModal(null, targetId));
    return true;
  }
  if (id.startsWith('mod_preset_edit:')) {
    const [, presetId, targetId = 'none'] = id.split(':');
    const preset = getModerationPreset(i.guild.id, presetId);
    if (!preset) return safeReply(i, { content: '❌ Preset not found.', flags: 64 });
    await i.showModal(buildSafePresetEditorModal(preset, targetId));
    return true;
  }
  return false;
}

function scanTimestamp(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value > 0 ? `<t:${Math.floor(value / 1000)}:F> • <t:${Math.floor(value / 1000)}:R>` : 'Unknown';
}
function normalizeIdentity(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function parseJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
}
function parseCaseMetadata(modCase) {
  return parseJson(modCase?.metadata, {});
}
function investigationAuditRows(guildId, targetId, limit = 200) {
  try {
    const rows = db.prepare("SELECT audit_id, actor_id, event, after_value, metadata, created_at FROM case_audit WHERE guild_id = ? AND event IN ('moderation.member_scan.note_added','moderation.member_scan.watch_updated') ORDER BY created_at DESC LIMIT ?").all(String(guildId), Math.max(1, Math.min(500, Number(limit) || 200)));
    return rows.filter((row) => String(parseJson(row.metadata, {}).targetId || '') === String(targetId));
  } catch (error) {
    console.error('❌ Member investigation state query failed:', error);
    return [];
  }
}
function getInvestigationState(guildId, targetId) {
  const rows = investigationAuditRows(guildId, targetId);
  const notes = [];
  let watch = null;
  for (const row of rows) {
    const after = parseJson(row.after_value, {});
    if (row.event === 'moderation.member_scan.watch_updated' && watch === null) {
      watch = { enabled: Boolean(after.enabled), reason: after.reason || null, actorId: row.actor_id || null, at: row.created_at || null };
    }
    if (row.event === 'moderation.member_scan.note_added' && after.note) {
      notes.push({ note: String(after.note), actorId: row.actor_id || null, at: row.created_at || null });
    }
  }
  return { watched: Boolean(watch?.enabled), watch, notes: notes.slice(0, 10) };
}
function aggregateSuspectedEvidence(guildId, targetId) {
  const matches = new Map();
  for (const row of scanAuditRows(guildId, targetId, 100)) {
    const after = parseJson(row.after_value, {});
    for (const match of Array.isArray(after.suspectedMatches) ? after.suspectedMatches : []) {
      if (!match?.userId) continue;
      const key = String(match.userId);
      const current = matches.get(key) || { userId: key, appearances: 0, maxScore: 0, signals: new Set(), firstSeen: row.created_at || null, lastSeen: row.created_at || null };
      current.appearances += 1;
      current.maxScore = Math.max(current.maxScore, Number(match.score) || 0);
      for (const signal of Array.isArray(match.signals) ? match.signals : []) current.signals.add(String(signal));
      current.firstSeen = current.firstSeen || row.created_at || null;
      current.lastSeen = row.created_at || current.lastSeen;
      matches.set(key, current);
    }
  }
  return [...matches.values()]
    .map((entry) => ({ ...entry, signals: [...entry.signals] }))
    .sort((a, b) => (b.appearances - a.appearances) || (b.maxScore - a.maxScore))
    .slice(0, 10);
}
function scanAuditRows(guildId, targetId, limit = 25) {
  try {
    const rows = db.prepare("SELECT audit_id, actor_id, after_value, metadata, created_at FROM case_audit WHERE guild_id = ? AND event = 'moderation.member_scan.completed' ORDER BY created_at DESC LIMIT ?").all(String(guildId), Math.max(1, Math.min(100, Number(limit) || 25)));
    return rows.filter((row) => String(parseJson(row.metadata, {}).targetId || '') === String(targetId));
  } catch (error) {
    console.error('❌ Member scan history query failed:', error);
    return [];
  }
}
function historicalIdentitySnapshot(guildId, targetId) {
  const names = new Set();
  const globals = new Set();
  const displays = new Set();
  const avatars = new Set();
  const rows = scanAuditRows(guildId, targetId, 100);
  for (const row of rows) {
    const identity = parseJson(row.after_value, {}).identity || {};
    if (identity.username) names.add(String(identity.username));
    if (identity.globalName) globals.add(String(identity.globalName));
    if (identity.displayName) displays.add(String(identity.displayName));
    if (identity.avatarHash) avatars.add(String(identity.avatarHash));
  }
  return { names: [...names], globals: [...globals], displays: [...displays], avatars: [...avatars], scanCount: rows.length };
}
function getCrossGuildModeration(userId, currentGuildId) {
  try {
    const rows = db.prepare('SELECT guild_id, COUNT(*) AS case_count, MAX(created_at) AS last_case_at FROM cases WHERE user_id = ? GROUP BY guild_id ORDER BY last_case_at DESC').all(String(userId));
    const outside = rows.filter((row) => String(row.guild_id) !== String(currentGuildId));
    return {
      guildCount: outside.length,
      caseCount: outside.reduce((total, row) => total + Number(row.case_count || 0), 0),
      rows: outside.slice(0, 5),
    };
  } catch (error) {
    console.error('❌ Cross-guild moderation intelligence query failed:', error);
    return { guildCount: 0, caseCount: 0, rows: [] };
  }
}
function compareIdentitySignals(primary, candidate) {
  if (!primary?.user || !candidate?.user || primary.id === candidate.id) return { score: 0, signals: [] };
  const signals = [];
  let score = 0;
  const primaryUsername = normalizeIdentity(primary.user.username);
  const candidateUsername = normalizeIdentity(candidate.user.username);
  const primaryGlobal = normalizeIdentity(primary.user.globalName || primary.displayName);
  const candidateGlobal = normalizeIdentity(candidate.user.globalName || candidate.displayName);
  if (primary.user.avatar && candidate.user.avatar && primary.user.avatar === candidate.user.avatar) { score += 45; signals.push('same custom avatar hash'); }
  if (primaryUsername && candidateUsername === primaryUsername) { score += 30; signals.push('same normalized username'); }
  else if (primaryUsername && candidateUsername && (candidateUsername.includes(primaryUsername) || primaryUsername.includes(candidateUsername)) && Math.min(candidateUsername.length, primaryUsername.length) >= 5) { score += 12; signals.push('similar username'); }
  if (primaryGlobal && candidateGlobal && primaryGlobal === candidateGlobal) { score += 20; signals.push('same display/global name'); }
  const createdDelta = Math.abs((candidate.user.createdTimestamp || 0) - (primary.user.createdTimestamp || 0));
  if (createdDelta && createdDelta <= 86400000) { score += 10; signals.push('accounts created within 24h'); }
  const joinedDelta = Math.abs((candidate.joinedTimestamp || 0) - (primary.joinedTimestamp || 0));
  if (joinedDelta && joinedDelta <= 86400000) { score += 10; signals.push('joined server within 24h'); }
  return { score: Math.min(95, score), signals };
}
function buildSuspectedAccounts(guild, target) {
  const candidates = [];
  for (const member of guild.members.cache.values()) {
    if (!member?.user || member.id === target.id || member.user.bot) continue;
    const result = compareIdentitySignals(target, member);
    if (result.score >= 35) candidates.push({ member, ...result });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}
function moderationSummary(guildId, userId) {
  const cases = getCasesForUser(guildId, userId) || [];
  const warningCount = getWarningCountForUser(guildId, userId);
  const activeCases = cases.filter((entry) => String(entry.status || 'active') === 'active').length;
  const bans = cases.filter((entry) => entry.action === 'ban').length;
  const timeouts = cases.filter((entry) => entry.action === 'timeout').length;
  const appeals = cases.reduce((total, entry) => total + (Array.isArray(parseCaseMetadata(entry).appeals) ? parseCaseMetadata(entry).appeals.length : 0), 0);
  const evidence = cases.reduce((total, entry) => total + (Array.isArray(parseCaseMetadata(entry).evidence) ? parseCaseMetadata(entry).evidence.filter((item) => !item?.removedAt).length : 0), 0);
  return { cases, warningCount, activeCases, bans, timeouts, appeals, evidence };
}
function calculateModerationRisk(summary, crossGuild) {
  const reasons = [];
  let score = 0;
  const warnings = Math.min(20, Math.max(0, Number(summary.warningCount) || 0) * 4);
  const active = Math.min(20, Math.max(0, Number(summary.activeCases) || 0) * 5);
  const bans = Math.min(25, Math.max(0, Number(summary.bans) || 0) * 10);
  const timeouts = Math.min(15, Math.max(0, Number(summary.timeouts) || 0) * 4);
  const network = Math.min(20, Math.max(0, Number(crossGuild?.caseCount) || 0) * 4);
  if (warnings) { score += warnings; reasons.push(`${summary.warningCount} active warning(s)`); }
  if (active) { score += active; reasons.push(`${summary.activeCases} active moderation case(s)`); }
  if (bans) { score += bans; reasons.push(`${summary.bans} ban case(s)`); }
  if (timeouts) { score += timeouts; reasons.push(`${summary.timeouts} timeout case(s)`); }
  if (network) { score += network; reasons.push(`${crossGuild.caseCount} case(s) for the same Discord ID in other Goliath guilds`); }
  score = Math.min(100, score);
  const label = score >= 70 ? '🔴 High' : score >= 40 ? '🟠 Elevated' : score >= 20 ? '🟡 Moderate' : '🟢 Low';
  return { score, label, reasons };
}
function buildInvestigationNoteModal(targetId) {
  return new Discord.ModalBuilder().setCustomId(`mod_scan_note_submit:${targetId}`).setTitle('Add Investigation Note').addComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.TextInputBuilder().setCustomId('note').setLabel('Investigation note').setStyle(Discord.TextInputStyle.Paragraph).setRequired(true).setMinLength(2).setMaxLength(1000).setPlaceholder('Record relevant context, observations, or why this account needs review.')
    )
  );
}
function buildMemberScanPayload(i, target) {
  const summary = moderationSummary(i.guild.id, target.id);
  const { cases, warningCount, activeCases, bans, timeouts, appeals, evidence } = summary;
  const roles = [...target.roles.cache.values()].filter((role) => role.id !== i.guild.id).sort((a, b) => b.position - a.position);
  const keyPermissions = target.permissions.toArray().filter((name) => ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages', 'ModerateMembers', 'KickMembers', 'BanMembers'].includes(name));
  const flags = target.user.flags?.toArray?.() || [];
  const suspects = buildSuspectedAccounts(i.guild, target);
  const history = historicalIdentitySnapshot(i.guild.id, target.id);
  const crossGuild = getCrossGuildModeration(target.id, i.guild.id);
  const investigation = getInvestigationState(i.guild.id, target.id);
  const persistentLinks = aggregateSuspectedEvidence(i.guild.id, target.id);
  const risk = calculateModerationRisk(summary, crossGuild);
  const historicalNames = [...new Set([...history.names, ...history.globals, ...history.displays])].filter((name) => name && name !== target.user.username && name !== target.user.globalName && name !== target.displayName);
  const suspectText = suspects.length
    ? suspects.map(({ member, score, signals }) => `${score >= 70 ? '🔴 **STRONG MATCH**' : '🟠 **POSSIBLE MATCH**'} — ${member.user} • **${score}%**\n${signals.map((signal) => `• ${signal}`).join('\n')}`).join('\n\n')
    : '⚪ **NO LINK FOUND** — No evidence-based suspected account match in the current guild cache.';
  const recent = cases.slice(0, 5).map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • ${entry.reason || 'No reason'}`).join('\n') || 'No recorded moderation cases.';
  const scanId = `scan_${Date.now().toString(36)}_${target.id.slice(-6)}`;
  const embed = new Discord.EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🔎 Goliath Member Scan • ${target.user.tag}`)
    .setDescription([
      `**Scan ID:** \`${scanId}\``,
      `**Target:** ${target.user} (\`${target.id}\`)`,
      '',
      'This report separates confirmed Discord/Goliath data from heuristic suspected-account matches. A suspected match is not proof of account ownership.',
    ].join('\n'))
    .addFields(
      { name: '🪪 Identity', value: [`Username: \`${target.user.username}\``, `Global name: ${target.user.globalName || 'None'}`, `Server display: ${target.displayName || target.user.username}`, `Bot: ${target.user.bot ? 'Yes' : 'No'}`, `Account created: ${scanTimestamp(target.user.createdTimestamp)}`].join('\n'), inline: false },
      { name: '🧾 Historical Identity', value: historicalNames.length ? `${historicalNames.slice(0, 12).map((name) => `\`${name}\``).join(' • ')}\nBuilt from **${history.scanCount}** prior Goliath scan snapshot(s).` : `No prior identity changes captured yet. Goliath has ${history.scanCount} previous scan snapshot(s) for this member.`, inline: false },
      { name: '🏠 Guild Membership', value: [`Joined: ${scanTimestamp(target.joinedTimestamp)}`, `Boosting since: ${scanTimestamp(target.premiumSinceTimestamp)}`, `Pending screening: ${target.pending ? 'Yes' : 'No'}`, `Timeout until: ${target.communicationDisabledUntilTimestamp ? scanTimestamp(target.communicationDisabledUntilTimestamp) : 'None'}`].join('\n'), inline: false },
      { name: `🎭 Roles (${roles.length})`, value: (roles.slice(0, 15).map((role) => `${role}`).join(', ') || 'None').slice(0, 1024), inline: false },
      { name: '🔐 Key Permissions', value: keyPermissions.length ? keyPermissions.map((name) => `\`${name}\``).join(' • ') : 'No elevated Discord permissions detected.', inline: false },
      { name: '🚩 Account Flags', value: flags.length ? flags.join(', ') : 'None exposed by Discord.', inline: false },
      { name: '⚖️ Moderation Intelligence', value: [`Warnings: **${warningCount}**`, `Cases: **${cases.length}** • Active: **${activeCases}**`, `Timeout cases: **${timeouts}** • Ban cases: **${bans}**`, `Appeals: **${appeals}** • Active evidence refs: **${evidence}**`].join('\n'), inline: false },
      { name: '📈 Moderation Risk Score', value: [`**${risk.score}/100 • ${risk.label}**`, risk.reasons.length ? risk.reasons.map((reason) => `• ${reason}`).join('\n') : 'No recorded moderation-risk signals.', 'Score is based only on recorded moderation history; identity-correlation guesses do not increase it.'].join('\n').slice(0, 1024), inline: false },
      { name: '👁️ Investigation Status', value: [`Watch list: **${investigation.watched ? 'ON' : 'OFF'}**`, investigation.watch?.reason ? `Reason: ${investigation.watch.reason}` : 'No watch reason recorded.', `Investigation notes: **${investigation.notes.length}**`, investigation.notes[0] ? `Latest: ${investigation.notes[0].note.slice(0, 500)}` : 'No investigation notes yet.'].join('\n').slice(0, 1024), inline: false },
      { name: '🌐 Goliath Network Intelligence', value: crossGuild.guildCount ? `Same Discord ID has **${crossGuild.caseCount}** moderation case(s) across **${crossGuild.guildCount}** other Goliath guild(s).\n${crossGuild.rows.map((row) => `• Guild \`${row.guild_id}\` — ${row.case_count} case(s) • last ${row.last_case_at || 'unknown'}`).join('\n').slice(0, 850)}` : 'No moderation cases for this Discord ID were found in other Goliath guilds.', inline: false },
      { name: '🕘 Recent Case History', value: recent.slice(0, 1024), inline: false },
      { name: '🧬 Suspected Accounts', value: suspectText.slice(0, 1024), inline: false },
      { name: '🔗 Confirmed Linked Accounts', value: 'No confirmed Goliath identity-link provider is currently connected to this scan. This section only shows verified links when Goliath has a legitimate stored verification/OAuth relationship.', inline: false },
      { name: '📡 Data Sources', value: 'Discord API • guild member cache • Goliath moderation cases • warnings • case metadata • appeals • evidence • scan history • same-ID cross-guild case intelligence • persistent scan correlation • investigation notes/watch state • heuristic guild correlation', inline: false },
    )
    .setFooter({ text: `Scanned by ${i.user?.tag || i.user?.username || i.user?.id || 'Unknown staff'} • evidence-based intelligence only` })
    .setTimestamp();
  const controls = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${target.id}`).setLabel('Rescan').setEmoji('🔄').setStyle(Discord.ButtonStyle.Primary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${target.id}`).setLabel('Scan History').setEmoji('🕘').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_case_detail:${target.id}`).setLabel('Case Detail').setEmoji('📁').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:cases`).setLabel('Cases').setEmoji('⚖️').setStyle(Discord.ButtonStyle.Secondary),
  );
  const intelligenceControls = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(`mod_scan_note:${target.id}`).setLabel('Add Note').setEmoji('📝').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_watch:${target.id}`).setLabel(investigation.watched ? 'Remove Watch' : 'Watch Member').setEmoji('👁️').setStyle(investigation.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_links:${target.id}`).setLabel(`Link Evidence (${persistentLinks.length})`.slice(0, 80)).setEmoji('🔗').setStyle(Discord.ButtonStyle.Secondary),
  );
  return { scanId, cases, suspects, history, crossGuild, investigation, persistentLinks, risk, embed, components: [controls, intelligenceControls] };
}
function buildScanHistoryPayload(i, target) {
  const rows = scanAuditRows(i.guild.id, target.id, 25);
  const historyText = rows.length ? rows.slice(0, 10).map((row) => {
    const after = parseJson(row.after_value, {});
    const identity = after.identity || {};
    const ts = new Date(row.created_at || 0).getTime();
    const when = Number.isFinite(ts) && ts > 0 ? `<t:${Math.floor(ts / 1000)}:R>` : String(row.created_at || 'Unknown time');
    const suspected = Array.isArray(after.suspectedMatches) ? after.suspectedMatches.length : Number(after.suspectedCount || 0);
    return `• ${when} • scan \`${after.scanId || row.audit_id}\` • ${identity.username || target.user.username} • ${after.caseCount || 0} case(s) • ${suspected} suspected match(es)`;
  }).join('\n') : 'No previous Goliath Member Scan audit records exist for this member yet.';
  const identity = historicalIdentitySnapshot(i.guild.id, target.id);
  const embed = new Discord.EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🕘 Member Scan History • ${target.user.tag}`)
    .setDescription(`**Target:** ${target.user} (\`${target.id}\`)\n\n${historyText.slice(0, 3500)}`)
    .addFields(
      { name: 'Captured Usernames', value: identity.names.length ? identity.names.slice(0, 20).map((value) => `\`${value}\``).join(' • ') : 'None captured yet.', inline: false },
      { name: 'Captured Global / Display Names', value: [...new Set([...identity.globals, ...identity.displays])].length ? [...new Set([...identity.globals, ...identity.displays])].slice(0, 20).map((value) => `\`${value}\``).join(' • ') : 'None captured yet.', inline: false },
      { name: 'Captured Avatar Hashes', value: identity.avatars.length ? `${identity.avatars.length} distinct custom avatar hash(es) recorded across scans.` : 'No custom avatar hashes captured yet.', inline: false },
    )
    .setFooter({ text: 'History is built only from Goliath scan audit snapshots.' })
    .setTimestamp();
  const controls = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${target.id}`).setLabel('Back to Scan').setEmoji('🔎').setStyle(Discord.ButtonStyle.Primary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary),
  );
  return { embed, components: [controls] };
}
function buildComparisonPayload(i, primary, secondary) {
  const correlation = compareIdentitySignals(primary, secondary);
  const left = moderationSummary(i.guild.id, primary.id);
  const right = moderationSummary(i.guild.id, secondary.id);
  const label = correlation.score >= 70 ? '🔴 STRONG MATCH' : correlation.score >= 35 ? '🟠 POSSIBLE MATCH' : '⚪ LOW CORRELATION';
  const deltaCreated = Math.abs((primary.user.createdTimestamp || 0) - (secondary.user.createdTimestamp || 0));
  const deltaJoined = Math.abs((primary.joinedTimestamp || 0) - (secondary.joinedTimestamp || 0));
  const embed = new Discord.EmbedBuilder()
    .setColor(correlation.score >= 70 ? 0xED4245 : correlation.score >= 35 ? 0xFEE75C : 0x5865F2)
    .setTitle(`🧬 Goliath Account Comparison`)
    .setDescription([
      `${primary.user} (\`${primary.id}\`)`,
      `vs`,
      `${secondary.user} (\`${secondary.id}\`)`,
      '',
      `**Correlation:** ${label} • **${correlation.score}%**`,
      'This score is an investigation aid, not proof that both Discord accounts belong to the same person.',
    ].join('\n'))
    .addFields(
      { name: '🔎 Correlation Signals', value: correlation.signals.length ? correlation.signals.map((signal) => `• ${signal}`).join('\n') : 'No meaningful identity correlation signals detected.', inline: false },
      { name: `🪪 ${primary.user.username}`, value: [`Global: ${primary.user.globalName || 'None'}`, `Display: ${primary.displayName}`, `Created: ${scanTimestamp(primary.user.createdTimestamp)}`, `Joined: ${scanTimestamp(primary.joinedTimestamp)}`, `Warnings: ${left.warningCount} • Cases: ${left.cases.length} • Bans: ${left.bans}`].join('\n'), inline: true },
      { name: `🪪 ${secondary.user.username}`, value: [`Global: ${secondary.user.globalName || 'None'}`, `Display: ${secondary.displayName}`, `Created: ${scanTimestamp(secondary.user.createdTimestamp)}`, `Joined: ${scanTimestamp(secondary.joinedTimestamp)}`, `Warnings: ${right.warningCount} • Cases: ${right.cases.length} • Bans: ${right.bans}`].join('\n'), inline: true },
      { name: '⏱️ Timeline Difference', value: [`Account creation gap: **${Math.round(deltaCreated / 3600000)}h**`, `Guild join gap: **${Math.round(deltaJoined / 3600000)}h**`].join('\n'), inline: false },
    )
    .setFooter({ text: 'Evidence-based comparison • no private Discord data is exposed to bots' })
    .setTimestamp();
  const controls = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${primary.id}`).setLabel(`Scan ${primary.user.username}`.slice(0, 80)).setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${secondary.id}`).setLabel(`Scan ${secondary.user.username}`.slice(0, 80)).setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${primary.id}`).setLabel('Compare Another').setEmoji('🧬').setStyle(Discord.ButtonStyle.Primary),
  );
  return { correlation, embed, components: [controls] };
}
async function runMemberScan(i, targetId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to run a member intelligence scan.');
  if (!allowed) return true;
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  const report = buildMemberScanPayload(i, target);
  recordModerationSystemEvent({
    interaction: i,
    event: 'moderation.member_scan.completed',
    action: 'member_scan',
    targetId: target.id,
    after: {
      scanId: report.scanId,
      caseCount: report.cases.length,
      suspectedCount: report.suspects.length,
      suspectedMatches: report.suspects.map((entry) => ({ userId: entry.member.id, score: entry.score, signals: entry.signals })),
      identity: {
        username: target.user.username || null,
        globalName: target.user.globalName || null,
        displayName: target.displayName || null,
        avatarHash: target.user.avatar || null,
        accountCreatedAt: target.user.createdTimestamp || null,
        joinedAt: target.joinedTimestamp || null,
      },
      network: { otherGuildCount: report.crossGuild.guildCount, otherGuildCaseCount: report.crossGuild.caseCount },
      risk: report.risk,
      investigation: { watched: report.investigation.watched, noteCount: report.investigation.notes.length },
      persistentLinkEvidence: report.persistentLinks.map((entry) => ({ userId: entry.userId, appearances: entry.appearances, maxScore: entry.maxScore, signals: entry.signals })),
    },
    metadata: { dataSources: ['discord_api', 'guild_cache', 'moderation_cases', 'warnings', 'case_metadata', 'appeals', 'evidence', 'scan_history', 'cross_guild_same_id_cases', 'persistent_scan_correlation', 'investigation_state', 'heuristic_guild_correlation'] },
  });
  return safeReply(i, { embeds: [report.embed], components: report.components, flags: 64 });
}
async function showMemberScanHistory(i, targetId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to view member scan history.');
  if (!allowed) return true;
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  const payload = buildScanHistoryPayload(i, target);
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.history_viewed', action: 'member_scan_history', targetId: target.id });
  return safeReply(i, { embeds: [payload.embed], components: payload.components, flags: 64 });
}
async function runMemberComparison(i, primaryId, secondaryId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to compare member intelligence.');
  if (!allowed) return true;
  if (!primaryId || !secondaryId || String(primaryId) === String(secondaryId)) return safeReply(i, { content: '❌ Select a different member to compare against.', flags: 64 });
  const [primary, secondary] = await Promise.all([fetchTarget(i.guild, primaryId), fetchTarget(i.guild, secondaryId)]);
  if (!primary || !secondary) return safeReply(i, { content: '❌ One of those members could not be found in this server.', flags: 64 });
  const payload = buildComparisonPayload(i, primary, secondary);
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.compared', action: 'member_compare', targetId: primary.id, after: { comparedUserId: secondary.id, score: payload.correlation.score, signals: payload.correlation.signals } });
  return safeReply(i, { embeds: [payload.embed], components: payload.components, flags: 64 });
}
async function showPersistentLinkEvidence(i, targetId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to view persistent link evidence.');
  if (!allowed) return true;
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  const evidence = aggregateSuspectedEvidence(i.guild.id, target.id);
  const text = evidence.length ? evidence.map((entry) => {
    const member = i.guild.members.cache.get(entry.userId);
    const label = entry.maxScore >= 70 ? '🔴 Strong historical correlation' : '🟠 Possible historical correlation';
    return `${label} — ${member ? member.user : `<@${entry.userId}>`} (\`${entry.userId}\`)\n• appeared in **${entry.appearances}** scan(s) • highest score **${entry.maxScore}%**\n${entry.signals.slice(0, 8).map((signal) => `• ${signal}`).join('\n')}`;
  }).join('\n\n') : 'No suspected-account correlation has repeated across prior Goliath scans.';
  const embed = new Discord.EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🔗 Persistent Link Evidence • ${target.user.tag}`)
    .setDescription(`Evidence accumulated from previous Goliath scans. Repeated heuristic matches are still **not proof** of shared ownership.\n\n${text.slice(0, 3800)}`)
    .setFooter({ text: 'Persistent correlation uses only previously recorded Goliath scan signals.' })
    .setTimestamp();
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.link_evidence_viewed', action: 'member_scan_links', targetId: target.id, after: { matchCount: evidence.length } });
  return safeReply(i, { embeds: [embed], components: [new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${target.id}`).setLabel('Back to Scan').setEmoji('🔎').setStyle(Discord.ButtonStyle.Primary))], flags: 64 });
}
async function toggleMemberWatch(i, targetId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to change investigation watch state.');
  if (!allowed) return true;
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  const state = getInvestigationState(i.guild.id, target.id);
  const enabled = !state.watched;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.watch_updated', action: 'member_watch', targetId: target.id, before: { enabled: state.watched }, after: { enabled, reason: enabled ? 'Manual staff investigation watch.' : 'Removed from manual investigation watch.' } });
  return runMemberScan(i, target.id);
}
async function submitInvestigationNote(i) {
  const id = String(i.customId || '');
  if (!id.startsWith('mod_scan_note_submit:')) return false;
  const targetId = id.split(':')[1];
  const allowed = await ensureActionAccess(i, 'add_case_note', '❌ You do not have permission to add investigation notes.');
  if (!allowed) return true;
  const note = fieldValue(i, 'note').slice(0, 1000);
  if (!note) return safeReply(i, { content: '❌ Investigation note cannot be empty.', flags: 64 });
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.note_added', action: 'member_scan_note', targetId: target.id, after: { note } });
  return runMemberScan(i, target.id);
}
async function handleMemberScanSelect(i) {
  if (i.customId === 'mod_scan_user_select') {
    const targetId = i.values?.[0];
    if (!targetId) return safeReply(i, { content: '❌ No member selected.', flags: 64 });
    return runMemberScan(i, targetId);
  }
  if (String(i.customId || '').startsWith('mod_scan_compare_select:')) {
    const primaryId = String(i.customId).split(':')[1];
    const secondaryId = i.values?.[0];
    if (!secondaryId) return safeReply(i, { content: '❌ No comparison member selected.', flags: 64 });
    return runMemberComparison(i, primaryId, secondaryId);
  }
  return false;
}
async function handleMemberScanButton(i) {
  const id = String(i.customId || '');
  if (id === 'mod_select_user' || id === 'mod_member_scan') {
    const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to run a member intelligence scan.');
    if (!allowed) return true;
    const select = new Discord.UserSelectMenuBuilder().setCustomId('mod_scan_user_select').setPlaceholder('🔎 Select a member to scan').setMinValues(1).setMaxValues(1);
    return safeReply(i, { content: '🔎 **Goliath Member Scan** — select a server member to run a full intelligence report.', components: [new Discord.ActionRowBuilder().addComponents(select)], flags: 64 });
  }
  if (id.startsWith('mod_member_scan:')) return runMemberScan(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_history:')) return showMemberScanHistory(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_links:')) return showPersistentLinkEvidence(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_watch:')) return toggleMemberWatch(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_note:')) {
    const targetId = id.split(':')[1];
    const allowed = await ensureActionAccess(i, 'add_case_note', '❌ You do not have permission to add investigation notes.');
    if (!allowed) return true;
    await i.showModal(buildInvestigationNoteModal(targetId));
    return true;
  }
  if (id.startsWith('mod_scan_compare:')) {
    const primaryId = id.split(':')[1];
    const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to compare member intelligence.');
    if (!allowed) return true;
    const select = new Discord.UserSelectMenuBuilder().setCustomId(`mod_scan_compare_select:${primaryId}`).setPlaceholder('🧬 Select another member to compare').setMinValues(1).setMaxValues(1);
    return safeReply(i, { content: `🧬 **Compare Accounts** — select another server member to compare against <@${primaryId}>.`, components: [new Discord.ActionRowBuilder().addComponents(select)], flags: 64 });
  }
  return false;
}

async function showPunishmentModal(i, action, targetId) { if (!PUNISHMENT_ACTIONS.has(action)) return false; const target = await requireModeratableTarget(i, targetId, action); if (!target) return true; await i.showModal(buildPunishmentModal(action, target.id)); return true; }
async function requestRemoveTimeout(i, targetId) { const target = await requireModeratableTarget(i, targetId, 'remove_timeout'); if (!target) return true; return createConfirmation(i, target.id, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`); }
async function routeActionRequest(i, action, targetId) { if (action === 'warn') return showWarningModal(i, targetId); if (action === 'remove-warning') return showRemoveWarningModal(i, targetId); if (action === 'remove-timeout') return requestRemoveTimeout(i, targetId); if (PUNISHMENT_ACTIONS.has(action)) return showPunishmentModal(i, action, targetId); return false; }
async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }
async function handleOpenActionButton(i) { const action = getPrefixedAction(i.customId, 'mod_open_', OPEN_ACTIONS); if (!action) return false; return routeActionRequest(i, action, getTargetIdFromCustomId(i.customId)); }
async function handleCaseToolButton(i) { const caseResult = await openCaseTool(i); if (caseResult) return caseResult; const searchResult = await handleCaseSearchAction(i); if (searchResult) return searchResult; const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id); if (id.startsWith('mod_remove_warning:')) return routeActionRequest(i, 'remove-warning', targetId); if (id.startsWith('mod_remove_timeout:')) return routeActionRequest(i, 'remove-timeout', targetId); return false; }
async function handleBulkButton(i) {
  if (!String(i.customId || '').startsWith('mod_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  await i.showModal(buildBulkModal(action)); return true;
}
async function handleConfirmButton(i) {
  if (!i.customId.startsWith('mod_confirm_action:')) return false;
  const { token, context } = parseConfirmActionContext(i.customId);
  if (!token) return false;
  const lockKey = `${i.guild?.id || 'none'}:${token}`;
  if (CONFIRM_LOCKS.has(lockKey)) {
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.duplicate_blocked', metadata: { tokenPresent: true } });
    return safeReply(i, { content: '⏳ That moderation action is already being processed.', flags: 64 });
  }
  CONFIRM_LOCKS.add(lockKey);
  try {
    const result = await executePendingAction(Discord, i, token, context);
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.processed', metadata: { tokenPresent: true, handled: Boolean(result) } });
    return result;
  } finally {
    CONFIRM_LOCKS.delete(lockKey);
  }
}
async function handleCancelButton(i) {
  if (i.customId !== 'mod_cancel_action') return false;
  let removed = 0;
  if (i.guild?.id && i.user?.id) removed = db.prepare('DELETE FROM pending_actions WHERE guild_id = ? AND moderator_id = ?').run(String(i.guild.id), String(i.user.id)).changes;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.action.cancelled', metadata: { pendingActionsRemoved: removed } });
  if (i.message && typeof i.update === 'function') { await i.update({ content: '❌ Cancelled.', embeds: [], components: [] }); return true; }
  return safeReply(i, { content: '❌ Cancelled.', flags: 64 });
}
async function handleBulkModal(i) {
  if (!String(i.customId || '').startsWith('mod_submit_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.bulk.requested', action, metadata: { operation: fieldValue(i, 'operation') || action } });
  return submitBulkModal(i, action);
}
function trackPresetSubmission(i) { const presetId = presetIdFromSubmission(i.customId); if (presetId && i.guild) markPresetUsed(i.guild, presetId, i.user?.id || null); }
async function handleActionModal(i) {
  const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_submit_warn:')) {
    const result = await submitWarningModal(i, targetId, refreshCasesDashboard);
    if (result?.ok) trackPresetSubmission(i);
    else auditFailure(i, 'moderation.action.failed', 'warn', targetId, result?.error?.message || result?.error || 'Warning submission failed.');
    return result || true;
  }
  if (id.startsWith('mod_submit_remove_warning:')) return submitRemoveWarningRequest(i, targetId, createConfirmation);
  const action = getPunishmentSubmitAction(id); if (!action) return false;
  const target = await requireModeratableTarget(i, targetId, action); if (!target) return true;
  const result = await submitPunishmentRequest(i, target, action);
  if (result?.ok) trackPresetSubmission(i);
  else auditFailure(i, 'moderation.action.failed', action, targetId, result?.error?.message || result?.error || `${action} submission failed.`);
  if (action === 'timeout' && result?.ok) await refreshCasesDashboard(i, target);
  return true;
}
async function hardenAppealDecisionResult(i, result) {
  const match = String(i.customId || '').match(/^mod_submit_case_appeal_decision:(\d+):([^:]+):(approved|denied)$/);
  if (!match || match[3] !== 'approved' || !i.guild?.id) return result;
  const caseId = Number(match[1]);
  const appealId = match[2];
  let modCase = getCaseById(i.guild.id, caseId);
  if (!modCase) return result;
  const appeal = Array.isArray(modCase.metadata?.appeals) ? modCase.metadata.appeals.find((entry) => String(entry?.id) === appealId) : null;
  const remedy = appeal?.remedy || null;
  if (remedy?.ok === false && modCase.status === 'reversed') {
    modCase = updateCaseStatus(i.guild.id, caseId, 'active', i.user?.id || null) || modCase;
    recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.appeal.remedy.status_restored', before: 'reversed', after: 'active', metadata: { appealId, remedyAction: remedy.action || null, reason: remedy.detail || 'Approved appeal remedy failed.' } });
    recordModerationSystemEvent({ interaction: i, event: 'moderation.appeal.remedy.failed', action: remedy.action || modCase.action, targetId: modCase.userId, reason: remedy.detail || 'Approved appeal remedy failed.', metadata: { caseId, appealId, caseStatusRestored: true } });
  }
  if (modCase.action === 'warn' && remedy?.ok === true) {
    const existing = db.prepare('SELECT audit_id FROM case_audit WHERE guild_id = ? AND case_id = ? AND event = ? LIMIT 1').get(String(i.guild.id), caseId, 'case.strike.removed');
    if (!existing) {
      const strikeWeight = Math.max(1, Math.min(5, Number(modCase.metadata?.strikeWeight) || 1));
      recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.strike.removed', before: strikeWeight, after: 0, metadata: { strikeWeight, appealId, appealRemedy: true } });
    }
  }
  return result;
}
async function handleCaseModal(i) {
  const result = await submitCaseModal(i, { fetchTarget, refreshCasesDashboard });
  return hardenAppealDecisionResult(i, result);
}
async function routeHandlers(i, handlers) { for (const handler of handlers) { const result = await handler(i); if (result) return result; } return false; }
async function routeButtonsAndSelects(i) {
  const denied = ensurePanelAccess(i); if (denied) return denied;
  if (i.isUserSelectMenu?.()) {
    const scan = await handleMemberScanSelect(i);
    if (scan) return scan;
    return handleUserSelectMenu(i);
  }
  if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);
  if (!i.isButton?.()) return false;
  return routeHandlers(i, [handleExportInteraction, handlePresetEditorButton, handlePresetInteraction, handleConfirmButton, value => handleCaseAction(value, { fetchTarget, createConfirmation }), handleDashboardNavigation, handleCancelButton, handleMemberScanButton, handleSelectUserButton, handleBulkButton, handleOpenActionButton, handleCaseToolButton]);
}
async function routeModModal(i) {
  if (!i?.customId?.startsWith('mod_')) return false;
  const denied = ensurePanelAccess(i); if (denied) return denied;
  await syncExpiredWarningsToCases(i.guild.id);
  if (String(i.customId).startsWith('mod_export_submit:')) {
    const result = await handleExportInteraction(i);
    if (result) {
      recordModerationSystemEvent({ interaction: i, event: 'moderation.export.requested', action: 'export_cases', metadata: {
        scope: fieldValue(i, 'scope'), reference: fieldValue(i, 'reference') || null, format: fieldValue(i, 'format'), include: fieldValue(i, 'include'), filters: fieldValue(i, 'filters').slice(0, 500),
      } });
      return result;
    }
  }
  return routeHandlers(i, [submitInvestigationNote, handleExportInteraction, handlePresetModal, handleCaseSearchModal, handleCaseModal, handleBulkModal, handleActionModal]);
}
async function handleModInteraction(i) {
  if (!i?.customId || !isModCustomId(i.customId)) return false;
  if (i.customId.startsWith('nav|')) return false;
  try {
    if (isExternalAppealCustomId(i.customId)) return await handleExternalAppealInteraction(i);
    if (i.isModalSubmit?.()) return await routeModModal(i);
    const handled = await routeButtonsAndSelects(i);
    if (!handled) recordModerationSystemEvent({ interaction: i, event: 'moderation.interaction.unhandled', metadata: { interactionType: i.componentType || null } });
    return handled;
  } catch (error) {
    console.error('❌ Moderation interaction failed:', error);
    auditFailure(i, 'moderation.interaction.failed', null, getTargetIdFromCustomId(i.customId), error?.message || error, { stack: String(error?.stack || '').slice(0, 1500) });
    await safeReply(i, { content: '❌ That moderation action failed safely. No further action was taken.', flags: 64 }).catch(() => null);
    return true;
  }
}
module.exports = { handleModInteraction };
