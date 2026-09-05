const { ActionRowBuilder, MessageFlags } = require('discord.js');
const { errorEmbed } = require('./embeds');

function getComponentData(component) {
  return component?.data || component || {};
}

function getComponentCustomId(component) {
  const data = getComponentData(component);
  return String(data.custom_id || data.customId || component?.customId || '');
}

function getComponentLabel(component) {
  const data = getComponentData(component);
  return String(data.label || component?.label || '').trim();
}

function isModComponent(component) {
  const customId = getComponentCustomId(component);
  return customId.startsWith('mod_') || customId.startsWith('mod:');
}

function isBackControl(component) {
  const label = getComponentLabel(component).replace(/^\p{Extended_Pictographic}[\uFE0F\u200D\s]*/u, '').trim();
  const customId = getComponentCustomId(component).toLowerCase();
  return /^back(?:\b|\s|$)/i.test(label)
    || customId === 'mod_back'
    || customId.startsWith('mod_back:')
    || customId.includes('_back:')
    || customId.endsWith('_back');
}

function isNavigationCompanion(component) {
  const label = getComponentLabel(component).replace(/^\p{Extended_Pictographic}[\uFE0F\u200D\s]*/u, '').trim();
  return /^(refresh|export)(?:\b|\s|$)/i.test(label);
}

function getRowComponents(row) {
  if (Array.isArray(row?.components)) return row.components;
  if (Array.isArray(row?.data?.components)) return row.data.components;
  return [];
}

function buildRow(components) {
  return new ActionRowBuilder().addComponents(...components);
}

// Moderation pages use many independently-built payloads. Keep the navigation
// contract centralized so every page ends with one dedicated navigation row.
// Only payloads containing Goliath moderation component IDs are touched.
function normalizeModerationNavigation(payload = {}) {
  const rows = Array.isArray(payload?.components) ? payload.components : null;
  if (!rows?.length) return payload;

  const componentRows = rows.map((row) => ({ row, components: getRowComponents(row) }));
  if (!componentRows.some(({ components }) => components.some(isModComponent))) return payload;

  const rowsWithBack = new Set();
  for (let index = 0; index < componentRows.length; index += 1) {
    if (componentRows[index].components.some(isBackControl)) rowsWithBack.add(index);
  }
  if (!rowsWithBack.size) return payload;

  const navigation = [];
  const remainingRows = [];
  const seenNavigationIds = new Set();

  for (let index = 0; index < componentRows.length; index += 1) {
    const { row, components } = componentRows[index];
    const keep = [];

    for (const component of components) {
      const moveToNavigation = isBackControl(component)
        || (rowsWithBack.has(index) && isNavigationCompanion(component));

      if (!moveToNavigation) {
        keep.push(component);
        continue;
      }

      const identity = getComponentCustomId(component) || `${getComponentLabel(component)}:${navigation.length}`;
      if (!seenNavigationIds.has(identity)) {
        seenNavigationIds.add(identity);
        navigation.push(component);
      }
    }

    if (keep.length) remainingRows.push(buildRow(keep));
    else if (!components.length) remainingRows.push(row);
  }

  if (!navigation.length) return payload;

  navigation.sort((a, b) => {
    const rank = (component) => {
      if (isBackControl(component)) return 0;
      const label = getComponentLabel(component).toLowerCase();
      if (label.includes('refresh')) return 1;
      if (label.includes('export')) return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });

  return {
    ...payload,
    components: [...remainingRows, buildRow(navigation.slice(0, 5))],
  };
}

// ✅ Generic safe reply
async function safeReply(interaction, payload = {}) {
  try {
    const normalizedPayload = normalizeModerationNavigation(payload);
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({
        ...normalizedPayload,
        flags: normalizedPayload.flags ?? MessageFlags.Ephemeral
      });
    }

    return await interaction.reply(normalizedPayload);
  } catch (error) {
    console.error('safeReply failed:', error);
    return null;
  }
}

// ✅ Generic safe update
async function safeUpdate(interaction, payload = {}) {
  try {
    const normalizedPayload = normalizeModerationNavigation(payload);
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(normalizedPayload);
    }

    if (
      interaction.isButton?.() ||
      interaction.isStringSelectMenu?.() ||
      interaction.isUserSelectMenu?.() ||
      (interaction.isModalSubmit?.() && interaction.message && typeof interaction.update === 'function')
    ) {
      return await interaction.update(normalizedPayload);
    }

    return await safeReply(interaction, {
      ...normalizedPayload,
      flags: normalizedPayload.flags ?? MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('safeUpdate failed:', error);
    return null;
  }
}

// ✅ Generic safe edit reply
async function safeEditReply(interaction, payload = {}) {
  try {
    const normalizedPayload = normalizeModerationNavigation(payload);
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(normalizedPayload);
    }

    return await safeReply(interaction, {
      ...normalizedPayload,
      flags: normalizedPayload.flags ?? MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('safeEditReply failed:', error);
    return null;
  }
}

// ❌ Simple ephemeral error response
function ephemeralError(content) {
  return {
    embeds: [errorEmbed(content)],
    flags: MessageFlags.Ephemeral
  };
}

module.exports = {
  safeReply,
  safeUpdate,
  safeEditReply,
  ephemeralError,
  normalizeModerationNavigation,
};
