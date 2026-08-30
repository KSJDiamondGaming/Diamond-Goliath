'use strict';

const fetch = require('node-fetch');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const emojiProcessor = require('../../../core/mediaTools/emojiMaker/emojiProcessor');
const security = require('../../../core/security/protection/core');
const emojiApi = require('./emojisApi');
const emojis = require('./emojis');
const emojiStore = require('./emojisStore');

const router = require('express').Router();
const PANEL_COLOR = 0x5865F2;
const ok = (res, payload = {}) => res.json({ success: true, ...payload });
const fail = (res, error, status = 400) => res.status(error?.statusCode || status).json({ success: false, error: error?.message || 'Emoji request failed.' });
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{16,20}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}
function actor(req) { return String(req.session?.user?.id || req.body?.actorId || '').trim() || null; }
function client(req) { return req.client || req.app?.get?.('goliath.client') || null; }
function memberName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
async function discordOverview(interaction) {
  if (!interaction?.guild?.id || !interaction?.client) throw new Error('Emoji Studio requires a server interaction.');
  return emojis.overview(interaction.client, interaction.guild.id);
}
async function payload(req, id) { return { guildId: id, ...(await emojis.overview(client(req), id)), source: 'Discord application emojis' }; }

// Dashboard/API surface for catalogues, aliases, packs, analytics, health and portability.
router.get('/:guildId/overview', async (req, res) => { try { return ok(res, await payload(req, guildId(req))); } catch (error) { return fail(res, error); } });
router.patch('/:guildId/enabled', async (req, res) => { try { const id = guildId(req); guildManager.setModuleEnabled(id, 'emojis', req.body?.enabled === true, { actorId: actor(req), action: 'emoji_panel_toggle' }); return ok(res, await payload(req, id)); } catch (error) { return fail(res, error); } });
router.get('/:guildId/search', async (req, res) => { try { return ok(res, { results: await emojiApi.search(req.query?.q || '', Number(req.query?.limit) || 25) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/catalog', async (req, res) => { try { const id = guildId(req); return ok(res, { results: await emojis.catalog(client(req), id, req.query?.q || '', { category: req.query?.category, tag: req.query?.tag }) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/picker', async (req, res) => { try { const id = guildId(req); return ok(res, await emojis.picker(client(req), id, req.query?.q || '', req.query?.context || 'dashboard')); } catch (error) { return fail(res, error); } });
router.get('/:guildId/suggest', async (req, res) => { try { const id = guildId(req); return ok(res, { suggestions: await emojis.suggest(client(req), id, req.query?.q || '', req.query?.context || 'dashboard', Number(req.query?.limit) || 25) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/analytics', async (req, res) => { try { return ok(res, { analytics: await emojis.analytics(client(req)) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/health', async (req, res) => { try { const id = guildId(req); return ok(res, { health: await emojis.health(client(req), id) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/cleanup', async (req, res) => { try { const id = guildId(req); const days = emojiStore.getSection(id).cleanup.unusedDays; return ok(res, { candidates: await emojis.cleanupCandidates(client(req), days) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/duplicates', async (req, res) => { try { return ok(res, { duplicates: await emojis.duplicates(client(req)) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/dependencies/:emojiId', async (req, res) => { try { guildId(req); return ok(res, { dependency: await emojis.dependencies(client(req), req.params.emojiId) }); } catch (error) { return fail(res, error); } });
router.get('/:guildId/export', async (req, res) => { try { const id = guildId(req); return ok(res, { config: emojis.exportGuildConfig(id) }); } catch (error) { return fail(res, error); } });
router.post('/:guildId/import-config', async (req, res) => { try { const id = guildId(req); const section = emojis.importGuildConfig(id, req.body?.config || req.body, { actorId: actor(req), action: 'emoji_config_import' }); return ok(res, { section, ...(await payload(req, id)) }); } catch (error) { return fail(res, error); } });
router.post('/:guildId/import', async (req, res) => { try { const id = guildId(req); if (!emojiStore.getSection(id).enabled) throw new Error('Emoji Studio is disabled for this server.'); const result = await emojis.importFromEmojiGG(client(req), req.body?.emojiGgId, req.body?.name || null); if (req.body?.selectForGuild !== false) emojiStore.setFavourite(id, result.emoji.id, true, { actorId: actor(req), action: 'emoji_panel_import' }); return ok(res, { result, ...(await payload(req, id)) }); } catch (error) { return fail(res, error); } });
router.post('/:guildId/import-url', async (req, res) => { try { const id = guildId(req); if (!emojiStore.getSection(id).enabled) throw new Error('Emoji Studio is disabled for this server.'); const result = await emojis.importFromUrl(client(req), req.body?.imageUrl, req.body?.name || null); if (req.body?.selectForGuild !== false) emojiStore.setFavourite(id, result.emoji.id, true, { actorId: actor(req), action: 'emoji_url_import' }); return ok(res, { result, ...(await payload(req, id)) }); } catch (error) { return fail(res, error); } });
router.patch('/:guildId/favourites/:emojiId', async (req, res) => { try { const id = guildId(req); emojiStore.setFavourite(id, req.params.emojiId, req.body?.selected !== false, { actorId: actor(req), action: 'emoji_favourite' }); return ok(res, await payload(req, id)); } catch (error) { return fail(res, error); } });
router.put('/:guildId/aliases/:alias', async (req, res) => { try { const id = guildId(req); const section = emojiStore.setAlias(id, req.params.alias, req.body?.emojiId, { actorId: actor(req), action: 'emoji_alias_set' }); return ok(res, { section }); } catch (error) { return fail(res, error); } });
router.delete('/:guildId/aliases/:alias', async (req, res) => { try { const id = guildId(req); return ok(res, { section: emojiStore.removeAlias(id, req.params.alias, { actorId: actor(req), action: 'emoji_alias_remove' }) }); } catch (error) { return fail(res, error); } });
router.put('/:guildId/tags/:emojiId', async (req, res) => { try { const id = guildId(req); return ok(res, { section: emojiStore.setTags(id, req.params.emojiId, req.body?.tags || [], { actorId: actor(req), action: 'emoji_tags_set' }) }); } catch (error) { return fail(res, error); } });
router.put('/:guildId/packs/:packKey', async (req, res) => { try { const id = guildId(req); return ok(res, { section: emojiStore.savePack(id, req.params.packKey, req.body || {}, { actorId: actor(req), action: 'emoji_pack_save' }) }); } catch (error) { return fail(res, error); } });
router.delete('/:guildId/packs/:packKey', async (req, res) => { try { const id = guildId(req); return ok(res, { section: emojiStore.deletePack(id, req.params.packKey, { actorId: actor(req), action: 'emoji_pack_delete' }) }); } catch (error) { return fail(res, error); } });
router.put('/:guildId/temporary/:emojiId', async (req, res) => { try { const id = guildId(req); return ok(res, { section: emojiStore.setTemporary(id, req.params.emojiId, req.body?.expiresAt, req.body?.removeWhenUnused !== false, { actorId: actor(req), action: 'emoji_temporary_set' }) }); } catch (error) { return fail(res, error); } });
router.patch('/:guildId/bank/:emojiId', async (req, res) => { try { const id = guildId(req); const emoji = await emojis.renameInBank(client(req), req.params.emojiId, req.body?.name); return ok(res, { emoji, ...(await payload(req, id)) }); } catch (error) { return fail(res, error); } });
router.delete('/:guildId/bank/:emojiId', async (req, res) => { try { const id = guildId(req); await emojis.removeFromBank(client(req), req.params.emojiId); return ok(res, await payload(req, id)); } catch (error) { return fail(res, error); } });

function mainEmbed(overview, interaction, notice = '') {
  return new EmbedBuilder().setColor(overview.enabled ? 0x57F287 : PANEL_COLOR).setTitle('😀 Emoji Studio').setDescription([
    'Add extra emojis to this server without using Discord\'s emoji slots. Goliath\'s built-in emojis are always available.',
    '',
    `**Studio:** ${overview.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**Extra emojis:** ${overview.guildCapacity.used} of ${overview.guildCapacity.max} selected`,
    `**Shared Library:** ${overview.studioCapacity.used} emoji${overview.studioCapacity.used === 1 ? '' : 's'} available`,
    `**Built-in emojis:** ${overview.coreCapacity.used} ready`,
    `**Status:** ${overview.health?.healthy ? 'Everything working ✅' : 'Needs attention ⚠️'}`,
    notice ? `\n${notice}` : '',
  ].filter(Boolean).join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` }).setTimestamp();
}

async function buildDiscordPanel(interaction, notice = '') {
  const overview = await discordOverview(interaction);
  return { embeds: [mainEmbed(overview, interaction, notice)], components: [
    row(
      button('admin:module:emojis:guild', '⭐ Manage Extra Emojis', ButtonStyle.Primary).setDisabled(!overview.enabled),
      button('admin:module:emojis:search-open', '🔎 Find New Emojis', ButtonStyle.Primary).setDisabled(!overview.enabled),
      button('admin:module:emojis:import-url-open', '🔗 Import from URL', ButtonStyle.Primary).setDisabled(!overview.enabled),
    ),
    row(
      button('admin:module:emojis:bank', '🌐 Shared Emoji Library', ButtonStyle.Secondary),
      button('admin:module:emojis:core', '💠 Built-in Emojis', ButtonStyle.Secondary),
    ),
    row(
      button('admin:studio:utilityStudio', '⬅️ Back', ButtonStyle.Secondary),
      button('admin:module:emojis:settings', '⚙️ Settings', ButtonStyle.Secondary),
    ),
  ] };
}

function settingsPanel(overview, interaction, notice = '') {
  return { embeds: [new EmbedBuilder().setColor(overview.enabled ? 0x57F287 : PANEL_COLOR).setTitle('⚙️ Emoji Studio Settings').setDescription([
    'Manage Emoji Studio itself, check its health, and access maintenance tools.',
    '',
    `**Emoji Studio:** ${overview.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**Status:** ${overview.health?.healthy ? 'Everything working ✅' : 'Needs attention ⚠️'}`,
    notice ? `\n${notice}` : '',
  ].filter(Boolean).join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` }).setTimestamp()], components: [
    row(button('admin:module:emojis:tools', '🧰 Tools & Health', ButtonStyle.Secondary)),
    row(button('admin:module:emojis:toggle', overview.enabled ? '⏸️ Turn Off Emoji Studio' : '▶️ Turn On Emoji Studio', overview.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)),
    row(button('admin:module:emojis:panel', '⬅️ Back', ButtonStyle.Secondary)),
  ] };
}

function corePanel(overview, interaction) {
  const status = overview.coreStatus || [];
  const split = Math.ceil(status.length / 2);
  const line = (entry) => `${entry.installed ? '✅' : '⬜'} **${String(entry.slot).padStart(2, '0')}** \`:${entry.alias}:\``;
  const components = [row(button('admin:module:emojis:core-preview', '👁️ Preview Emojis', ButtonStyle.Primary))];
  if (security.isBotOwner(interaction.user?.id)) components.push(row(button('admin:module:emojis:core-replace', '🛠️ Replace Built-in Emoji', ButtonStyle.Secondary)));
  components.push(row(button('admin:module:emojis:panel', '⬅️ Back to Emoji Studio', ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('💠 Built-in Goliath Emojis').setDescription([
    'These emojis are included with Goliath and are automatically available in every server. They cannot be edited or removed by server admins.', '',
    `**Ready:** ${overview.coreCapacity.used}/${overview.coreCapacity.max}`,
    `**Status:** ${overview.coreIntegrity?.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
    '**Uses your server limit:** No',
  ].join('\n')).addFields({ name: 'Built-in Emojis 01–09', value: status.slice(0, split).map(line).join('\n') || 'None', inline: true }, { name: 'Built-in Emojis 10–18', value: status.slice(split).map(line).join('\n') || 'None', inline: true }).setFooter({ text: `Requested by ${memberName(interaction)}` })], components };
}

function corePreviewPanel(overview, interaction) {
  const installed = (overview.coreStatus || []).filter((entry) => entry.installed && entry.emoji);
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('👁️ Built-in Emoji Preview').setDescription([`**Available:** ${installed.length}/${overview.coreCapacity.max}`, '', ...installed.map((entry) => `${entry.mention || entry.emoji.mention}  \`:${entry.alias}:\``)].join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` })], components: [row(button('admin:module:emojis:core-preview', '🔄 Refresh', ButtonStyle.Primary)), row(button('admin:module:emojis:core', '⬅️ Back to Built-in Emojis', ButtonStyle.Secondary))] };
}

function coreReplaceSelectPanel(overview, interaction) {
  const options = (overview.coreStatus || []).map((entry) => ({
    label: `:${entry.alias}:`,
    value: entry.alias,
    description: entry.installed ? `Replace built-in slot ${String(entry.slot).padStart(2, '0')}` : `Slot ${String(entry.slot).padStart(2, '0')} is currently missing`,
    emoji: entry.emoji?.component || undefined,
  }));
  return {
    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🛠️ Replace Built-in Emoji').setDescription([
      'Choose the built-in Goliath emoji you want to replace.',
      '',
      'Only the selected Core alias will be changed. The current emoji is kept as a temporary recovery backup until the replacement succeeds.',
    ].join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` })],
    components: [
      row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:core-replace-select').setPlaceholder('Choose a built-in emoji').addOptions(options)),
      row(button('admin:module:emojis:core', '⬅️ Back to Built-in Emojis', ButtonStyle.Secondary)),
    ],
  };
}

function coreReplaceUploadModal(alias) {
  const upload = new FileUploadBuilder().setCustomId('file').setMinValues(1).setMaxValues(1).setRequired(true);
  return new ModalBuilder().setCustomId(`admin:module:emojis:core-replace-submit:${alias}`).setTitle(`Replace :${alias}:`).addComponents(
    new LabelBuilder().setLabel(`Replacement image for :${alias}:`).setDescription('Upload exactly one image. Goliath will process it for Discord automatically.').setFileUploadComponent(upload),
  );
}

function bankPanel(overview, interaction) {
  const selected = new Set(overview.effectiveFavourites || []);
  const options = (overview.catalog || []).filter((emoji) => !emoji.core).slice(0, 25).map((emoji) => ({ label: `:${emoji.name}:`.slice(0, 100), value: String(emoji.id), description: `${selected.has(String(emoji.id)) ? 'Selected for this server' : 'Available to add'} • ${emoji.category} • used ${emoji.usage?.count || 0}x`.slice(0, 100), emoji: emoji.component || undefined }));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🌐 Shared Emoji Library').setDescription([`**Available in library:** ${overview.studioCapacity.used}`, `**Selected for this server:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`, '', options.length ? 'Choose an emoji below to add it to, or remove it from, this server.' : 'The shared emoji library is currently empty.'].join('\n'))], components: [...(options.length ? [row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:bank-toggle').setPlaceholder('Choose an emoji').addOptions(options))] : []), row(button('admin:module:emojis:bulk-open', '📤 Upload Emoji Files', ButtonStyle.Primary)), row(button('admin:module:emojis:panel', '⬅️ Back to Emoji Studio', ButtonStyle.Secondary))] };
}

function guildPanel(overview) {
  const selectedIds = new Set(overview.effectiveFavourites || []);
  const selected = (overview.catalog || []).filter((emoji) => !emoji.core && selectedIds.has(String(emoji.id))).slice(0, 25);
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('⭐ Your Server Emojis').setDescription([`**Selected:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`, `**Built-in emojis:** ${overview.coreCapacity.used} always available`, '', selected.length ? selected.map((emoji) => `${emoji.mention} \`:${emoji.name}:\` • ${emoji.category}`).join('\n') : 'No extra emojis are selected for this server yet.', '', 'Use the shared library to add or remove emojis, or use the picker to preview what is currently available.'].join('\n'))], components: [row(button('admin:module:emojis:bank', '🌐 Add / Remove Emojis', ButtonStyle.Primary), button('admin:module:emojis:picker', '🧩 Preview Available Emojis', ButtonStyle.Secondary)), row(button('admin:module:emojis:panel', '⬅️ Back to Emoji Studio', ButtonStyle.Secondary))] };
}

function pickerPanel(overview, interaction, query = '') {
  const clean = String(query || '').toLowerCase();
  const available = (overview.catalog || []).filter((emoji) => emoji.core || (overview.enabled && emoji.selected)).filter((emoji) => !clean || [emoji.name, emoji.alias, ...(emoji.aliases || []), ...(emoji.tags || [])].some((value) => String(value || '').toLowerCase().includes(clean))).slice(0, 25);
  const options = available.map((emoji) => ({ label: `:${emoji.core ? emoji.alias : emoji.name}:`.slice(0, 100), value: String(emoji.id), description: `${emoji.core ? 'Built-in' : emoji.category} • used ${emoji.usage?.count || 0}x`.slice(0, 100), emoji: emoji.component || undefined }));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧩 Available Emoji Preview').setDescription(['Preview emojis Goliath can currently use in this server.', '', query ? `**Filter:** ${query}` : '**Filter:** none', `**Shown:** ${available.length}${(overview.catalog || []).length > 25 ? ' (up to 25 at a time)' : ''}`].join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` })], components: [...(options.length ? [row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:picker-select').setPlaceholder('Choose an emoji to preview').addOptions(options))] : []), row(button('admin:module:emojis:picker-search-open', '🔎 Filter Emojis', ButtonStyle.Primary)), row(button('admin:module:emojis:panel', '⬅️ Back to Emoji Studio', ButtonStyle.Secondary))] };
}

function toolsPanel(overview) {
  const usage = overview.usage || [];
  const top = usage.filter((entry) => entry.count > 0).slice(0, 5);
  const health = overview.health || {};
  return { embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFEE75C).setTitle('🧰 Emoji Tools & Health').setDescription([
    `**Overall status:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`, `**Application space:** ${overview.forecast?.used || 0}/${overview.forecast?.max || 2000} used`, `**Items needing attention:** ${(health.brokenFavourites?.length || 0) + (health.brokenAliases?.length || 0) + (health.brokenPackEntries?.length || 0) + (health.expiredTemporary?.length || 0)}`, '', '**Most used emojis**', ...(top.length ? top.map((entry) => `• \`:${entry.emoji.alias || entry.emoji.name}:\` — ${entry.count} uses`) : ['No usage has been tracked yet.']),
  ].join('\n'))], components: [row(button('admin:module:emojis:analytics', '📊 Usage', ButtonStyle.Primary), button('admin:module:emojis:health', '🩺 Health Check', ButtonStyle.Secondary), button('admin:module:emojis:cleanup', '🧹 Find Unused', ButtonStyle.Secondary)), row(button('admin:module:emojis:duplicates', '🧬 Find Duplicates', ButtonStyle.Secondary), button('admin:module:emojis:export', '📦 Export Settings', ButtonStyle.Secondary)), row(button('admin:module:emojis:settings', '⬅️ Back', ButtonStyle.Secondary))] };
}

function searchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:search-submit').setTitle('Find Emojis on Emoji.gg').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('What are you looking for?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function urlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:import-url-submit').setTitle('Import Emoji from URL').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('Emoji name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }
function pickerSearchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:picker-search-submit').setTitle('Filter Emojis').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('Name, alias, tag or category').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80))); }
function bulkUploadModal() { const upload = new FileUploadBuilder().setCustomId('files').setMinValues(1).setMaxValues(10).setRequired(true); return new ModalBuilder().setCustomId('admin:module:emojis:bulk-submit').setTitle('Upload Emoji Files').addComponents(new LabelBuilder().setLabel('Emoji files').setDescription('Upload up to 10 images. Names are created from the filenames.').setFileUploadComponent(upload)); }

function searchResultsPanel(results, query) {
  const clean = Array.isArray(results) ? results.slice(0, 25) : [];
  const components = [];
  if (clean.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:import').setPlaceholder('Choose an emoji to add').addOptions(clean.map((entry) => ({ label: String(entry.title || entry.slug || `Emoji ${entry.id}`).slice(0, 100), value: String(entry.id), description: String(entry.category || 'Emoji.gg').slice(0, 100) })))));
  components.push(row(button('admin:module:emojis:search-open', '🔎 Search Again', ButtonStyle.Primary)));
  components.push(row(button('admin:module:emojis:panel', '⬅️ Back to Emoji Studio', ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🔎 Emoji Search Results').setDescription(clean.length ? `Found **${clean.length}** result(s) for **${String(query).slice(0, 80)}**. Choose one below to add it to this server.` : 'No matching emojis were found. Try a different search.')], components };
}

async function sendPanel(interaction, data) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(data);
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...data, flags: MessageFlags.Ephemeral });
  return interaction.update(data);
}

async function handleDiscordInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (!id.startsWith('admin:module:emojis:')) return false;
  const guildId = interaction.guild?.id;

  if (id === 'admin:module:emojis:panel') { await sendPanel(interaction, await buildDiscordPanel(interaction)); return true; }
  if (id === 'admin:module:emojis:settings') { await sendPanel(interaction, settingsPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:toggle') { const current = emojiStore.getSection(guildId).enabled; guildManager.setModuleEnabled(guildId, 'emojis', !current, { actorId: interaction.user?.id, action: 'emoji_discord_toggle' }); await sendPanel(interaction, settingsPanel(await discordOverview(interaction), interaction, `Emoji Studio ${!current ? 'enabled' : 'disabled'}. Built-in emojis remain available.`)); return true; }
  if (id === 'admin:module:emojis:core') { await sendPanel(interaction, corePanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:core-preview') { await sendPanel(interaction, corePreviewPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:core-replace') {
    if (!security.isBotOwner(interaction.user?.id)) throw new Error('Only the Goliath Owner can replace built-in emojis.');
    await sendPanel(interaction, coreReplaceSelectPanel(await discordOverview(interaction), interaction));
    return true;
  }
  if (id === 'admin:module:emojis:core-replace-select' && interaction.isStringSelectMenu?.()) {
    if (!security.isBotOwner(interaction.user?.id)) throw new Error('Only the Goliath Owner can replace built-in emojis.');
    const alias = String(interaction.values?.[0] || '').toLowerCase();
    if (!emojis.isApprovedCoreAlias(alias)) throw new Error('That is not an approved Goliath Core emoji.');
    await interaction.showModal(coreReplaceUploadModal(alias));
    return true;
  }
  if (id === 'admin:module:emojis:bank') { await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:guild') { await sendPanel(interaction, guildPanel(await discordOverview(interaction))); return true; }
  if (id === 'admin:module:emojis:picker') { await sendPanel(interaction, pickerPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:tools') { await sendPanel(interaction, toolsPanel(await discordOverview(interaction))); return true; }
  if (id === 'admin:module:emojis:search-open') { await interaction.showModal(searchModal()); return true; }
  if (id === 'admin:module:emojis:import-url-open') { await interaction.showModal(urlImportModal()); return true; }
  if (id === 'admin:module:emojis:picker-search-open') { await interaction.showModal(pickerSearchModal()); return true; }
  if (id === 'admin:module:emojis:bulk-open') { await interaction.showModal(bulkUploadModal()); return true; }

  if (id.startsWith('admin:module:emojis:core-replace-submit:') && interaction.isModalSubmit?.()) {
    if (!security.isBotOwner(interaction.user?.id)) throw new Error('Only the Goliath Owner can replace built-in emojis.');
    const alias = id.split(':').pop();
    if (!emojis.isApprovedCoreAlias(alias)) throw new Error('That is not an approved Goliath Core emoji.');
    const uploads = interaction.fields.getUploadedFiles('file', true);
    const attachment = uploads?.first?.() || [...uploads.values()][0];
    if (!attachment?.url) throw new Error('Replacement image upload was not found.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const response = await fetch(attachment.url, { headers: { 'User-Agent': 'KSJHub-Goliath/1.0' }, timeout: 15000 });
    if (!response.ok) throw new Error(`Replacement image download failed (${response.status}).`);
    const source = await response.buffer();
    const prepared = await emojiProcessor.prepareEmojiBuffer(source, { size: 512, padding: 32, maxBytes: emojiApi.MAX_BYTES });
    const result = await emojis.replaceCoreEmoji(interaction.client, alias, prepared.buffer);
    await interaction.editReply({ ...corePreviewPanel(await discordOverview(interaction), interaction), content: `✅ Replaced :${result.alias}: successfully.` });
    return true;
  }

  if (id === 'admin:module:emojis:search-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, searchResultsPanel(await emojiApi.search(query, 25), query)); return true; }
  if (id === 'admin:module:emojis:picker-search-submit' && interaction.isModalSubmit?.()) { const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, pickerPanel(await discordOverview(interaction), interaction, query)); return true; }
  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const result = await emojis.importFromUrl(interaction.client, interaction.fields.getTextInputValue('imageUrl'), interaction.fields.getTextInputValue('name') || null); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_url_import' }); await interaction.editReply(await buildDiscordPanel(interaction, `${result.created ? '✅ Added' : '✅ Reused'} :${result.emoji.name}: from URL.`)); return true; }
  if (id === 'admin:module:emojis:import' && interaction.isStringSelectMenu?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); await interaction.deferUpdate(); const result = await emojis.importFromEmojiGG(interaction.client, interaction.values?.[0]); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_discord_import' }); await interaction.editReply(await buildDiscordPanel(interaction, `${result.created ? '✅ Added' : '✅ Reused'} :${result.emoji.name}: and selected it for this server.`)); return true; }
  if (id === 'admin:module:emojis:bank-toggle' && interaction.isStringSelectMenu?.()) { const emojiId = String(interaction.values?.[0] || ''); const overview = await discordOverview(interaction); if ((overview.core || []).some((emoji) => String(emoji.id) === emojiId)) throw new Error('Built-in emojis are global and cannot be changed here.'); const current = emojiStore.getSection(guildId); emojiStore.setFavourite(guildId, emojiId, !current.favourites.includes(emojiId), { actorId: interaction.user?.id, action: 'emoji_discord_select' }); await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:picker-select' && interaction.isStringSelectMenu?.()) { const overview = await discordOverview(interaction); const emoji = (overview.catalog || []).find((entry) => String(entry.id) === String(interaction.values?.[0])); if (!emoji) throw new Error('Emoji no longer exists.'); const shortcode = emoji.core ? emoji.alias : (emoji.aliases?.[0] || emoji.name); emojiStore.touchRecent(guildId, emoji.id); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧩 Emoji Preview').setDescription([emoji.mention, '', `**Type this:** \`:${shortcode}:\``, `**Category:** ${emoji.category}`, `**Tags:** ${(emoji.tags || []).join(', ') || 'none'}`, `**Used:** ${emoji.usage?.count || 0} time(s)`].join('\n'))], components: [row(button('admin:module:emojis:picker', '⬅️ Back to Emoji Preview', ButtonStyle.Secondary))] }); return true; }

  if (id === 'admin:module:emojis:bulk-submit' && interaction.isModalSubmit?.()) {
    if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.');
    const uploads = interaction.fields.getUploadedFiles('files', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lines = [];
    for (const attachment of uploads.values()) {
      try {
        const response = await fetch(attachment.url, { headers: { 'User-Agent': 'KSJHub-Goliath/1.0' }, timeout: 15000 });
        if (!response.ok) throw new Error(`download failed (${response.status})`);
        const source = await response.buffer();
        const prepared = await emojiProcessor.prepareEmojiBuffer(source, { size: 512, padding: 32, maxBytes: emojiApi.MAX_BYTES });
        const name = String(attachment.name || 'emoji').replace(/\.[a-z0-9]+$/i, '');
        const result = await emojis.createStudioEmoji(interaction.client, prepared.buffer, name);
        emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_bulk_import' });
        lines.push(`✅ ${attachment.name} → \`:${result.emoji.name}:\``);
      } catch (error) { lines.push(`❌ ${attachment.name} — ${String(error?.message || error).slice(0, 120)}`); }
    }
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📤 Emoji Upload Complete').setDescription(lines.join('\n').slice(0, 4000))], components: [row(button('admin:module:emojis:bank', '⬅️ Back to Shared Emoji Library', ButtonStyle.Secondary))] });
    return true;
  }

  if (id === 'admin:module:emojis:analytics') { const overview = await discordOverview(interaction); const rows = (overview.usage || []).filter((entry) => entry.count > 0).slice(0, 20); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📊 Emoji Usage').setDescription(rows.length ? rows.map((entry, index) => `${index + 1}. \`:${entry.emoji.alias || entry.emoji.name}:\` — **${entry.count}** use(s) • ${entry.lastUsedAt ? `<t:${Math.floor(Date.parse(entry.lastUsedAt) / 1000)}:R>` : 'never'}`).join('\n') : 'No emoji usage has been tracked yet.')], components: [row(button('admin:module:emojis:tools', '⬅️ Back to Tools & Health', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:health') { const overview = await discordOverview(interaction); const h = overview.health || {}; await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(h.healthy ? 0x57F287 : 0xFEE75C).setTitle('🩺 Emoji Health Check').setDescription([`**Status:** ${h.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`, `Missing server selections: **${h.brokenFavourites?.length || 0}**`, `Broken shortcuts: **${h.brokenAliases?.length || 0}**`, `Broken pack entries: **${h.brokenPackEntries?.length || 0}**`, `Expired temporary emojis: **${h.expiredTemporary?.length || 0}**`, `Application spaces remaining: **${h.capacity?.remaining ?? 0}**`].join('\n'))], components: [row(button('admin:module:emojis:tools', '⬅️ Back to Tools & Health', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:cleanup') { const section = emojiStore.getSection(guildId); const candidates = await emojis.cleanupCandidates(interaction.client, section.cleanup.unusedDays); const candidateLines = candidates.slice(0, 20).map((entry) => `• \`:${entry.emoji.name}:\` — ${entry.count} uses • ${entry.dependencies} dependencies${entry.unusedDays == null ? ' • never used' : ` • ${entry.unusedDays}d idle`}`); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧹 Find Unused Emojis').setDescription([`Looking for emojis unused for **${section.cleanup.unusedDays} days** or more.`, 'Goliath will not automatically delete an emoji that is still being used elsewhere.', '', ...(candidateLines.length ? candidateLines : ['No unused emoji candidates found.'])].join('\n').slice(0, 4000))], components: [row(button('admin:module:emojis:tools', '⬅️ Back to Tools & Health', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:duplicates') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const groups = await emojis.duplicates(interaction.client); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧬 Duplicate Emoji Check').setDescription(groups.length ? groups.slice(0, 15).map((group, index) => `**Group ${index + 1}:** ${group.entries.map((entry) => `\`:${entry.name}:\``).join(', ')}`).join('\n') : 'No exact duplicate images were found.')], components: [row(button('admin:module:emojis:tools', '⬅️ Back to Tools & Health', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:export') { const exported = emojis.exportGuildConfig(guildId); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📦 Export Emoji Settings').setDescription(`\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 3500)}\n\`\`\``)], components: [row(button('admin:module:emojis:tools', '⬅️ Back to Tools & Health', ButtonStyle.Secondary))] }); return true; }

  return false;
}

router.buildDiscordPanel = buildDiscordPanel;
router.handleDiscordInteraction = handleDiscordInteraction;
module.exports = router;