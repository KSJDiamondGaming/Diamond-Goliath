'use strict';

const fs = require('fs');

const path = 'src/modules/utilityStudio/emojis/emojisPanel.js';
let source = fs.readFileSync(path, 'utf8');

const helperAnchor = "const button = (id, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);\n";
if (!source.includes(helperAnchor)) throw new Error('Missing emoji panel helper anchor.');
source = source.replace(helperAnchor, `${helperAnchor}
const manageFilters = new Map();
function manageFilterKey(interaction) { return `${interaction.guild?.id || interaction.guildId || 'unknown'}:${interaction.user?.id || 'unknown'}`; }
function currentManageFilter(interaction) { const value = manageFilters.get(manageFilterKey(interaction)); return value === 'static' || value === 'animated' ? value : 'all'; }
function setManageFilter(interaction, value) { const filter = value === 'static' || value === 'animated' ? value : 'all'; manageFilters.set(manageFilterKey(interaction), filter); return filter; }
`);

const managePattern = /function managePanel\(overview, interaction, selectedKey = '', notice = ''\) \{[\s\S]*?\n\}\n\nfunction deleteConfirmPanel/;
if (!managePattern.test(source)) throw new Error('Missing managePanel block.');
const manageReplacement = `function managePanel(overview, interaction, selectedKey = '', notice = '') {
  const filter = currentManageFilter(interaction);
  const selectedIds = new Set(overview.effectiveFavourites || []);
  const matchesFilter = (animated) => filter === 'all' || (filter === 'animated' ? Boolean(animated) : !animated);
  const extras = (overview.catalog || []).filter((emoji) => !emoji.core && matchesFilter(emoji.animated)).sort((a, b) => Number(selectedIds.has(String(b.id))) - Number(selectedIds.has(String(a.id))) || String(a.name || '').localeCompare(String(b.name || '')));
  const builtIns = (overview.coreStatus || []).filter((entry) => entry.installed && entry.emoji && matchesFilter(entry.animated ?? entry.emoji?.animated));
  const extraOptions = extras.slice(0, 25).map((emoji) => ({ label: `:${emoji.name}:`.slice(0, 100), value: `extra:${emoji.id}`, description: `${emoji.animated ? '🎞️ Animated' : '🖼️ Static'} • ${selectedIds.has(String(emoji.id)) ? 'Added' : 'Available'}`.slice(0, 100), emoji: emoji.component || undefined }));
  const coreOptions = builtIns.slice(0, 25).map((entry) => ({ label: `:${entry.alias}:`.slice(0, 100), value: `core:${entry.alias}`, description: `${entry.animated ? '🎞️ Animated' : '💠 Built-in'} • always available`.slice(0, 100), emoji: entry.emoji?.component || undefined }));
  let chosen = null; let isCore = false;
  if (selectedKey.startsWith('extra:')) chosen = extras.find((emoji) => String(emoji.id) === selectedKey.slice(6)) || null;
  if (selectedKey.startsWith('core:')) { isCore = true; const alias = selectedKey.slice(5); const entry = builtIns.find((item) => item.alias === alias); const catalogEntry = (overview.catalog || []).find((emoji) => emoji.core && String(emoji.alias || emoji.name) === alias); chosen = entry ? { ...catalogEntry, ...entry.emoji, alias: entry.alias, mention: entry.mention || entry.emoji.mention } : null; }
  const chosenAdded = chosen && !isCore ? selectedIds.has(String(chosen.id)) : false;
  const shortcode = chosen ? String(chosen.alias || chosen.name || 'emoji') : '';
  const previewLines = chosen ? [`${chosen.mention || `:${shortcode}:`}  **:${shortcode}:**`, `**Type:** ${chosen.animated ? '🎞️ Animated' : '🖼️ Static'}`, `**Status:** ${isCore ? 'Built-in • always available 💠' : (chosenAdded ? 'Added to this server ✅' : 'Available to add')}`, `**Type this:** \`:${shortcode}:\``, ...(!isCore && chosen.category ? [`**Category:** ${chosen.category}`] : []), ...(!isCore && Array.isArray(chosen.tags) && chosen.tags.length ? [`**Tags:** ${chosen.tags.join(', ')}`] : []), `**Used:** ${chosen.usage?.count || 0} time(s)`, ...(isCore ? ['', 'Included with Goliath and always available in this server.'] : [])] : [`Showing **${filter === 'all' ? 'All' : filter === 'animated' ? 'Animated' : 'Static'}** emojis. Choose one below to preview and manage it.`];
  const embed = new EmbedBuilder().setColor(PANEL_COLOR).setTitle('⭐ Manage Emojis').setDescription([`**Your emojis:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`, `**Built-in emojis:** ${overview.coreCapacity.used}/${overview.coreCapacity.max} always available`, `**Filter:** ${filter === 'all' ? 'All' : filter === 'animated' ? '🎞️ Animated' : '🖼️ Static'}`, '', ...previewLines, notice ? `\n${notice}` : ''].filter(Boolean).join('\n')).setFooter({ text: `Requested by ${memberName(interaction)}` });
  const previewUrl = emojiPreviewUrl(chosen); if (previewUrl) embed.setThumbnail(previewUrl);
  const components = [];
  components.push(row(
    button('admin:module:emojis:manage-filter:all', 'All', filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    button('admin:module:emojis:manage-filter:static', '🖼️ Static', filter === 'static' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    button('admin:module:emojis:manage-filter:animated', '🎞️ Animated', filter === 'animated' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ));
  if (extraOptions.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:manage-extra-select').setPlaceholder(filter === 'all' ? 'Your & available emojis' : `${filter === 'animated' ? 'Animated' : 'Static'} emojis`).addOptions(extraOptions)));
  if (coreOptions.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:manage-core-select').setPlaceholder(filter === 'all' ? 'Built-in emojis' : `Built-in ${filter} emojis`).addOptions(coreOptions)));
  if (chosen && !isCore) components.push(row(chosenAdded ? button(`admin:module:emojis:manage-remove:${chosen.id}`, '➖ Remove from Server', ButtonStyle.Secondary) : button(`admin:module:emojis:manage-add:${chosen.id}`, '➕ Add to Server', ButtonStyle.Success), button(`admin:module:emojis:delete-open:${chosen.id}`, '🗑️ Delete Emoji', ButtonStyle.Danger)));
  components.push(row(button('admin:module:emojis:panel', '⬅️ Back', ButtonStyle.Secondary)));
  return { embeds: [embed], components };
}

function deleteConfirmPanel`;
source = source.replace(managePattern, manageReplacement);

const interactionAnchor = "  if (id === 'admin:module:emojis:guild') { await sendPanel(interaction, managePanel(await discordOverview(interaction), interaction)); return true; }\n";
if (!source.includes(interactionAnchor)) throw new Error('Missing manage guild interaction anchor.');
source = source.replace(interactionAnchor, `${interactionAnchor}  if (id.startsWith('admin:module:emojis:manage-filter:') && interaction.isButton?.()) { setManageFilter(interaction, id.slice('admin:module:emojis:manage-filter:'.length)); await sendPanel(interaction, managePanel(await discordOverview(interaction), interaction)); return true; }\n`);

fs.writeFileSync(path, source);
console.log('Emoji management filter added.');
