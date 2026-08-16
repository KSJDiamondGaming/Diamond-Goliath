'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getModuleSection, saveModuleSection, updateModuleSection } = require('../../../core/guild/moduleSectionManager');

const MODULE = 'colourRoles';
const now = () => new Date().toISOString();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const DEFAULT_PALETTE = Object.freeze([
  { key: 'red', label: 'Red', emoji: '🔴', hex: '#E74C3C', family: 'red', order: 10, enabled: true },
  { key: 'orange', label: 'Orange', emoji: '🟠', hex: '#E67E22', family: 'orange', order: 20, enabled: true },
  { key: 'yellow', label: 'Yellow', emoji: '🟡', hex: '#F1C40F', family: 'yellow', order: 30, enabled: true },
  { key: 'green', label: 'Green', emoji: '🟢', hex: '#2ECC71', family: 'green', order: 40, enabled: true },
  { key: 'blue', label: 'Blue', emoji: '🔵', hex: '#3498DB', family: 'blue', order: 50, enabled: true },
  { key: 'purple', label: 'Purple', emoji: '🟣', hex: '#9B59B6', family: 'purple', order: 60, enabled: true },
  { key: 'pink', label: 'Pink', emoji: '🩷', hex: '#E84393', family: 'pink', order: 70, enabled: true },
  { key: 'black', label: 'Black', emoji: '⚫', hex: '#23272A', family: 'black', order: 80, enabled: true },
  { key: 'white', label: 'White', emoji: '⚪', hex: '#F5F5F5', family: 'white', order: 90, enabled: true },
]);

const FAMILY_ORDER = Object.freeze({ red: 10, orange: 20, yellow: 30, green: 40, blue: 50, purple: 60, pink: 70, black: 80, white: 90 });

function cleanId(value) {
  const id = String(value || '').replace(/[^0-9]/g, '');
  return /^\d{15,25}$/.test(id) ? id : null;
}

function normalizeHex(value, fallback = null) {
  const raw = String(value || '').trim().replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(raw)) return fallback;
  return `#${raw}`;
}

function hexToInt(hex) {
  return parseInt(normalizeHex(hex, '#000000').slice(1), 16);
}

function rgbFromHex(hex) {
  const value = normalizeHex(hex, '#000000').slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
    else if (max === gn) h = ((bn - rn) / d + 2);
    else h = ((rn - gn) / d + 4);
    h *= 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

function classifyHex(hex) {
  const normalized = normalizeHex(hex, '#000000');
  const { h, s, l } = rgbToHsl(rgbFromHex(normalized));

  if (l <= 16) return { family: 'black', familyOrder: FAMILY_ORDER.black, hue: h, lightness: l };
  if (l >= 92 && s <= 20) return { family: 'white', familyOrder: FAMILY_ORDER.white, hue: h, lightness: l };

  let family = 'red';
  if (h < 15 || h >= 345) family = 'red';
  else if (h < 45) family = 'orange';
  else if (h < 75) family = 'yellow';
  else if (h < 165) family = 'green';
  else if (h < 255) family = 'blue';
  else if (h < 315) family = 'purple';
  else family = 'pink';

  return { family, familyOrder: FAMILY_ORDER[family], hue: h, lightness: l };
}

function defaultAnalytics() {
  return {
    selections: 0,
    switches: 0,
    removals: 0,
    rolesCreated: 0,
    rolesDeleted: 0,
    failed: 0,
    lastSelectionAt: null,
  };
}

function defaultSection() {
  return {
    palette: DEFAULT_PALETTE.map(clone),
    customHexEnabled: true,
    oneColourOnly: true,
    allowRemoveColour: true,
    style: {
      format: '🎨 | {colour}',
      icon: '🎨',
      separator: '|',
      anchorRoleId: null,
      placement: 'below',
      keepGrouped: true,
      detectedFormat: null,
      detectedIcon: null,
      detectedSeparator: null,
      detectedConfidence: 0,
    },
    deployment: {
      channelId: null,
      messageId: null,
    },
    managedRoles: {},
    memberSelections: {},
    cleanup: {
      deleteUnusedRoles: true,
      unusedGraceHours: 168,
    },
    analytics: defaultAnalytics(),
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizePalette(value) {
  const source = Array.isArray(value) ? value : DEFAULT_PALETTE;
  const seen = new Set();
  const output = [];

  for (const item of source) {
    const hex = normalizeHex(item?.hex);
    const key = String(item?.key || item?.label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 40);

    if (!hex || !key || seen.has(key)) continue;
    seen.add(key);

    const classified = classifyHex(hex);
    output.push({
      key,
      label: String(item?.label || key).trim().slice(0, 60),
      emoji: String(item?.emoji || '🎨').trim().slice(0, 16),
      hex,
      family: String(item?.family || classified.family),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : classified.familyOrder,
      enabled: item?.enabled !== false,
    });
  }

  return output.length ? output : DEFAULT_PALETTE.map(clone);
}

function normalizeSection(value = {}) {
  const base = defaultSection();
  const source = value && typeof value === 'object' ? value : {};
  const style = source.style && typeof source.style === 'object' ? source.style : {};
  const managed = source.managedRoles && typeof source.managedRoles === 'object' ? source.managedRoles : {};
  const managedRoles = {};

  for (const [hexKey, record] of Object.entries(managed)) {
    const hex = normalizeHex(record?.hex || hexKey);
    const roleId = cleanId(record?.roleId);
    if (!hex || !roleId) continue;

    const classified = classifyHex(hex);
    managedRoles[hex] = {
      roleId,
      hex,
      label: String(record?.label || hex).slice(0, 60),
      family: String(record?.family || classified.family),
      hue: Number.isFinite(Number(record?.hue)) ? Number(record.hue) : classified.hue,
      createdAt: record?.createdAt || now(),
      unusedSince: record?.unusedSince || null,
    };
  }

  return {
    ...base,
    ...clone(source),
    palette: normalizePalette(source.palette),
    customHexEnabled: source.customHexEnabled !== false,
    oneColourOnly: source.oneColourOnly !== false,
    allowRemoveColour: source.allowRemoveColour !== false,
    style: {
      ...base.style,
      ...clone(style),
      format: String(style.format || base.style.format).slice(0, 80),
      icon: String(style.icon ?? base.style.icon).slice(0, 16),
      separator: String(style.separator || base.style.separator).slice(0, 8),
      anchorRoleId: cleanId(style.anchorRoleId),
      placement: style.placement === 'above' ? 'above' : 'below',
      keepGrouped: style.keepGrouped !== false,
      detectedFormat: style.detectedFormat ? String(style.detectedFormat).slice(0, 80) : null,
      detectedIcon: style.detectedIcon == null ? null : String(style.detectedIcon).slice(0, 16),
      detectedSeparator: style.detectedSeparator == null ? null : String(style.detectedSeparator).slice(0, 8),
      detectedConfidence: Math.min(1, Math.max(0, Number(style.detectedConfidence || 0))),
    },
    deployment: {
      channelId: cleanId(source.deployment?.channelId),
      messageId: cleanId(source.deployment?.messageId),
    },
    managedRoles,
    memberSelections: source.memberSelections && typeof source.memberSelections === 'object'
      ? clone(source.memberSelections)
      : {},
    cleanup: {
      deleteUnusedRoles: source.cleanup?.deleteUnusedRoles !== false,
      unusedGraceHours: Math.min(720, Math.max(1, Number(source.cleanup?.unusedGraceHours || 168))),
    },
    analytics: {
      ...defaultAnalytics(),
      ...(source.analytics || {}),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getSection(guildId) {
  return normalizeSection(getModuleSection(guildId, MODULE, defaultSection()));
}

function saveSection(guildId, section, meta = {}) {
  return normalizeSection(saveModuleSection(guildId, MODULE, normalizeSection(section), meta));
}

function updateSection(guildId, updater, meta = {}) {
  return normalizeSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeSection(current);
      const next = typeof updater === 'function'
        ? updater(clone(normalized))
        : { ...normalized, ...(updater || {}) };
      return { ...normalizeSection(next), updatedAt: now() };
    },
    defaultSection(),
    meta
  ));
}

function enabledPalette(guildId) {
  return getSection(guildId).palette
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order);
}

function extractPrefix(name, separator) {
  if (!name || !separator || !name.includes(separator)) return '';
  return String(name.split(separator)[0] || '').trim().slice(0, 16);
}

function suggestRoleStyle(guild) {
  const names = [...(guild?.roles?.cache?.values?.() || [])]
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => role.name)
    .filter(Boolean)
    .slice(0, 100);

  const candidates = [' | ', ' • ', '・', ' ┃ ', ' - ', ' » '];
  let best = { separator: ' | ', count: 0 };

  for (const separator of candidates) {
    const count = names.filter((name) => name.includes(separator)).length;
    if (count > best.count) best = { separator, count };
  }

  const separator = best.count >= 2 ? best.separator.trim() : '|';
  const rawSeparator = best.count >= 2 ? best.separator : ` ${separator} `;
  const prefixes = new Map();

  for (const name of names) {
    if (!name.includes(rawSeparator)) continue;
    const prefix = extractPrefix(name, rawSeparator);
    if (!prefix || prefix.length > 16) continue;
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
  }

  const dominantPrefix = [...prefixes.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const emojiPattern = /^\p{Extended_Pictographic}/u;
  const icon = dominantPrefix && emojiPattern.test(dominantPrefix[0])
    ? dominantPrefix[0]
    : '';
  const format = icon ? `{icon} ${separator} {colour}` : `{colour}`;
  const confidence = Math.min(1, best.count / Math.max(1, names.length));

  return {
    format,
    icon,
    separator,
    confidence,
    examples: names.filter((name) => name.includes(rawSeparator)).slice(0, 5),
  };
}

function roleNameFor(section, label) {
  const style = section.style || defaultSection().style;
  return String(style.format || '{colour}')
    .replaceAll('{icon}', style.icon || '')
    .replaceAll('{separator}', style.separator || '|')
    .replaceAll('{colour}', String(label || 'Colour'))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 100);
}

function canManageRole(guild, role) {
  const me = guild?.members?.me;
  return Boolean(
    me
    && me.permissions.has(PermissionFlagsBits.ManageRoles)
    && role
    && !role.managed
    && role.position < me.roles.highest.position
  );
}

function sortManagedRecords(section) {
  return Object.values(section.managedRoles).sort((a, b) => {
    const ac = classifyHex(a.hex);
    const bc = classifyHex(b.hex);

    if (ac.familyOrder !== bc.familyOrder) return ac.familyOrder - bc.familyOrder;
    if (ac.hue !== bc.hue) return ac.hue - bc.hue;
    if (ac.lightness !== bc.lightness) return ac.lightness - bc.lightness;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

async function reorderManagedRoles(guild) {
  const section = getSection(guild.id);

  if (!section.style.keepGrouped || !section.style.anchorRoleId) {
    return { moved: 0, skipped: true };
  }

  const anchor = guild.roles.cache.get(section.style.anchorRoleId)
    || await guild.roles.fetch(section.style.anchorRoleId).catch(() => null);

  if (!anchor) return { moved: 0, skipped: true, reason: 'anchor_missing' };

  const records = sortManagedRecords(section);
  const roles = records
    .map((record) => guild.roles.cache.get(record.roleId))
    .filter((role) => canManageRole(guild, role));

  if (!roles.length) return { moved: 0, skipped: true };

  const me = guild.members.me;
  const maximumAllowedPosition = Math.max(1, me.roles.highest.position - 1);
  let moved = 0;

  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    const desiredRaw = section.style.placement === 'above'
      ? anchor.position + roles.length - index
      : anchor.position - 1 - index;
    const desired = Math.min(maximumAllowedPosition, Math.max(1, desiredRaw));

    if (role.position === desired) continue;
    await role.setPosition(desired, { reason: 'Goliath Colour Roles managed hierarchy' }).catch(() => null);
    moved += 1;
  }

  return { moved, skipped: false };
}

function paletteEntryForHex(section, hex) {
  const normalized = normalizeHex(hex);
  return section.palette.find((entry) => entry.hex === normalized) || null;
}

async function ensureManagedRole(guild, hex, label = null) {
  let section = getSection(guild.id);
  const normalized = normalizeHex(hex);

  if (!normalized) throw new Error('A valid six-digit HEX colour is required.');

  const existingRecord = section.managedRoles[normalized];
  if (existingRecord) {
    const existing = guild.roles.cache.get(existingRecord.roleId)
      || await guild.roles.fetch(existingRecord.roleId).catch(() => null);
    if (existing) return existing;
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Goliath requires Manage Roles to create Colour Roles.');
  }

  const paletteEntry = paletteEntryForHex(section, normalized);
  const classified = classifyHex(normalized);
  const resolvedLabel = String(label || paletteEntry?.label || normalized).slice(0, 60);

  const role = await guild.roles.create({
    name: roleNameFor(section, resolvedLabel),
    color: hexToInt(normalized),
    hoist: false,
    mentionable: false,
    permissions: [],
    reason: `Goliath Colour Roles: ${resolvedLabel}`,
  });

  section = updateSection(guild.id, (current) => ({
    ...current,
    managedRoles: {
      ...current.managedRoles,
      [normalized]: {
        roleId: role.id,
        hex: normalized,
        label: resolvedLabel,
        family: classified.family,
        hue: classified.hue,
        createdAt: now(),
        unusedSince: null,
      },
    },
    analytics: {
      ...current.analytics,
      rolesCreated: Number(current.analytics.rolesCreated || 0) + 1,
    },
  }), { action: 'colour_role_created' });

  if (section.style.anchorRoleId) await reorderManagedRoles(guild);
  return role;
}

function memberManagedRoleIds(member, section) {
  const managedIds = new Set(
    Object.values(section.managedRoles).map((record) => record.roleId)
  );

  return [...member.roles.cache.keys()].filter((roleId) => managedIds.has(roleId));
}

async function chooseColour(member, hex, options = {}) {
  if (!member?.guild) throw new Error('Guild member is required.');

  const guild = member.guild;
  if (!options.force && !guildManager.isModuleEnabled(guild.id, MODULE)) {
    throw new Error('Colour Roles is disabled.');
  }

  let section = getSection(guild.id);
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error('Invalid HEX colour. Use #RRGGBB.');

  const paletteEntry = paletteEntryForHex(section, normalized);
  if (!paletteEntry && !section.customHexEnabled) {
    throw new Error('Custom HEX colours are disabled for this server.');
  }
  if (paletteEntry && !paletteEntry.enabled) {
    throw new Error('That colour is disabled.');
  }

  const role = await ensureManagedRole(
    guild,
    normalized,
    options.label || paletteEntry?.label || normalized
  );

  if (!canManageRole(guild, role)) {
    throw new Error('Goliath cannot assign the selected colour role because of role hierarchy.');
  }

  section = getSection(guild.id);
  const previous = memberManagedRoleIds(member, section).filter((id) => id !== role.id);
  let removed = 0;

  for (const roleId of previous) {
    await member.roles.remove(roleId, 'Goliath Colour Roles switch');
    removed += 1;
  }

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Goliath Colour Roles selection');
  }

  section = updateSection(guild.id, (current) => ({
    ...current,
    memberSelections: {
      ...current.memberSelections,
      [member.id]: {
        hex: normalized,
        roleId: role.id,
        selectedAt: now(),
      },
    },
    managedRoles: {
      ...current.managedRoles,
      [normalized]: {
        ...current.managedRoles[normalized],
        unusedSince: null,
      },
    },
    analytics: {
      ...current.analytics,
      selections: Number(current.analytics.selections || 0) + 1,
      switches: Number(current.analytics.switches || 0) + (removed > 0 ? 1 : 0),
      lastSelectionAt: now(),
    },
  }), { actorId: member.id, action: 'colour_role_selected' });

  return {
    roleId: role.id,
    hex: normalized,
    removed,
    label: section.managedRoles[normalized]?.label || paletteEntry?.label || normalized,
  };
}

async function removeColour(member) {
  if (!member?.guild) throw new Error('Guild member is required.');

  const section = getSection(member.guild.id);
  const roleIds = memberManagedRoleIds(member, section);
  let removed = 0;

  for (const roleId of roleIds) {
    await member.roles.remove(roleId, 'Goliath Colour Roles removal');
    removed += 1;
  }

  updateSection(member.guild.id, (current) => {
    const memberSelections = { ...current.memberSelections };
    delete memberSelections[member.id];

    return {
      ...current,
      memberSelections,
      analytics: {
        ...current.analytics,
        removals: Number(current.analytics.removals || 0) + removed,
      },
    };
  }, { actorId: member.id, action: 'colour_role_removed' });

  return { removed };
}

async function getUsage(guild) {
  const section = getSection(guild.id);
  await guild.members.fetch().catch(() => null);
  const rows = [];

  for (const record of sortManagedRecords(section)) {
    const role = guild.roles.cache.get(record.roleId)
      || await guild.roles.fetch(record.roleId).catch(() => null);
    if (!role) continue;

    const members = [...role.members.values()].filter((member) => !member.user?.bot);
    rows.push({
      ...record,
      roleName: role.name,
      count: members.length,
      members: members.map((member) => ({
        id: member.id,
        name: member.displayName || member.user.username,
      })),
    });
  }

  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const totalUsing = new Set(
    rows.flatMap((row) => row.members.map((member) => member.id))
  ).size;

  const totalMembers = [...guild.members.cache.values()]
    .filter((member) => !member.user?.bot)
    .length;

  return { rows, totalUsing, totalMembers };
}

async function markAndCleanupUnused(guild) {
  let section = getSection(guild.id);
  if (!section.cleanup.deleteUnusedRoles) return { deleted: 0 };

  const graceMs = section.cleanup.unusedGraceHours * 3600000;
  let deleted = 0;
  const nextManaged = { ...section.managedRoles };

  for (const [hex, record] of Object.entries(section.managedRoles)) {
    const role = guild.roles.cache.get(record.roleId)
      || await guild.roles.fetch(record.roleId).catch(() => null);

    if (!role) {
      delete nextManaged[hex];
      continue;
    }

    if (role.members.size > 0) {
      nextManaged[hex] = { ...record, unusedSince: null };
      continue;
    }

    const unusedSince = record.unusedSince
      ? new Date(record.unusedSince).getTime()
      : Date.now();

    nextManaged[hex] = {
      ...record,
      unusedSince: record.unusedSince || now(),
    };

    if (Date.now() - unusedSince >= graceMs && canManageRole(guild, role)) {
      await role.delete('Goliath Colour Roles unused-role cleanup').catch(() => null);
      delete nextManaged[hex];
      deleted += 1;
    }
  }

  section = updateSection(guild.id, (current) => ({
    ...current,
    managedRoles: nextManaged,
    analytics: {
      ...current.analytics,
      rolesDeleted: Number(current.analytics.rolesDeleted || 0) + deleted,
    },
  }), { action: 'colour_roles_cleanup' });

  return {
    deleted,
    managed: Object.keys(section.managedRoles).length,
  };
}

module.exports = {
  MODULE,
  DEFAULT_PALETTE,
  FAMILY_ORDER,
  defaultSection,
  normalizeSection,
  getSection,
  saveSection,
  updateSection,
  enabledPalette,
  cleanId,
  normalizeHex,
  hexToInt,
  rgbFromHex,
  rgbToHsl,
  classifyHex,
  suggestRoleStyle,
  roleNameFor,
  canManageRole,
  sortManagedRecords,
  reorderManagedRoles,
  ensureManagedRole,
  chooseColour,
  removeColour,
  getUsage,
  markAndCleanupUnused,
};
