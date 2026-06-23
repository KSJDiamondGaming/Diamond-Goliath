// functions/embed/embedPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeploymentStore');

const guildManager = require('../../../guild/guildManager');
const PANEL_COLOR = '#5865F2';
const CUSTOM_HEX_VALUE = '__custom_hex__';

const sessions = new Map();

const COLORS = [
  { label: 'Deep Blue', value: '#2F80ED', emoji: '🔷' },
  { label: 'Royal Blue', value: '#4169E1', emoji: '🔵' },
  { label: 'Sky Blue', value: '#00BFFF', emoji: '🩵' },
  { label: 'Electric Blue', value: '#007BFF', emoji: '⚡' },
  { label: 'Cyan', value: '#00D4FF', emoji: '💧' },
  { label: 'Teal', value: '#1ABC9C', emoji: '🌊' },
  { label: 'Green', value: '#57F287', emoji: '🟢' },
  { label: 'Emerald', value: '#2ECC71', emoji: '💚' },
  { label: 'Lime', value: '#BFFF00', emoji: '🍏' },
  { label: 'Yellow', value: '#FEE75C', emoji: '🟡' },
  { label: 'Gold', value: '#FFD700', emoji: '🏆' },
  { label: 'Amber', value: '#FFC107', emoji: '🌟' },
  { label: 'Orange', value: '#E67E22', emoji: '🟠' },
  { label: 'Dark Orange', value: '#FF8C00', emoji: '🔥' },
  { label: 'Red', value: '#ED4245', emoji: '🔴' },
  { label: 'Crimson', value: '#DC143C', emoji: '❤️' },
  { label: 'Rose', value: '#FF4D6D', emoji: '🌹' },
  { label: 'Discord Blurple', value: '#5865F2', emoji: '🔮' },
  { label: 'Purple', value: '#9B59B6', emoji: '🟣' },
  { label: 'Violet', value: '#8A2BE2', emoji: '🪻' },
  { label: 'Pink', value: '#EB459E', emoji: '🌸' },
  { label: 'Hot Pink', value: '#FF69B4', emoji: '💖' },
  { label: 'Dark', value: '#2B2D31', emoji: '⬛' },
  { label: 'White', value: '#FFFFFF', emoji: '🤍' },
];

const TEMPLATES = {
  custom: {
    label: 'Custom Embed',
    emoji: '🛠️',
    title: 'Custom Embed',
    description: 'Edit this embed for your server.',
    color: '#5865F2',
    authorName: '',
    authorIcon: '',
    authorUrl: '',
    footer: '',
    footerIcon: '',
    image: '',
    thumbnail: '',
    fields: [],

buttons: [],
  },

  welcome: {
    label: 'Welcome Message',
    emoji: '🤗',
    title: '',
    description: [
      '🎉 **Welcome to {guildName},**',
      '**{userMention}**',
      '',
      '👤 You are member **#{guildMemberCount}**.',
      '',
      'Enjoy your stay!',
    ].join('\n'),
    color: '#57F287',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Member joined',
    image: '',
    thumbnail: '{userAvatar}',
    fields: [],

buttons: [],
  },

  leave: {
    label: 'Leave Message',
    emoji: '👋',
    title: '',
    description: [
      '{userMention}',
      '',
      '👋 **{userDisplay}** has left **{guildName}**.',
      '',
      '📉 We now have **{guildMemberCount}** members.',
    ].join('\n'),
    color: '#ED4245',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Member left',
    image: '',
    thumbnail: '{userAvatar}',
    fields: [],

buttons: [],
  },

  announcement: {
    label: 'Announcement',
    emoji: '📢',
    title: 'Announcement',
    description: [
      'A new announcement has been posted for **{guildName}**.',
      '',
      'Write your announcement here.',
    ].join('\n'),
    color: '#5865F2',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Announcement',
    image: '',
    thumbnail: '{guildIcon}',
    fields: [],

buttons: [],
  },

  rules: {
    label: 'Rules',
    emoji: '📜',
    title: 'Server Rules',
    description: [
      'Please read and follow the rules for **{guildName}**.',
      '',
      '**1. Be respectful**',
      'Treat everyone with respect.',
      '',
      '**2. No spam**',
      'Do not spam messages, links, emojis, or mentions.',
      '',
      '**3. Keep it appropriate**',
      'Keep conversations safe and suitable for the server.',
      '',
      '**4. No advertising**',
      'Do not advertise without permission.',
      '',
      '**5. Follow Discord Terms**',
      'Follow Discord’s Terms of Service and Community Guidelines.',
    ].join('\n'),
    color: '#5865F2',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Please follow the rules',
    image: '',
    thumbnail: '',
    fields: [],

buttons: [],
  },

  suggestion: {
    label: 'Suggestion',
    emoji: '💡',
    title: 'New Suggestion',
    description: [
      '**Suggestion:**',
      'Write the suggestion here.',
      '',
      '**Status:** Pending review',
    ].join('\n'),
    color: '#FEE75C',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Suggestion system',
    image: '',
    thumbnail: '',
    fields: [
      { name: 'Status', value: 'Pending', inline: true },
      { name: 'Votes', value: 'Waiting for votes', inline: true },
    ],

    buttons: [],
  },

  giveaway: {
    label: 'Giveaway',
    emoji: '🎉',
    title: 'Giveaway',
    description: [
      '**Prize:** Your prize here',
      '**Winners:** 1',
      '**Ends:** Soon',
      '',
      'Enter the giveaway for a chance to win.',
    ].join('\n'),
    color: '#9B59B6',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Good luck!',
    image: '',
    thumbnail: '',
    fields: [
      { name: 'Prize', value: 'Your prize here', inline: true },
      { name: 'Winners', value: '1', inline: true },
      { name: 'Ends', value: 'Soon', inline: true },
    ],
    buttons: [],
  },

  update: {
    label: 'Update Post',
    emoji: '📰',
    title: 'Server Update',
    description: [
      'A new update has been posted for **{guildName}**.',
      '',
      '**What changed:**',
      '- Add update here',
      '- Add update here',
      '- Add update here',
    ].join('\n'),
    color: '#3498DB',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Update notice',
    image: '',
    thumbnail: '',
    fields: [],

buttons: [],
  },

  event: {
    label: 'Event',
    emoji: '📅',
    title: 'Server Event',
    description: [
      'A new event is happening in **{guildName}**.',
      '',
      '**Event:** Event name',
      '**Date:** Date here',
      '**Time:** Time here',
      '**Location:** Channel or place here',
      '',
      'React or reply if you are joining.',
    ].join('\n'),
    color: '#E67E22',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Event details',
    image: '',
    thumbnail: '',
    fields: [
      { name: 'Date', value: 'Set date', inline: true },
      { name: 'Time', value: 'Set time', inline: true },
      { name: 'Location', value: 'Set location', inline: true },
    ],

    buttons: [],
  },

  warning: {
    label: 'Warning Notice',
    emoji: '⚠️',
    title: 'Warning',
    description: [
      'This is an official notice for **{guildName}**.',
      '',
      'Please make sure you follow the server rules.',
    ].join('\n'),
    color: '#ED4245',
    authorName: '{guildName}',
    authorIcon: '{guildIcon}',
    footer: 'Moderator notice',
    image: '',
    thumbnail: '',
    fields: [],

buttons: [],
  },
};

const HELPER_VARIABLES = [
  { name: '{userId}', desc: 'User ID' },
  { name: '{userTag}', desc: 'User tag/name' },
  { name: '{userName}', desc: 'Username' },
  { name: '{userGlobalName}', desc: 'Global display name' },
  { name: '{userMention}', desc: 'Clickable user mention' },
  { name: '{userNoPing}', desc: 'Mention style, safe with Ping OFF' },
  { name: '{guildIcon}', desc: 'User avatar URL' },
  { name: '{userServerAvatar}', desc: 'Server avatar URL' },
  { name: '{userNickname}', desc: 'Server nickname' },
  { name: '{userDisplay}', desc: 'Display name' },
  { name: '{userCreatedAt}', desc: 'Account created date' },
  { name: '{userCreatedTimestamp}', desc: 'Account created Discord timestamp' },
  { name: '{userJoinedAt}', desc: 'Server joined date' },
  { name: '{userJoinedTimestamp}', desc: 'Server joined Discord timestamp' },
  { name: '{nowTimestamp}', desc: 'Current Discord timestamp' },
  { name: '{successEmoji}', desc: 'Success emoji' },
  { name: '{warningEmoji}', desc: 'Warning emoji' },
  { name: '{errorEmoji}', desc: 'Error emoji' },
  { name: '{proofVerifiedEmoji}', desc: 'Verified emoji' },
  { name: '{successColor}', desc: 'Success colour' },
  { name: '{warningColor}', desc: 'Warning colour' },
  { name: '{errorColor}', desc: 'Error colour' },
  { name: '{proofVerifiedColor}', desc: 'Verified colour' },
  { name: '{guildId}', desc: 'Server ID' },
  { name: '{guildName}', desc: 'Server name' },
  { name: '{server}', desc: 'Server name shortcut' },
  { name: '{guildIcon}', desc: 'Server icon URL' },
  { name: '{serverIcon}', desc: 'Server icon URL shortcut' },
  { name: '{guildBanner}', desc: 'Server banner URL' },
  { name: '{guildMemberCount}', desc: 'Server member count' },
  { name: '{memberCount}', desc: 'Member count shortcut' },
  { name: '{guildVanityCode}', desc: 'Server vanity code' },
];

/* ---------------- BASIC HELPERS ---------------- */

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function refreshGuild(guildId) {
  if (typeof guildManager.reloadGuild === 'function') {
    guildManager.reloadGuild(guildId);
  }
}

function getSessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function getUserDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.globalName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'User'
  );
}

function trim(text, max = 4096) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function safeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;

  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? text : undefined;
  } catch {
    return undefined;
  }
}

function isValidHexColor(value) {
  return /^#?[0-9A-Fa-f]{6}$/.test(String(value || '').trim());
}

function normalizeHexColor(value) {
  const text = String(value || '').trim().replace('#', '').toUpperCase();
  return `#${text}`;
}

function formatDate(value) {
  if (!value) return '';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';

  const seconds = Math.floor(Number(timestamp) / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:R>` : '';
}

function getUserAvatar(user) {
  return (
    user?.displayAvatarURL?.({
      extension: 'png',
      size: 256,
    }) || ''
  );
}

function getMemberAvatar(member, fallback = '') {
  return (
    member?.displayAvatarURL?.({
      extension: 'png',
      size: 256,
    }) || fallback
  );
}

function getGuildIcon(guild) {
  return (
    guild?.iconURL?.({
      extension: 'png',
      size: 256,
    }) || ''
  );
}

function getGuildBanner(guild) {
  return (
    guild?.bannerURL?.({
      extension: 'png',
      size: 1024,
    }) || ''
  );
}

function replaceAllVariables(text, variables) {
  let output = String(text || '');

  Object.entries(variables).forEach(([key, value]) => {
    output = output.replaceAll(key, value ?? '');
  });

  return output;
}

function resolvePreviewText(text, interaction) {
  const user = interaction.user || {};
  const member = interaction.member || {};
  const guild = interaction.guild || {};

  const userId = user.id || '';
  const username = user.username || 'User';
  const userTag = user.tag || username;
  const userDisplay = getUserDisplayName(interaction);

  const userAvatar = getUserAvatar(user);
  const userServerAvatar = getMemberAvatar(member, userAvatar);
  const guildIcon = getGuildIcon(guild);
  const guildBanner = getGuildBanner(guild);

  const userCreatedAt = formatDate(user.createdAt);
  const userCreatedTimestamp = formatTimestamp(user.createdTimestamp);
  const userJoinedAt = formatDate(member.joinedAt);
  const userJoinedTimestamp = formatTimestamp(member.joinedTimestamp);
  const nowTimestamp = `<t:${Math.floor(Date.now() / 1000)}:R>`;

  return replaceAllVariables(text, {
    '{userId}': userId,
    '{userid}': userId,
    '{userTag}': userTag,
    '{usertag}': userTag,
    '{userName}': username,
    '{username}': username,
    '{userGlobalName}': user.globalName || username,
    '{userglobalnickname}': user.globalName || username,
    '{userMention}': userId ? `<@${userId}>` : '',
    '{usermention}': userId ? `<@${userId}>` : '',
    '{userNoPing}': userId ? `<@${userId}>` : '',
    '{user}': userId ? `<@${userId}>` : '',
    '{userAvatar}': userAvatar,
    '{useravatarurl}': userAvatar,
    '{userServerAvatar}': userServerAvatar,
    '{userserveravatarurl}': userServerAvatar,
    '{userNickname}': member.nickname || userDisplay,
    '{usernickname}': member.nickname || userDisplay,
    '{userDisplay}': userDisplay,
    '{userdisplayname}': userDisplay,
    '{userCreatedAt}': userCreatedAt,
    '{usercreatedat}': userCreatedAt,
    '{userCreatedTimestamp}': userCreatedTimestamp,
    '{usercreatedtimestamp}': userCreatedTimestamp,
    '{userJoinedAt}': userJoinedAt,
    '{userjoinedat}': userJoinedAt,
    '{userJoinedTimestamp}': userJoinedTimestamp,
    '{userjoinedtimestamp}': userJoinedTimestamp,
    '{nowTimestamp}': nowTimestamp,
    '{nowtimestamp}': nowTimestamp,
    '{successEmoji}': '✅',
    '{succesemoji}': '✅',
    '{warningEmoji}': '⚠️',
    '{warningemoji}': '⚠️',
    '{errorEmoji}': '❌',
    '{erroremoji}': '❌',
    '{proofVerifiedEmoji}': '💎',
    '{proofverifiedemoji}': '💎',
    '{successColor}': '#57F287',
    '{successcolor}': '#57F287',
    '{warningColor}': '#FEE75C',
    '{warningcolor}': '#FEE75C',
    '{errorColor}': '#ED4245',
    '{errorcolor}': '#ED4245',
    '{proofVerifiedColor}': '#00D4FF',
    '{proofverifiedcolor}': '#00D4FF',
    '{guildId}': guild.id || '',
    '{guildid}': guild.id || '',
    '{guildName}': guild.name || 'Server',
    '{guildname}': guild.name || 'Server',
    '{server}': guild.name || 'Server',
    '{guildIcon}': guildIcon,
    '{guildiconurl}': guildIcon,
    '{serverIcon}': guildIcon,
    '{guildBanner}': guildBanner,
    '{guildbannerurl}': guildBanner,
    '{guildMemberCount}': String(guild.memberCount || 0),
    '{guildmembercount}': String(guild.memberCount || 0),
    '{memberCount}': String(guild.memberCount || 0),
    '{guildVanityCode}': guild.vanityURLCode || '',
    '{guildvanitycode}': guild.vanityURLCode || '',
  });
}

function markUnsaved(interaction, nextState) {
  const current = getSession(interaction);

  return saveSession(interaction, {
    ...current,
    ...(nextState || {}),
    hasUnsavedChanges: true,
  });
}

function clearUnsaved(interaction, nextState) {
  const current = getSession(interaction);

  return saveSession(interaction, {
    ...current,
    ...(nextState || {}),
    hasUnsavedChanges: false,
  });
}

function getAllowedMentionsForState(state, interaction) {
  if (state.allowUserPing) {
    return {
      users: [interaction.user.id],
      roles: [],
      repliedUser: false,
    };
  }

  return {
    parse: [],
    repliedUser: false,
  };
}

/* ---------------- SESSION ---------------- */

function getDefaultState() {
  return {
    openedFromAdmin: false,
    template: 'custom',
    selectedPreset: null,
    pendingPresetName: null,
    showTimestamp: true,
    selectedFieldIndex: null,
    channelId: null,
    hasUnsavedChanges: false,
    allowUserPing: false,

    title: TEMPLATES.custom.title,
    description: TEMPLATES.custom.description,
    color: TEMPLATES.custom.color,

    authorName: '',
    authorIcon: '',
    authorUrl: '',
    footer: '',
    footerIcon: '',
    image: '',
    thumbnail: '',

    fields: [],

    buttons: [],
    selectedButtonIndex: null,
  };
}

function getSession(interaction) {
  const key = getSessionKey(interaction);

  if (!sessions.has(key)) {
    sessions.set(key, getDefaultState());
  }

  return sessions.get(key);
}

function saveSession(interaction, state) {
  sessions.set(getSessionKey(interaction), state);
  return state;
}

function resetSession(interaction) {
  return saveSession(interaction, getDefaultState());
}

function getPresetDataFromState(state) {
  return {
    template: state.template || 'custom',
    channelId: state.channelId || null,
    allowUserPing: Boolean(state.allowUserPing),
    showTimestamp: state.showTimestamp !== false,

    title: state.title || '',
    description: state.description || '',
    color: state.color || PANEL_COLOR,

    authorName: state.authorName || '',
    authorIcon: state.authorIcon || '',
    authorUrl: state.authorUrl || '',
    footer: state.footer || '',
    footerIcon: state.footerIcon || '',
    image: state.image || '',
    thumbnail: state.thumbnail || '',

    fields: Array.isArray(state.fields) ? clone(state.fields) : [],

    buttons: Array.isArray(state.buttons) ? clone(state.buttons) : [],
  };
}

function applyPresetToSession(interaction, presetName, preset) {
  const current = getSession(interaction);

  return clearUnsaved(interaction, {
    ...current,
    template: preset.template || 'custom',
    selectedPreset: presetName,
    pendingPresetName: null,
    selectedFieldIndex: null,
    channelId: preset.channelId || current.channelId || null,
    allowUserPing: Boolean(preset.allowUserPing),
    showTimestamp: preset.showTimestamp !== false,

    title: preset.title || '',
    description: preset.description || '',
    color: preset.color || PANEL_COLOR,

    authorName: preset.authorName || '',
    authorIcon: preset.authorIcon || '',
    authorUrl: preset.authorUrl || '',
    footer: preset.footer || '',
    footerIcon: preset.footerIcon || '',
    image: preset.image || '',
    thumbnail: preset.thumbnail || '',

    fields: Array.isArray(preset.fields) ? clone(preset.fields) : [],

    buttons: Array.isArray(preset.buttons) ? clone(preset.buttons) : [],

    selectedButtonIndex: null,
  });
}

function applyTemplate(interaction, templateKey) {
  const template = TEMPLATES[templateKey] || TEMPLATES.custom;
  const current = getSession(interaction);

  return saveSession(interaction, {
    template: templateKey,
    selectedPreset: null,
    selectedFieldIndex: null,
    channelId: current.channelId || null,
    hasUnsavedChanges: true,
    allowUserPing: Boolean(current.allowUserPing),

    title: template.title || '',
    description: template.description || '',
    color: template.color || PANEL_COLOR,

    authorName: template.authorName || '',
    authorIcon: template.authorIcon || '',
    authorUrl: template.authorUrl || '',
    footer: template.footer || '',
    footerIcon: template.footerIcon || '',
    image: template.image || '',
    thumbnail: template.thumbnail || '',

    fields: Array.isArray(template.fields) 
    ? clone(template.fields) : [],

    buttons: Array.isArray(template.buttons)
    ? clone(template.buttons)
    : [],

    selectedButtonIndex: null,
  });
}

/* ---------------- EMBED BUILDERS ---------------- */

function buildPreviewEmbed(state, interaction) {
  const embed = new EmbedBuilder().setColor(state.color || PANEL_COLOR);

  const authorName = trim(resolvePreviewText(state.authorName, interaction), 256);
  const authorIconUrl = safeUrl(resolvePreviewText(state.authorIcon, interaction));
  const authorUrl = safeUrl(resolvePreviewText(state.authorUrl, interaction));

  const resolvedAuthorName =
  authorName ||
  (state.template === 'welcome'
    ? `Welcome to ${interaction.guild?.name || 'the server'}`
    : 'Live Embed Preview');

  const resolvedAuthorIcon = authorIconUrl;

  embed.setAuthor({
    name: resolvedAuthorName,
    ...(resolvedAuthorIcon ? { iconURL: resolvedAuthorIcon } : {}),
    ...(authorUrl ? { url: authorUrl } : {}),
  });

  if (state.title) {
    embed.setTitle(trim(resolvePreviewText(state.title, interaction), 256));
  }

  if (state.description) {
  embed.setDescription(
    trim(resolvePreviewText(state.description, interaction), 4096)
  );
}

const footerText = trim(
  typeof state.footer === 'string'
    ? resolvePreviewText(state.footer, interaction)
    : '',
  2048
);

const footerIconUrl = safeUrl(
  typeof state.footerIcon === 'string'
    ? resolvePreviewText(state.footerIcon, interaction)
    : ''
);

if (footerText) {
  embed.setFooter({
    text: footerText,
    ...(footerIconUrl ? { iconURL: footerIconUrl } : {}),
  });
}

const imageUrl = safeUrl(resolvePreviewText(state.image, interaction));
if (imageUrl) embed.setImage(imageUrl);

  const thumbnailUrl = safeUrl(
    resolvePreviewText(state.thumbnail, interaction)
  );

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  const safeFields = Array.isArray(state.fields) ? state.fields.slice(0, 25) : [];

  if (safeFields.length) {
    embed.addFields(
      safeFields
        .filter((field) => field?.name && field?.value)
        .map((field) => ({
          name: trim(resolvePreviewText(field.name, interaction), 256),
          value: trim(resolvePreviewText(field.value, interaction), 1024),
          inline: Boolean(field.inline),
        }))
    );
  }

  if (state.showTimestamp !== false) {
  embed.setTimestamp();
}

return embed;
}

function normaliseButtonStyle(style) {
  const value = String(style || 'Primary').toLowerCase();

  if (value === 'secondary') return ButtonStyle.Secondary;
  if (value === 'success') return ButtonStyle.Success;
  if (value === 'danger') return ButtonStyle.Danger;
  if (value === 'link') return ButtonStyle.Link;

  return ButtonStyle.Primary;
}

function buildButtonComponents(state) {
  const buttons = Array.isArray(state.buttons)
  ? state.buttons.slice(0, 20)
  : [];

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder();

    buttons.slice(i, i + 5).forEach((button, index) => {
      const style = normaliseButtonStyle(button.style);

      const builder = new ButtonBuilder()
        .setLabel(trim(button.label || 'Button', 80))
        .setStyle(style);

      if (button.emoji) {
        builder.setEmoji(button.emoji);
      }

      const url = safeUrl(button.url);

      if (url) {
        builder
          .setStyle(ButtonStyle.Link)
          .setURL(url);
      } else {
        builder
          .setCustomId(
            button.id ||
            `embed-action:${button.action || 'custom'}:${i + index}`
          );
    }

      row.addComponents(builder);
    });

    rows.push(row);
  }

  return rows;
}

function buildPanelEmbed(state, interaction, memberDisplayName) {
  const template = TEMPLATES[state.template] || TEMPLATES.custom;

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🎨 Embed Studio')
    .setDescription('Create, edit and activate embeds for this server.')
    .addFields(
      {
        name: 'Template',
        value: `${template.emoji} ${template.label}`,
        inline: true,
      },
      {
        name: 'Preset',
        value: state.selectedPreset ? `💾 ${state.selectedPreset}` : 'Not loaded',
        inline: true,
      },
      {
        name: 'Mentions',
        value: state.allowUserPing ? 'Ping: ON' : 'Ping: OFF',
        inline: true,
      },
      {
        name: 'Channel',
        value: state.channelId ? `<#${state.channelId}>` : 'Not selected',
        inline: true,
      },
      {
        name: 'Colour',
        value: `\`${state.color || PANEL_COLOR}\``,
        inline: true,
      },
      {
        name: 'Fields',
        value: `${state.fields?.length || 0}/25`,
        inline: true,
      },
      {
        name: 'Selected Field',
        value: selectedField
          ? `${selectedField.name}\nInline: ${selectedField.inline ? 'Yes' : 'No'}`
          : 'None',
        inline: false,
      }
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();
}

function buildEmbedPanel(interactionOrGuild, memberDisplayName = 'Unknown User') {
  const fakeInteraction = interactionOrGuild?.guild
    ? interactionOrGuild
    : {
        guild: interactionOrGuild,
        guildId: interactionOrGuild?.id,
        user: { id: 'system', username: memberDisplayName },
      };

  const state = getSession(fakeInteraction);

  const payload = buildEditorPanel(fakeInteraction, memberDisplayName);

  return {
    embeds: payload.embeds,
    components: payload.components,
  };
}

/* ---------------- EDITOR PANEL ---------------- */
function getUseButtonLabel(templateKey) {
  const labels = {
    welcome: '✅ Use Welcome',
    leave: '✅ Use Leave',
    announcement: '✅ Use Announcement',
    rules: '✅ Use Rules',
    suggestion: '✅ Use Suggestion',
    giveaway: '✅ Use Giveaway',
    update: '✅ Use Update',
    event: '✅ Use Event',
    warning: '✅ Use Warning',
    custom: '✅ Use Embed',
  };

  return labels[templateKey] || '✅ Use Embed';
}

function getAutoPresetName(state) {
  return `auto-${state.template || 'custom'}`;
}

function setEmbedDefault(guildId, templateKey, presetName) {
  if (typeof guildManager.setEmbedDefaultPreset === 'function') {
    guildManager.setEmbedDefaultPreset(guildId, templateKey, presetName);
    return true;
  }

  if (typeof guildManager.setEmbedDefault === 'function') {
    guildManager.setEmbedDefault(guildId, templateKey, presetName);
    return true;
  }

  const current =
    typeof guildManager.getEmbedDefaults === 'function'
      ? guildManager.getEmbedDefaults(guildId) || {}
      : {};

  if (typeof guildManager.replaceGuildSection === 'function') {
    guildManager.replaceGuildSection(guildId, 'embedDefaults', {
      ...current,
      [templateKey]: presetName,
    });
    return true;
  }

  return false;
}

function buildEditorPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  const templateSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:template')
    .setPlaceholder('🎨 Choose a premade template')
    .addOptions(
      Object.entries(TEMPLATES).map(([value, template]) => ({
        label: template.label,
        value,
        emoji: template.emoji,
        default: state.template === value,
      }))
    );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('embed:channel')
    .setPlaceholder('📢 Choose where to send this embed')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:color')
    .setPlaceholder('🌈 Choose embed colour or custom HEX')
    .addOptions([
      ...COLORS.map((color) => ({
        label: color.label,
        value: color.value,
        emoji: color.emoji,
        default: state.color === color.value,
      })),
      {
        label: 'Custom HEX',
        value: CUSTOM_HEX_VALUE,
        emoji: '🎨',
        description: 'Enter your own HEX colour',
      },
    ]);

  const components = [
    new ActionRowBuilder().addComponents(templateSelect),

    new ActionRowBuilder().addComponents(channelSelect),

    new ActionRowBuilder().addComponents(colorSelect),
  ];

 components.push(
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('embed:builder')
      .setLabel('🛠️ Builder')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('embed:presets')
      .setLabel('💾 Presets')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('embed:use')
      .setLabel(getUseButtonLabel(state.template))
      .setStyle(ButtonStyle.Success)
  ),

  new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('embed:update-existing')
    .setLabel('♻️ Update Existing')
    .setStyle(ButtonStyle.Secondary),

  new ButtonBuilder()
    .setCustomId('embed:test-send')
    .setLabel('🧪 Test')
    .setStyle(ButtonStyle.Secondary),

  new ButtonBuilder()
    .setCustomId('embed:back')
    .setLabel('⬅️ Back')
    .setStyle(ButtonStyle.Secondary)
)
);

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('✏️ Embed Studio')
    .setDescription(
      [
        '**Build, customise, preview, and activate embeds for your server.**',
        '',
        `> **Template:** ${TEMPLATES[state.template]?.emoji || '🛠️'} ${
          TEMPLATES[state.template]?.label || 'Custom Embed'
        }`,
        `> **Preset:** ${
          state.selectedPreset
            ? `💾 ${state.selectedPreset}`
            : 'None loaded'
        }`,
        `> **Channel:** ${
          state.channelId
            ? `<#${state.channelId}>`
            : 'Not selected'
        }`,
        `> **Colour:** \`${state.color || PANEL_COLOR}\``,
        `> **Mentions:** ${
          state.allowUserPing
            ? '🔔 User ping enabled'
            : '🔕 Safe / no ping'
        }`,
        `> **Fields:** ${state.fields?.length || 0}/25`,
        `> **Buttons:** ${state.buttons?.length || 0}/20`,
        `> **Unsaved Changes:** ${
          state.hasUnsavedChanges
            ? '⚠️ Yes'
            : '✅ No'
        }`,
        '',
        selectedField
          ? [
              '**Selected Field**',
              `\`${state.selectedFieldIndex + 1}.\` **${trim(
                selectedField.name,
                120
              )}**`,
              `Inline: ${selectedField.inline ? 'Yes' : 'No'}`,
            ].join('\n')
          : '**Selected Field**\nNone selected.',
      ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed, buildPreviewEmbed(state, interaction)],
    components,
  };
}

/* ---------------- SUB PANELS ---------------- */
function buildBuilderPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('🛠️ Embed Builder')
    .setDescription('Edit your embed content, media, buttons, mentions, timestamp, and variables.')
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed, buildPreviewEmbed(state, interaction)],
    components: [
          new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:edit-content')
        .setLabel('✏️ Content')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:edit-media')
        .setLabel('🖼️ Media')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:fields')
        .setLabel(`📋 Fields (${state.fields?.length || 0})`)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:buttons')
        .setLabel(`🔘 Buttons (${state.buttons?.length || 0})`)
        .setStyle(ButtonStyle.Primary),
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
      .setCustomId('embed:toggle-ping')
      .setLabel(
      state.allowUserPing
        ? '🔔 Ping ON'
        : '🔕 Ping OFF'
    )
    .setStyle(
      state.allowUserPing
        ? ButtonStyle.Success
        : ButtonStyle.Secondary
    ),

 new ButtonBuilder()
  .setCustomId('embed:toggle-timestamp')
  .setLabel(
    state.showTimestamp
      ? '🕒 Timestamp ON'
      : '🕒 Timestamp OFF'
  )
  .setStyle(
    state.showTimestamp
      ? ButtonStyle.Success
      : ButtonStyle.Secondary
  ),

  new ButtonBuilder()
    .setCustomId('embed:helpers')
    .setLabel('📖 Variables')
    .setStyle(ButtonStyle.Secondary)
),

      new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('embed:reset')
    .setLabel('♻️ Reset')
    .setStyle(ButtonStyle.Danger),

  new ButtonBuilder()
    .setCustomId('embed:back')
    .setLabel('⬅️ Back')
    .setStyle(ButtonStyle.Secondary)
)
    ],
  };
}

function buildButtonsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const selectedButton =
    Number.isInteger(state.selectedButtonIndex) &&
    state.buttons?.[state.selectedButtonIndex]
      ? state.buttons[state.selectedButtonIndex]
      : null;

  const buttonEmbed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('🔘 Button Management')
    .setDescription(
      selectedButton
        ? [
            '**Selected Button:**',
            `\`${state.selectedButtonIndex + 1}.\` ${selectedButton.emoji || ''} ${selectedButton.label || 'Unnamed Button'}`,
            '',
            `Style: \`${selectedButton.style || 'Primary'}\``,
            `Action: \`${selectedButton.action || 'none'}\``,
            selectedButton.url ? `URL: ${selectedButton.url}` : null,
            '',
            'Manage your embed buttons below.',
          ].filter(Boolean).join('\n')
        : [
            'No button selected.',
            '',
            `Buttons: ${state.buttons?.length || 0}/20`,
            '',
            'Add a button to begin.',
          ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [buttonEmbed],
    components: [
      ...(state.buttons?.length
        ? [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('embed:button-select')
                .setPlaceholder('🔘 Select a button')
                .addOptions(
                  state.buttons.map((button, index) => ({
                    label: `${index + 1}. ${trim(button.label || 'Unnamed Button', 80)}`,
                    value: String(index),
                    description: trim(button.action || button.style || 'Button action', 100),
                    default: state.selectedButtonIndex === index,
                  }))
                )
            ),
          ]
        : []),

      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:button-add')
          .setLabel('➕ Add')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(
            selectedButton
              ? `embed:button-edit:${state.selectedButtonIndex}`
              : 'embed:button-edit'
          )
          .setLabel('✏️ Edit')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!selectedButton),

        new ButtonBuilder()
          .setCustomId('embed:button-remove-selected')
          .setLabel('🗑️ Remove')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!selectedButton)
      ),

      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:button-move-up')
          .setLabel('⬆️ Up')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!selectedButton || state.selectedButtonIndex <= 0),

        new ButtonBuilder()
          .setCustomId('embed:button-move-down')
          .setLabel('⬇️ Down')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(
            !selectedButton ||
              state.selectedButtonIndex >= (state.buttons?.length || 0) - 1
          ),

        new ButtonBuilder()
          .setCustomId('embed:editor')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

/* ---------------- MODALS ---------------- */

function buildContentModal(state) {
  return new ModalBuilder()
    .setCustomId(`embed:save-content:${Date.now()}`)
    .setTitle('Edit Embed Text')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(trim(state.title || '', 256))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue(trim(state.description || '', 4000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorName')
          .setLabel('Author name')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(trim(state.authorName || '', 256))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer text')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(trim(state.footer || '', 2048))
      )
    );
}

function buildMediaModal(state) {
  return new ModalBuilder()
    .setCustomId(`embed:save-media:${Date.now()}`)
    .setTitle('Edit Embed Media')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorIcon')
          .setLabel('Author logo URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/logo.png or {guildIcon}')
          .setValue(trim(state.authorIcon || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnail')
          .setLabel('Small thumbnail URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/logo.png or {guildIcon}')
          .setValue(trim(state.thumbnail || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Large banner/image URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('{guildBanner}')
          .setValue(trim(state.image || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorUrl')
          .setLabel('Author clickable URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://ksjdigital.co.uk')
          .setValue(trim(state.authorUrl || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footerIcon')
          .setLabel('Footer icon URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/icon.png or {guildIcon}')
          .setValue(trim(state.footerIcon || '', 1000))
    ),
  );
}

function buildFieldModal(state, fieldIndex = null) {
  const isEditing = Number.isInteger(fieldIndex) && state.fields?.[fieldIndex];
  const field = isEditing
    ? state.fields[fieldIndex]
    : {
        name: '',
        value: '',
        inline: false,
      };

  return new ModalBuilder()
    .setCustomId(isEditing ? `embed:field-save:${fieldIndex}` : 'embed:field-save-new')
    .setTitle(isEditing ? 'Edit Embed Field' : 'Add Embed Field')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Field name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Example: Prize')
          .setValue(trim(field.name || '', 256))
          .setMaxLength(256)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('Field value')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Example: Nitro giveaway')
          .setValue(trim(field.value || '', 1024))
          .setMaxLength(1024)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('layout')
          .setLabel('Inline? yes/no')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('yes = inline, no = stacked')
          .setValue(field.inline ? 'yes' : 'no')
          .setMaxLength(10)
      )
    );
}

function buildButtonModal(state, buttonIndex = null) {
  const isEditing =
    Number.isInteger(buttonIndex) &&
    state.buttons?.[buttonIndex];

  const button = isEditing
    ? state.buttons[buttonIndex]
    : {
        label: '',
        emoji: '',
        style: 'Link',
        action: 'link',
        url: '',
      };

  return new ModalBuilder()
    .setCustomId(
      isEditing
        ? `embed:button-save:${buttonIndex}`
        : 'embed:button-save-new'
    )
    .setTitle(
      isEditing
        ? 'Edit Button'
        : 'Add Button'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Button Label')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(button.label || '')
          .setMaxLength(80)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(button.emoji || '')
          .setMaxLength(20)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('style')
          .setLabel('Style')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Primary, Secondary, Success, Danger, Link')
          .setValue(button.style || 'Primary')
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('url')
          .setLabel('URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(button.url || '')
      )
    );
}

function buildColorModal(state) {
  return new ModalBuilder()
    .setCustomId('embed:save-color')
    .setTitle('Custom HEX Colour')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('hex')
          .setLabel('HEX colour')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('#5865F2')
          .setValue(state.color || PANEL_COLOR)
          .setMaxLength(7)
      )
    );
}

function buildPresetSaveModal(state) {
  return new ModalBuilder()
    .setCustomId('embed:preset-save-modal')
    .setTitle('Save Embed Preset')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Preset name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('welcome, rules, friday giveaway...')
          .setValue(trim(state.selectedPreset || '', 50))
          .setMaxLength(50)
      )
    );
}

function buildRenameModal(currentName = '') {
  return new ModalBuilder()
    .setCustomId('embed:preset-rename-modal')
    .setTitle('Rename Preset')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New preset name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(trim(currentName, 50))
          .setMaxLength(50)
      )
    );
}

function buildDuplicateModal(currentName = '') {
  const suggestedName = currentName ? `${currentName} Copy` : 'Preset Copy';

  return new ModalBuilder()
    .setCustomId('embed:preset-duplicate-modal')
    .setTitle('Duplicate Preset')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New duplicate name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('rules copy, welcome alt...')
          .setValue(trim(suggestedName, 50))
          .setMaxLength(50)
      )
    );
}

function buildPresetsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const presets =
    typeof guildManager.getEmbedPresets === 'function'
      ? guildManager.getEmbedPresets(interaction.guild.id) || {}
      : {};

  const presetNames = Object.keys(presets).slice(0, 25);

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('💾 Embed Presets')
    .setDescription(
      presetNames.length
        ? 'Load, save, rename, duplicate, or delete embed presets.'
        : 'No presets saved yet. Save your current embed as a preset to start.'
    )
    .addFields(
      {
        name: 'Current preset',
        value: state.selectedPreset ? `💾 ${state.selectedPreset}` : 'None selected',
        inline: true,
      },
      {
        name: 'Saved presets',
        value: String(presetNames.length),
        inline: true,
      }
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const components = [];

  if (presetNames.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:preset-select')
          .setPlaceholder('💾 Select a preset')
          .addOptions(
            presetNames.map((name) => ({
              label: trim(name, 100),
              value: name,
              description: 'Load this preset',
              default: state.selectedPreset === name,
            }))
          )
      )
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:preset-save')
        .setLabel('💾 Save')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('embed:preset-rename')
        .setLabel('✏️ Rename')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-duplicate')
        .setLabel('📋 Duplicate')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-delete')
        .setLabel('🗑️ Delete')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.selectedPreset)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:editor')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [embed],
    components,
  };
}

function buildHelpersPanel(memberDisplayName = 'Unknown User') {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('📖 Embed Variables')
    .setDescription(
      HELPER_VARIABLES.map((v) => `\`${v.name}\` — ${v.desc}`).join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:builder')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildFieldsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('📋 Field Management')
    .setDescription(`Fields: ${state.fields?.length || 0}/25`)
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      ...(state.fields?.length
        ? [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('embed:field-select')
                .setPlaceholder('📋 Select a field')
                .addOptions(
                  state.fields.map((field, index) => ({
                    label: `${index + 1}. ${trim(field.name || 'Unnamed Field', 80)}`,
                    value: String(index),
                    description: trim(field.value || 'Field value', 100),
                    default: state.selectedFieldIndex === index,
                  }))
                )
            ),
          ]
        : []),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:field-add')
          .setLabel('➕ Add')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('embed:field-edit')
          .setLabel('✏️ Edit')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!Number.isInteger(state.selectedFieldIndex)),
        new ButtonBuilder()
          .setCustomId('embed:field-remove-selected')
          .setLabel('🗑️ Remove')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!Number.isInteger(state.selectedFieldIndex)),
        new ButtonBuilder()
          .setCustomId('embed:builder')
          .setLabel('⬅️ Builder')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

async function updateFields(interaction, memberDisplayName) {
  const payload = buildFieldsPanel(interaction, memberDisplayName);

  if (interaction.isModalSubmit()) {
    return interaction.reply({
      ...payload,
      flags: 64,
    });
  }

  return interaction.update(payload);
}

/* ---------------- UPDATE HELPERS ---------------- */

async function updatePanel(interaction, memberDisplayName) {
  return interaction.update(buildEmbedPanel(interaction, memberDisplayName));
}

async function updateEditor(interaction, memberDisplayName) {

  const payload = buildEditorPanel(interaction, memberDisplayName);

  if (interaction.isModalSubmit()) {
    return interaction.reply({
      ...payload,
      flags: 64,
    });
  }

  return interaction.update(payload);
}

async function updatePresets(interaction, memberDisplayName) {

  refreshGuild(interaction.guild.id);

  const payload = buildPresetsPanel(interaction, memberDisplayName);

  if (interaction.isModalSubmit()) {
    return interaction.reply({
      ...payload,
      flags: 64,
    });
  }

  return interaction.update(payload);
}


/* ---------------- INTERACTIONS ---------------- */

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('embed:')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  /* ---------------- SELECT MENUS ---------------- */
  if (interaction.isStringSelectMenu()) {
    const state = getSession(interaction);

    if (interaction.customId === 'embed:template') {
      applyTemplate(interaction, interaction.values[0]);
      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:color') {
      const selectedColor = interaction.values[0];

      if (selectedColor === CUSTOM_HEX_VALUE) {
        await interaction.showModal(buildColorModal(state));
        return true;
      }

      markUnsaved(interaction, { ...state, color: selectedColor });
      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:field-select') {
    saveSession(interaction, {
      ...state,
      selectedFieldIndex: Number(interaction.values[0]),
    });

    await interaction.update(buildFieldsPanel(interaction, memberDisplayName));
    return true;
  }

  if (interaction.customId === 'embed:button-select') {
  saveSession(interaction, {
    ...state,
    selectedButtonIndex: Number(interaction.values[0]),
  });

  await interaction.update(
    buildButtonsPanel(
      interaction,
      memberDisplayName
    )
  );

  return true;
}

      if (interaction.customId === 'embed:preset-select') {
  const presetName = interaction.values[0];

  const preset = guildManager.getEmbedPreset(
    interaction.guild.id,
    presetName
  );

  if (!preset) {
    await interaction.reply({
      content: 'Preset not found.',
      flags: 64,
    });

    return true;
  }

  applyPresetToSession(
    interaction,
    presetName,
    preset
  );

    await updateEditor(
    interaction,
    memberDisplayName
  );

    return true;
  }

}

/* ---------------- CHANNEL SELECT ---------------- */
if (interaction.isChannelSelectMenu()) {
  const state = getSession(interaction);

  if (interaction.customId === 'embed:channel') {
    markUnsaved(interaction, {
      ...state,
      channelId: interaction.values[0],
    });

    await updateEditor(interaction, memberDisplayName);
    return true;
  }
}

  /* ---------------- BUTTONS ---------------- */
  if (interaction.isButton()) {

    // Let NAV system handle its own buttons
    if (interaction.customId.startsWith('nav|')) return false;

    if (!interaction.customId.startsWith('embed:')) return false;

    const state = getSession(interaction);

    if (interaction.customId === 'embed:back') {
  await interaction.update(
    buildEditorPanel(
      interaction,
      memberDisplayName
    )
  );

  return true;
}

if (interaction.customId === 'embed:editor') {
  console.log('🧪 EMBED EDITOR BUTTON CLICKED');

  return interaction.update(
  buildEditorPanel(interaction, memberDisplayName)
  );
}

    if (interaction.customId === 'embed:builder') {
      await interaction.update(buildBuilderPanel(interaction, memberDisplayName));
      return true;
  }

    if (interaction.customId === 'embed:helpers') {
      await interaction.update(buildHelpersPanel(memberDisplayName));
      return true;
    }

    if (interaction.customId === 'embed:presets') {
      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:toggle-ping') {
      markUnsaved(interaction, {
        ...state,
        allowUserPing: !state.allowUserPing,
      });

      await interaction.update(
        buildBuilderPanel(interaction, memberDisplayName)
      );

      return true;
    }

    if (interaction.customId === 'embed:toggle-timestamp') {
      markUnsaved(interaction, {
        ...state,
        showTimestamp: !state.showTimestamp,
      });

      await interaction.update(
        buildBuilderPanel(interaction, memberDisplayName)
  );
      return true;
  }

    if (interaction.customId === 'embed:field-add') {
      await interaction.showModal(buildFieldModal(state));
      return true;
    }

    if (interaction.customId.startsWith('embed:field-edit')) {
      const indexFromId = interaction.customId.split(':')[2];
      const fieldIndex = Number.isInteger(Number(indexFromId))
        ? Number(indexFromId)
        : state.selectedFieldIndex;

      if (!Number.isInteger(fieldIndex) || !state.fields?.[fieldIndex]) {
        await interaction.reply({
          content: 'Select a field first.',
          flags: 64,
        });
        return true;
      }

      await interaction.showModal(buildFieldModal(state, fieldIndex));
      return true;
    }

    if (interaction.customId === 'embed:field-remove-selected') {
  const nextFields = [...(state.fields || [])];

  if (Number.isInteger(state.selectedFieldIndex)) {
    nextFields.splice(state.selectedFieldIndex, 1);
  }

  markUnsaved(interaction, {
    ...state,
    fields: nextFields,
    selectedFieldIndex: null,
  });

  await interaction.update(
    buildFieldsPanel(interaction, memberDisplayName)
  );

  return true;
}

    if (interaction.customId === 'embed:edit-content') {
      await interaction.showModal(buildContentModal(state));
      return true;
    }

    if (interaction.customId === 'embed:fields') {
      await updateFields(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:buttons') {
      await interaction.update(
      buildButtonsPanel(interaction, memberDisplayName)
    );

      return true;
    }

    if (interaction.customId === 'embed:button-add') {

  if ((state.buttons?.length || 0) >= 20) {
    await interaction.reply({
      content: '⚠️ Maximum button limit reached (20/20).',
      flags: 64,
    });

    return true;
  }

  await interaction.showModal(
    buildButtonModal(state)
  );

  return true;
}

if (
  interaction.customId.startsWith(
    'embed:button-edit'
  )
) {
  const index =
    Number.isInteger(
      Number(
        interaction.customId.split(':')[2]
      )
    )
      ? Number(
          interaction.customId.split(':')[2]
        )
      : state.selectedButtonIndex;

  if (
    !Number.isInteger(index) ||
    !state.buttons?.[index]
  ) {
    await interaction.reply({
      content: 'Select a button first.',
      flags: 64,
    });

    return true;
  }

  await interaction.showModal(
    buildButtonModal(state, index)
  );

  return true;
}
    
  if (interaction.customId === 'embed:button-remove-selected') {
  const nextButtons = [...(state.buttons || [])];

  if (Number.isInteger(state.selectedButtonIndex)) {
    nextButtons.splice(state.selectedButtonIndex, 1);
  }

  markUnsaved(interaction, {
    ...state,
    buttons: nextButtons,
    selectedButtonIndex: null,
  });

  await interaction.update(
    buildButtonsPanel(interaction, memberDisplayName)
  );

  return true;
}

if (interaction.customId === 'embed:button-move-up') {
  const index = state.selectedButtonIndex;

  if (
    !Number.isInteger(index) ||
    index <= 0
  ) {
    return true;
  }

  const nextButtons = [...(state.buttons || [])];

  [
    nextButtons[index - 1],
    nextButtons[index]
  ] = [
    nextButtons[index],
    nextButtons[index - 1]
  ];

  markUnsaved(interaction, {
    ...state,
    buttons: nextButtons,
    selectedButtonIndex: index - 1,
  });

  await interaction.update(
    buildButtonsPanel(
      interaction,
      memberDisplayName
    )
  );

  return true;
}

if (interaction.customId === 'embed:button-move-down') {
  const index = state.selectedButtonIndex;

  if (
    !Number.isInteger(index) ||
    index >= (state.buttons?.length || 0) - 1
  ) {
    return true;
  }

  const nextButtons = [...(state.buttons || [])];

  [
    nextButtons[index],
    nextButtons[index + 1]
  ] = [
    nextButtons[index + 1],
    nextButtons[index]
  ];

  markUnsaved(interaction, {
    ...state,
    buttons: nextButtons,
    selectedButtonIndex: index + 1,
  });

  await interaction.update(
    buildButtonsPanel(
      interaction,
      memberDisplayName
    )
  );

  return true;
}

if (interaction.customId === 'embed:edit-media') {
      await interaction.showModal(buildMediaModal(state));
      return true;
    }

    if (interaction.customId === 'embed:preset-save') {
      await interaction.showModal(buildPresetSaveModal(state));
      return true;
    }

    if (interaction.customId === 'embed:preset-load') {
      const presetName = state.pendingPresetName || state.selectedPreset;
      const preset = guildManager.getEmbedPreset(interaction.guild.id, presetName);

      if (!preset) {
        await interaction.reply({ content: 'Preset not found.', flags: 64 });
        return true;
      }

      applyPresetToSession(interaction, presetName, preset);
      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-delete') {
      const presetName = state.pendingPresetName || state.selectedPreset;

      if (!presetName) {
        await interaction.reply({
          content: 'Select a preset first.',
          flags: 64,
        });
        return true;
      }

      const presets =
        typeof guildManager.getEmbedPresets === 'function'
          ? guildManager.getEmbedPresets(interaction.guild.id) || {}
          : {};

      if (!presets[presetName]) {
        await interaction.reply({
          content: 'Preset not found.',
          flags: 64,
        });
        return true;
      }

      delete presets[presetName];

      if (typeof guildManager.replaceGuildSection === 'function') {
        guildManager.replaceGuildSection(
          interaction.guild.id,
          'embedPresets',
          presets
        );
      }

      clearUnsaved(interaction, {
        ...state,
        selectedPreset: null,
        pendingPresetName: null,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

 if (interaction.customId === 'embed:reset') {
  resetSession(interaction);

  await interaction.update(
    buildBuilderPanel(interaction, memberDisplayName)
  );

  return true;
}

if (interaction.customId === 'embed:update-existing') {

  const deployment = getEmbedDeployment(
    interaction.guild.id,
    getDeploymentKeyFromState(state)
  );

  if (!deployment) {
    await interaction.reply({
      content: '⚠️ No deployed embed found. Use the embed first.',
      flags: 64,
    });

    return true;
  }

  try {
    const channel = await interaction.guild.channels.fetch(
  deployment.channelId
);

if (!channel?.isTextBased()) {
  throw new Error('Invalid deployment channel');
}

const message = await channel.messages.fetch(
  deployment.messageId
);

    await message.edit({
      content: state.allowUserPing
        ? `<@${interaction.user.id}>`
        : '',
      embeds: [buildPreviewEmbed(state, interaction)],
      components: buildButtonComponents(state),
      allowedMentions: getAllowedMentionsForState(
        state,
        interaction
      ),
    });

    await interaction.reply({
      content: '✅ Existing embed updated.',
      flags: 64,
    });

  } catch (error) {
  console.error(
    'Failed to update existing embed:',
    error
  );

  const isPermissionError =
  error?.code === 50001 || // Missing Access
  error?.code === 50013 || // Missing Permissions
  error?.code === 10003;   // Unknown Channel

  const message = isPermissionError
  ? '❌ I no longer have permission to edit that embed.'
  : '⚠️ Original embed not found. Use the embed again to repost it.';

  await interaction.reply({
    content: message,
    flags: 64,
  });
}

  return true;
}

if (interaction.customId === 'embed:test-send') {

  if ((state.buttons?.length || 0) > 20) {
    await interaction.reply({
      content: '⚠️ Too many buttons. Maximum is 20.',
      flags: 64,
    });

    return true;
  }

  await interaction.reply({
    content: '🧪 Test Preview',
    embeds: [buildPreviewEmbed(state, interaction)],
    components: buildButtonComponents(state),
    allowedMentions: getAllowedMentionsForState(
      state,
      interaction
    ),
    flags: 64,
  });

  return true;
}

if (interaction.customId === 'embed:use') {

  if ((state.buttons?.length || 0) > 20) {
    await interaction.reply({
      content: '⚠️ Too many buttons. Maximum is 20.',
      flags: 64,
    });

    return true;
  }

  const channel =
    interaction.guild.channels.cache.get(state.channelId) ||
    (await interaction.guild.channels.fetch(state.channelId).catch(() => null));

  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: 'Invalid channel.',
      flags: 64,
    });

    return true;
  }

  let sentMessage;

try {
  sentMessage = await channel.send({
    content: state.allowUserPing ? `<@${interaction.user.id}>` : '',
    embeds: [buildPreviewEmbed(state, interaction)],
    components: buildButtonComponents(state),
    allowedMentions: getAllowedMentionsForState(state, interaction),
  });
} catch (error) {
  console.error('Embed send failed:', error);

  await interaction.reply({
    content:
      '❌ I cannot send messages to that channel. Check Send Messages, Embed Links and View Channel permissions.',
    flags: 64,
  });

  return true;
}

  const presetName = getAutoPresetName(state);

  guildManager.saveEmbedPreset(
    interaction.guild.id,
    presetName,
    getPresetDataFromState(state),
    interaction.guild
  );

  saveEmbedDeployment(
    interaction.guild.id,
    getDeploymentKeyFromState({
      ...state,
      selectedPreset: presetName,
    }),
    {
      channelId: channel.id,
      messageId: sentMessage.id,
      template: state.template,
      preset: presetName,
      createdBy: interaction.user.id,
      lastUpdatedBy: interaction.user.id,
    }
  );

  const success = setEmbedDefault(
    interaction.guild.id,
    state.template,
    presetName
  );

  clearUnsaved(interaction, {
    ...state,
    selectedPreset: presetName,
  });

  await interaction.reply({
    content: success
      ? `✅ ${TEMPLATES[state.template]?.label || 'Embed'} posted to <#${state.channelId}> and saved as active`
      : '⚠️ Preset saved, but default assignment failed.',
    flags: 64,
  });

  return true;
}

  }

/* ---------------- MODALS ---------------- */
if (interaction.isModalSubmit()) {
  const state = getSession(interaction);

    if (interaction.customId === 'embed:preset-save-modal') {
      const name = interaction.fields.getTextInputValue('name').trim();

      if (!name) {
        await interaction.reply({ content: 'Name required.', flags: 64 });
        return true;
      }

      guildManager.saveEmbedPreset(
        interaction.guild.id,
        name,
        getPresetDataFromState(state),
        interaction.guild
      );

      clearUnsaved(interaction, {
        ...state,
        selectedPreset: name,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:button-save-new') {

  if ((state.buttons?.length || 0) >= 20) {
    await interaction.reply({
      content: '⚠️ Maximum button limit reached (20/20).',
      flags: 64,
    });

    return true;
  }

  const style =
    interaction.fields.getTextInputValue('style') || 'Primary';

  const url =
    interaction.fields.getTextInputValue('url');

  if (
    String(style).toLowerCase() === 'link' &&
    !safeUrl(url)
  ) {
    await interaction.reply({
      content: '⚠️ Link buttons require a valid URL.',
      flags: 64,
    });

    return true;
  }

  const nextButtons = [...(state.buttons || [])];

  nextButtons.push({
    label: interaction.fields.getTextInputValue('label'),
    emoji: interaction.fields.getTextInputValue('emoji'),
    style,
    action: 'link',
    url,
  });

  markUnsaved(interaction, {
    ...state,
    buttons: nextButtons,
    selectedButtonIndex: nextButtons.length - 1,
  });

  await interaction.reply({
    ...buildButtonsPanel(interaction, memberDisplayName),
    flags: 64,
  });

  return true;
}

if (interaction.customId.startsWith('embed:button-save:')) {
  const buttonIndex = Number(interaction.customId.split(':')[2]);

  if (!Number.isInteger(buttonIndex) || !state.buttons?.[buttonIndex]) {
    await interaction.reply({
      content: 'Button not found.',
      flags: 64,
    });

    return true;
  }

  const style =
    interaction.fields.getTextInputValue('style') || 'Primary';

  const url =
    interaction.fields.getTextInputValue('url');

  if (
    String(style).toLowerCase() === 'link' &&
    !safeUrl(url)
  ) {
    await interaction.reply({
      content: '⚠️ Link buttons require a valid URL.',
      flags: 64,
    });

    return true;
  }

  const nextButtons = [...state.buttons];

  nextButtons[buttonIndex] = {
    ...nextButtons[buttonIndex],
    label: interaction.fields.getTextInputValue('label'),
    emoji: interaction.fields.getTextInputValue('emoji'),
    style,
    url,
  };

  markUnsaved(interaction, {
    ...state,
    buttons: nextButtons,
    selectedButtonIndex: buttonIndex,
  });

  await interaction.reply({
    ...buildButtonsPanel(interaction, memberDisplayName),
    flags: 64,
  });

  return true;
}

    if (interaction.customId === 'embed:save-color') {
      const hex = interaction.fields.getTextInputValue('hex');

      if (!isValidHexColor(hex)) {
        await interaction.reply({ content: 'Invalid HEX.', flags: 64 });
        return true;
      }

      markUnsaved(interaction, {
        ...state,
        color: normalizeHexColor(hex),
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

      if (interaction.customId.startsWith('embed:save-content:')) {
    markUnsaved(interaction, {
      ...state,
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      authorName: interaction.fields.getTextInputValue('authorName'),
      footer: interaction.fields.getTextInputValue('footer'),
    });

    await interaction.reply({
      ...buildBuilderPanel(interaction, memberDisplayName),
      flags: 64,
    });

    return true;
  }

      if (interaction.customId.startsWith('embed:save-media:')) {
  markUnsaved(interaction, {
    ...state,
    authorIcon: interaction.fields.getTextInputValue('authorIcon'),
    authorUrl: interaction.fields.getTextInputValue('authorUrl'),
    footerIcon: interaction.fields.getTextInputValue('footerIcon'),
    thumbnail: interaction.fields.getTextInputValue('thumbnail'),
    image: interaction.fields.getTextInputValue('image'),
  });

  await interaction.reply({
    ...buildBuilderPanel(interaction, memberDisplayName),
    flags: 64,
  });

  return true;
}

    if (interaction.customId.startsWith('embed:field-save:')) {
    const fieldIndex = Number(interaction.customId.split(':')[2]);

    if (!Number.isInteger(fieldIndex) || !state.fields?.[fieldIndex]) {
      await interaction.reply({
        content: 'Field not found.',
        flags: 64,
      });

      return true;
    }

    const nextFields = [...(state.fields || [])];

    nextFields[fieldIndex] = {
      name: interaction.fields.getTextInputValue('name'),
      value: interaction.fields.getTextInputValue('value'),
      inline: /^y(es)?|true|1$/i.test(
        interaction.fields.getTextInputValue('layout') || ''
      ),
    };

    markUnsaved(interaction, {
      ...state,
      fields: nextFields,
      selectedFieldIndex: fieldIndex,
    });

    await interaction.reply({
  ...buildFieldsPanel(interaction, memberDisplayName),
  flags: 64,
  });

    return true;
  }

  if (interaction.customId === 'embed:field-save-new') {
    const nextFields = [...(state.fields || [])];

    nextFields.push({
      name: interaction.fields.getTextInputValue('name'),
      value: interaction.fields.getTextInputValue('value'),
      inline: /^y(es)?|true|1$/i.test(
        interaction.fields.getTextInputValue('layout') || ''
      ),
    });

    markUnsaved(interaction, {
      ...state,
      fields: nextFields,
      selectedFieldIndex: nextFields.length - 1,
    });

      await interaction.reply({
    ...buildFieldsPanel(interaction, memberDisplayName),
    flags: 64,
    });

        return true;
    }
  }

  return false;
}

module.exports = {
  buildEmbedPanel,
  handleInteraction,
  buildPreviewEmbed,
  TEMPLATES,
};
