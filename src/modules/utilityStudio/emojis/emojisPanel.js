'use strict';

const express = require('express');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const emojiApi = require('./emojisApi');
const emojis = require('./emojis');
const emojiStore = require('./emojisStore');

const router = express.Router();
const PANEL_COLOR = 0x5865F2;
const ok = (res, payload = {}) => res.json({ success: true, ...payload });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error: error?.message || 'Emoji request failed.' });

function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{16,20}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}

function actor(req) {
  return String(req.session?.user?.id || req.body?.actorId || '').trim() || null;
}

function client(req) {
  return req.client || req.app?.get?.('goliath.client') || null;
}

async function payload(req, id) {
  const overview = await emojis.overview(client(req), id);
  return {
    guildId: id,
    ...overview,
    source: 'Discord application emojis',
    imageStorage: 'Discord-hosted',
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try { return ok(res, await payload(req, guildId(req))); }
  catch (error) { return fail(res, error); }
});

router.patch('/:guildId/enabled', async (req, res) => {
  try {
    const id = guildId(req);
    guildManager.setModuleEnabled(id, 'emojis', req.body?.enabled === true, { actorId: actor(req), action: 'emoji_panel_toggle' });
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

router.get('/:guildId/search', async (req, res) => {
  try {
    const id = guildId(req);
    const results = await emojiApi.search(req.query?.q || '', Number(req.query?.limit) || 25);
    return ok(res, { guildId: id, results });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/import', async (req, res) => {
  try {
    const id = guildId(req);
    if (!emojiStore.getSection(id).enabled) throw new Error('Emoji Studio is disabled for this server.');
    const result = await emojis.importFromEmojiGG(client(req), req.body?.emojiGgId, req.body?.name || null);
    if (req.body?.selectForGuild !== false) {
      emojiStore.setFavourite(id, result.emoji.id, true, { actorId: actor(req), action: 'emoji_panel_import' });
    }
    return ok(res, { result, ...(await payload(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.patch('/:guildId/favourites/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    emojiStore.setFavourite(id, req.params.emojiId, req.body?.selected !== false, { actorId: actor(req), action: 'emoji_panel_favourite' });
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

router.patch('/:guildId/bank/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    const emoji = await emojis.renameInBank(client(req), req.params.emojiId, req.body?.name);
    return ok(res, { emoji, ...(await payload(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.delete('/:guildId/bank/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    await emojis.removeFromBank(client(req), req.params.emojiId);
    const section = emojiStore.getSection(id);
    if (section.favourites.includes(String(req.params.emojiId))) {
      emojiStore.setFavourite(id, req.params.emojiId, false, { actorId: actor(req), action: 'emoji_panel_delete' });
    }
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

function row(...items) { return new ActionRowBuilder().addComponents(...items); }
function button(id, label, style = ButtonStyle.Primary) { return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style); }
function memberName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }

async function discordOverview(interaction) {
  if (!interaction?.guild?.id || !interaction?.client) throw new Error('Emoji Studio requires a server interaction.');
  return emojis.overview(interaction.client, interaction.guild.id);
}

function mainEmbed(overview, interaction, notice = '') {
  return new EmbedBuilder()
    .setColor(overview.enabled ? 0x57F287 : PANEL_COLOR)
    .setTitle('😀 Emoji Studio')
    .setDescription([
      'Discord-hosted Goliath emojis with a built-in Core set plus optional server favourites.',
      '',
      `**Emoji Studio:** ${overview.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**💠 Goliath Core:** ${overview.coreCapacity.used} / ${overview.coreCapacity.max} — always available`,
      `**🌐 Studio Bank:** ${overview.studioCapacity.used} / ${overview.studioCapacity.max}`,
      `**🏠 This Server:** ${overview.guildCapacity.used} / ${overview.guildCapacity.max}`,
      `**📦 Total application emojis:** ${overview.capacity.used} / ${overview.capacity.max}`,
      '**💾 Goliath image storage:** 0 bytes',
      notice ? `\n${notice}` : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Requested by ${memberName(interaction)}` })
    .setTimestamp();
}

async function buildDiscordPanel(interaction, notice = '') {
  const overview = await discordOverview(interaction);
  return {
    embeds: [mainEmbed(overview, interaction, notice)],
    components: [
      row(
        button('admin:module:emojis:core', '💠 Goliath Core', ButtonStyle.Secondary),
        button('admin:module:emojis:search-open', '🔎 Browse Emoji.gg', ButtonStyle.Primary).setDisabled(!overview.enabled),
        button('admin:module:emojis:guild', '😀 Server Emojis', ButtonStyle.Secondary),
      ),
      row(
        button('admin:module:emojis:bank', '🌐 Studio Bank', ButtonStyle.Secondary),
        button('admin:module:emojis:toggle', overview.enabled ? '⏸️ Disable Studio' : '▶️ Enable Studio', overview.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:studio:utilityStudio', '⬅️ Utility Studio', ButtonStyle.Secondary),
      ),
    ],
  };
}

function searchModal() {
  return new ModalBuilder()
    .setCustomId('admin:module:emojis:search-submit')
    .setTitle('Search Emoji.gg')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('query')
        .setLabel('Search')
        .setPlaceholder('dolphin, gaming, pepe...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
    ));
}

function resultLabel(entry) {
  return String(entry?.title || entry?.slug || `Emoji ${entry?.id || ''}`).slice(0, 100);
}

function resultDescription(entry) {
  const bits = [entry?.category, entry?.id ? `Emoji.gg #${entry.id}` : null].filter(Boolean);
  return String(bits.join(' • ') || 'Emoji.gg result').slice(0, 100);
}

function searchResultsPanel(results, query, interaction) {
  const clean = Array.isArray(results) ? results.slice(0, 25) : [];
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🔎 Emoji.gg Results')
    .setDescription(clean.length
      ? `Found **${clean.length}** result(s) for **${String(query).slice(0, 80)}**. Select one to import it into Emoji Studio and add it to this server.`
      : `No results found for **${String(query).slice(0, 80)}**.`)
    .setFooter({ text: `Requested by ${memberName(interaction)}` });
  const components = [];
  if (clean.length) {
    components.push(row(
      new StringSelectMenuBuilder()
        .setCustomId('admin:module:emojis:import')
        .setPlaceholder('Choose an emoji to import')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(clean.map((entry) => ({
          label: resultLabel(entry),
          value: String(entry.id),
          description: resultDescription(entry),
        })))
    ));
  }
  components.push(row(
    button('admin:module:emojis:search-open', '🔎 Search Again', ButtonStyle.Primary),
    button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary)
  ));
  return { embeds: [embed], components };
}

function corePanel(overview, interaction) {
  const core = Array.isArray(overview.core) ? overview.core.slice(0, 25) : [];
  const lines = core.map((emoji) => `${emoji.mention || `:${emoji.name}:`}  \`:${emoji.alias}:\``);
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('💠 Goliath Core Emojis')
    .setDescription([
      `**Core usage:** ${overview.coreCapacity.used}/${overview.coreCapacity.max}`,
      '**Availability:** Every Goliath guild automatically',
      '**Guild slots used:** 0',
      '**Server favourites used:** 0',
      '',
      lines.length ? 'Use these aliases anywhere Goliath supports Emoji Studio shortcodes:' : 'No Core emojis have been uploaded yet.',
      ...lines,
      overview.core.length > core.length ? `\nShowing the first ${core.length} of ${overview.core.length} Core emojis.` : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Requested by ${memberName(interaction)}` });
  return {
    embeds: [embed],
    components: [row(button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary))],
  };
}

function bankPanel(overview, interaction) {
  const bank = Array.isArray(overview.studio) ? overview.studio : [];
  const selected = new Set((overview.favourites || []).map(String));
  const options = bank.slice(0, 25).map((emoji) => ({
    label: `:${emoji.name}:`.slice(0, 100),
    value: String(emoji.id),
    description: `${selected.has(String(emoji.id)) ? 'Selected for this server' : 'Not selected'} • ${emoji.animated ? 'Animated' : 'Static'}`.slice(0, 100),
    emoji: emoji.component || undefined,
  }));
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🌐 Emoji Studio Bank')
    .setDescription([
      `**Studio usage:** ${overview.studioCapacity.used}/${overview.studioCapacity.max}`,
      `**Reserved Core:** ${overview.coreCapacity.used}/${overview.coreCapacity.max}`,
      `**This server:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`,
      '',
      options.length ? 'Select an Emoji Studio emoji to add/remove it from this server. Showing the first 25 Studio entries.' : 'The Emoji Studio bank is empty.',
    ].join('\n'));
  const components = [];
  if (options.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:bank-toggle').setPlaceholder('Add/remove a Studio emoji').addOptions(options)));
  components.push(row(button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary)));
  return { embeds: [embed], components };
}

function guildPanel(overview, interaction) {
  const selectedIds = new Set((overview.favourites || []).map(String));
  const selected = (overview.studio || []).filter((emoji) => selectedIds.has(String(emoji.id))).slice(0, 25);
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('😀 This Server\'s Emoji Studio Favourites')
    .setDescription([
      `**Selected:** ${overview.guildCapacity.used}/${overview.guildCapacity.max}`,
      `**Plus Goliath Core:** ${overview.coreCapacity.used} always available`,
      '',
      selected.length ? 'Select an emoji below to remove it from this server. Showing up to 25 at a time.' : 'No optional Emoji Studio emojis are selected for this server yet.',
    ].join('\n'));
  const components = [];
  if (selected.length) components.push(row(new StringSelectMenuBuilder().setCustomId('admin:module:emojis:guild-remove').setPlaceholder('Remove a server emoji').addOptions(selected.map((emoji) => ({
    label: `:${emoji.name}:`.slice(0, 100), value: String(emoji.id), description: emoji.animated ? 'Animated application emoji' : 'Static application emoji', emoji: emoji.component || undefined,
  })) )));
  components.push(row(button('admin:module:emojis:panel', '⬅️ Emoji Studio', ButtonStyle.Secondary)));
  return { embeds: [embed], components };
}

async function sendPanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  return interaction.update(payload);
}

async function handleDiscordInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (!id.startsWith('admin:module:emojis:')) return false;

  if (id === 'admin:module:emojis:panel') {
    await sendPanel(interaction, await buildDiscordPanel(interaction));
    return true;
  }

  if (id === 'admin:module:emojis:toggle' && interaction.isButton?.()) {
    const current = emojiStore.getSection(interaction.guild.id).enabled;
    guildManager.setModuleEnabled(interaction.guild.id, 'emojis', !current, { actorId: interaction.user?.id || null, action: 'emoji_discord_toggle' });
    await sendPanel(interaction, await buildDiscordPanel(interaction, `Emoji Studio ${!current ? 'enabled' : 'disabled'}. Goliath Core remains available.`));
    return true;
  }

  if (id === 'admin:module:emojis:search-open' && interaction.isButton?.()) {
    await interaction.showModal(searchModal());
    return true;
  }

  if (id === 'admin:module:emojis:search-submit' && interaction.isModalSubmit?.()) {
    if (!emojiStore.getSection(interaction.guild.id).enabled) throw new Error('Enable Emoji Studio before importing emojis.');
    const query = interaction.fields.getTextInputValue('query');
    const results = await emojiApi.search(query, 25);
    await sendPanel(interaction, searchResultsPanel(results, query, interaction));
    return true;
  }

  if (id === 'admin:module:emojis:import' && interaction.isStringSelectMenu?.()) {
    if (!emojiStore.getSection(interaction.guild.id).enabled) throw new Error('Enable Emoji Studio before importing emojis.');
    await interaction.deferUpdate();
    const result = await emojis.importFromEmojiGG(interaction.client, interaction.values?.[0]);
    emojiStore.setFavourite(interaction.guild.id, result.emoji.id, true, { actorId: interaction.user?.id || null, action: 'emoji_discord_import' });
    await interaction.editReply(await buildDiscordPanel(interaction, `${result.created ? '✅ Imported' : '✅ Reused'} :${result.emoji.name}: and selected it for this server.`));
    return true;
  }

  if (id === 'admin:module:emojis:core' && interaction.isButton?.()) {
    await sendPanel(interaction, corePanel(await discordOverview(interaction), interaction));
    return true;
  }

  if (id === 'admin:module:emojis:bank' && interaction.isButton?.()) {
    await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction));
    return true;
  }

  if (id === 'admin:module:emojis:guild' && interaction.isButton?.()) {
    await sendPanel(interaction, guildPanel(await discordOverview(interaction), interaction));
    return true;
  }

  if (id === 'admin:module:emojis:bank-toggle' && interaction.isStringSelectMenu?.()) {
    const emojiId = String(interaction.values?.[0] || '');
    const overview = await discordOverview(interaction);
    if ((overview.core || []).some((emoji) => String(emoji.id) === emojiId)) throw new Error('Goliath Core emojis are already available to every server and do not use favourites.');
    const current = emojiStore.getSection(interaction.guild.id);
    emojiStore.setFavourite(interaction.guild.id, emojiId, !current.favourites.includes(emojiId), { actorId: interaction.user?.id || null, action: 'emoji_discord_select' });
    await sendPanel(interaction, bankPanel(await discordOverview(interaction), interaction));
    return true;
  }

  if (id === 'admin:module:emojis:guild-remove' && interaction.isStringSelectMenu?.()) {
    emojiStore.setFavourite(interaction.guild.id, interaction.values?.[0], false, { actorId: interaction.user?.id || null, action: 'emoji_discord_remove' });
    await sendPanel(interaction, guildPanel(await discordOverview(interaction), interaction));
    return true;
  }

  return false;
}

router.buildDiscordPanel = buildDiscordPanel;
router.handleDiscordInteraction = handleDiscordInteraction;
module.exports = router;
