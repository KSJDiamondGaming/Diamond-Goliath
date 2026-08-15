const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const {
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require("./embedDeployments");
const embedState = require("./embedState");

const guildManager = require("../../../core/guild/guildManager");
const {
  validateChannelAccess,
} = require("../../../core/security/goliathPermissionGuard");

const {
  HELPERS,
  clone,
  trim,
  fmtDate,
  fmtTs,
  avatar,
  guildIcon,
  guildBanner,
  memberName,
  displayName,
  refreshGuild,
  sessionKey,
  replaceVars,
  getSession,
  saveSession,
  saveSelected,
  markUnsaved,
  clearUnsaved,
  resetSession,
  applyTemplate,
  applyPreset,
  setDefault,
} = embedState;

const PANEL_COLOR = "#5865F2";
const CUSTOM_HEX_VALUE = "__custom_hex__";
const MAX_PANELS = 10;
const MAX_BUTTONS = 20;

const COLORS = [
  ["Deep Blue", "#2F80ED", "🔷"],
  ["Royal Blue", "#4169E1", "🔵"],
  ["Sky Blue", "#00BFFF", "🩵"],
  ["Electric Blue", "#007BFF", "⚡"],
  ["Cyan", "#00D4FF", "💧"],
  ["Teal", "#1ABC9C", "🌊"],
  ["Green", "#57F287", "🟢"],
  ["Emerald", "#2ECC71", "💚"],
  ["Lime", "#BFFF00", "🍏"],
  ["Yellow", "#FEE75C", "🟡"],
  ["Gold", "#FFD700", "🏆"],
  ["Amber", "#FFC107", "🌟"],
  ["Orange", "#E67E22", "🟠"],
  ["Dark Orange", "#FF8C00", "🔥"],
  ["Red", "#ED4245", "🔴"],
  ["Crimson", "#DC143C", "❤️"],
  ["Rose", "#FF4D6D", "🌹"],
  ["Discord Blurple", "#5865F2", "🔮"],
  ["Purple", "#9B59B6", "🟣"],
  ["Violet", "#8A2BE2", "🪻"],
  ["Pink", "#EB459E", "🌸"],
  ["Hot Pink", "#FF69B4", "💖"],
  ["Dark", "#2B2D31", "⬛"],
  ["White", "#FFFFFF", "🤍"],
].map(([label, value, emoji]) => ({ label, value, emoji }));

const TEMPLATES = {
  custom: {
    label: "Custom Embed",
    emoji: "🛠️",
    title: "Custom Embed",
    description: "Edit this embed for your server.",
    color: PANEL_COLOR,
  },
  welcome: {
    label: "Welcome Message",
    emoji: "🤗",
    title: "",
    description:
      "🎉 **Welcome to {guildName},**\n**{userMention}**\n\n👤 You are member **#{guildMemberCount}**.\n\nEnjoy your stay!",
    color: "#57F287",
    authorName: "{guildName}",
    authorIcon: "{guildIcon}",
    footer: "Member joined",
    thumbnail: "{userAvatar}",
  },
  leave: {
    label: "Leave Message",
    emoji: "👋",
    title: "",
    description:
      "{userMention}\n\n👋 **{userDisplay}** has left **{guildName}**.\n\n📉 We now have **{guildMemberCount}** members.",
    color: "#ED4245",
    authorName: "{guildName}",
    authorIcon: "{guildIcon}",
    footer: "Member left",
    thumbnail: "{userAvatar}",
  },
  announcement: {
    label: "Announcement",
    emoji: "📢",
    title: "Announcement",
    description:
      "A new announcement has been posted for **{guildName}**.\n\nWrite your announcement here.",
    color: PANEL_COLOR,
    authorName: "{guildName}",
    authorIcon: "{guildIcon}",
    footer: "Announcement",
    thumbnail: "{guildIcon}",
  },
  rules: {
    label: "Rules",
    emoji: "📜",
    title: "Server Rules",
    description:
      "Please read and follow the rules for **{guildName}**.\n\n**1. Be respectful**\nTreat everyone with respect.\n\n**2. No spam**\nDo not spam messages, links, emojis, or mentions.\n\n**3. Keep it appropriate**\nKeep conversations safe and suitable for the server.\n\n**4. No advertising**\nDo not advertise without permission.\n\n**5. Follow Discord Terms**\nFollow Discord’s Terms of Service and Community Guidelines.",
    color: PANEL_COLOR,
    authorName: "{guildName}",
    authorIcon: "{guildIcon}",
    footer: "Please follow the rules",
  },
  suggestion: {
    label: "Suggestion",
    emoji: "💡",
    title: "New Suggestion",
    description:
      "**Suggestion:**\nWrite your suggestion here.\n\n**Status:** Pending review",
    color: "#FEE75C",
    footer: "Suggestion system",
    fields: [
      { name: "Status", value: "Pending", inline: true },
      { name: "Votes", value: "Waiting for votes", inline: true },
    ],
  },
  giveaway: {
    label: "Giveaway",
    emoji: "🎉",
    title: "Giveaway",
    description:
      "**Prize:** Your prize here\n**Winners:** 1\n**Ends:** Soon\n\nEnter the giveaway for a chance to win.",
    color: "#9B59B6",
    footer: "Good luck!",
    fields: [
      { name: "Prize", value: "Your prize here", inline: true },
      { name: "Winners", value: "1", inline: true },
      { name: "Ends", value: "Soon", inline: true },
    ],
  },
  update: {
    label: "Update Post",
    emoji: "📰",
    title: "Server Update",
    description:
      "A new update has been posted for **{guildName}**.\n\n**What changed:**\n- Add update here\n- Add update here\n- Add update here",
    color: "#3498DB",
    footer: "Update notice",
  },
  event: {
    label: "Event",
    emoji: "📅",
    title: "Server Event",
    description:
      "A new event is happening in **{guildName}**.\n\n**Event:** Event name\n**Date:** Date here\n**Time:** Time here\n**Location:** Channel or place here\n\nReact or reply if you are joining.",
    color: "#E67E22",
    footer: "Event details",
    fields: [
      { name: "Date", value: "Set date", inline: true },
      { name: "Time", value: "Set time", inline: true },
      { name: "Location", value: "Set location", inline: true },
    ],
  },
  warning: {
    label: "Warning Notice",
    emoji: "⚠️",
    title: "Warning",
    description:
      "This is an official notice for **{guildName}**.\n\nPlease make sure you follow the server rules.",
    color: "#ED4245",
    footer: "Moderator notice",
  },
};

function discordErrorCode(error) {
  return Number(error?.code || error?.rawError?.code || error?.data?.code || 0);
}
function discordErrorDetail(error) {
  return trim(
    error?.rawError?.message ||
      error?.data?.message ||
      error?.message ||
      "Discord rejected the request.",
    300,
  );
}
function embedOperationError(error, channelId, operation = "send") {
  const code = discordErrorCode(error);
  const detail = discordErrorDetail(error);
  if (code === 50001 || code === 50013) {
    return `❌ Discord denied access to <#${channelId}>. Recheck Goliath's effective channel and category permissions.`;
  }
  if (code === 50035) {
    return `❌ Discord rejected part of the embed or its buttons: ${detail}`;
  }
  if (code === 10008 && operation === "update") {
    return "⚠️ The original embed message no longer exists.";
  }
  return `❌ Discord could not ${operation} the embed${code ? ` (error ${code})` : ""}: ${detail}`;
}
function safeUrl(v) {
  try {
    const text = String(v || "").trim();
    if (!text) return undefined;
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? text : undefined;
  } catch {
    return undefined;
  }
}
function validHex(v) {
  return /^#[0-9A-F]{6}$/i.test(String(v || "").trim());
}
function normHex(v, fallback = PANEL_COLOR) {
  const text = String(v || "").trim();
  return validHex(text) ? text.toUpperCase() : fallback;
}
function isIconUrl(v) {
  return safeUrl(v);
}
function isImageUrl(v) {
  return safeUrl(v);
}
function extractMediaLines(text) {
  return { text: String(text || ""), media: [] };
}
function basePanel(template = "custom") {
  const t = clone(TEMPLATES[template] || TEMPLATES.custom);
  return {
    title: t.title || "",
    description: t.description || "",
    color: t.color || PANEL_COLOR,
    authorName: t.authorName || "",
    authorIcon: t.authorIcon || "",
    authorUrl: t.authorUrl || "",
    footer: t.footer || "",
    footerIcon: t.footerIcon || "",
    thumbnail: t.thumbnail || "",
    image: t.image || "",
    fields: clone(t.fields || []),
    buttons: clone(t.buttons || []),
  };
}
function sync(s) {
  const p = s.panels[s.selectedPanelIndex] || s.panels[0];
  return {
    ...s,
    title: p.title,
    description: p.description,
    color: p.color,
    authorName: p.authorName,
    authorIcon: p.authorIcon,
    authorUrl: p.authorUrl,
    footer: p.footer,
    footerIcon: p.footerIcon,
    thumbnail: p.thumbnail,
    image: p.image,
    fields: p.fields || [],
    buttons: p.buttons || [],
  };
}
function defaultState() {
  const p = basePanel("custom");
  return sync({
    template: "custom",
    selectedPreset: null,
    channelId: null,
    selectedPanelIndex: 0,
    panels: [p],
    allowUserPing: false,
    showTimestamp: true,
    hasUnsavedChanges: false,
    selectedFieldIndex: null,
    selectedButtonIndex: null,
    fieldLayout: "auto",
    deploymentKey: null,
  });
}

embedState.configure({ defaultState, sync, basePanel });

function allowedMentions(s) {
  return s.allowUserPing ? { parse: ["users", "roles"] } : { parse: [] };
}
function presetData(s) {
  return {
    template: s.template,
    panels: clone(s.panels),
    allowUserPing: !!s.allowUserPing,
    showTimestamp: !!s.showTimestamp,
    fieldLayout: s.fieldLayout || "auto",
  };
}
function normalizeInlineFields(fields = []) {
  return fields.map((field) => ({ ...field, inline: !!field.inline }));
}
function applyFieldLayout(fields = [], layout = "auto") {
  const normalized = normalizeInlineFields(fields);
  if (layout === "auto") return normalized;
  if (layout === "1") return normalized.map((f) => ({ ...f, inline: false }));
  return normalized.map((f) => ({ ...f, inline: true }));
}
function buildEmbedFromPanel(panelData, i, showTimestamp = true, fieldLayout = "auto") {
  const e = new EmbedBuilder();
  const title = replaceVars(panelData.title, i);
  const description = replaceVars(panelData.description, i);
  const authorName = replaceVars(panelData.authorName, i);
  const authorIcon = replaceVars(panelData.authorIcon, i);
  const authorUrl = replaceVars(panelData.authorUrl, i);
  const footer = replaceVars(panelData.footer, i);
  const footerIcon = replaceVars(panelData.footerIcon, i);
  const thumbnail = replaceVars(panelData.thumbnail, i);
  const image = replaceVars(panelData.image, i);
  if (title) e.setTitle(trim(title, 256));
  if (description) e.setDescription(trim(description, 4096));
  if (panelData.color && validHex(panelData.color)) e.setColor(panelData.color);
  if (authorName) {
    const author = { name: trim(authorName, 256) };
    if (safeUrl(authorIcon)) author.iconURL = authorIcon;
    if (safeUrl(authorUrl)) author.url = authorUrl;
    e.setAuthor(author);
  }
  if (footer) {
    const f = { text: trim(footer, 2048) };
    if (safeUrl(footerIcon)) f.iconURL = footerIcon;
    e.setFooter(f);
  }
  if (safeUrl(thumbnail)) e.setThumbnail(thumbnail);
  if (safeUrl(image)) e.setImage(image);
  const fields = applyFieldLayout(panelData.fields || [], fieldLayout).slice(0, 25);
  if (fields.length) e.addFields(fields.map((f) => ({ name: trim(replaceVars(f.name, i), 256), value: trim(replaceVars(f.value, i), 1024), inline: !!f.inline })));
  if (showTimestamp) e.setTimestamp();
  return e;
}
function buildPreviewEmbeds(s, i) {
  return s.panels.map((p) => buildEmbedFromPanel(p, i, s.showTimestamp, s.fieldLayout));
}
function buildPreviewEmbed(s, i) {
  return buildEmbedFromPanel(s.panels[s.selectedPanelIndex], i, s.showTimestamp, s.fieldLayout);
}
function buttonRows(s, i, offset = 0) {
  const rows = [];
  const buttons = (s.buttons || []).slice(offset, offset + MAX_BUTTONS);
  for (let idx = 0; idx < buttons.length; idx += 5) {
    const row = new ActionRowBuilder();
    buttons.slice(idx, idx + 5).forEach((b, j) => {
      const builder = new ButtonBuilder().setLabel(trim(replaceVars(b.label || "Button", i), 80)).setStyle(ButtonStyle[b.style] || ButtonStyle.Link);
      if (b.emoji) builder.setEmoji(b.emoji);
      if ((ButtonStyle[b.style] || ButtonStyle.Link) === ButtonStyle.Link) builder.setURL(safeUrl(replaceVars(b.url, i)) || "https://discord.com");
      else builder.setCustomId(b.id || `embed-action:${b.action || "custom"}:${j + offset}`);
      row.addComponents(builder);
    });
    rows.push(row);
  }
  return rows;
}
function buildEmbedPanel(interactionOrGuild, memberDisplayName = "Unknown User") {
  const fake = interactionOrGuild?.guild ? interactionOrGuild : { guild: interactionOrGuild, guildId: interactionOrGuild?.id, user: { id: "system" } };
  return buildEditorPanel(fake, memberDisplayName);
}
function mainEmbed(s, who) {
  return new EmbedBuilder()
    .setColor(s.color || PANEL_COLOR)
    .setTitle("✏️ Embed Studio")
    .setDescription([
      "**Build embeds with separate coloured panels in one Discord message.**",
      "",
      `> **Template:** ${(TEMPLATES[s.template] || TEMPLATES.custom).emoji} ${(TEMPLATES[s.template] || TEMPLATES.custom).label}`,
      `> **Preset:** ${s.selectedPreset ? `💾 ${s.selectedPreset}` : "None loaded"}`,
      `> **Channel:** ${s.channelId ? `<#${s.channelId}>` : "Not selected"}`,
      `> **Selected Panel:** ${s.selectedPanelIndex + 1}/${s.panels.length}`,
      `> **Panel Colour:** \`${s.color || PANEL_COLOR}\``,
      `> **Fields:** ${(s.fields || []).length}/25`,
      `> **Buttons:** ${(s.buttons || []).length}/20`,
      `> **Mentions:** ${s.allowUserPing ? "🔔 User ping enabled" : "🔕 Safe / no ping"}`,
      `> **Unsaved Changes:** ${s.hasUnsavedChanges ? "⚠️ Yes" : "✅ No"}`,
      "",
      "Server icon: use **Media → Small thumbnail URL** = `{guildIcon}`. Author/Footer icon fields also accept `{guildIcon}`.",
    ].join("\n"))
    .setFooter({ text: `Requested by ${who}` })
    .setTimestamp();
}
function buildEditorPanel(i, who = "Unknown User") {
  const s = getSession(i);
  return {
    embeds: [mainEmbed(s, who), ...buildPreviewEmbeds(s, i)],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("embed:template").setPlaceholder("🎨 Choose template").addOptions(Object.entries(TEMPLATES).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji, default: s.template === value }))),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId("embed:channel").setPlaceholder("📢 Choose channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("embed:color").setPlaceholder("🌈 Selected panel colour").addOptions([
          ...COLORS.map((c) => ({ label: c.label, value: c.value, emoji: c.emoji, default: s.color === c.value })),
          { label: "Custom HEX", value: CUSTOM_HEX_VALUE, emoji: "🎨", description: "Enter your own HEX colour" },
        ]),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("embed:panel-select").setPlaceholder("🧩 Select content panel").addOptions(s.panels.map((p, n) => ({
          label: `${n + 1}. ${trim(p.title || p.authorName || "Content Panel", 80)}`,
          value: String(n),
          description: trim(p.description || p.color, 100),
          default: s.selectedPanelIndex === n,
        }))),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:builder").setLabel("🛠️ Builder").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("embed:presets").setLabel("💾 Presets").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("embed:use").setLabel("✅ Use Embed").setStyle(ButtonStyle.Success),
      ),
    ],
  };
}
function simplePanel(title, desc, state, who) {
  return new EmbedBuilder().setColor(state.color || PANEL_COLOR).setTitle(title).setDescription(desc).setFooter({ text: `Requested by ${who}` }).setTimestamp();
}
function buildBuilderPanel(i, who = "Unknown User") {
  const s = getSession(i);
  return {
    embeds: [simplePanel("🛠️ Embed Builder", `Editing panel **${s.selectedPanelIndex + 1}/${s.panels.length}**.`, s, who), ...buildPreviewEmbeds(s, i)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:edit-content").setLabel("✏️ Content").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("embed:edit-media").setLabel("🖼️ Media").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("embed:fields").setLabel(`📋 Fields (${(s.fields || []).length})`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("embed:buttons").setLabel(`🔘 Buttons (${(s.buttons || []).length})`).setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:toggle-ping").setLabel(s.allowUserPing ? "🔔 Ping ON" : "🔕 Ping OFF").setStyle(s.allowUserPing ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("embed:toggle-timestamp").setLabel(s.showTimestamp ? "🕒 Timestamp ON" : "🕒 Timestamp OFF").setStyle(s.showTimestamp ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("embed:helpers").setLabel("📖 Variables").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:test-send").setLabel("🧪 Test").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("embed:update-existing").setLabel("♻️ Update Existing").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("embed:reset").setLabel("♻️ Reset").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("embed:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
function buildPanelsPanel(i, who) {
  const s = getSession(i);
  return {
    embeds: [simplePanel("🧩 Content Panels", `Selected **${s.selectedPanelIndex + 1}/${s.panels.length}**.`, s, who), ...buildPreviewEmbeds(s, i)],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("embed:panel-select").setPlaceholder("🧩 Select panel").addOptions(s.panels.map((p, n) => ({
          label: `${n + 1}. ${trim(p.title || "Content Panel", 80)}`,
          value: String(n),
          description: trim(p.description || p.color, 100),
          default: s.selectedPanelIndex === n,
        }))),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:panel-add").setLabel("➕ Add").setStyle(ButtonStyle.Success).setDisabled(s.panels.length >= MAX_PANELS),
        new ButtonBuilder().setCustomId("embed:panel-duplicate").setLabel("📋 Duplicate").setStyle(ButtonStyle.Secondary).setDisabled(s.panels.length >= MAX_PANELS),
        new ButtonBuilder().setCustomId("embed:panel-remove").setLabel("🗑️ Remove").setStyle(ButtonStyle.Danger).setDisabled(s.panels.length <= 1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed:panel-up").setLabel("⬆️ Up").setStyle(ButtonStyle.Secondary).setDisabled(s.selectedPanelIndex <= 0),
        new ButtonBuilder().setCustomId("embed:panel-down").setLabel("⬇️ Down").setStyle(ButtonStyle.Secondary).setDisabled(s.selectedPanelIndex >= s.panels.length - 1),
        new ButtonBuilder().setCustomId("embed:builder").setLabel("⬅️ Builder").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}
function buildFieldsPanel(i, who) {
  const s = getSession(i), rows = [];
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("embed:field-layout").setPlaceholder("Field Layout").addOptions([
      { label: "Auto", value: "auto", default: (s.fieldLayout || "auto") === "auto" },
      { label: "1 field per row", value: "1", default: s.fieldLayout === "1" },
      { label: "2 fields per row", value: "2", default: s.fieldLayout === "2" },
      { label: "3 fields per row", value: "3", default: s.fieldLayout === "3" },
    ]),
  ));
  if ((s.fields || []).length) rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("embed:field-select").setPlaceholder("📋 Select field").addOptions(s.fields.map((f, n) => ({
      label: `${n + 1}. ${trim(f.name || "Field", 80)}`,
      value: String(n),
      description: trim(f.value || "Value", 100),
      default: s.selectedFieldIndex === n,
    }))),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("embed:field-add").setLabel("➕ Add").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("embed:field-edit").setLabel("✏️ Edit").setStyle(ButtonStyle.Primary).setDisabled(!Number.isInteger(s.selectedFieldIndex)),
    new ButtonBuilder().setCustomId("embed:field-remove-selected").setLabel("🗑️ Remove").setStyle(ButtonStyle.Danger).setDisabled(!Number.isInteger(s.selectedFieldIndex)),
    new ButtonBuilder().setCustomId("embed:builder").setLabel("⬅️ Builder").setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [simplePanel("📋 Field Management", `Panel ${s.selectedPanelIndex + 1}/${s.panels.length} fields: ${(s.fields || []).length}/25`, s, who)],
    components: rows,
  };
}
function buildButtonsPanel(i, who) {
  const s = getSession(i), rows = [];
  if ((s.buttons || []).length) rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("embed:button-select").setPlaceholder("🔘 Select button").addOptions(s.buttons.map((b, n) => ({
      label: `${n + 1}. ${trim(b.label || "Button", 80)}`,
      value: String(n),
      description: trim(b.url || b.style || "Button", 100),
      default: s.selectedButtonIndex === n,
    }))),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("embed:button-add").setLabel("➕ Add").setStyle(ButtonStyle.Success).setDisabled((s.buttons || []).length >= MAX_BUTTONS),
    new ButtonBuilder().setCustomId("embed:button-edit").setLabel("✏️ Edit").setStyle(ButtonStyle.Primary).setDisabled(!Number.isInteger(s.selectedButtonIndex)),
    new ButtonBuilder().setCustomId("embed:button-remove-selected").setLabel("🗑️ Remove").setStyle(ButtonStyle.Danger).setDisabled(!Number.isInteger(s.selectedButtonIndex)),
    new ButtonBuilder().setCustomId("embed:builder").setLabel("⬅️ Builder").setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [simplePanel("🔘 Button Management", `Panel ${s.selectedPanelIndex + 1}/${s.panels.length} buttons: ${(s.buttons || []).length}/${MAX_BUTTONS}`, s, who)], components: rows };
}
function buildPresetsPanel(i, presets = {}, defaultName = null) {
  const s = getSession(i), rows = [];
  const entries = Object.entries(presets || {}).slice(0, 25);
  if (entries.length) rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("embed:preset-select").setPlaceholder("💾 Select preset").addOptions(entries.map(([name]) => ({ label: name.slice(0, 100), value: name.slice(0, 100), description: defaultName === name ? "Default preset" : "Saved preset", default: s.selectedPreset === name }))),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("embed:preset-load").setLabel("📂 Load").setStyle(ButtonStyle.Primary).setDisabled(!s.selectedPreset),
    new ButtonBuilder().setCustomId("embed:preset-save").setLabel("💾 Save Current").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("embed:preset-delete").setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger).setDisabled(!s.selectedPreset),
    new ButtonBuilder().setCustomId("embed:preset-default").setLabel("⭐ Set Default").setStyle(ButtonStyle.Secondary).setDisabled(!s.selectedPreset),
  ));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("embed:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)));
  return { embeds: [simplePanel("💾 Embed Presets", `Saved presets: ${entries.length}.\nDefault: ${defaultName || "None"}.`, s, memberName(i))], components: rows };
}
function buildHelpersPanel(i) {
  const s = getSession(i);
  return { embeds: [simplePanel("📖 Embed Variables", HELPERS.map((h) => `\`${h}\``).join("\n"), s, memberName(i))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("embed:builder").setLabel("⬅️ Builder").setStyle(ButtonStyle.Secondary))] };
}
function modal(id, title, inputs) {
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(...inputs.map((input) => new ActionRowBuilder().addComponents(input)));
}
function input(id, label, style, value = "", required = false, max) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setValue(trim(value, max || 4000));
  if (max) t.setMaxLength(max);
  return t;
}
function contentModal(s) {
  return modal(`embed:save-content:${Date.now()}`, "Edit Panel Text", [
    input("title", "Panel title", TextInputStyle.Short, s.title, false, 256),
    input("description", "Panel message/content", TextInputStyle.Paragraph, s.description, false, 4000),
    input("authorName", "Author name", TextInputStyle.Short, s.authorName, false, 256),
    input("footer", "Footer text", TextInputStyle.Short, s.footer, false, 2048),
  ]);
}
function mediaModal(s) {
  return modal(`embed:save-media:${Date.now()}`, "Edit Panel Media", [
    input("authorIcon", "Author logo URL / variable", TextInputStyle.Short, s.authorIcon),
    input("thumbnail", "Small thumbnail URL / variable", TextInputStyle.Short, s.thumbnail),
    input("image", "Large banner/image URL", TextInputStyle.Short, s.image),
    input("authorUrl", "Author clickable URL", TextInputStyle.Short, s.authorUrl),
    input("footerIcon", "Footer icon URL / variable", TextInputStyle.Short, s.footerIcon),
  ]);
}
function fieldModal(s, n = null) {
  const f = Number.isInteger(n) ? s.fields[n] : {};
  return modal(Number.isInteger(n) ? `embed:field-save:${n}` : "embed:field-save-new", Number.isInteger(n) ? "Edit Field" : "Add Field", [
    input("name", "Field name", TextInputStyle.Short, f.name, true, 256),
    input("value", "Field value", TextInputStyle.Paragraph, f.value, true, 1024),
    input("layout", "Inline? yes/no", TextInputStyle.Short, f.inline ? "yes" : "no", false, 10),
  ]);
}
function buttonModal(s, n = null) {
  const b = Number.isInteger(n) ? s.buttons[n] : { style: "Link" };
  return modal(Number.isInteger(n) ? `embed:button-save:${n}` : "embed:button-save-new", Number.isInteger(n) ? "Edit Button" : "Add Button", [
    input("label", "Button Label", TextInputStyle.Short, b.label, true, 80),
    input("emoji", "Emoji", TextInputStyle.Short, b.emoji, false, 20),
    input("style", "Style", TextInputStyle.Short, b.style || "Link"),
    input("url", "URL", TextInputStyle.Short, b.url),
  ]);
}
function colorModal(s) {
  return modal("embed:save-color", "Custom HEX Colour", [input("hex", "HEX colour", TextInputStyle.Short, s.color || PANEL_COLOR, true, 7)]);
}
function presetModal(s) {
  return modal("embed:preset-save-modal", "Save Embed Preset", [input("name", "Preset name", TextInputStyle.Short, s.selectedPreset || "", true, 50)]);
}

module.exports = {
  clone,
  trim,
  discordErrorCode,
  discordErrorDetail,
  embedOperationError,
  safeUrl,
  validHex,
  normHex,
  fmtDate,
  fmtTs,
  avatar,
  guildIcon,
  guildBanner,
  memberName,
  displayName,
  refreshGuild,
  sessionKey,
  replaceVars,
  isIconUrl,
  isImageUrl,
  extractMediaLines,
  basePanel,
  sync,
  saveSelected,
  defaultState,
  getSession,
  saveSession,
  markUnsaved,
  clearUnsaved,
  resetSession,
  allowedMentions,
  presetData,
  applyTemplate,
  applyPreset,
  setDefault,
  normalizeInlineFields,
  applyFieldLayout,
  buildEmbedFromPanel,
  buildPreviewEmbeds,
  buildPreviewEmbed,
  buttonRows,
  buildEmbedPanel,
  mainEmbed,
  buildEditorPanel,
  simplePanel,
  buildBuilderPanel,
  buildPanelsPanel,
  buildFieldsPanel,
  buildButtonsPanel,
  buildPresetsPanel,
  buildHelpersPanel,
  modal,
  input,
  contentModal,
  mediaModal,
  fieldModal,
  buttonModal,
  colorModal,
  presetModal,
  PANEL_COLOR,
  CUSTOM_HEX_VALUE,
  MAX_PANELS,
  MAX_BUTTONS,
  COLORS,
  TEMPLATES,
  HELPERS,
};
