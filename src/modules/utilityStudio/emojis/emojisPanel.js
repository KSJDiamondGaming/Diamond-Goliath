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
    'Application-wide emoji catalogue with locked Goliath Core plus optional guild Studio selections.', '',
    `**Emoji Studio:** ${overview.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**💠 Goliath Core:** ${overview.coreCapacity.used}/${overview.coreCapacity.max} — global + immutable`,
    `**🌐 Studio Bank:** ${overview.studioCapacity.used}/${overview.studioCapacity.max}`,
    `**🏠 Effective for this server:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`,
    `**📦 Application capacity:** ${overview.capacity.used}/${overview.capacity.max}`,
    `**🩺 Health:** ${overview.health?.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
    notice ? `\n${notice}` : '',
  ].filter(Boolean).join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` }).setTimestamp();
}

async function buildDiscordPanel(interaction, notice = '') {
  const overview = await discordOverview(interaction);
  return { embeds: [mainEmbed(overview, interaction, notice)], components: [
    row(button('admin:module:emojis:core', '💠 Goliath Core', ButtonStyle.Secondary), button('admin:module:emojis:picker', '🧩 Emoji Picker', ButtonStyle.Primary), button('admin:module:emojis:guild', '⭐ Server Selection', ButtonStyle.Secondary)),
    row(button('admin:module:emojis:bank', '🌐 Studio Bank', ButtonStyle.Secondary), button('admin:module:emojis:search-open', '🔎 Emoji.gg', ButtonStyle.Primary).setDisabled(!overview.enabled), button('admin:module:emojis:import-url-open', '🔗 Import URL', ButtonStyle.Primary).setDisabled(!overview.enabled)),
    row(button('admin:module:emojis:tools', '🧰 Studio Tools', ButtonStyle.Secondary), button('admin:module:emojis:toggle', overview.enabled ? '⏸️ Disable Studio' : '▶️ Enable Studio', overview.enabled ? ButtonStyle.Secondary : ButtonStyle.Success), button('admin:studio:utilityStudio', '⬅️ Utility Studio', ButtonStyle.Secondary)),
  ] };
}

function corePanel(overview, interaction) {
  const status = overview.coreStatus || [];
  const split = Math.ceil(status.length / 2);
  const line = (entry) => `${entry.installed ? '✅' : '⬜'} **${String(entry.slot).padStart(2, '0')}** \`:${entry.alias}:\``;
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('💠 Goliath Core Emojis').setDescription([
    `**Core usage:** ${overview.coreCapacity.used}/${overview.coreCapacity.max}`, `**Missing:** ${overview.missingCore.length}`,
    `**Integrity:** ${overview.coreIntegrity?.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`, '**Management:** 🔒 Locked — repo managed only',
    '**Availability:** Every Goliath guild automatically', '**Guild slots used:** 0', '**Server favourites used:** 0',
  ].join('\n')).addFields({ name: 'Core Slots 01–09', value: status.slice(0, split).map(line).join('\n') || 'None', inline: true }, { name: 'Core Slots 10–18', value: status.slice(split).map(line).join('\n') || 'None', inline: true }).setFooter({ text: `Requested by ${memberName(interaction)}` })], components: [row(button('admin:module:emojis:core-preview', '👁️ Preview Core', ButtonStyle.Primary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))] };
}

function corePreviewPanel(overview, interaction) {
  const installed = (overview.coreStatus || []).filter((entry) => entry.installed && entry.emoji);
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('👁️ Goliath Core Emoji Preview').setDescription([`**Installed:** ${installed.length}/${overview.coreCapacity.max}`, 'Locked application emojis rendered globally.', '', ...installed.map((entry) => `${entry.mention || entry.emoji.mention}  \`:${entry.alias}:\``)].join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` })], components: [row(button('admin:module:emojis:core-preview', '🔄 Refresh', ButtonStyle.Primary), button('admin:module:emojis:core', '⬅️ Goliath Core', ButtonStyle.Secondary))] };
}

function bankPanel(overview, interaction) {
  const selected = new Set(overview.effectiveFavourites || []);
  const options = (overview.catalog || []).filter((emoji) => !emoji.core).slice(0, 25).map((emoji) => ({ label: `:${emoji.name}:`.slice(0, 100), value: String(emoji.id), description: `${selected.has(String(emoji.id)) ? 'Selected' : 'Not selected'} • ${emoji.category} • used ${emoji.usage?.count || 0}x`.slice(0, 100), emoji: emoji.component || undefined }));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🌐 Emoji Studio Bank').setDescription([`**Studio:** ${overview.studioCapacity.used}/${overview.studioCapacity.max}`, `**This server:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`, '', options.length ? 'Select an emoji to add/remove it for this server.' : 'Studio Bank is empty.'].join('\n'))], components: [...(options.length ? [row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:bank-toggle').setPlaceholder('Add/remove Studio emoji').addOptions(options))] : []), row(button('admin:module:emojis:bulk-open', '📤 Bulk Upload', ButtonStyle.Primary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))] };
}

function guildPanel(overview) {
  const selectedIds = new Set(overview.effectiveFavourites || []);
  const selected = (overview.catalog || []).filter((emoji) => !emoji.core && selectedIds.has(String(emoji.id))).slice(0, 25);
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('⭐ Server Emoji Selection').setDescription([`**Effective selection:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`, `**Core:** ${overview.coreCapacity.used} always available`, `**Aliases:** ${Object.keys(overview.aliases || {}).length}`, `**Packs:** ${Object.keys(overview.packs || {}).length}`, '', selected.length ? selected.map((emoji) => `${emoji.mention} \`:${emoji.name}:\` • ${emoji.category}`).join('\n') : 'No optional Studio emojis selected.'].join('\n'))], components: [row(button('admin:module:emojis:picker', '🧩 Picker', ButtonStyle.Primary), button('admin:module:emojis:bank', '🌐 Studio Bank', ButtonStyle.Secondary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))] };
}

function pickerPanel(overview, interaction, query = '') {
  const clean = String(query || '').toLowerCase();
  const available = (overview.catalog || []).filter((emoji) => emoji.core || (overview.enabled && emoji.selected)).filter((emoji) => !clean || [emoji.name, emoji.alias, ...(emoji.aliases || []), ...(emoji.tags || [])].some((value) => String(value || '').toLowerCase().includes(clean))).slice(0, 25);
  const options = available.map((emoji) => ({ label: `:${emoji.core ? emoji.alias : emoji.name}:`.slice(0, 100), value: String(emoji.id), description: `${emoji.core ? 'Core' : emoji.category} • used ${emoji.usage?.count || 0}x`.slice(0, 100), emoji: emoji.component || undefined }));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧩 Goliath Emoji Picker').setDescription(['Core is always available. Studio entries come from this server\'s selections, packs and aliases.', '', query ? `**Filter:** ${query}` : '**Filter:** none', `**Available:** ${available.length}${(overview.catalog || []).length > 25 ? ' shown up to 25' : ''}`].join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` })], components: [...(options.length ? [row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:picker-select').setPlaceholder('Choose an emoji').addOptions(options))] : []), row(button('admin:module:emojis:picker-search-open', '🔎 Filter', ButtonStyle.Primary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))] };
}

function toolsPanel(overview) {
  const usage = overview.usage || [];
  const top = usage.filter((entry) => entry.count > 0).slice(0, 5);
  const health = overview.health || {};
  return { embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFEE75C).setTitle('🧰 Emoji Studio Tools').setDescription([
    `**Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`, `**Capacity:** ${overview.forecast?.used || 0}/${overview.forecast?.max || 2000} (${overview.forecast?.remaining || 0} free)`, `**Broken favourites:** ${health.brokenFavourites?.length || 0}`, `**Broken aliases:** ${health.brokenAliases?.length || 0}`, `**Broken pack refs:** ${health.brokenPackEntries?.length || 0}`, `**Expired temporary:** ${health.expiredTemporary?.length || 0}`, '', '**Top usage**', ...(top.length ? top.map((entry) => `• \`:${entry.emoji.alias || entry.emoji.name}:\` — ${entry.count} uses`) : ['No tracked usage yet.']),
  ].join('\n'))], components: [row(button('admin:module:emojis:analytics', '📊 Analytics', ButtonStyle.Primary), button('admin:module:emojis:health', '🩺 Health', ButtonStyle.Secondary), button('admin:module:emojis:cleanup', '🧹 Cleanup', ButtonStyle.Secondary)), row(button('admin:module:emojis:duplicates', '🧬 Duplicates', ButtonStyle.Secondary), button('admin:module:emojis:export', '📦 Export Config', ButtonStyle.Secondary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))] };
}

function searchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:search-submit').setTitle('Search Emoji.gg').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('Search').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function urlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:import-url-submit').setTitle('Import Emoji from URL').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('Name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }
function pickerSearchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:picker-search-submit').setTitle('Filter Emoji Picker').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('Name, alias, tag or category').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80))); }
function bulkUploadModal() { const upload = new FileUploadBuilder().setCustomId('files').setMinValues(1).setMaxValues(10).setRequired(true); return new ModalBuilder().setCustomId('admin:module:emojis:bulk-submit').setTitle('Bulk Upload Studio Emojis').addComponents(new LabelBuilder().setLabel('Emoji files').setDescription('Upload up to 10 images. Names are generated from filenames.').setFileUploadComponent(upload)); }

function searchResultsPanel(results, query) {
  const clean = Array.isArray(results) ? results.slice(0, 25) : [];
  const components = [];
  if (clean.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:import').setPlaceholder('Choose an emoji to import').addOptions(clean.map((entry) => ({ label: String(entry.title || entry.slug || `Emoji ${entry.id}`).slice(0, 100), value: String(entry.id), description: String(entry.category || 'Emoji.gg').slice(0, 100) })))));
  components.push(row(button('admin:module:emojis:search-open', '🔎 Search Again', ButtonStyle.Primary), button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🔎 Emoji.gg Results').setDescription(clean.length ? `Found **${clean.length}** result(s) for **${String(query).slice(0, 80)}**.` : 'No results found.')], components };
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
  if (id === 'admin:module:emojis:toggle') { const current = emojiStore.getSection(guildId).enabled; guildManager.setModuleEnabled(guildId, 'emojis', !current, { actorId: interaction.user?.id, action: 'emoji_discord_toggle' }); await sendPanel(interaction, await buildDiscordPanel(interaction, `Emoji Studio ${!current ? 'enabled' : 'disabled'}. Core remains available.`)); return true; }
  if (id === 'admin:module:emojis:core') { await sendPanel(interaction, corePanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:core-preview') { await sendPanel(interaction, corePreviewPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:bank') { await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:guild') { await sendPanel(interaction, guildPanel(await discordOverview(interaction))); return true; }
  if (id === 'admin:module:emojis:picker') { await sendPanel(interaction, pickerPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:tools') { await sendPanel(interaction, toolsPanel(await discordOverview(interaction))); return true; }
  if (id === 'admin:module:emojis:search-open') { await interaction.showModal(searchModal()); return true; }
  if (id === 'admin:module:emojis:import-url-open') { await interaction.showModal(urlImportModal()); return true; }
  if (id === 'admin:module:emojis:picker-search-open') { await interaction.showModal(pickerSearchModal()); return true; }
  if (id === 'admin:module:emojis:bulk-open') { await interaction.showModal(bulkUploadModal()); return true; }

  if (id === 'admin:module:emojis:search-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, searchResultsPanel(await emojiApi.search(query, 25), query)); return true; }
  if (id === 'admin:module:emojis:picker-search-submit' && interaction.isModalSubmit?.()) { const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, pickerPanel(await discordOverview(interaction), interaction, query)); return true; }
  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const result = await emojis.importFromUrl(interaction.client, interaction.fields.getTextInputValue('imageUrl'), interaction.fields.getTextInputValue('name') || null); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_url_import' }); await interaction.editReply(await buildDiscordPanel(interaction, `${result.created ? '✅ Imported' : '✅ Reused'} :${result.emoji.name}: from URL.`)); return true; }
  if (id === 'admin:module:emojis:import' && interaction.isStringSelectMenu?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Enable Emoji Studio first.'); await interaction.deferUpdate(); const result = await emojis.importFromEmojiGG(interaction.client, interaction.values?.[0]); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_discord_import' }); await interaction.editReply(await buildDiscordPanel(interaction, `${result.created ? '✅ Imported' : '✅ Reused'} :${result.emoji.name}: and selected it.`)); return true; }
  if (id === 'admin:module:emojis:bank-toggle' && interaction.isStringSelectMenu?.()) { const emojiId = String(interaction.values?.[0] || ''); const overview = await discordOverview(interaction); if ((overview.core || []).some((emoji) => String(emoji.id) === emojiId)) throw new Error('Core emojis are global and immutable.'); const current = emojiStore.getSection(guildId); emojiStore.setFavourite(guildId, emojiId, !current.favourites.includes(emojiId), { actorId: interaction.user?.id, action: 'emoji_discord_select' }); await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction)); return true; }
  if (id === 'admin:module:emojis:picker-select' && interaction.isStringSelectMenu?.()) { const overview = await discordOverview(interaction); const emoji = (overview.catalog || []).find((entry) => String(entry.id) === String(interaction.values?.[0])); if (!emoji) throw new Error('Emoji no longer exists.'); const shortcode = emoji.core ? emoji.alias : (emoji.aliases?.[0] || emoji.name); emojiStore.touchRecent(guildId, emoji.id); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧩 Emoji Selected').setDescription([emoji.mention, '', `**Shortcode:** \`:${shortcode}:\``, `**Category:** ${emoji.category}`, `**Tags:** ${(emoji.tags || []).join(', ') || 'none'}`, `**Used:** ${emoji.usage?.count || 0} time(s)`].join('\n'))], components: [row(button('admin:module:emojis:picker', '⬅️ Picker', ButtonStyle.Secondary), button('admin:module:emojis:panel', 'Emoji Studio', ButtonStyle.Secondary))] }); return true; }

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
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📤 Bulk Upload Complete').setDescription(lines.join('\n').slice(0, 4000))], components: [row(button('admin:module:emojis:bank', '🌐 Studio Bank', ButtonStyle.Secondary), button('admin:module:emojis:panel', 'Emoji Studio', ButtonStyle.Secondary))] });
    return true;
  }

  if (id === 'admin:module:emojis:analytics') { const overview = await discordOverview(interaction); const rows = (overview.usage || []).filter((entry) => entry.count > 0).slice(0, 20); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📊 Emoji Usage Analytics').setDescription(rows.length ? rows.map((entry, index) => `${index + 1}. \`:${entry.emoji.alias || entry.emoji.name}:\` — **${entry.count}** use(s) • ${entry.lastUsedAt ? `<t:${Math.floor(Date.parse(entry.lastUsedAt) / 1000)}:R>` : 'never'}`).join('\n') : 'No tracked emoji usage yet.')], components: [row(button('admin:module:emojis:tools', '⬅️ Studio Tools', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:health') { const overview = await discordOverview(interaction); const h = overview.health || {}; await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(h.healthy ? 0x57F287 : 0xFEE75C).setTitle('🩺 Emoji Studio Health').setDescription([`**Status:** ${h.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`, `Broken favourites: **${h.brokenFavourites?.length || 0}**`, `Broken aliases: **${h.brokenAliases?.length || 0}**`, `Broken pack refs: **${h.brokenPackEntries?.length || 0}**`, `Expired temporary: **${h.expiredTemporary?.length || 0}**`, `Capacity remaining: **${h.capacity?.remaining ?? 0}**`].join('\n'))], components: [row(button('admin:module:emojis:tools', '⬅️ Studio Tools', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:cleanup') { const section = emojiStore.getSection(guildId); const candidates = await emojis.cleanupCandidates(interaction.client, section.cleanup.unusedDays); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧹 Unused Emoji Cleanup').setDescription([`Threshold: **${section.cleanup.unusedDays} days**`, 'Deletion is never automatic when dependencies exist.', '', ...(candidates.slice(0, 20).map((entry) => `• \`:${entry.emoji.name}:\` — ${entry.count} uses • ${entry.dependencies} dependencies${entry.unusedDays == null ? ' • never used' : ` • ${entry.unusedDays}d idle`}`) || ['No candidates.'])].join('\n').slice(0, 4000))], components: [row(button('admin:module:emojis:tools', '⬅️ Studio Tools', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:duplicates') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const groups = await emojis.duplicates(interaction.client); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🧬 Duplicate Emoji Audit').setDescription(groups.length ? groups.slice(0, 15).map((group, index) => `**Group ${index + 1}:** ${group.entries.map((entry) => `\`:${entry.name}:\``).join(', ')}`).join('\n') : 'No exact-image duplicates found.')], components: [row(button('admin:module:emojis:tools', '⬅️ Studio Tools', ButtonStyle.Secondary))] }); return true; }
  if (id === 'admin:module:emojis:export') { const exported = emojis.exportGuildConfig(guildId); await sendPanel(interaction, { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📦 Emoji Studio Configuration Export').setDescription(`\`\`\`json\n${JSON.stringify(exported, null, 2).slice(0, 3500)}\n\`\`\``)], components: [row(button('admin:module:emojis:tools', '⬅️ Studio Tools', ButtonStyle.Secondary))] }); return true; }

  return false;
}

router.buildDiscordPanel = buildDiscordPanel;
router.handleDiscordInteraction = handleDiscordInteraction;
module.exports = router;
