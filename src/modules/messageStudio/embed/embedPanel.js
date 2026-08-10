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

const guildManager = require("../../../core/guild/guildManager");
const {
  validateChannelAccess,
} = require("../../../core/security/goliathPermissionGuard");

const PANEL_COLOR = "#5865F2";
const CUSTOM_HEX_VALUE = "__custom_hex__";
const MAX_PANELS = 10;
const MAX_BUTTONS = 20;
const sessions = new Map();

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

const HELPERS = [
  "{userId}",
  "{userTag}",
  "{userName}",
  "{userGlobalName}",
  "{userMention}",
  "{userNoPing}",
  "{userAvatar}",
  "{userServerAvatar}",
  "{userNickname}",
  "{userDisplay}",
  "{userCreatedAt}",
  "{userCreatedTimestamp}",
  "{userJoinedAt}",
  "{userJoinedTimestamp}",
  "{createdAt}",
  "{joinedAt}",
  "{leftAt}",
  "{timestamp}",
  "{accountAge}",
  "{membershipDuration}",
  "{departureIcon}",
  "{departureType}",
  "{departureLabel}",
  "{departureReason}",
  "{departureModerator}",
  "{departureModeratorId}",
  "{nowTimestamp}",
  "{successEmoji}",
  "{warningEmoji}",
  "{errorEmoji}",
  "{proofVerifiedEmoji}",
  "{successColor}",
  "{warningColor}",
  "{errorColor}",
  "{proofVerifiedColor}",
  "{guildId}",
  "{guildName}",
  "{server}",
  "{guildIcon}",
  "{serverIcon}",
  "{guildBanner}",
  "{guildMemberCount}",
  "{memberCount}",
  "{guildVanityCode}",
];

function clone(v) {
  return JSON.parse(JSON.stringify(v || {}));
}
function trim(v, max = 4096) {
  v = String(v || "");
  return v.length > max ? `${v.slice(0, max - 3)}...` : v;
}
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
  return /^#?[0-9A-Fa-f]{6}$/.test(String(v || "").trim());
}
function normHex(v) {
  return `#${String(v || "")
    .trim()
    .replace("#", "")
    .toUpperCase()}`;
}
function fmtDate(v) {
  try {
    return v ? new Date(v).toLocaleString() : "";
  } catch {
    return "";
  }
}
function fmtTs(v) {
  const s = Math.floor(Number(v) / 1000);
  return Number.isFinite(s) ? `<t:${s}:R>` : "";
}
function avatar(e) {
  return e?.displayAvatarURL?.({ extension: "png", size: 256 }) || "";
}
function guildIcon(g) {
  return g?.iconURL?.({ extension: "png", size: 256 }) || "";
}
function guildBanner(g) {
  return g?.bannerURL?.({ extension: "png", size: 1024 }) || "";
}
function memberName(i) {
  return (
    i.member?.displayName ||
    i.user?.displayName ||
    i.user?.username ||
    "Unknown User"
  );
}
function displayName(i) {
  return (
    i.member?.displayName ||
    i.user?.globalName ||
    i.user?.displayName ||
    i.user?.username ||
    "User"
  );
}
function refreshGuild(id) {
  if (typeof guildManager.reloadGuild === "function")
    guildManager.reloadGuild(id);
}
function sessionKey(i) {
  return `${i.guildId}:${i.user.id}`;
}

function replaceVars(text, i) {
  const user = i.user || {},
    member = i.member || {},
    guild = i.guild || {};
  const userId = user.id || "",
    userAvatar = avatar(user),
    serverAvatar = avatar(member) || userAvatar;
  const icon = guildIcon(guild),
    banner = guildBanner(guild),
    now = `<t:${Math.floor(Date.now() / 1000)}:R>`;
  const vars = {
    userId,
    userid: userId,
    userTag: user.tag || user.username || "User",
    usertag: user.tag || user.username || "User",
    userName: user.username || "User",
    username: user.username || "User",
    userGlobalName: user.globalName || user.username || "User",
    userglobalname: user.globalName || user.username || "User",
    userMention: userId ? `<@${userId}>` : "",
    usermention: userId ? `<@${userId}>` : "",
    userNoPing: userId ? `<@${userId}>` : "",
    usernoping: userId ? `<@${userId}>` : "",
    user: userId ? `<@${userId}>` : "",
    userAvatar,
    useravatar: userAvatar,
    useravatarurl: userAvatar,
    userServerAvatar: serverAvatar,
    userserveravatar: serverAvatar,
    userserveravatarurl: serverAvatar,
    userNickname: member.nickname || displayName(i),
    usernickname: member.nickname || displayName(i),
    userDisplay: displayName(i),
    userdisplay: displayName(i),
    userdisplayname: displayName(i),
    userCreatedAt: fmtDate(user.createdAt),
    usercreatedat: fmtDate(user.createdAt),
    userCreatedTimestamp: fmtTs(user.createdTimestamp),
    usercreatedtimestamp: fmtTs(user.createdTimestamp),
    userJoinedAt: fmtDate(member.joinedAt),
    userjoinedat: fmtDate(member.joinedAt),
    userJoinedTimestamp: fmtTs(member.joinedTimestamp),
    userjoinedtimestamp: fmtTs(member.joinedTimestamp),
    createdAt: fmtTs(user.createdTimestamp) || "Unknown",
    createdat: fmtTs(user.createdTimestamp) || "Unknown",
    joinedAt: fmtTs(member.joinedTimestamp) || "Unknown",
    joinedat: fmtTs(member.joinedTimestamp) || "Unknown",
    leftAt: now,
    leftat: now,
    timestamp: now,
    accountAge: "4 years, 2 months",
    accountage: "4 years, 2 months",
    membershipDuration: "1 year, 8 months",
    membershipduration: "1 year, 8 months",
    departureIcon: "👋",
    departureicon: "👋",
    departureType: "left",
    departuretype: "left",
    departureLabel: "Left Voluntarily",
    departurelabel: "Left Voluntarily",
    departureReason: "No reason — the member left voluntarily.",
    departurereason: "No reason — the member left voluntarily.",
    departureModerator: "Not applicable",
    departuremoderator: "Not applicable",
    departureModeratorId: "",
    departuremoderatorid: "",
    nowTimestamp: now,
    nowtimestamp: now,
    successEmoji: "✅",
    successem...