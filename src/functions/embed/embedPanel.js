// src/functions/embed/embedPanel.js

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
const MAX_FIELDS = 25;
const MAX_BUTTONS = 25;

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
    authorUrl: '',
    footer: 'Member joined',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Member left',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Announcement',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Please follow the rules',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Suggestion system',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Good luck!',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Update notice',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Event details',
    footerIcon: '',
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
    authorUrl: '',
    footer: 'Moderator notice',
    footerIcon: '',
    image: '',
    thumbnail: '',
    fields: [],
    buttons: [],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function getSessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function trim(text, max = 4096) {
  const value = String(text || '');
  return value.length > max
    ? `${value.slice(0, max - 3)}...`
    : value;
}

function safeUrl(value) {
  const text = String(value || '').trim();

  if (!text) return undefined;

  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol)
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

function isValidHexColor(value) {
  return /^#?[0-9A-Fa-f]{6}$/.test(
    String(value || '').trim()
  );
}

function normalizeHexColor(value) {
  const text = String(value || '')
    .trim()
    .replace('#', '')
    .toUpperCase();

  return `#${text}`;
}

function getDefaultState() {
  return {
    template: 'custom',
    selectedPreset: null,
    selectedFieldIndex: null,
    selectedButtonIndex: null,

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
  sessions.set(
    getSessionKey(interaction),
    state
  );

  return state;
}

function resetSession(interaction) {
  return saveSession(
    interaction,
    getDefaultState()
  );
}

function markUnsaved(interaction, nextState = {}) {
  const current = getSession(interaction);

  return saveSession(interaction, {
    ...current,
    ...nextState,
    hasUnsavedChanges: true,
  });
}

function clearUnsaved(interaction, nextState = {}) {
  const current = getSession(interaction);

  return saveSession(interaction, {
    ...current,
    ...nextState,
    hasUnsavedChanges: false,
  });
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

  return Number.isFinite(seconds)
    ? `<t:${seconds}:R>`
    : '';
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

    '{userMention}': userId ? `<@${userId}>` : '',
    '{usermention}': userId ? `<@${userId}>` : '',

    '{userNoPing}': userId ? `<@${userId}>` : '',

    '{userAvatar}': userAvatar,
    '{useravatarurl}': userAvatar,

    '{userServerAvatar}': userServerAvatar,
    '{userserveravatarurl}': userServerAvatar,

    '{userNickname}': member.nickname || userDisplay,
    '{userDisplay}': userDisplay,

    '{userCreatedAt}': userCreatedAt,
    '{userCreatedTimestamp}': userCreatedTimestamp,

    '{userJoinedAt}': userJoinedAt,
    '{userJoinedTimestamp}': userJoinedTimestamp,

    '{nowTimestamp}': nowTimestamp,

    '{guildId}': guild.id || '',
    '{guildName}': guild.name || 'Server',
    '{server}': guild.name || 'Server',

    '{guildIcon}': guildIcon,
    '{serverIcon}': guildIcon,

    '{guildBanner}': guildBanner,

    '{guildMemberCount}': String(guild.memberCount || 0),
    '{memberCount}': String(guild.memberCount || 0),

    '{guildVanityCode}': guild.vanityURLCode || '',

    '{successEmoji}': '✅',
    '{warningEmoji}': '⚠️',
    '{errorEmoji}': '❌',
    '{proofVerifiedEmoji}': '💎',

    '{successColor}': '#57F287',
    '{warningColor}': '#FEE75C',
    '{errorColor}': '#ED4245',
    '{proofVerifiedColor}': '#00D4FF',
  });
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
    authorUrl: state.authorUrl || '',

    footer: state.footer || '',
    footerIcon: state.footerIcon || '',

    image: state.image || '',
    thumbnail: state.thumbnail || '',

    fields: Array.isArray(state.fields)
      ? clone(state.fields)
      : [],

    buttons: Array.isArray(state.buttons)
      ? clone(state.buttons)
      : [],
  };
}

function applyPresetToSession(interaction, presetName, preset) {
  const current = getSession(interaction);

  return clearUnsaved(interaction, {
    ...current,

    template: preset.template || 'custom',
    selectedPreset: presetName,

    selectedFieldIndex: null,
    selectedButtonIndex: null,

    channelId: preset.channelId || current.channelId || null,
    allowUserPing: Boolean(preset.allowUserPing),

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

    fields: Array.isArray(preset.fields)
      ? clone(preset.fields)
      : [],

    buttons: Array.isArray(preset.buttons)
      ? clone(preset.buttons)
      : [],
  });
}

function applyTemplate(interaction, templateKey) {
  const template = TEMPLATES[templateKey] || TEMPLATES.custom;
  const current = getSession(interaction);

  return saveSession(interaction, {
    ...current,

    template: templateKey,
    selectedPreset: null,

    selectedFieldIndex: null,
    selectedButtonIndex: null,

    hasUnsavedChanges: true,

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
      ? clone(template.fields)
      : [],

    buttons: Array.isArray(template.buttons)
      ? clone(template.buttons)
      : [],
  });
}

function buildPreviewEmbed(state, interaction) {
  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR);

  const resolvedAuthorName = trim(
    resolvePreviewText(state.authorName, interaction),
    256
  );

  const resolvedAuthorIcon = safeUrl(
    resolvePreviewText(state.authorIcon, interaction)
  );

  const resolvedAuthorUrl = safeUrl(
    resolvePreviewText(state.authorUrl, interaction)
  );

  embed.setAuthor({
    name:
      resolvedAuthorName ||
      (state.template === 'welcome'
        ? `Welcome to ${interaction.guild?.name || 'the server'}`
        : 'Live Embed Preview'),
    ...(resolvedAuthorIcon
      ? { iconURL: resolvedAuthorIcon }
      : {}),
    ...(resolvedAuthorUrl
      ? { url: resolvedAuthorUrl }
      : {}),
  });

  if (state.title) {
    embed.setTitle(
      trim(
        resolvePreviewText(state.title, interaction),
        256
      )
    );
  }

  if (state.description) {
    embed.setDescription(
      trim(
        resolvePreviewText(state.description, interaction),
        4096
      )
    );
  }

  const footerText = trim(
    resolvePreviewText(state.footer, interaction),
    2048
  );

  const footerIcon = safeUrl(
    resolvePreviewText(state.footerIcon, interaction)
  );

  if (footerText) {
    embed.setFooter({
      text: footerText,
      ...(footerIcon ? { iconURL: footerIcon } : {}),
    });
  }

  const imageUrl = safeUrl(
    resolvePreviewText(state.image, interaction)
  );

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  const thumbnailUrl = safeUrl(
    resolvePreviewText(state.thumbnail, interaction)
  );

  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  const safeFields = Array.isArray(state.fields)
    ? state.fields.slice(0, MAX_FIELDS)
    : [];

  const previewFields = safeFields
    .filter((field) => field?.name && field?.value)
    .map((field) => ({
      name: trim(
        resolvePreviewText(field.name, interaction),
        256
      ),
      value: trim(
        resolvePreviewText(field.value, interaction),
        1024
      ),
      inline: Boolean(field.inline),
    }));

  if (previewFields.length) {
    embed.addFields(previewFields);
  }

  embed.setTimestamp();

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
    ? state.buttons.slice(0, MAX_BUTTONS)
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

      if (style === ButtonStyle.Link) {
        builder.setURL(
          safeUrl(button.url) ||
            'https://ksjdigital.co.uk'
        );
      } else {
        builder.setCustomId(
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
  const template = TEMPLATES[state.template] || TEMPLATES.custom;

  const templateSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:template')
    .setPlaceholder('🎨 Choose a premade template')
    .addOptions(
      Object.entries(TEMPLATES).map(([value, item]) => ({
        label: item.label,
        value,
        emoji: item.emoji,
        default: state.template === value,
      }))
    );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('embed:channel')
    .setPlaceholder('📢 Choose where to send this embed')
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement
    );

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

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:edit:content')
        .setLabel('✏️ Edit')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:fields')
        .setLabel(`📋 Fields & Media (${state.fields?.length || 0})`)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:buttons')
        .setLabel(`🔘 Buttons (${state.buttons?.length || 0})`)
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
        .setCustomId('embed:test:send')
        .setLabel('🧪 Test')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('embed:toggle:ping')
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
        .setCustomId('embed:helpers')
        .setLabel('📖 Variables')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('embed:reset')
        .setLabel('♻️ Reset')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('embed:back')
        .setLabel('⬅️ Admin Panel')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('✏️ Embed Studio')
    .setDescription(
      [
        '**Build, customise, preview, and activate embeds for your server.**',
        '',
        `> **Template:** ${template.emoji} ${template.label}`,
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
        `> **Fields:** ${state.fields?.length || 0}/${MAX_FIELDS}`,
        `> **Buttons:** ${state.buttons?.length || 0}/${MAX_BUTTONS}`,
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
    embeds: [
      embed,
      buildPreviewEmbed(state, interaction),
    ],
    components,
  };
}

function buildEmbedPanel(interactionOrGuild, memberDisplayName = 'Unknown User') {
  const fakeInteraction = interactionOrGuild?.guild
    ? interactionOrGuild
    : {
        guild: interactionOrGuild,
        guildId: interactionOrGuild?.id,
        user: {
          id: 'system',
          username: memberDisplayName,
        },
      };

  return buildEditorPanel(fakeInteraction, memberDisplayName);
}

function buildHelpersPanel(memberDisplayName = 'Unknown User') {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('📖 Embed Variables')
    .setDescription(
      [
        '**User Variables**',
        '`{userMention}` `{userNoPing}` `{userName}` `{userDisplay}`',
        '`{userAvatar}` `{userServerAvatar}` `{userJoinedTimestamp}`',
        '',
        '**Server Variables**',
        '`{guildName}` `{server}` `{guildIcon}` `{serverIcon}`',
        '`{guildBanner}` `{guildMemberCount}` `{memberCount}`',
        '',
        '**Utility Variables**',
        '`{nowTimestamp}` `{successEmoji}` `{warningEmoji}` `{errorEmoji}`',
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
          .setLabel('⬅️ Embed Studio')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildFieldsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const selectedField =
    Number.isInteger(state.selectedFieldIndex) &&
    state.fields?.[state.selectedFieldIndex]
      ? state.fields[state.selectedFieldIndex]
      : null;

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('📋 Fields & Media')
    .setDescription(
      selectedField
        ? [
            '**Selected Field:**',
            `\`${state.selectedFieldIndex + 1}.\` **${trim(
              selectedField.name,
              120
            )}**`,
            '',
            trim(selectedField.value, 500),
            '',
            `Inline: ${selectedField.inline ? 'Yes' : 'No'}`,
          ].join('\n')
        : [
            `Fields: ${state.fields?.length || 0}/${MAX_FIELDS}`,
            '',
            'Add, edit, remove, and manage embed fields.',
            'Use Media to edit images, thumbnails, icons, and URLs.',
          ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const components = [];

  if (state.fields?.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:field:select')
          .setPlaceholder('📋 Select a field')
          .addOptions(
            state.fields.slice(0, MAX_FIELDS).map((field, index) => ({
              label: `${index + 1}. ${trim(
                field.name || 'Unnamed Field',
                80
              )}`,
              value: String(index),
              description: trim(field.value || 'No value', 100),
              default: state.selectedFieldIndex === index,
            }))
          )
      )
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:field:add')
        .setLabel('➕ Add Field')
        .setStyle(ButtonStyle.Success)
        .setDisabled((state.fields?.length || 0) >= MAX_FIELDS),

      new ButtonBuilder()
        .setCustomId(
          selectedField
            ? `embed:field:edit:${state.selectedFieldIndex}`
            : 'embed:field:edit'
        )
        .setLabel('✏️ Edit Field')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!selectedField),

      new ButtonBuilder()
        .setCustomId('embed:field:remove')
        .setLabel('🗑️ Remove Field')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!selectedField)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:media')
        .setLabel('🖼️ Media')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('embed:editor')
        .setLabel('⬅️ Embed Studio')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [
      embed,
      buildPreviewEmbed(state, interaction),
    ],
    components,
  };
}

function buildButtonsPanel(interaction, memberDisplayName = 'Unknown User') {
  const state = getSession(interaction);

  const selectedButton =
    Number.isInteger(state.selectedButtonIndex) &&
    state.buttons?.[state.selectedButtonIndex]
      ? state.buttons[state.selectedButtonIndex]
      : null;

  const embed = new EmbedBuilder()
    .setColor(state.color || PANEL_COLOR)
    .setTitle('🔘 Button Management')
    .setDescription(
      selectedButton
        ? [
            '**Selected Button:**',
            `\`${state.selectedButtonIndex + 1}.\` ${
              selectedButton.emoji || ''
            } ${selectedButton.label || 'Unnamed Button'}`,
            '',
            `Style: \`${selectedButton.style || 'Primary'}\``,
            selectedButton.url ? `URL: ${selectedButton.url}` : null,
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `Buttons: ${state.buttons?.length || 0}/${MAX_BUTTONS}`,
            '',
            'Add, edit, remove, and reorder buttons for this embed.',
            'Link buttons will open URLs. Other styles create internal custom IDs.',
          ].join('\n')
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const components = [];

  if (state.buttons?.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:button:select')
          .setPlaceholder('🔘 Select a button')
          .addOptions(
            state.buttons.slice(0, MAX_BUTTONS).map((button, index) => ({
              label: `${index + 1}. ${trim(
                button.label || 'Unnamed Button',
                80
              )}`,
              value: String(index),
              description: trim(button.style || 'Button', 100),
              default: state.selectedButtonIndex === index,
            }))
          )
      )
    );
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:button:add')
        .setLabel('➕ Add')
        .setStyle(ButtonStyle.Success)
        .setDisabled((state.buttons?.length || 0) >= MAX_BUTTONS),

      new ButtonBuilder()
        .setCustomId(
          selectedButton
            ? `embed:button:edit:${state.selectedButtonIndex}`
            : 'embed:button:edit'
        )
        .setLabel('✏️ Edit')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!selectedButton),

      new ButtonBuilder()
        .setCustomId('embed:button:remove')
        .setLabel('🗑️ Remove')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!selectedButton)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:button:up')
        .setLabel('⬆️ Up')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!selectedButton || state.selectedButtonIndex <= 0),

      new ButtonBuilder()
        .setCustomId('embed:button:down')
        .setLabel('⬇️ Down')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(
          !selectedButton ||
            state.selectedButtonIndex >= (state.buttons?.length || 0) - 1
        ),

      new ButtonBuilder()
        .setCustomId('embed:editor')
        .setLabel('⬅️ Embed Studio')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [embed],
    components,
  };
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
        value: state.selectedPreset
          ? `💾 ${state.selectedPreset}`
          : 'None selected',
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
          .setCustomId('embed:preset:load')
          .setPlaceholder('💾 Load a preset')
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
        .setCustomId('embed:preset:save')
        .setLabel('Save')
        .setEmoji('💾')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('embed:preset:rename')
        .setLabel('Rename')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset:duplicate')
        .setLabel('Duplicate')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.selectedPreset),

      new ButtonBuilder()
        .setCustomId('embed:preset:delete')
        .setLabel('Delete')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.selectedPreset)
    )
  );

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('embed:editor')
        .setLabel('⬅️ Embed Studio')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [embed],
    components,
  };
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

async function updateButtons(interaction, memberDisplayName) {
  const payload = buildButtonsPanel(interaction, memberDisplayName);

  if (interaction.isModalSubmit()) {
    return interaction.reply({
      ...payload,
      flags: 64,
    });
  }

  return interaction.update(payload);
}

async function updatePresets(interaction, memberDisplayName) {
  const payload = buildPresetsPanel(interaction, memberDisplayName);

  if (interaction.isModalSubmit()) {
    return interaction.reply({
      ...payload,
      flags: 64,
    });
  }

  return interaction.update(payload);
}

function buildContentModal(state) {
  return new ModalBuilder()
    .setCustomId(`embed:modal:content:${Date.now()}`)
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
    .setCustomId(`embed:modal:media:${Date.now()}`)
    .setTitle('Edit Embed Media')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('authorIcon')
          .setLabel('Author icon URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/icon.png or {guildIcon}')
          .setValue(trim(state.authorIcon || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnail')
          .setLabel('Thumbnail URL / variable')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/thumb.png or {userAvatar}')
          .setValue(trim(state.thumbnail || '', 1000))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel('Large image/banner URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/banner.png or {guildBanner}')
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
      )
    );
}

function buildFieldModal(state, fieldIndex = null) {
  const isEditing =
    Number.isInteger(fieldIndex) &&
    state.fields?.[fieldIndex];

  const field = isEditing
    ? state.fields[fieldIndex]
    : {
        name: '',
        value: '',
        inline: false,
      };

  return new ModalBuilder()
    .setCustomId(
      isEditing
        ? `embed:modal:field:${fieldIndex}`
        : 'embed:modal:field:new'
    )
    .setTitle(
      isEditing
        ? 'Edit Embed Field'
        : 'Add Embed Field'
    )
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
          .setCustomId('inline')
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
        style: 'Primary',
        url: '',
      };

  return new ModalBuilder()
    .setCustomId(
      isEditing
        ? `embed:modal:button:${buttonIndex}`
        : 'embed:modal:button:new'
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
          .setLabel('Button label')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(trim(button.label || '', 80))
          .setMaxLength(80)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji')
          .setLabel('Emoji')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(trim(button.emoji || '', 20))
          .setMaxLength(20)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('style')
          .setLabel('Style')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Primary, Secondary, Success, Danger, Link')
          .setValue(trim(button.style || 'Primary', 20))
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('url')
          .setLabel('URL for Link button')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com')
          .setValue(trim(button.url || '', 1000))
      )
    );
}

function buildColorModal(state) {
  return new ModalBuilder()
    .setCustomId('embed:modal:color')
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
    .setCustomId('embed:modal:preset:save')
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

function buildPresetRenameModal(state) {
  return new ModalBuilder()
    .setCustomId('embed:modal:preset:rename')
    .setTitle('Rename Embed Preset')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New preset name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(trim(state.selectedPreset || '', 50))
          .setMaxLength(50)
      )
    );
}

function buildPresetDuplicateModal(state) {
  const suggestedName = state.selectedPreset
    ? `${state.selectedPreset} Copy`
    : 'Preset Copy';

  return new ModalBuilder()
    .setCustomId('embed:modal:preset:duplicate')
    .setTitle('Duplicate Embed Preset')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New duplicate name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(trim(suggestedName, 50))
          .setMaxLength(50)
      )
    );
}

async function handleSelectMenu(interaction, memberDisplayName) {
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

    markUnsaved(interaction, {
      color: selectedColor,
    });

    await updateEditor(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:field:select') {
    saveSession(interaction, {
      ...state,
      selectedFieldIndex: Number(interaction.values[0]),
    });

    await updateFields(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:button:select') {
    saveSession(interaction, {
      ...state,
      selectedButtonIndex: Number(interaction.values[0]),
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:preset:load') {
    const presetName = interaction.values[0];

    const preset =
      typeof guildManager.getEmbedPreset === 'function'
        ? guildManager.getEmbedPreset(interaction.guild.id, presetName)
        : null;

    if (!preset) {
      await interaction.reply({
        content: 'Preset not found.',
        flags: 64,
      });

      return true;
    }

    applyPresetToSession(interaction, presetName, preset);
    await updatePresets(interaction, memberDisplayName);
    return true;
  }

  return false;
}

async function handleChannelSelect(interaction, memberDisplayName) {
  const state = getSession(interaction);

  if (interaction.customId !== 'embed:channel') {
    return false;
  }

  markUnsaved(interaction, {
    ...state,
    channelId: interaction.values[0],
  });

  await updateEditor(interaction, memberDisplayName);
  return true;
}

async function sendTestEmbed(interaction, state) {
  if (!state.channelId) {
    await interaction.reply({
      content: 'Select a channel first.',
      flags: 64,
    });

    return true;
  }

  const channel =
    interaction.guild.channels.cache.get(state.channelId) ||
    (await interaction.guild.channels
      .fetch(state.channelId)
      .catch(() => null));

  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: 'Invalid channel.',
      flags: 64,
    });

    return true;
  }

  await channel.send({
    content: state.allowUserPing
      ? `<@${interaction.user.id}>`
      : '',
    embeds: [buildPreviewEmbed(state, interaction)],
    components: buildButtonComponents(state),
    allowedMentions: getAllowedMentionsForState(state, interaction),
  });

  await interaction.reply({
    content: `✅ Test embed sent to <#${state.channelId}>`,
    flags: 64,
  });

  return true;
}

async function activateEmbed(interaction, state) {
  if (!state.channelId) {
    await interaction.reply({
      content: 'Select a channel first before activating this embed.',
      flags: 64,
    });

    return true;
  }

  const presetName = getAutoPresetName(state);

  if (typeof guildManager.saveEmbedPreset === 'function') {
    guildManager.saveEmbedPreset(
      interaction.guild.id,
      presetName,
      getPresetDataFromState(state),
      interaction.guild
    );
  }

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

async function deleteSelectedPreset(interaction, state, memberDisplayName) {
  if (!state.selectedPreset) {
    await interaction.reply({
      content: 'No preset selected.',
      flags: 64,
    });

    return true;
  }

  if (typeof guildManager.deleteEmbedPreset === 'function') {
    guildManager.deleteEmbedPreset(
      interaction.guild.id,
      state.selectedPreset
    );
  }

  clearUnsaved(interaction, {
    ...state,
    selectedPreset: null,
  });

  await updatePresets(interaction, memberDisplayName);
  return true;
}

async function handleButton(interaction, memberDisplayName) {
  const state = getSession(interaction);

  if (interaction.customId === 'embed:back') {
    await interaction.update(
      buildAdminPanel(interaction.guild, memberDisplayName)
    );

    return true;
  }

  if (interaction.customId === 'embed:editor') {
    await interaction.update(
      buildEditorPanel(interaction, memberDisplayName)
    );

    return true;
  }

  if (interaction.customId === 'embed:helpers') {
    await interaction.update(
      buildHelpersPanel(memberDisplayName)
    );

    return true;
  }

  if (interaction.customId === 'embed:presets') {
    await updatePresets(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:fields') {
    await updateFields(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:buttons') {
    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:toggle:ping') {
    markUnsaved(interaction, {
      allowUserPing: !state.allowUserPing,
    });

    await updateEditor(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:edit:content') {
    await interaction.showModal(buildContentModal(state));
    return true;
  }

  if (interaction.customId === 'embed:media') {
    await interaction.showModal(buildMediaModal(state));
    return true;
  }

  if (interaction.customId === 'embed:field:add') {
    await interaction.showModal(buildFieldModal(state));
    return true;
  }

  if (interaction.customId.startsWith('embed:field:edit')) {
    const index = Number(interaction.customId.split(':')[3]);
    const fieldIndex = Number.isInteger(index)
      ? index
      : state.selectedFieldIndex;

    if (!Number.isInteger(fieldIndex) || !state.fields?.[fieldIndex]) {
      await interaction.reply({
        content: 'Select a field first.',
        flags: 64,
      });

      return true;
    }

    await interaction.showModal(
      buildFieldModal(state, fieldIndex)
    );

    return true;
  }

  if (interaction.customId === 'embed:field:remove') {
    if (!Number.isInteger(state.selectedFieldIndex)) {
      await interaction.reply({
        content: 'Select a field first.',
        flags: 64,
      });

      return true;
    }

    const nextFields = [...(state.fields || [])];
    nextFields.splice(state.selectedFieldIndex, 1);

    markUnsaved(interaction, {
      fields: nextFields,
      selectedFieldIndex: null,
    });

    await updateFields(interaction, memberDisplayName);
    return true;
  }

    if (interaction.customId === 'embed:button:add') {
    await interaction.showModal(buildButtonModal(state));
    return true;
  }

  if (interaction.customId.startsWith('embed:button:edit')) {
    const index = Number(interaction.customId.split(':')[3]);
    const buttonIndex = Number.isInteger(index)
      ? index
      : state.selectedButtonIndex;

    if (!Number.isInteger(buttonIndex) || !state.buttons?.[buttonIndex]) {
      await interaction.reply({
        content: 'Select a button first.',
        flags: 64,
      });

      return true;
    }

    await interaction.showModal(
      buildButtonModal(state, buttonIndex)
    );

    return true;
  }

  if (interaction.customId === 'embed:button:remove') {
    if (!Number.isInteger(state.selectedButtonIndex)) {
      await interaction.reply({
        content: 'Select a button first.',
        flags: 64,
      });

      return true;
    }

    const nextButtons = [...(state.buttons || [])];
    nextButtons.splice(state.selectedButtonIndex, 1);

    markUnsaved(interaction, {
      buttons: nextButtons,
      selectedButtonIndex: null,
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:button:up') {
    const index = state.selectedButtonIndex;

    if (!Number.isInteger(index) || index <= 0) {
      return true;
    }

    const nextButtons = [...(state.buttons || [])];

    [
      nextButtons[index - 1],
      nextButtons[index],
    ] = [
      nextButtons[index],
      nextButtons[index - 1],
    ];

    markUnsaved(interaction, {
      buttons: nextButtons,
      selectedButtonIndex: index - 1,
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:button:down') {
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
      nextButtons[index + 1],
    ] = [
      nextButtons[index + 1],
      nextButtons[index],
    ];

    markUnsaved(interaction, {
      buttons: nextButtons,
      selectedButtonIndex: index + 1,
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:preset:save') {
    await interaction.showModal(buildPresetSaveModal(state));
    return true;
  }

  if (interaction.customId === 'embed:preset:rename') {
    if (!state.selectedPreset) {
      await interaction.reply({
        content: 'No preset selected.',
        flags: 64,
      });

      return true;
    }

    await interaction.showModal(
      buildPresetRenameModal(state)
    );

    return true;
  }

  if (interaction.customId === 'embed:preset:duplicate') {
    if (!state.selectedPreset) {
      await interaction.reply({
        content: 'No preset selected.',
        flags: 64,
      });

      return true;
    }

    await interaction.showModal(
      buildPresetDuplicateModal(state)
    );

    return true;
  }

  if (interaction.customId === 'embed:preset:delete') {
    return deleteSelectedPreset(
      interaction,
      state,
      memberDisplayName
    );
  }

  if (interaction.customId === 'embed:reset') {
    resetSession(interaction);
    await updateEditor(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:test:send') {
    return sendTestEmbed(interaction, state);
  }

  if (interaction.customId === 'embed:use') {
    return activateEmbed(interaction, state);
  }

  return false;
}

async function handleModal(interaction, memberDisplayName) {
  const state = getSession(interaction);

  if (interaction.customId === 'embed:modal:preset:save') {
    const name = interaction.fields
      .getTextInputValue('name')
      .trim();

    if (!name) {
      await interaction.reply({
        content: 'Name required.',
        flags: 64,
      });

      return true;
    }

    if (typeof guildManager.saveEmbedPreset === 'function') {
      guildManager.saveEmbedPreset(
        interaction.guild.id,
        name,
        getPresetDataFromState(state),
        interaction.guild
      );
    }

    clearUnsaved(interaction, {
      ...state,
      selectedPreset: name,
    });

    await updatePresets(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:modal:preset:rename') {
    const newName = interaction.fields
      .getTextInputValue('name')
      .trim();

    if (!newName) {
      await interaction.reply({
        content: 'Name required.',
        flags: 64,
      });

      return true;
    }

    if (!state.selectedPreset) {
      await interaction.reply({
        content: 'No preset selected.',
        flags: 64,
      });

      return true;
    }

    const oldName = state.selectedPreset;

    const preset =
      typeof guildManager.getEmbedPreset === 'function'
        ? guildManager.getEmbedPreset(interaction.guild.id, oldName)
        : null;

    if (!preset) {
      await interaction.reply({
        content: 'Preset not found.',
        flags: 64,
      });

      return true;
    }

    if (typeof guildManager.saveEmbedPreset === 'function') {
      guildManager.saveEmbedPreset(
        interaction.guild.id,
        newName,
        preset,
        interaction.guild
      );
    }

    if (typeof guildManager.deleteEmbedPreset === 'function') {
      guildManager.deleteEmbedPreset(
        interaction.guild.id,
        oldName
      );
    }

    clearUnsaved(interaction, {
      ...state,
      selectedPreset: newName,
    });

    await updatePresets(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:modal:preset:duplicate') {
    const newName = interaction.fields
      .getTextInputValue('name')
      .trim();

    if (!newName) {
      await interaction.reply({
        content: 'Name required.',
        flags: 64,
      });

      return true;
    }

    if (!state.selectedPreset) {
      await interaction.reply({
        content: 'No preset selected.',
        flags: 64,
      });

      return true;
    }

    const preset =
      typeof guildManager.getEmbedPreset === 'function'
        ? guildManager.getEmbedPreset(
            interaction.guild.id,
            state.selectedPreset
          )
        : null;

    if (!preset) {
      await interaction.reply({
        content: 'Preset not found.',
        flags: 64,
      });

      return true;
    }

    if (typeof guildManager.saveEmbedPreset === 'function') {
      guildManager.saveEmbedPreset(
        interaction.guild.id,
        newName,
        preset,
        interaction.guild
      );
    }

    clearUnsaved(interaction, {
      ...state,
      selectedPreset: newName,
    });

    await updatePresets(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId.startsWith('embed:modal:content')) {
    markUnsaved(interaction, {
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      authorName: interaction.fields.getTextInputValue('authorName'),
      footer: interaction.fields.getTextInputValue('footer'),
    });

    await updateEditor(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId.startsWith('embed:modal:media')) {
    markUnsaved(interaction, {
      authorIcon: interaction.fields.getTextInputValue('authorIcon'),
      authorUrl: interaction.fields.getTextInputValue('authorUrl'),
      footerIcon: interaction.fields.getTextInputValue('footerIcon'),
      thumbnail: interaction.fields.getTextInputValue('thumbnail'),
      image: interaction.fields.getTextInputValue('image'),
    });

    await updateFields(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:modal:color') {
    const hex = interaction.fields.getTextInputValue('hex');

    if (!isValidHexColor(hex)) {
      await interaction.reply({
        content: 'Invalid HEX colour.',
        flags: 64,
      });

      return true;
    }

    markUnsaved(interaction, {
      color: normalizeHexColor(hex),
    });

    await updateEditor(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:modal:field:new') {
    const nextFields = [...(state.fields || [])];

    nextFields.push({
      name: interaction.fields.getTextInputValue('name'),
      value: interaction.fields.getTextInputValue('value'),
      inline: /^y(es)?|true|1$/i.test(
        interaction.fields.getTextInputValue('inline') || ''
      ),
    });

    markUnsaved(interaction, {
      fields: nextFields,
      selectedFieldIndex: nextFields.length - 1,
    });

    await updateFields(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId.startsWith('embed:modal:field:')) {
    const fieldIndex = Number(interaction.customId.split(':')[3]);

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
        interaction.fields.getTextInputValue('inline') || ''
      ),
    };

    markUnsaved(interaction, {
      fields: nextFields,
      selectedFieldIndex: fieldIndex,
    });

    await updateFields(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId === 'embed:modal:button:new') {
    const nextButtons = [...(state.buttons || [])];

    nextButtons.push({
      label: interaction.fields.getTextInputValue('label'),
      emoji: interaction.fields.getTextInputValue('emoji'),
      style: interaction.fields.getTextInputValue('style') || 'Primary',
      url: interaction.fields.getTextInputValue('url'),
    });

    markUnsaved(interaction, {
      buttons: nextButtons,
      selectedButtonIndex: nextButtons.length - 1,
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  if (interaction.customId.startsWith('embed:modal:button:')) {
    const buttonIndex = Number(interaction.customId.split(':')[3]);

    if (!Number.isInteger(buttonIndex) || !state.buttons?.[buttonIndex]) {
      await interaction.reply({
        content: 'Button not found.',
        flags: 64,
      });

      return true;
    }

    const nextButtons = [...(state.buttons || [])];

    nextButtons[buttonIndex] = {
      ...nextButtons[buttonIndex],
      label: interaction.fields.getTextInputValue('label'),
      emoji: interaction.fields.getTextInputValue('emoji'),
      style: interaction.fields.getTextInputValue('style') || 'Primary',
      url: interaction.fields.getTextInputValue('url'),
    };

    markUnsaved(interaction, {
      buttons: nextButtons,
      selectedButtonIndex: buttonIndex,
    });

    await updateButtons(interaction, memberDisplayName);
    return true;
  }

  return false;
}

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('embed:')) {
    return false;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isStringSelectMenu()) {
    return handleSelectMenu(interaction, memberDisplayName);
  }

  if (interaction.isChannelSelectMenu()) {
    return handleChannelSelect(interaction, memberDisplayName);
  }

  if (interaction.isButton()) {
    return handleButton(interaction, memberDisplayName);
  }

  if (interaction.isModalSubmit()) {
    return handleModal(interaction, memberDisplayName);
  }

  return false;
}

module.exports = {
  buildEmbedPanel,
  handleInteraction,
  buildPreviewEmbed,
  TEMPLATES,
};