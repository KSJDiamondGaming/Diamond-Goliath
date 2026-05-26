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

const { buildAdminPanel } = require('../admin/adminPanel');
const guildManager = require('../../guild/guildManager');
const panelNav = require('../../helpers/ui/panelNavigation');

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
    footer: '',
    image: '',
    thumbnail: '',
    fields: [],
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
    selectedFieldIndex: null,
    channelId: null,
    hasUnsavedChanges: false,
    allowUserPing: false,

    title: TEMPLATES.custom.title,
    description: TEMPLATES.custom.description,
    color: TEMPLATES.custom.color,

    authorName: '',
    authorIcon: '',
    footer: '',
    image: '',
    thumbnail: '',

    fields: [],
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

    title: state.title || '',
    description: state.description || '',
    color: state.color || PANEL_COLOR,

    authorName: state.authorName || '',
    authorIcon: state.authorIcon || '',
    footer: state.footer || '',
    image: state.image || '',
    thumbnail: state.thumbnail || '',

    fields: Array.isArray(state.fields) ? clone(state.fields) : [],
  };
}

function applyPresetToSession(interaction, presetName, preset) {
  const current = getSession(interaction);

  return clearUnsaved(interaction, {
    ...current,
    template: preset.template || 'custom',
    selectedPreset: presetName,
    selectedFieldIndex: null,
    channelId: preset.channelId || current.channelId || null,
    allowUserPing: Boolean(preset.allowUserPing),

    title: preset.title || '',
    description: preset.description || '',
    color: preset.color || PANEL_COLOR,

    authorName: preset.authorName || '',
    authorIcon: preset.authorIcon || '',
    footer: preset.footer || '',
    image: preset.image || '',
    thumbnail: preset.thumbnail || '',

    fields: Array.isArray(preset.fields) ? clone(preset.fields) : [],
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
    footer: template.footer || '',
    image: template.image || '',
    thumbnail: template.thumbnail || '',

    fields: Array.isArray(template.fields) ? clone(template.fields) : [],
  });
}

/* ---------------- EMBED BUILDERS ---------------- */

function buildPreviewEmbed(state, interaction) {
  const embed = new EmbedBuilder().setColor(state.color || PANEL_COLOR);

  const authorName = trim(resolvePreviewText(state.authorName, interaction), 256);
  const authorIconUrl = safeUrl(resolvePreviewText(state.authorIcon, interaction));

  const resolvedAuthorName =
  authorName ||
  (state.template === 'welcome'
    ? `Welcome to ${interaction.guild?.name || 'the server'}`
    : 'Live Embed Preview');

  const resolvedAuthorIcon = authorIconUrl;

  embed.setAuthor({
    name: resolvedAuthorName,
    ...(resolvedAuthorIcon ? { iconURL: resolvedAuthorIcon } : {}),
  });

  if (state.title) {
    embed.setTitle(trim(resolvePreviewText(state.title, interaction), 256));
  }

  if (state.description) {
    embed.setDescription(
      trim(resolvePreviewText(state.description, interaction), 4096)
    );
  }

  if (state.footer) {
    embed.setFooter({
      text: trim(resolvePreviewText(state.footer, interaction), 2048),
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

  embed.setTimestamp();
  return embed;
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

  return {
    embeds: [
      buildPanelEmbed(state, fakeInteraction, memberDisplayName),
      buildPreviewEmbed(state, fakeInteraction),
    ],

    components: [
      // 🔹 MAIN ACTIONS
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:editor')
          .setLabel('✏️ Edit Embed')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('embed:presets')
          .setLabel('💾 Presets')
          .setStyle(ButtonStyle.Primary),
      ),

        new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
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
        .setCustomId('embed:edit-content')
        .setLabel('✏️ Edit Embed')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:fields')
        .setLabel(
          selectedField
            ? `📋 Fields (${state.selectedFieldIndex + 1}/${state.fields.length})`
            : `📋 Fields (${state.fields?.length || 0})`
        )
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:presets')
        .setLabel('💾 Presets')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:use')
        .setLabel(getUseButtonLabel(state.template))
        .setStyle(ButtonStyle.Success)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:test-send')
        .setLabel('🧪 Test')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('embed:helpers')
        .setLabel('📖 Variables')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('embed:reset')
        .setLabel('♻️ Reset')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('embed:back')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('✏️ Embed Editor')
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
function buildFieldsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  const fieldEmbed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('📋 Field Management')
    .setDescription(
      selectedField
        ? [
            '**Selected Field:**',
            `\`${state.selectedFieldIndex + 1}.\` ${selectedField.name}`,
            '',
            `Inline: ${selectedField.inline ? 'Yes' : 'No'}`,
            '',
            'Manage your embed fields below.',
          ].join('\n')
        : [
            'No field selected.',
            '',
            'Add a field to begin.',
          ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [fieldEmbed],
    components: [
      ...(state.fields?.length
        ? [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('embed:field-select')
                .setPlaceholder('🧩 Select a field')
                .addOptions(
                  state.fields.map((field, index) => ({
                    label: `${index + 1}. ${trim(field.name, 80)}`,
                    value: String(index),
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
          .setCustomId(
            selectedField
              ? `embed:field-edit:${state.selectedFieldIndex}`
              : 'embed:field-edit'
          )
          .setLabel('✏️ Edit')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!selectedField),

        new ButtonBuilder()
          .setCustomId('embed:field-remove-selected')
          .setLabel('🗑️ Remove')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!selectedField)
      ),

      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:field-move-up')
          .setLabel('⬆️ Up')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!selectedField || state.selectedFieldIndex <= 0),

        new ButtonBuilder()
          .setCustomId('embed:field-move-down')
          .setLabel('⬇️ Down')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(
            !selectedField ||
              state.selectedFieldIndex >= (state.fields?.length || 0) - 1
          ),

        new ButtonBuilder()
          .setCustomId('embed:editor')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildHelpersPanel(memberDisplayName = 'Unknown User') {
  const messageVariables = HELPER_VARIABLES.slice(0, 13)
    .map((variable) => `\`${variable.name}\` — ${variable.desc}`)
    .join('\n');

  const defaultVariables = HELPER_VARIABLES.slice(13, 22)
    .map((variable) => `\`${variable.name}\` — ${variable.desc}`)
    .join('\n');

  const guildVariables = HELPER_VARIABLES.slice(22)
    .map((variable) => `\`${variable.name}\` — ${variable.desc}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('📖 Embed Variables')
    .setDescription(
      [
        'Use these variables inside your title, description, fields, author, footer, image, thumbnail, or author icon.',
        '',
        '**MESSAGE SPECIFIC**',
        messageVariables,
        '',
        '**DEFAULT**',
        defaultVariables,
        '',
        '**SERVER / GUILD**',
        guildVariables,
        '',
        '**Examples:**',
        '`Welcome to {guildName}`',
        '`Hello {userMention}`',
        '`{guildIcon}` inside thumbnail',
        '`{guildIcon}` inside author icon',
      ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

      return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:editor')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildOverwriteConfirmPanel(presetName, memberDisplayName = 'Unknown User') {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#FFC107')
        .setTitle('⚠️ Preset Already Exists')
        .setDescription(
          [
            `A preset called **${presetName}** already exists.`,
            '',
            'Do you want to overwrite it?',
          ].join('\n')
        )
        .setFooter({ text: `Requested by ${memberDisplayName}` })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`embed:preset-overwrite:${presetName}`)
          .setLabel('✅ Overwrite')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('embed:preset-rename')
          .setLabel('✏️ Rename')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('embed:presets')
          .setLabel('⬅️ Cancel')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildDeleteConfirmPanel(presetName, memberDisplayName = 'Unknown User') {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('⚠️ Confirm Preset Delete')
        .setDescription(
          [
            `Are you sure you want to delete **${presetName}**?`,
            '',
            'This cannot be undone.',
          ].join('\n')
        )
        .setFooter({ text: `Requested by ${memberDisplayName}` })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:preset-delete')
          .setLabel('✅ Yes, Delete')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('embed:presets')
          .setLabel('⬅️ Cancel')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildPresetsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);
  const presets = guildManager.getEmbedPresets(interaction.guild.id) || {};

  const embedDefaults =
    typeof guildManager.getEmbedDefaults === 'function'
      ? guildManager.getEmbedDefaults(interaction.guild.id) || {}
      : {};

  const presetEntries = Object.entries(presets)
    .filter(([name, value]) => name !== 'updatedAt' && value && typeof value === 'object')
    .sort(([, a], [, b]) => {
      const aTime = new Date(a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 25);

  const currentDefault = embedDefaults[state.template] || null;

  const presetText = presetEntries.length
    ? presetEntries
        .map(([name, preset], index) => {
          const updated = preset?.updatedAt
            ? new Date(preset.updatedAt).toLocaleString()
            : 'Unknown';

          const loadedBadge = state.selectedPreset === name ? ' ✅ Loaded' : '';
          const defaultBadge = currentDefault === name ? ' ⭐ Default' : '';

          return [
            `**${index + 1}. ${name}**${loadedBadge}${defaultBadge}`,
            `> Updated: ${updated}`,
            `> Template: \`${preset.template || 'custom'}\``,
            `> Fields: ${Array.isArray(preset.fields) ? preset.fields.length : 0}/25`,
          ].join('\n');
        })
        .join('\n\n')
    : [
        'No presets saved yet.',
        '',
        'Use **Save Current** to store your current embed setup.',
      ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('💾 Embed Presets')
    .setDescription(
      [
        '**Save, load, duplicate, rename, delete, and set default embeds.**',
        '',
        `> **Loaded Preset:** ${state.selectedPreset ? `💾 ${state.selectedPreset}` : 'None'}`,
        `> **Current Template:** ${TEMPLATES[state.template]?.emoji || '🛠️'} ${
          TEMPLATES[state.template]?.label || 'Custom Embed'
        }`,
        `> **Template Default:** ${currentDefault ? `⭐ ${currentDefault}` : 'None'}`,
        `> **Unsaved Changes:** ${state.hasUnsavedChanges ? '⚠️ Yes' : '✅ No'}`,
        '',
        '**Saved Presets**',
        presetText,
      ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const components = [];

  if (presetEntries.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:preset-load')
          .setPlaceholder('💾 Load a saved preset')
          .addOptions(
            presetEntries.map(([name, preset]) => ({
              label: name.slice(0, 100),
              description: trim(
                preset?.title || preset?.description || 'Saved embed preset',
                100
              ),
              value: name,
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
        .setLabel(state.selectedPreset ? '💾 Save / Overwrite' : '💾 Save Current')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('embed:preset-set-default')
        .setLabel('⭐ Set Default')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-clear-default')
        .setLabel('🧹 Clear Default')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!currentDefault)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:preset-rename')
        .setLabel('✏️ Rename')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-duplicate')
        .setLabel('📄 Duplicate')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-delete-confirm')
        .setLabel('🗑️ Delete')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.selectedPreset)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:helpers')
        .setLabel('📖 Variables')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('embed:back')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  return {
    embeds: [embed],
    components,
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
          .setLabel('Author icon URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('{guildIcon}')
          .setValue(trim(state.authorIcon || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnail')
          .setLabel('Thumbnail URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('{guildIcon}')
          .setValue(trim(state.thumbnail || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Large image URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('{guildBanner}')
          .setValue(trim(state.image || '', 1000))
      )
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

    if (interaction.customId === 'embed:preset-load') {
      const presetName = interaction.values[0];
      const preset = guildManager.getEmbedPreset(interaction.guild.id, presetName);

      if (!preset) {
        await interaction.reply({ content: 'Preset not found.', flags: 64 });
        return true;
      }

      applyPresetToSession(interaction, presetName, preset);
      await updatePresets(interaction, memberDisplayName);
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
        buildAdminPanel(
          interaction.guild,
          memberDisplayName
        )
      );

      return true;
    }

    if (interaction.customId === 'embed:editor') {
      await updateEditor(interaction, memberDisplayName);
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

      await updateEditor(interaction, memberDisplayName);
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

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:edit-content') {
      await interaction.showModal(buildContentModal(state));
      return true;
    }

    if (interaction.customId === 'embed:fields') {
      await interaction.update(
        buildFieldsPanel(interaction, memberDisplayName)
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

    if (interaction.customId === 'embed:reset') {
      resetSession(interaction);
      await updatePanel(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:use') {
    if (!state.channelId) {
      await interaction.reply({
        content: 'Select a channel first before activating this embed.',
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
        ? `✅ ${TEMPLATES[state.template]?.label || 'Embed'} is now active in <#${state.channelId}>`
        : '⚠️ Preset saved, but default assignment failed.',
      flags: 64,
    });

    return true;
  }

    if (interaction.customId === 'embed:test-send') {
      if (!state.channelId) {
        await interaction.reply({
          content: 'Select a channel first.',
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

      await channel.send({
        content: state.allowUserPing ? `<@${interaction.user.id}>` : '',
        embeds: [buildPreviewEmbed(state, interaction)],
        allowedMentions: getAllowedMentionsForState(state, interaction),
      });

      await interaction.reply({
        content: `Sent to <#${state.channelId}>`,
        flags: 64,
      });

      return true;
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

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

      if (interaction.customId.startsWith('embed:save-media:')) {
        markUnsaved(interaction, {
          ...state,
          authorIcon: interaction.fields.getTextInputValue('authorIcon'),
          thumbnail: interaction.fields.getTextInputValue('thumbnail'),
          image: interaction.fields.getTextInputValue('image'),
        });

        await updateEditor(interaction, memberDisplayName);
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
}

module.exports = {
  buildEmbedPanel,
  handleInteraction,
  buildPreviewEmbed,
  TEMPLATES,
};