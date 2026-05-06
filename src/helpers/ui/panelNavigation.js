// Goliath - Panel Navigation System
// Global history-based navigation (fixes broken "Back" buttons)

function encodeState(state) {
  try {
    return Buffer.from(JSON.stringify(state)).toString('base64');
  } catch {
    return '';
  }
}

function decodeState(encoded) {
  try {
    if (!encoded) return { history: ['admin:home'] };
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString());

    // safety check
    if (!parsed.history || !Array.isArray(parsed.history)) {
      return { history: ['admin:home'] };
    }

    return parsed;
  } catch {
    return { history: ['admin:home'] };
  }
}

function createState(start = 'admin:home') {
  return {
    history: [start],
  };
}

function push(state, panel) {
  if (!state || !state.history) state = createState();
  state.history.push(panel);
  return state;
}

function back(state) {
  if (!state || !state.history) return createState();

  state.history.pop();

  if (state.history.length === 0) {
    state.history = ['admin:home'];
  }

  return state;
}

function current(state) {
  if (!state || !state.history || state.history.length === 0) {
    return 'admin:home';
  }

  return state.history[state.history.length - 1];
}

/**
 * Builds a customId with navigation state
 * Format: nav|<base64>|<action>
 */
function buildCustomId(state, action) {
  const encoded = encodeState(state);
  return `nav|${encoded}|${action}`;
}

/**
 * Parses navigation customId
 */
function parseCustomId(customId) {
  try {
    const parts = String(customId).split('|');

    if (parts[0] !== 'nav') return null;

    return {
      state: decodeState(parts[1]),
      action: parts[2],
    };
  } catch {
    return null;
  }
}

module.exports = {
  createState,
  encodeState,
  decodeState,
  push,
  back,
  current,
  buildCustomId,
  parseCustomId,
};