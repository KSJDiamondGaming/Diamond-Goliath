'use strict';

const fs = require('node:fs');

function replaceOnce(text, oldValue, newValue, label) {
  const index = text.indexOf(oldValue);
  if (index < 0) throw new Error(`${label} anchor missing`);
  if (text.indexOf(oldValue, index + oldValue.length) >= 0) throw new Error(`${label} anchor not unique`);
  return text.slice(0, index) + newValue + text.slice(index + oldValue.length);
}

function replaceBlock(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${label} start missing`);
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label} end missing`);
  return text.slice(0, start) + replacement + text.slice(end);
}

const apiPath = 'src/modules/utilityStudio/emojis/emojisApi.js';
let api = fs.readFileSync(apiPath, 'utf8');
api = replaceOnce(api,
`async function search(query, limit = 25) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  const catalogue = await fetchCatalogue();
  return catalogue
    .filter((entry) => [entry.title, entry.slug, entry.category, entry.id].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 25)));
}

function assetUrl(entry) { return entry ? (entry.image || entry.url || entry.src || null) : null; }
`,
`async function search(query, limit = 25) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  const catalogue = await fetchCatalogue();
  return catalogue
    .filter((entry) => [entry.title, entry.slug, entry.category, entry.id].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 25)));
}

function assetUrl(entry) { return entry ? (entry.image || entry.url || entry.src || null) : null; }

function catalogueEntryLooksAnimated(entry) {
  const explicit = entry?.animated ?? entry?.isAnimated ?? entry?.is_animated;
  if (explicit === true || explicit === 1 || String(explicit || '').toLowerCase() === 'true') return true;
  const format = String(entry?.format || entry?.type || entry?.extension || '').toLowerCase();
  if (format === 'gif' || format === 'apng' || format.includes('animated')) return true;
  const url = String(assetUrl(entry) || '');
  return /\\.(?:gif|apng)(?:$|[?#])/i.test(url) || /(?:^|[?&])animated=(?:1|true)(?:&|$)/i.test(url);
}

async function searchAnimated(query, limit = 25) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  const catalogue = await fetchCatalogue();
  return catalogue
    .filter((entry) => catalogueEntryLooksAnimated(entry))
    .filter((entry) => [entry.title, entry.slug, entry.category, entry.id].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 25)));
}
`, 'api animated search');
api = replaceOnce(api, '  search,\n  assetUrl,', '  search,\n  searchAnimated,\n  catalogueEntryLooksAnimated,\n  assetUrl,', 'api exports');
fs.writeFileSync(apiPath, api);

const panelPath = 'src/modules/utilityStudio/emojis/emojisPanel.js';
let panel = fs.readFileSync(panelPath, 'utf8');

panel = replaceOnce(panel,
`  ] };
}
function settingsPanel(overview, interaction, notice = '') {`,
`  ] };
}

function gifPanel(interaction) {
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🎞️ Add GIF').setDescription([
    'Add animated GIFs and other supported animated media to this server. Static images are handled separately through the **Add Emoji** button on the main panel.', '',
    '**Browse GIFs** — search the online animated collection.',
    '**Upload GIF** — add an animated file from your device.',
    '**Add GIF Link** — paste a direct animated media link.',
  ].join('\\n')).setFooter({ text: 'Requested by ' + memberName(interaction) })], components: [
    row(button('admin:module:emojis:gif-search-open', '🔎 Browse GIFs', ButtonStyle.Success), button('admin:module:emojis:gif-upload-file-open', '🎞️ Upload GIF', ButtonStyle.Success), button('admin:module:emojis:gif-import-url-open', '🔗 Add GIF Link', ButtonStyle.Secondary)),
    row(button('admin:module:emojis:panel', '⬅️ Back', ButtonStyle.Secondary), button('admin:module:emojis:settings', '⚙️ Settings', ButtonStyle.Secondary)),
  ] };
}

function settingsPanel(overview, interaction, notice = '') {`, 'gif panel');

panel = replaceOnce(panel,
`function searchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:search-submit').setTitle('Search Emojis').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('What emoji are you looking for?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function urlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:import-url-submit').setTitle('Add Emoji from Image Link').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Static image link').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('Emoji name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }
`,
`function searchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:search-submit').setTitle('Search Emojis').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('What emoji are you looking for?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function gifSearchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:gif-search-submit').setTitle('Search GIFs').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('What GIF are you looking for?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function urlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:import-url-submit').setTitle('Add Emoji from Image Link').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Static image link').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('Emoji name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }
function gifUrlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:gif-import-url-submit').setTitle('Add GIF from Link').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('GIF / animated media link').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('GIF name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }
`, 'gif modals');

panel = replaceBlock(panel, 'function searchResultsPanel(', 'function searchPreviewPanel(',
`function searchResultsPanel(results, query, mode = 'emoji') {
  const gifMode = mode === 'gif';
  const clean = Array.isArray(results) ? results.slice(0, 25) : [];
  const components = [];
  if (clean.length) components.push(row(new StringSelectMenuBuilder().setCustomId(gifMode ? 'admin:module:emojis:gif-import' : 'admin:module:emojis:import').setPlaceholder(gifMode ? 'Choose a GIF to preview' : 'Choose an emoji to preview').addOptions(clean.map((entry) => ({ label: cleanSearchName(entry).slice(0, 100), value: String(entry.id), description: cleanSearchCategory(entry).slice(0, 100) }))));
  components.push(row(button(gifMode ? 'admin:module:emojis:gif-search-open' : 'admin:module:emojis:search-open', '🔎 Search Again', gifMode ? ButtonStyle.Success : ButtonStyle.Primary)));
  components.push(row(button(gifMode ? 'admin:module:emojis:gif-upload-open' : 'admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle(gifMode ? '🔎 GIF Search Results' : '🔎 Emoji Search Results').setDescription(clean.length ? \`Found **\${clean.length}** \${gifMode ? 'animated ' : ''}result(s) for **\${String(query).slice(0, 80)}**. Choose one to preview it before adding.\` : \`No matching \${gifMode ? 'animated GIFs' : 'emojis'} were found. Try a different search.\`)], components };
}
`, 'search results');

panel = replaceBlock(panel, 'function searchPreviewPanel(', 'function addedEmojiPanel(',
`function searchPreviewPanel(entry, mode = 'emoji') {
  const gifMode = mode === 'gif';
  const name = cleanSearchName(entry);
  const embed = new EmbedBuilder().setColor(PANEL_COLOR).setTitle(\`👁️ \${name}\`).setDescription(\`**Name:** \${name}\\n**Type:** \${gifMode ? '🎞️ Animated GIF' : '🖼️ Static Emoji'}\\n\\nCheck the preview below, then choose whether to add it to this server.\`);
  const imageUrl = emojiApi.assetUrl(entry);
  if (imageUrl) embed.setImage(imageUrl);
  return { embeds: [embed], components: [
    row(button(\`\${gifMode ? 'admin:module:emojis:gif-import-confirm:' : 'admin:module:emojis:import-confirm:'}\${entry.id}\`, gifMode ? '✅ Add This GIF' : '✅ Add This Emoji', ButtonStyle.Success), button(gifMode ? 'admin:module:emojis:gif-search-open' : 'admin:module:emojis:search-open', '🔎 Search Again', ButtonStyle.Secondary)),
    row(button(gifMode ? 'admin:module:emojis:gif-upload-open' : 'admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary)),
  ] };
}
`, 'search preview');

panel = replaceBlock(panel, 'function addedEmojiPanel(', 'async function sendPanel(',
`function addedEmojiPanel(result, interaction, mode = 'emoji') {
  const gifMode = mode === 'gif';
  const emoji = result?.emoji;
  const name = String(emoji?.name || 'emoji');
  const mention = emoji?.mention || (emoji?.id ? \`<\${result?.animated ? 'a' : ''}:\${name}:\${emoji.id}>\` : \`:\${name}:\`);
  const details = [\`**Type:** \${result?.animated || emoji?.animated ? \`🎞️ \${emojiMedia.mediaTypeLabel({ ...result, animated: true })}\` : '🖼️ Static'}\`, result?.processed ? '**Processing:** Optimised automatically ✅' : '**Processing:** Preserved as uploaded ✅', ...(result?.animated && result?.pages ? [\`**Frames:** \${result.pages}\${result.frameRateReduced ? ' • frame rate reduced' : ''}\`] : [])];
  return { content: null, embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(gifMode ? '✅ GIF Added' : '✅ Emoji Added').setDescription(\`\${mention}  **:\${name}:**\\n\\n\${result?.created ? 'Added' : 'Already available and added'} to this server successfully.\\n\${details.join('\\n')}\`).setFooter({ text: \`Requested by \${memberName(interaction)}\` }).setTimestamp()], components: [
    row(button(gifMode ? 'admin:module:emojis:gif-search-open' : 'admin:module:emojis:search-open', gifMode ? '🔎 Add Another GIF' : '🔎 Add Another', gifMode ? ButtonStyle.Success : ButtonStyle.Primary), button('admin:module:emojis:guild', '⭐ Manage Library', ButtonStyle.Secondary)),
    row(button(gifMode ? 'admin:module:emojis:gif-upload-open' : 'admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary)),
  ] };
}
`, 'added panel');

panel = replaceOnce(panel,
`  if (id === 'admin:module:emojis:search-open') { await interaction.showModal(searchModal()); return true; }
  if (id === 'admin:module:emojis:import-url-open') { await interaction.showModal(urlImportModal()); return true; }
  if (id === 'admin:module:emojis:bulk-open') { await interaction.showModal(bulkUploadModal()); return true; }
  if (id === 'admin:module:emojis:gif-upload-open') { await interaction.showModal(gifUploadModal()); return true; }
`,
`  if (id === 'admin:module:emojis:search-open') { await interaction.showModal(searchModal()); return true; }
  if (id === 'admin:module:emojis:gif-search-open') { await interaction.showModal(gifSearchModal()); return true; }
  if (id === 'admin:module:emojis:import-url-open') { await interaction.showModal(urlImportModal()); return true; }
  if (id === 'admin:module:emojis:gif-import-url-open') { await interaction.showModal(gifUrlImportModal()); return true; }
  if (id === 'admin:module:emojis:bulk-open') { await interaction.showModal(bulkUploadModal()); return true; }
  if (id === 'admin:module:emojis:gif-upload-open') { await sendPanel(interaction, gifPanel(interaction)); return true; }
  if (id === 'admin:module:emojis:gif-upload-file-open') { await interaction.showModal(gifUploadModal()); return true; }
`, 'open handlers');

panel = replaceOnce(panel,
`  if (id === 'admin:module:emojis:search-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Turn on Emoji Studio first.'); const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, searchResultsPanel(await emojiApi.search(query, 25), query)); return true; }
  if (id === 'admin:module:emojis:import' && interaction.isStringSelectMenu?.()) { const entry = await emojiApi.findById(interaction.values?.[0]); if (!entry) throw new Error('That emoji could not be found anymore. Try searching again.'); await sendPanel(interaction, searchPreviewPanel(entry)); return true; }
`,
`  if (id === 'admin:module:emojis:search-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Turn on Emoji Studio first.'); const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, searchResultsPanel(await emojiApi.search(query, 25), query)); return true; }
  if (id === 'admin:module:emojis:gif-search-submit' && interaction.isModalSubmit?.()) { if (!emojiStore.getSection(guildId).enabled) throw new Error('Turn on Emoji & GIF Studio first.'); const query = interaction.fields.getTextInputValue('query'); await sendPanel(interaction, searchResultsPanel(await emojiApi.searchAnimated(query, 25), query, 'gif')); return true; }
  if (id === 'admin:module:emojis:import' && interaction.isStringSelectMenu?.()) { const entry = await emojiApi.findById(interaction.values?.[0]); if (!entry) throw new Error('That emoji could not be found anymore. Try searching again.'); await sendPanel(interaction, searchPreviewPanel(entry)); return true; }
  if (id === 'admin:module:emojis:gif-import' && interaction.isStringSelectMenu?.()) { const entry = await emojiApi.findById(interaction.values?.[0]); if (!entry || !emojiApi.catalogueEntryLooksAnimated(entry)) throw new Error('That animated GIF could not be found anymore. Try searching again.'); await sendPanel(interaction, searchPreviewPanel(entry, 'gif')); return true; }
`, 'search handlers');

const staticConfirmEnd = `    await interaction.editReply(addedEmojiPanel(result, interaction));
    return true;
  }
  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) {`;
panel = replaceOnce(panel, staticConfirmEnd,
`    await interaction.editReply(addedEmojiPanel(result, interaction));
    return true;
  }
  if (id.startsWith('admin:module:emojis:gif-import-confirm:') && interaction.isButton?.()) {
    const emojiGgId = id.slice('admin:module:emojis:gif-import-confirm:'.length);
    if (!/^\\d+$/.test(emojiGgId)) throw new Error('That GIF could not be identified. Search for it again.');
    await interaction.deferUpdate();
    const entry = await emojiApi.findById(emojiGgId);
    if (!entry || !emojiApi.catalogueEntryLooksAnimated(entry)) throw new Error('That animated GIF could not be found anymore. Try searching again.');
    const prepared = await emojiApi.prepareDownloadedAsset(emojiApi.assetUrl(entry), { requireAnimated: true });
    const created = await emojis.createStudioEmoji(interaction.client, prepared.buffer, cleanSearchName(entry));
    const result = { ...created, ...prepared, emoji: created.emoji };
    emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_gif_catalogue_import' });
    await interaction.editReply(addedEmojiPanel(result, interaction, 'gif'));
    return true;
  }
  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) {`, 'gif catalogue confirm');

const staticUrlEnd = `    await interaction.editReply(addedEmojiPanel(result, interaction));
    return true;
  }
  if ((id === 'admin:module:emojis:bulk-submit' || id === 'admin:module:emojis:gif-bulk-submit') && interaction.isModalSubmit?.()) {`;
panel = replaceOnce(panel, staticUrlEnd,
`    await interaction.editReply(addedEmojiPanel(result, interaction));
    return true;
  }
  if (id === 'admin:module:emojis:gif-import-url-submit' && interaction.isModalSubmit?.()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const imageUrl = interaction.fields.getTextInputValue('imageUrl');
    const requestedName = interaction.fields.getTextInputValue('name') || null;
    const prepared = await emojiApi.prepareDownloadedAsset(imageUrl, { requireAnimated: true });
    let name = requestedName || 'gif';
    if (!requestedName) { try { name = decodeURIComponent(new URL(imageUrl).pathname.split('/').pop() || 'gif').replace(/\\.[a-z0-9]+$/i, '') || 'gif'; } catch {} }
    const created = await emojis.createStudioEmoji(interaction.client, prepared.buffer, name);
    const result = { ...created, ...prepared, emoji: created.emoji };
    emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_gif_url_import' });
    await interaction.editReply(addedEmojiPanel(result, interaction, 'gif'));
    return true;
  }
  if ((id === 'admin:module:emojis:bulk-submit' || id === 'admin:module:emojis:gif-bulk-submit') && interaction.isModalSubmit?.()) {`, 'gif url submit');

panel = replaceOnce(panel,
`    components.push(row(button('admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary)));
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(failed ? 0xFEE75C : 0x57F287).setTitle(gifOnly ? '🎞️ GIF Upload Complete' : '🖼️ Emoji Upload Complete')`,
`    components.push(row(button(gifOnly ? 'admin:module:emojis:gif-upload-open' : 'admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary)));
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(failed ? 0xFEE75C : 0x57F287).setTitle(gifOnly ? '🎞️ GIF Upload Complete' : '🖼️ Emoji Upload Complete')`, 'bulk back route');

panel = replaceOnce(panel,
`components: [row(button('admin:module:emojis:guild', '⭐ Manage Library', ButtonStyle.Primary)), row(button('admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary))]`,
`components: [row(button('admin:module:emojis:guild', '⭐ Manage Library', ButtonStyle.Primary)), row(button('admin:module:emojis:gif-upload-open', '⬅️ Back to Add GIF', ButtonStyle.Secondary))]`, 'fallback back route');

fs.writeFileSync(panelPath, panel);
console.log('Patched mirrored Add GIF experience.');
