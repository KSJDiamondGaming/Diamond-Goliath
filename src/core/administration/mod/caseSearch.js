'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const { COLORS, createEmbed } = require('../../../core/ui/embeds');
const { canUseModAction } = require('./permissions');
const { searchCases, getCaseById, getCaseAudit, isCaseLocked, updateCaseReason, updateCaseTags, updateCaseLock, linkCases, unlinkCaseRelationship } = require('./storage');

const ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout']);
const STATUSES = new Set(['active', 'reversed', 'expired']);
const SEARCHES = new Map();
const TTL = 30 * 60 * 1000;
const SNOWFLAKE = /^\d{16,20}$/;
const AUDIT_PAGE_SIZE = 5;

function buildCaseSearchModal() {
  return new ModalBuilder().setCustomId('mod_submit_case_search').setTitle('Search Moderation Cases').addComponents(
    ...[['case_id', 'Case ID', 'Optional — e.g. 123', 12], ['user_id', 'User ID', 'Optional Discord user ID', 30], ['moderator_id', 'Moderator ID', 'Optional Discord moderator ID', 30], ['action', 'Action', 'warn, timeout, kick, ban...', 30], ['status', 'Status', 'active, reversed, expired', 20]].map(([id, label, placeholder, max]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder(placeholder).setRequired(false).setMaxLength(max)))
  );
}

function buildAdvancedCaseSearchModal(token) {
  return new ModalBuilder().setCustomId(`mod_submit_case_search_advanced:${token}`).setTitle('Advanced Case Search').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason_query').setLabel('Reason / Staff Note').setStyle(TextInputStyle.Paragraph).setPlaceholder('Text contained in the reason or staff note').setRequired(false).setMaxLength(500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('created_from').setLabel('Created From').setStyle(TextInputStyle.Short).setPlaceholder('YYYY-MM-DD').setRequired(false).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('created_to').setLabel('Created To').setStyle(TextInputStyle.Short).setPlaceholder('YYYY-MM-DD').setRequired(false).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('updated_from').setLabel('Updated From').setStyle(TextInputStyle.Short).setPlaceholder('YYYY-MM-DD').setRequired(false).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('updated_to').setLabel('Updated To').setStyle(TextInputStyle.Short).setPlaceholder('YYYY-MM-DD').setRequired(false).setMaxLength(10))
  );
}

function buildCaseLinkModal(token, caseId) {
  return new ModalBuilder().setCustomId(`mod_case_link_submit:${token}:${caseId}`).setTitle(`Link Case #${caseId}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('related_case_id').setLabel('Related Case ID').setStyle(TextInputStyle.Short).setPlaceholder('Enter the case ID to link').setRequired(true).setMaxLength(12))
  );
}

function buildCaseReasonModal(token, c) {
  return new ModalBuilder().setCustomId(`mod_case_reason_submit:${token}:${c.caseId}`).setTitle(`Edit Case #${c.caseId} Reason`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Moderation Reason').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter the updated moderation reason').setRequired(true).setMaxLength(500).setValue(String(c.reason || '').slice(0, 500)))
  );
}

function buildCaseTagsModal(token, c) {
  const tags = Array.isArray(c.metadata?.tags) ? c.metadata.tags : [];
  return new ModalBuilder().setCustomId(`mod_case_tags_submit:${token}:${c.caseId}`).setTitle(`Edit Case #${c.caseId} Tags`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tags').setLabel('Case Tags').setStyle(TextInputStyle.Paragraph).setPlaceholder('Comma-separated tags, e.g. spam, repeat offender').setRequired(false).setMaxLength(400).setValue(tags.join(', ').slice(0, 400)))
  );
}

function input(i, id) { return String(i.fields.getTextInputValue(id) || '').trim(); }

function parseDate(value, label, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date.`);
  return parsed.toISOString();
}

function validateSnowflake(value, label) {
  if (!value) return null;
  if (!SNOWFLAKE.test(value)) return `${label} must be a valid Discord user ID.`;
  return null;
}

function filtersFrom(i) {
  const caseId = input(i, 'case_id'), userId = input(i, 'user_id'), moderatorId = input(i, 'moderator_id'), action = input(i, 'action').toLowerCase(), status = input(i, 'status').toLowerCase();
  if (caseId && !/^\d+$/.test(caseId)) return { error: 'Case ID must be a number.' };
  const userError = validateSnowflake(userId, 'User ID');
  if (userError) return { error: userError };
  const moderatorError = validateSnowflake(moderatorId, 'Moderator ID');
  if (moderatorError) return { error: moderatorError };
  if (action && !ACTIONS.has(action)) return { error: `Unknown action. Use: ${[...ACTIONS].join(', ')}.` };
  if (status && !STATUSES.has(status)) return { error: `Unknown status. Use: ${[...STATUSES].join(', ')}.` };
  return { caseId: caseId || undefined, userId: userId || undefined, moderatorId: moderatorId || undefined, action: action || undefined, status: status || undefined, page: 0, pageSize: 10 };
}

function remember(guildId, filters) {
  const token = `${String(guildId)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  SEARCHES.set(token, { guildId: String(guildId), filters: { ...filters }, createdAt: Date.now() });
  for (const [k, v] of SEARCHES) if (Date.now() - v.createdAt > TTL) SEARCHES.delete(k);
  return token;
}

function stateFor(token, guildId) {
  const s = SEARCHES.get(token);
  if (!s || s.guildId !== String(guildId) || Date.now() - s.createdAt > TTL) { SEARCHES.delete(token); return null; }
  return s;
}

function resultEmbed(r) {
  const d = r.results.length ? r.results.map((e) => `**#${e.caseId}** • ${e.action} • ${e.status || 'active'}\nUser: <@${e.userId}> • Moderator: <@${e.moderatorId}>\nReason: ${e.reason || 'No reason provided'}`).join('\n\n') : 'No moderation cases matched those filters.';
  return createEmbed({ title: 'Moderation Case Search', description: d.slice(0, 3900), color: COLORS.PRIMARY, footer: `Showing ${r.total ? `${r.page * r.pageSize + 1}-${Math.min((r.page + 1) * r.pageSize, r.total)} of ${r.total}` : '0'} result${r.total === 1 ? '' : 's'}` });
}

function resultComponents(r, token) {
  const rows = [];
  if (r.results.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_case_search_select:${token}`).setPlaceholder('Select a case to open Case Detail').addOptions(r.results.map((e) => ({ label: `Case #${e.caseId} • ${e.action}`.slice(0, 100), description: `${e.status || 'active'} • User ${e.userId}`.slice(0, 100), value: String(e.caseId) })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_search_page:${token}:${Math.max(0, r.page - 1)}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(r.page <= 0),
    new ButtonBuilder().setCustomId(`mod_case_search_page:${token}:${r.page + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(r.page >= r.totalPages - 1 || r.totalPages === 0),
    new ButtonBuilder().setCustomId(`mod_case_search_advanced:${token}`).setLabel('Advanced Filters').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mod_case_search').setLabel('New Search').setStyle(ButtonStyle.Primary)
  ));
  return rows;
}

function payload(r, token) { return { embeds: [resultEmbed(r)], components: resultComponents(r, token) }; }

function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function formatAuditEntry(entry) {
  const actor = entry.actorId ? `<@${entry.actorId}>` : 'System';
  const timestamp = new Date(entry.createdAt).getTime();
  const time = Number.isFinite(timestamp) ? `<t:${Math.floor(timestamp / 1000)}:R>` : 'Unknown time';
  const event = String(entry.event || 'case.updated').replace(/^case\./, '').replace(/\./g, ' ');
  const before = formatAuditValue(entry.before).replace(/\s+/g, ' ').slice(0, 180);
  const after = formatAuditValue(entry.after).replace(/\s+/g, ' ').slice(0, 180);
  return `• **${event}** by ${actor} • ${time}\n  Before: ${before}\n  After: ${after}`;
}

function caseDetailEmbed(c, audit) {
  const ts = (v) => { const n = new Date(v).getTime(); return Number.isFinite(n) ? Math.floor(n / 1000) : Math.floor(Date.now() / 1000); };
  const e = new EmbedBuilder().setColor(COLORS.PRIMARY).setTitle(`🧾 Case #${c.caseId}`).addFields(
    { name: 'Action', value: String(c.action || 'unknown'), inline: true }, { name: 'Status', value: String(c.status || 'active'), inline: true },
    { name: 'User ID', value: String(c.userId), inline: true }, { name: 'Moderator ID', value: String(c.moderatorId), inline: true },
    { name: 'Reason', value: String(c.reason || 'No reason provided').slice(0, 1024), inline: false },
    { name: 'Created', value: `<t:${ts(c.createdAt)}:F>`, inline: true }, { name: 'Updated', value: c.updatedAt ? `<t:${ts(c.updatedAt)}:F>` : 'Never', inline: true }
  );
  if (c.relatedCaseId) e.addFields({ name: 'Related Case', value: `#${c.relatedCaseId}`, inline: true });
  const locked = isCaseLocked(c);
  if (locked) {
    const lockedBy = c.metadata?.lockedBy ? `<@${c.metadata.lockedBy}>` : 'Unknown';
    const lockedAt = c.metadata?.lockedAt ? `<t:${ts(c.metadata.lockedAt)}:R>` : 'Unknown time';
    e.addFields({ name: '🔒 Case Lock', value: `Locked by ${lockedBy} • ${lockedAt}`, inline: false });
  }
  const tags = Array.isArray(c.metadata?.tags) ? c.metadata.tags : [];
  if (tags.length) e.addFields({ name: 'Tags', value: tags.map((tag) => `\`${String(tag).slice(0, 32)}\``).join(' ').slice(0, 1024), inline: false });
  if (c.note) e.addFields({ name: 'Staff Note', value: String(c.note).slice(0, 1024), inline: false });
  if (audit?.results?.length) e.addFields({ name: `Audit Timeline • Page ${audit.page + 1}/${audit.totalPages}`, value: audit.results.map(formatAuditEntry).join('\n').slice(0, 1024), inline: false });
  return e;
}

function caseDetailButtons(c, token, audit) {
  const closed = c.status === 'reversed' || c.status === 'expired';
  const locked = isCaseLocked(c);
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_search_back:${token}`).setLabel('← Back to Search').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_case_reverse_warning:${c.caseId}`).setLabel('↩️ Reverse Warning').setStyle(ButtonStyle.Secondary).setDisabled(c.action !== 'warn' || closed),
    new ButtonBuilder().setCustomId(`mod_case_reverse_timeout:${c.caseId}`).setLabel('⏪ Reverse Timeout').setStyle(ButtonStyle.Secondary).setDisabled(c.action !== 'timeout' || closed),
    new ButtonBuilder().setCustomId(`mod_case_note:${c.caseId}`).setLabel('📝 Add/Edit Note').setStyle(ButtonStyle.Primary).setDisabled(locked),
    new ButtonBuilder().setCustomId(`mod_case_lock:${token}:${c.caseId}`).setLabel(locked ? '🔓 Unlock Case' : '🔒 Lock Case').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger)
  )];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_reason:${token}:${c.caseId}`).setLabel('✏️ Edit Reason').setStyle(ButtonStyle.Primary).setDisabled(locked),
    new ButtonBuilder().setCustomId(`mod_case_tags:${token}:${c.caseId}`).setLabel('🏷️ Edit Tags').setStyle(ButtonStyle.Primary).setDisabled(locked),
    new ButtonBuilder().setCustomId(`mod_case_link:${token}:${c.caseId}`).setLabel('🔗 Link Case').setStyle(ButtonStyle.Secondary).setDisabled(locked || Boolean(c.relatedCaseId)),
    new ButtonBuilder().setCustomId(`mod_case_unlink:${token}:${c.caseId}`).setLabel('Unlink Case').setStyle(ButtonStyle.Secondary).setDisabled(locked || !c.relatedCaseId),
    new ButtonBuilder().setCustomId(`mod_case_related_open:${token}:${c.caseId}`).setLabel('Open Related').setStyle(ButtonStyle.Secondary).setDisabled(!c.relatedCaseId)
  ));
  if (audit?.totalPages > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_audit_page:${token}:${c.caseId}:${Math.max(0, audit.page - 1)}`).setLabel('◀ Audit').setStyle(ButtonStyle.Secondary).setDisabled(audit.page <= 0),
    new ButtonBuilder().setCustomId(`mod_case_audit_page:${token}:${c.caseId}:${Math.min(audit.totalPages - 1, audit.page + 1)}`).setLabel('Audit ▶').setStyle(ButtonStyle.Secondary).setDisabled(audit.page >= audit.totalPages - 1)
  ));
  return rows;
}

async function openCaseSearch(i) {
  if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
  await i.showModal(buildCaseSearchModal());
  return true;
}

async function submitCaseSearch(i) {
  if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
  const f = filtersFrom(i);
  if (f.error) return safeReply(i, ephemeralError(f.error));
  const token = remember(i.guild.id, f), r = searchCases(i.guild.id, f);
  return safeReply(i, { ...payload(r, token), flags: 64 });
}

async function handleCaseSearchAction(i) {
  const id = String(i.customId || '');
  if (id === 'mod_case_search') return openCaseSearch(i);
  if (id.startsWith('mod_case_lock:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to lock or unlock cases.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    const updated = updateCaseLock(i.guild.id, caseId, !isCaseLocked(c), i.user?.id || null);
    if (!updated) return safeReply(i, ephemeralError('Failed to update case lock.'));
    const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(updated, audit)], components: caseDetailButtons(updated, token, audit) });
  }
  if (id.startsWith('mod_case_reason:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit cases.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(c)) return safeReply(i, ephemeralError('This case is locked. Unlock it before editing the reason.'));
    await i.showModal(buildCaseReasonModal(token, c));
    return true;
  }
  if (id.startsWith('mod_case_tags:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit cases.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(c)) return safeReply(i, ephemeralError('This case is locked. Unlock it before editing tags.'));
    await i.showModal(buildCaseTagsModal(token, c));
    return true;
  }
  if (id.startsWith('mod_case_related_open:')) {
    if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to view case details.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    const relatedCaseId = Number(c.relatedCaseId);
    if (!Number.isInteger(relatedCaseId) || relatedCaseId <= 0) return safeReply(i, ephemeralError('This case does not have a related case.'));
    const related = getCaseById(i.guild.id, relatedCaseId);
    if (!related) return safeReply(i, ephemeralError(`Related Case #${relatedCaseId} could not be found.`));
    const audit = getCaseAudit(i.guild.id, relatedCaseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(related, audit)], components: caseDetailButtons(related, token, audit) });
  }
  if (id.startsWith('mod_case_link:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit case relationships.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(c)) return safeReply(i, ephemeralError('This case is locked. Unlock it before changing relationships.'));
    if (c.relatedCaseId) return safeReply(i, ephemeralError(`Case #${caseId} is already linked to Case #${c.relatedCaseId}.`));
    await i.showModal(buildCaseLinkModal(token, caseId));
    return true;
  }
  if (id.startsWith('mod_case_unlink:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit case relationships.'));
    const [, token, caseIdRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(c)) return safeReply(i, ephemeralError('This case is locked. Unlock it before changing relationships.'));
    const result = unlinkCaseRelationship(i.guild.id, caseId, i.user?.id || null);
    if (!result.ok) return safeReply(i, ephemeralError(result.error || 'Failed to unlink cases.'));
    const updated = getCaseById(i.guild.id, caseId);
    const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(updated, audit)], components: caseDetailButtons(updated, token, audit) });
  }
  if (id.startsWith('mod_case_audit_page:')) {
    if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to view case details.'));
    const [, token, caseIdRaw, pageRaw] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw), c = getCaseById(i.guild.id, caseId);
    if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
    const requestedPage = Math.max(0, Math.trunc(Number(pageRaw) || 0));
    const audit = getCaseAudit(i.guild.id, caseId, { page: requestedPage, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(c, audit)], components: caseDetailButtons(c, token, audit) });
  }
  if (id.startsWith('mod_case_search_advanced:')) {
    if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
    const [, token] = id.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    await i.showModal(buildAdvancedCaseSearchModal(token));
    return true;
  }
  if (id.startsWith('mod_case_search_back:')) {
    if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
    const [, token] = id.split(':');
    const state = stateFor(token, i.guild.id);
    if (!state) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const r = searchCases(i.guild.id, state.filters);
    return i.update(payload(r, token));
  }
  if (!id.startsWith('mod_case_search_page:')) return false;
  if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
  const [, token, pageRaw] = id.split(':');
  const s = stateFor(token, i.guild.id);
  if (!s) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
  const r = searchCases(i.guild.id, { ...s.filters, page: Math.max(0, Math.trunc(Number(pageRaw) || 0)) });
  return i.update(payload(r, token));
}

async function handleCaseSearchSelect(i) {
  const id = String(i.customId || '');
  if (!id.startsWith('mod_case_search_select:')) return false;
  if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to view case details.'));
  const [, token] = id.split(':');
  if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
  const caseId = Number(i.values?.[0]), c = getCaseById(i.guild.id, caseId);
  if (!Number.isInteger(caseId) || !c) return safeReply(i, ephemeralError('Case not found.'));
  const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
  return i.update({ embeds: [caseDetailEmbed(c, audit)], components: caseDetailButtons(c, token, audit) });
}

async function handleCaseSearchModal(i) {
  if (i.customId === 'mod_submit_case_search') return submitCaseSearch(i);
  if (i.customId.startsWith('mod_case_reason_submit:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit cases.'));
    const [, token, caseIdRaw] = i.customId.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw);
    const reason = input(i, 'reason');
    if (!Number.isInteger(caseId) || caseId <= 0) return safeReply(i, ephemeralError('Case ID must be a positive integer.'));
    if (!reason) return safeReply(i, ephemeralError('Case reason cannot be empty.'));
    const existing = getCaseById(i.guild.id, caseId);
    if (!existing) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(existing)) return safeReply(i, ephemeralError('This case was locked before the edit was submitted. Unlock it and try again.'));
    const updated = updateCaseReason(i.guild.id, caseId, reason, i.user?.id || null);
    if (!updated) return safeReply(i, ephemeralError('Failed to update case reason.'));
    const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(updated, audit)], components: caseDetailButtons(updated, token, audit) });
  }
  if (i.customId.startsWith('mod_case_tags_submit:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit cases.'));
    const [, token, caseIdRaw] = i.customId.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw);
    if (!Number.isInteger(caseId) || caseId <= 0) return safeReply(i, ephemeralError('Case ID must be a positive integer.'));
    const existing = getCaseById(i.guild.id, caseId);
    if (!existing) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(existing)) return safeReply(i, ephemeralError('This case was locked before the edit was submitted. Unlock it and try again.'));
    const updated = updateCaseTags(i.guild.id, caseId, input(i, 'tags'), i.user?.id || null);
    if (!updated) return safeReply(i, ephemeralError('Failed to update case tags.'));
    const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(updated, audit)], components: caseDetailButtons(updated, token, audit) });
  }
  if (i.customId.startsWith('mod_case_link_submit:')) {
    if (!canUseModAction(i.member, i.guild, 'edit_case')) return safeReply(i, ephemeralError('No permission to edit case relationships.'));
    const [, token, caseIdRaw] = i.customId.split(':');
    if (!stateFor(token, i.guild.id)) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
    const caseId = Number(caseIdRaw);
    const relatedRaw = input(i, 'related_case_id');
    if (!Number.isInteger(caseId) || !/^\d+$/.test(relatedRaw)) return safeReply(i, ephemeralError('Case IDs must be positive integers.'));
    const existing = getCaseById(i.guild.id, caseId);
    if (!existing) return safeReply(i, ephemeralError('Case not found.'));
    if (isCaseLocked(existing)) return safeReply(i, ephemeralError('This case was locked before the relationship was submitted. Unlock it and try again.'));
    const relatedCaseId = Number(relatedRaw);
    const result = linkCases(i.guild.id, caseId, relatedCaseId, i.user?.id || null);
    if (!result.ok) return safeReply(i, ephemeralError(result.error || 'Failed to link cases.'));
    const updated = getCaseById(i.guild.id, caseId);
    const audit = getCaseAudit(i.guild.id, caseId, { page: 0, pageSize: AUDIT_PAGE_SIZE });
    return i.update({ embeds: [caseDetailEmbed(updated, audit)], components: caseDetailButtons(updated, token, audit) });
  }
  if (!i.customId.startsWith('mod_submit_case_search_advanced:')) return false;
  if (!canUseModAction(i.member, i.guild, 'view_case_detail')) return safeReply(i, ephemeralError('No permission to search moderation cases.'));
  const [, token] = i.customId.split(':');
  const state = stateFor(token, i.guild.id);
  if (!state) return safeReply(i, ephemeralError('This search has expired. Please start a new search.'));
  const reasonQuery = input(i, 'reason_query');
  let dates;
  try {
    const createdFrom = parseDate(input(i, 'created_from'), 'Created From');
    const createdTo = parseDate(input(i, 'created_to'), 'Created To', true);
    const updatedFrom = parseDate(input(i, 'updated_from'), 'Updated From');
    const updatedTo = parseDate(input(i, 'updated_to'), 'Updated To', true);
    if (createdFrom && createdTo && new Date(createdFrom) > new Date(createdTo)) throw new Error('Created From cannot be after Created To.');
    if (updatedFrom && updatedTo && new Date(updatedFrom) > new Date(updatedTo)) throw new Error('Updated From cannot be after Updated To.');
    dates = { createdFrom, createdTo, updatedFrom, updatedTo };
  } catch (error) {
    return safeReply(i, ephemeralError(error.message));
  }
  state.filters = { ...state.filters, text: reasonQuery || undefined, ...dates, page: 0 };
  state.createdAt = Date.now();
  const r = searchCases(i.guild.id, state.filters);
  return safeReply(i, { ...payload(r, token), flags: 64 });
}

module.exports = { openCaseSearch, submitCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal };
