'use strict';

const fs = require('node:fs');

function replaceOnce(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`${label} anchor missing`);
  return text.replace(oldValue, newValue);
}

function replaceRegex(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`${label} anchor missing`);
  return text.replace(pattern, replacement);
}

const mediaPath = 'src/modules/utilityStudio/emojis/emojiMedia.js';
let media = fs.readFileSync(mediaPath, 'utf8');
media = replaceOnce(
  media,
  "  const animated = Number(metadata.pages || 1) > 1;\n  if (animated) return prepareAnimatedEmoji(source, metadata, { ...options, maxSourceBytes });\n",
  "  const animated = Number(metadata.pages || 1) > 1;\n  if (animated && options.rejectAnimated === true) throw new Error('Animated media must be added through Add GIF.');\n  if (!animated && options.requireAnimated === true) throw new Error('That file is static. Use Add Emoji instead.');\n  if (animated) return prepareAnimatedEmoji(source, metadata, { ...options, maxSourceBytes });\n",
  'emojiMedia animation routing',
);
fs.writeFileSync(mediaPath, media);

const apiPath = 'src/modules/utilityStudio/emojis/emojisApi.js';
let api = fs.readFileSync(apiPath, 'utf8');
api = replaceOnce(
  api,
  "    forceStaticFallback: options.forceStaticFallback === true,\n",
  "    forceStaticFallback: options.forceStaticFallback === true,\n    rejectAnimated: options.rejectAnimated === true,\n    requireAnimated: options.requireAnimated === true,\n",
  'emojisApi media options',
);
fs.writeFileSync(apiPath, api);

const panelPath = 'src/modules/utilityStudio/emojis/emojisPanel.js';
let panel = fs.readFileSync(panelPath, 'utf8');

const newAddPanel = [
  "function addPanel(interaction) {",
  "  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('➕ Add Emoji').setDescription([",
  "    'Add static emojis to this server. Animated media is handled separately through the **Add GIF** button on the main panel.', '',",
  "    '**Browse Emojis** — search the online emoji collection.',",
  "    '**Upload Emoji** — add a static image from your device.',",
  "    '**Add Image Link** — paste a direct static image link.',",
  "  ].join('\\n')).setFooter({ text: 'Requested by ' + memberName(interaction) })], components: [",
  "    row(button('admin:module:emojis:search-open', '🔎 Browse Emojis', ButtonStyle.Primary), button('admin:module:emojis:bulk-open', '🖼️ Upload Emoji', ButtonStyle.Primary), button('admin:module:emojis:import-url-open', '🔗 Add Image Link', ButtonStyle.Secondary)),",
  "    row(button('admin:module:emojis:panel', '⬅️ Back', ButtonStyle.Secondary), button('admin:module:emojis:settings', '⚙️ Settings', ButtonStyle.Secondary)),",
  "  ] };",
  "}",
  "",
].join('\n');

panel = replaceRegex(
  panel,
  /function addPanel\(interaction\) \{[\s\S]*?\n\}\n\n(?=function settingsPanel)/,
  newAddPanel,
  'addPanel',
);

panel = replaceRegex(
  panel,
  /function searchModal\(\) \{[^\n]+\}\n/,
  "function searchModal() { return new ModalBuilder().setCustomId('admin:module:emojis:search-submit').setTitle('Search Emojis').addComponents(row(new TextInputBuilder().setCustomId('query').setLabel('What emoji are you looking for?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }\n",
  'search modal',
);

panel = replaceRegex(
  panel,
  /function urlImportModal\(\) \{[^\n]+\}\n/,
  "function urlImportModal() { return new ModalBuilder().setCustomId('admin:module:emojis:import-url-submit').setTitle('Add Emoji from Image Link').addComponents(row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Static image link').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1000)), row(new TextInputBuilder().setCustomId('name').setLabel('Emoji name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32))); }\n",
  'URL modal',
);

panel = replaceOnce(
  panel,
  "function gifUploadModal() { const upload = new FileUploadBuilder().setCustomId('files').setMinValues(1).setMaxValues(10).setRequired(true); return new ModalBuilder().setCustomId('admin:module:emojis:bulk-submit').setTitle('Upload GIF / Animation').addComponents(new LabelBuilder().setLabel('Choose animated files').setDescription('GIF, animated WebP, APNG or AVIF. Goliath will optimise while preserving animation where possible.').setFileUploadComponent(upload)); }\n",
  "function gifUploadModal() { const upload = new FileUploadBuilder().setCustomId('files').setMinValues(1).setMaxValues(10).setRequired(true); return new ModalBuilder().setCustomId('admin:module:emojis:gif-bulk-submit').setTitle('Upload GIF / Animation').addComponents(new LabelBuilder().setLabel('Choose animated files').setDescription('GIF, animated WebP, APNG or AVIF. Goliath will optimise while preserving animation where possible.').setFileUploadComponent(upload)); }\n",
  'GIF upload modal',
);

panel = replaceRegex(
  panel,
  /function searchResultsPanel\(results, query\) \{[^\n]+\}\n/,
  "function searchResultsPanel(results, query) { const clean = Array.isArray(results) ? results.slice(0, 25) : []; const components = []; if (clean.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:import').setPlaceholder('Choose an emoji to preview').addOptions(clean.map((entry) => ({ label: cleanSearchName(entry).slice(0, 100), value: String(entry.id), description: cleanSearchCategory(entry).slice(0, 100) }))))); components.push(row(button('admin:module:emojis:search-open', '🔎 Search Again', ButtonStyle.Primary))); components.push(row(button('admin:module:emojis:add', '⬅️ Back', ButtonStyle.Secondary))); return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('🔎 Emoji Search Results').setDescription(clean.length ? `Found **${clean.length}** result(s) for **${String(query).slice(0, 80)}**. Choose one to preview it before adding.` : 'No matching emojis were found. Try a different search.')], components }; }\n",
  'search results panel',
);

panel = replaceOnce(
  panel,
  "  if (id.startsWith('admin:module:emojis:import-confirm:') && interaction.isButton?.()) { const emojiGgId = id.slice('admin:module:emojis:import-confirm:'.length); if (!/^\\d+$/.test(emojiGgId)) throw new Error('That emoji could not be identified. Search for it again.'); await interaction.deferUpdate(); const result = await emojis.importFromEmojiGG(interaction.client, emojiGgId); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_discord_import' }); await interaction.editReply(addedEmojiPanel(result, interaction)); return true; }\n",
  [
    "  if (id.startsWith('admin:module:emojis:import-confirm:') && interaction.isButton?.()) {",
    "    const emojiGgId = id.slice('admin:module:emojis:import-confirm:'.length);",
    "    if (!/^\\d+$/.test(emojiGgId)) throw new Error('That emoji could not be identified. Search for it again.');",
    "    await interaction.deferUpdate();",
    "    const entry = await emojiApi.findById(emojiGgId);",
    "    if (!entry) throw new Error('That emoji could not be found anymore. Try searching again.');",
    "    const prepared = await emojiApi.prepareDownloadedAsset(emojiApi.assetUrl(entry), { rejectAnimated: true });",
    "    const created = await emojis.createStudioEmoji(interaction.client, prepared.buffer, cleanSearchName(entry));",
    "    const result = { ...created, ...prepared, emoji: created.emoji };",
    "    emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_discord_import' });",
    "    await interaction.editReply(addedEmojiPanel(result, interaction));",
    "    return true;",
    "  }",
    "",
  ].join('\n'),
  'browse import enforcement',
);

panel = replaceOnce(
  panel,
  "  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const result = await emojis.importFromUrl(interaction.client, interaction.fields.getTextInputValue('imageUrl'), interaction.fields.getTextInputValue('name') || null); emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_url_import' }); await interaction.editReply(addedEmojiPanel(result, interaction)); return true; }\n",
  [
    "  if (id === 'admin:module:emojis:import-url-submit' && interaction.isModalSubmit?.()) {",
    "    await interaction.deferReply({ flags: MessageFlags.Ephemeral });",
    "    const imageUrl = interaction.fields.getTextInputValue('imageUrl');",
    "    const requestedName = interaction.fields.getTextInputValue('name') || null;",
    "    const prepared = await emojiApi.prepareDownloadedAsset(imageUrl, { rejectAnimated: true });",
    "    let name = requestedName || 'emoji';",
    "    if (!requestedName) { try { name = decodeURIComponent(new URL(imageUrl).pathname.split('/').pop() || 'emoji').replace(/\\.[a-z0-9]+$/i, '') || 'emoji'; } catch {} }",
    "    const created = await emojis.createStudioEmoji(interaction.client, prepared.buffer, name);",
    "    const result = { ...created, ...prepared, emoji: created.emoji };",
    "    emojiStore.setFavourite(guildId, result.emoji.id, true, { actorId: interaction.user?.id, action: 'emoji_url_import' });",
    "    await interaction.editReply(addedEmojiPanel(result, interaction));",
    "    return true;",
    "  }",
    "",
  ].join('\n'),
  'URL import enforcement',
);

panel = replaceOnce(
  panel,
  "  if (id === 'admin:module:emojis:bulk-submit' && interaction.isModalSubmit?.()) {\n",
  "  if ((id === 'admin:module:emojis:bulk-submit' || id === 'admin:module:emojis:gif-bulk-submit') && interaction.isModalSubmit?.()) {\n",
  'bulk handler selector',
);

panel = replaceOnce(
  panel,
  "    await interaction.deferReply({ flags: MessageFlags.Ephemeral });\n    const lines = [];\n    let animated = 0; let optimised = 0; let failed = 0; let fallbackEligible = 0;\n",
  "    await interaction.deferReply({ flags: MessageFlags.Ephemeral });\n    const gifOnly = id === 'admin:module:emojis:gif-bulk-submit';\n    const lines = [];\n    let animated = 0; let optimised = 0; let failed = 0; let fallbackEligible = 0;\n",
  'bulk mode flag',
);

panel = replaceOnce(
  panel,
  "        const prepared = await emojiApi.prepareAttachmentAsset(attachment);\n",
  "        const prepared = await emojiApi.prepareAttachmentAsset(attachment, gifOnly ? { requireAnimated: true } : { rejectAnimated: true });\n",
  'bulk media enforcement',
);

panel = replaceOnce(
  panel,
  "        if (message.includes('without flattening the animation')) fallbackEligible += 1;\n",
  "        if (gifOnly && message.includes('without flattening the animation')) fallbackEligible += 1;\n",
  'fallback GIF-only enforcement',
);

panel = replaceOnce(
  panel,
  "    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(failed ? 0xFEE75C : 0x57F287).setTitle('📤 Emoji & GIF Upload Complete').setDescription(`${summary}\\n\\n${lines.join('\\n')}`.slice(0, 4000))], components });\n",
  "    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(failed ? 0xFEE75C : 0x57F287).setTitle(gifOnly ? '🎞️ GIF Upload Complete' : '🖼️ Emoji Upload Complete').setDescription(`${summary}\\n\\n${lines.join('\\n')}`.slice(0, 4000))], components });\n",
  'bulk result title',
);

fs.writeFileSync(panelPath, panel);
