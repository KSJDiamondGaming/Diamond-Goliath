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

const PANEL_COLOR = '#5865F2';
const CUSTOM_HEX_VALUE = '__custom_hex__';

const sessions = new Map();

const COLORS = [
  { label: 'Discord Blurple', value: '#5865F2', emoji: '🟦' },
  { label: 'Deep Blue', value: '#2F80ED', emoji: '🔷' },
  { label: 'Royal Blue', value: '#4169E1', emoji: '🔵' },
  { label: 'Sky Blue', value: '#00BFFF', emoji: '💧' },
  { label: 'Electric Blue', value: '#007BFF', emoji: '⚡' },
  { label: 'Cyan', value: '#00D4FF', emoji: '💧' },
  { label: 'Teal', value: '#1ABC9C', emoji: '🌊' },
  { label: 'Green', value: '#57F287', emoji: '🟩' },
  { label: 'Emerald', value: '#2ECC71', emoji: '💚' },
  { label: 'Lime', value: '#BFFF00', emoji: '🍏' },
  { label: 'Yellow', value: '#FEE75C', emoji: '🟨' },
  { label: 'Gold', value: '#FFD700', emoji: '🏆' },
  { label: 'Amber', value: '#FFC107', emoji: '🟡' },
  { label: 'Orange', value: '#E67E22', emoji: '🟧' },
  { label: 'Dark Orange', value: '#FF8C00', emoji: '🔥' },
  { label: 'Red', value: '#ED4245', emoji: '🟥' },
  { label: 'Crimson', value: '#DC143C', emoji: '❤️' },
  { label: 'Rose', value: '#FF4D6D', emoji: '🌹' },
  { label: 'Purple', value: '#9B59B6', emoji: '🟪' },
  { label: 'Violet', value: '#8A2BE2', emoji: '🔮' },
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
    emoji: '👋',
    title: '',
    description: [
      '{userMention}',
      '',
      'Welcome to **{guildName}**!',
      '',
      'You are member **#{guildMemberCount}**.',
      '',
      'We hope you enjoy your stay.',
    ].join('\n'),
    color: '#57F287',
    authorName: 'Welcome to {guildName}',
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
    '**{userDisplay} ({userTag})** has left **{guildName}**.',
    '',
    'User ID: `{userId}`',
    '',
    'We now have **{guildMemberCount}** members.',
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
    thumbnail: '{guildIcon}',
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
    thumbnail: '{guildIcon}',
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
    thumbnail: '{guildIcon}',
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
    thumbnail: '{guildIcon}',
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
    thumbnail: '{guildIcon}',
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
  { name: '{userAvatar}', desc: 'User avatar URL' },
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

  if (authorName) {
    embed.setAuthor({
      name: authorName,
      ...(authorIconUrl ? { iconURL: authorIconUrl } : {}),
    });
  } else {
    embed.setAuthor({ name: 'Live Embed Preview' });
  }

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

  const thumbnailUrl = safeUrl(resolvePreviewText(state.thumbnail, interaction));
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  const imageUrl = safeUrl(resolvePreviewText(state.image, interaction));
  if (imageUrl) embed.setImage(imageUrl);

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
    .setDescription('Create, edit, save, and send reusable embeds for this server.')
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

        new ButtonBuilder()
          .setCustomId('embed:send')
          .setLabel('🚀 Send')
          .setStyle(ButtonStyle.Success)
      ),

      // 🔹 SECONDARY ACTIONS
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed:helpers')
          .setLabel('📖 Variables')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('embed:reset')
          .setLabel('♻️ Reset')
          .setStyle(ButtonStyle.Danger)
      ),

      // 🔹 NAVIGATION (CLEAN + CONSISTENT)
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('admin:modules')
          .setLabel('⬅️ Modules')
          .setStyle(ButtonStyle.Secondary),

        ...(state.openedFromAdmin
          ? [
              new ButtonBuilder()
                .setCustomId('embed:back:admin')
                .setLabel('🏠 Admin')
                .setStyle(ButtonStyle.Secondary),
            ]
          : [])
      ),
    ],
  };
}

/* ---------------- EDITOR PANEL ---------------- */

function buildEditorPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const templateSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:template')
    .setPlaceholder('Choose a premade template')
    .addOptions(
      Object.entries(TEMPLATES).map(([value, template]) => ({
        label: `${template.emoji} ${template.label}`,
        value,
        default: state.template === value,
      }))
    );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('embed:channel')
    .setPlaceholder('Choose where to send this embed')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:color')
    .setPlaceholder('Choose embed colour or custom HEX')
    .addOptions([
      ...COLORS.map((color) => ({
        label: `${color.emoji} ${color.label}`,
        value: color.value,
        default: state.color === color.value,
      })),
      {
        label: '🎨 Custom HEX',
        value: CUSTOM_HEX_VALUE,
        description: 'Enter your own HEX colour',
      },
    ]);

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  const fieldOptions = (state.fields || []).slice(0, 25).map((field, index) => ({
    label: `${index + 1}. ${trim(field.name, 80) || 'Untitled Field'}`,
    description: `Inline: ${field.inline ? 'Yes' : 'No'}`,
    value: String(index),
    default: state.selectedFieldIndex === index,
  }));

  const components = [
    new ActionRowBuilder().addComponents(templateSelect),
    new ActionRowBuilder().addComponents(channelSelect),
    new ActionRowBuilder().addComponents(colorSelect),
  ];

  if (fieldOptions.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:field-select')
          .setPlaceholder('Choose a field to edit or remove')
          .addOptions(fieldOptions)
      )
    );
  }

  components.push(
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('embed:edit-content')
      .setLabel('📝 Text')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('embed:edit-media')
      .setLabel('🖼️ Media')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('embed:field-add')
      .setLabel('➕ Field')
      .setStyle(ButtonStyle.Success)
      .setDisabled((state.fields?.length || 0) >= 25),

    new ButtonBuilder()
      .setCustomId(
        selectedField
          ? `embed:field-edit:${state.selectedFieldIndex}`
          : 'embed:field-edit'
      )
      .setLabel('✏️ Field')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!selectedField),

    new ButtonBuilder()
      .setCustomId('embed:home')
      .setLabel('⬅️ Back')
      .setStyle(ButtonStyle.Secondary)
  )
);

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('✏️ Embed Editor')
    .setDescription(
      [
        'Edit your embed using the controls below.',
        '',
        `**Preset:** ${state.selectedPreset || 'None'}`,
        `**Mentions:** ${state.allowUserPing ? 'Ping ON' : 'Ping OFF'}`,
        `**Fields:** ${state.fields?.length || 0}/25`,
        '',
        `**Selected field:** ${selectedField ? selectedField.name : 'None'}`,
        selectedField ? `Inline: ${selectedField.inline ? 'Yes' : 'No'}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed, buildPreviewEmbed(state, interaction)],
    components,
  };
}

/* ---------------- SUB PANELS ---------------- */

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
        '`{userAvatar}` inside thumbnail',
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
    .setLabel('⬅️ Back to Editor')
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
  const presets = guildManager.getEmbedPresets(interaction.guild.id);

  const embedDefaults =
    typeof guildManager.getEmbedDefaults === 'function'
      ? guildManager.getEmbedDefaults(interaction.guild.id)
      : {};

  const presetEntries = Object.entries(presets || {})
    .filter(([name, value]) => name !== 'updatedAt' && value && typeof value === 'object')
    .sort(([, a], [, b]) => {
      const aTime = new Date(a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 25);

  const presetText = presetEntries.length
    ? presetEntries
        .map(([name, preset], index) => {
          const updated = preset?.updatedAt
            ? new Date(preset.updatedAt).toLocaleString()
            : 'Unknown';

          const defaultBadge =
            embedDefaults[state.template] === name ? '\n⭐ Default for this template' : '';

          return `**${index + 1}. ${name}**\nUpdated: ${updated}${defaultBadge}`;
        })
        .join('\n\n')
    : 'No presets saved yet.';

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('💾 Embed Presets')
    .setDescription(
      [
        'Save your current embed, load an existing preset, rename it, duplicate it, delete it, or set it as a server default.',
        '',
        `**Loaded:** ${state.selectedPreset || 'None'}`,
        `**Template:** ${state.template || 'custom'}`,
        `**Default for this template:** ${embedDefaults[state.template] || 'None'}`,
        '',
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
          .setPlaceholder('Load a saved preset')
          .addOptions(
            presetEntries.map(([name, preset]) => ({
              label: name.slice(0, 100),
              description: trim(preset?.title || 'Saved embed preset', 100),
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
        .setLabel('💾 Save Current')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('embed:preset-set-default')
        .setLabel('⭐ Set Default')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-clear-default')
        .setLabel('🧹 Clear Default')
        .setStyle(ButtonStyle.Secondary),

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
        .setCustomId('embed:preset-rename')
        .setLabel('✏️ Rename Loaded')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset-duplicate')
        .setLabel('📄 Duplicate Loaded')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:home')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary)
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
          .setPlaceholder('{userAvatar}')
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
  return interaction.update(buildEditorPanel(interaction, memberDisplayName));
}

async function updatePresets(interaction, memberDisplayName) {
  refreshGuild(interaction.guild.id);
  return interaction.update(buildPresetsPanel(interaction, memberDisplayName));
}

/* ---------------- INTERACTIONS ---------------- */

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('embed:')) return false;

  if (!interaction.guild) {
    await interaction.reply({
      content: 'Embed Studio can only be used inside a server.',
      flags: 64,
    });
    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);
  const state = getSession(interaction);

  if (interaction.isStringSelectMenu()) {
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

      markUnsaved(interaction, {
        ...state,
        color: selectedColor,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:field-select') {
      const fieldIndex = Number(interaction.values[0]);

      saveSession(interaction, {
        ...state,
        selectedFieldIndex: fieldIndex,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:field-inline-toggle') {
      const freshState = getSession(interaction);
      const fieldIndex = freshState.selectedFieldIndex;
      const nextFields = [...(freshState.fields || [])];

      if (!Number.isInteger(fieldIndex) || !nextFields[fieldIndex]) {
        await updateEditor(interaction, memberDisplayName);
        return true;
      }

      nextFields[fieldIndex] = {
        ...nextFields[fieldIndex],
        inline: interaction.values[0] === 'true',
      };

      markUnsaved(interaction, {
        ...freshState,
        fields: nextFields,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-load') {
      const presetName = interaction.values[0];
      const preset = guildManager.getEmbedPreset(interaction.guild.id, presetName);

      if (!preset) {
        await interaction.reply({
          content: 'That preset could not be found.',
          flags: 64,
        });
        return true;
      }

      applyPresetToSession(interaction, presetName, preset);
      await updatePresets(interaction, memberDisplayName);
      return true;
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'embed:channel') {
      markUnsaved(interaction, {
        ...state,
        channelId: interaction.values[0],
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'embed:home') {
      await updatePanel(interaction, memberDisplayName);
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
      const freshState = getSession(interaction);

      markUnsaved(interaction, {
        ...freshState,
        allowUserPing: !freshState.allowUserPing,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (
      interaction.customId === 'embed:field-move-up' ||
      interaction.customId === 'embed:field-move-down'
    ) {
      const freshState = getSession(interaction);
      const fieldIndex = freshState.selectedFieldIndex;
      const nextFields = [...(freshState.fields || [])];

      if (!Number.isInteger(fieldIndex) || !nextFields[fieldIndex]) {
        await updateEditor(interaction, memberDisplayName);
        return true;
      }

      const direction = interaction.customId === 'embed:field-move-up' ? -1 : 1;
      const nextIndex = fieldIndex + direction;

      if (!nextFields[nextIndex]) {
        await updateEditor(interaction, memberDisplayName);
        return true;
      }

      [nextFields[fieldIndex], nextFields[nextIndex]] = [
        nextFields[nextIndex],
        nextFields[fieldIndex],
      ];

      markUnsaved(interaction, {
        ...freshState,
        fields: nextFields,
        selectedFieldIndex: nextIndex,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-save') {
      await interaction.showModal(buildPresetSaveModal(state));
      return true;
    }

    if (interaction.customId === 'embed:preset-set-default') {
      const freshState = getSession(interaction);

      if (!freshState.selectedPreset) {
        await interaction.reply({
          content: 'Load a preset first before setting it as default.',
          flags: 64,
        });
        return true;
      }

      if (typeof guildManager.setEmbedDefault !== 'function') {
        await interaction.reply({
          content: 'Embed defaults are not wired in guildManager yet.',
          flags: 64,
        });
        return true;
      }

      guildManager.setEmbedDefault(
        interaction.guild.id,
        freshState.template || 'custom',
        freshState.selectedPreset,
        interaction.guild
      );

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-clear-default') {
      const freshState = getSession(interaction);

      if (typeof guildManager.clearEmbedDefault !== 'function') {
        await interaction.reply({
          content: 'Embed defaults are not wired in guildManager yet.',
          flags: 64,
        });
        return true;
      }

      guildManager.clearEmbedDefault(
        interaction.guild.id,
        freshState.template || 'custom',
        interaction.guild
      );

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-rename') {
      const freshState = getSession(interaction);

      if (!freshState.selectedPreset) {
        await interaction.reply({
          content: 'Load a preset first before renaming one.',
          flags: 64,
        });
        return true;
      }

      await interaction.showModal(buildRenameModal(freshState.selectedPreset));
      return true;
    }

    if (interaction.customId === 'embed:preset-duplicate') {
      const freshState = getSession(interaction);

      if (!freshState.selectedPreset) {
        await interaction.reply({
          content: 'Load a preset first before duplicating one.',
          flags: 64,
        });
        return true;
      }

      await interaction.showModal(buildDuplicateModal(freshState.selectedPreset));
      return true;
    }

    if (interaction.customId.startsWith('embed:preset-overwrite:')) {
      const freshState = getSession(interaction);
      const presetName = interaction.customId.replace('embed:preset-overwrite:', '');

      guildManager.saveEmbedPreset(
        interaction.guild.id,
        presetName,
        getPresetDataFromState(freshState),
        interaction.guild
      );

      clearUnsaved(interaction, {
        ...freshState,
        selectedPreset: presetName,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-delete-confirm') {
      const freshState = getSession(interaction);
      const presetName = freshState.selectedPreset;

      if (!presetName) {
        await interaction.reply({
          content: 'Load a preset first before deleting one.',
          flags: 64,
        });
        return true;
      }

      await interaction.update(buildDeleteConfirmPanel(presetName, memberDisplayName));
      return true;
    }

    if (interaction.customId === 'embed:preset-delete') {
      const freshState = getSession(interaction);
      const presetName = freshState.selectedPreset;

      if (!presetName) {
        await interaction.reply({
          content: 'Load a preset first before deleting one.',
          flags: 64,
        });
        return true;
      }

      const deleted = guildManager.deleteEmbedPreset(
        interaction.guild.id,
        presetName
      );

      saveSession(interaction, {
        ...freshState,
        selectedPreset: null,
        hasUnsavedChanges: false,
      });

      if (!deleted) {
        await interaction.reply({
          content: 'That preset was already missing or could not be deleted.',
          flags: 64,
        });
        return true;
      }

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:edit-content') {
      const freshState = getSession(interaction);
      await interaction.showModal(buildContentModal(freshState));
      return true;
    }

    if (interaction.customId === 'embed:edit-media') {
      const freshState = getSession(interaction);
      await interaction.showModal(buildMediaModal(freshState));
      return true;
    }

    if (interaction.customId === 'embed:field-add') {
      const freshState = getSession(interaction);
      await interaction.showModal(buildFieldModal(freshState));
      return true;
    }

    if (interaction.customId.startsWith('embed:field-edit:')) {
      const freshState = getSession(interaction);
      const fieldIndex = Number(interaction.customId.split(':')[2]);

      await interaction.showModal(buildFieldModal(freshState, fieldIndex));
      return true;
    }

    if (interaction.customId === 'embed:field-remove-selected') {
      const freshState = getSession(interaction);
      const fieldIndex = freshState.selectedFieldIndex;
      const nextFields = [...(freshState.fields || [])];

      if (Number.isInteger(fieldIndex) && nextFields[fieldIndex]) {
        nextFields.splice(fieldIndex, 1);
      }

      markUnsaved(interaction, {
        ...freshState,
        fields: nextFields,
        selectedFieldIndex: null,
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:send') {
      const freshState = getSession(interaction);

      if (!freshState.channelId) {
        await interaction.reply({
          content: 'Please select a channel before sending.',
          flags: 64,
        });
        return true;
      }

      const channel =
        interaction.guild.channels.cache.get(freshState.channelId) ||
        (await interaction.guild.channels
          .fetch(freshState.channelId)
          .catch(() => null));

      if (!channel?.isTextBased()) {
        await interaction.reply({
          content: 'That channel is not available or is not text-based.',
          flags: 64,
        });
        return true;
      }

      await channel.send({
        content: freshState.allowUserPing ? `<@${interaction.user.id}>` : '',
        embeds: [buildPreviewEmbed(freshState, interaction)],
        allowedMentions: getAllowedMentionsForState(freshState, interaction),
      });

      await interaction.reply({
        content: `Embed sent to <#${freshState.channelId}>.`,
        flags: 64,
      });
      return true;
    }

    if (interaction.customId === 'embed:reset') {
      resetSession(interaction);
      await updatePanel(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:back:admin') {
      await interaction.update(
        buildAdminPanel(interaction.guild, memberDisplayName)
      );
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'embed:preset-save-modal') {
      const freshState = getSession(interaction);
      const presetName = interaction.fields.getTextInputValue('name').trim();

      if (!presetName) {
        await interaction.reply({
          content: 'Preset name cannot be empty.',
          flags: 64,
        });
        return true;
      }

      const existingPreset = guildManager.getEmbedPreset(
        interaction.guild.id,
        presetName
      );

      if (existingPreset) {
        await interaction.update(
          buildOverwriteConfirmPanel(presetName, memberDisplayName)
        );
        return true;
      }

      guildManager.saveEmbedPreset(
        interaction.guild.id,
        presetName,
        getPresetDataFromState(freshState),
        interaction.guild
      );

      clearUnsaved(interaction, {
        ...freshState,
        selectedPreset: presetName,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-rename-modal') {
      const freshState = getSession(interaction);
      const oldName = freshState.selectedPreset;
      const newName = interaction.fields.getTextInputValue('name').trim();

      if (!oldName) {
        await interaction.reply({
          content: 'No preset selected to rename.',
          flags: 64,
        });
        return true;
      }

      if (!newName) {
        await interaction.reply({
          content: 'Preset name cannot be empty.',
          flags: 64,
        });
        return true;
      }

      if (newName === oldName) {
        await updatePresets(interaction, memberDisplayName);
        return true;
      }

      const originalPreset = guildManager.getEmbedPreset(
        interaction.guild.id,
        oldName
      );

      if (!originalPreset) {
        await interaction.reply({
          content: 'Original preset could not be found.',
          flags: 64,
        });
        return true;
      }

      const nameTaken = guildManager.getEmbedPreset(interaction.guild.id, newName);

      if (nameTaken) {
        await interaction.update(
          buildOverwriteConfirmPanel(newName, memberDisplayName)
        );
        return true;
      }

      guildManager.saveEmbedPreset(
        interaction.guild.id,
        newName,
        originalPreset,
        interaction.guild
      );

      guildManager.deleteEmbedPreset(interaction.guild.id, oldName);

      clearUnsaved(interaction, {
        ...freshState,
        selectedPreset: newName,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:preset-duplicate-modal') {
      const freshState = getSession(interaction);
      const sourceName = freshState.selectedPreset;
      const duplicateName = interaction.fields.getTextInputValue('name').trim();

      if (!sourceName) {
        await interaction.reply({
          content: 'No preset selected to duplicate.',
          flags: 64,
        });
        return true;
      }

      if (!duplicateName) {
        await interaction.reply({
          content: 'Preset name cannot be empty.',
          flags: 64,
        });
        return true;
      }

      const nameTaken = guildManager.getEmbedPreset(
        interaction.guild.id,
        duplicateName
      );

      if (nameTaken) {
        await interaction.update(
          buildOverwriteConfirmPanel(duplicateName, memberDisplayName)
        );
        return true;
      }

      guildManager.saveEmbedPreset(
        interaction.guild.id,
        duplicateName,
        getPresetDataFromState(freshState),
        interaction.guild
      );

      clearUnsaved(interaction, {
        ...freshState,
        selectedPreset: duplicateName,
      });

      await updatePresets(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId === 'embed:save-color') {
      const rawHex = interaction.fields.getTextInputValue('hex');

      if (!isValidHexColor(rawHex)) {
        await interaction.reply({
          content: 'Please enter a valid HEX colour like `#5865F2`.',
          flags: 64,
        });
        return true;
      }

      const freshState = getSession(interaction);

      markUnsaved(interaction, {
        ...freshState,
        color: normalizeHexColor(rawHex),
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId.startsWith('embed:save-content:')) {
      const freshState = getSession(interaction);

      markUnsaved(interaction, {
        ...freshState,
        title: interaction.fields.getTextInputValue('title'),
        description: interaction.fields.getTextInputValue('description'),
        authorName: interaction.fields.getTextInputValue('authorName'),
        footer: interaction.fields.getTextInputValue('footer'),
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (interaction.customId.startsWith('embed:save-media:')) {
      const freshState = getSession(interaction);

      markUnsaved(interaction, {
        ...freshState,
        authorIcon: interaction.fields.getTextInputValue('authorIcon'),
        thumbnail: interaction.fields.getTextInputValue('thumbnail'),
        image: interaction.fields.getTextInputValue('image'),
      });

      await updateEditor(interaction, memberDisplayName);
      return true;
    }

    if (
      interaction.customId === 'embed:field-save-new' ||
      interaction.customId.startsWith('embed:field-save:')
    ) {
      const freshState = getSession(interaction);
      const nextFields = [...(freshState.fields || [])];

      const isNewField = interaction.customId === 'embed:field-save-new';
      const fieldIndex = isNewField
        ? nextFields.length
        : Number(interaction.customId.split(':')[2]);

      const existingInline = isNewField
        ? false
        : Boolean(nextFields[fieldIndex]?.inline);

      const layoutInput = String(
        interaction.fields.getTextInputValue('layout') || ''
      )
        .toLowerCase()
        .trim();

      const isInline = layoutInput
        ? ['inline', 'i', 'yes', 'y', 'true', '1'].includes(layoutInput)
        : existingInline;

      const field = {
        name: trim(interaction.fields.getTextInputValue('name'), 256),
        value: trim(interaction.fields.getTextInputValue('value'), 1024),
        inline: isInline,
      };

      if (isNewField) {
        if (nextFields.length < 25) {
          nextFields.push(field);
        }
      } else if (Number.isInteger(fieldIndex) && nextFields[fieldIndex]) {
        nextFields[fieldIndex] = field;
      }

      markUnsaved(interaction, {
        ...freshState,
        fields: nextFields,
        selectedFieldIndex: isNewField
          ? nextFields.length - 1
          : freshState.selectedFieldIndex,
      });

      await updateEditor(interaction, memberDisplayName);
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