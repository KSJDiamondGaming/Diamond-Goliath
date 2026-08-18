'use strict';

const { Events } = require('discord.js');

const TRACE_METHODS = [
  'deferUpdate',
  'update',
  'editReply',
  'reply',
  'deferReply',
  'followUp',
];

function state(interaction) {
  return {
    id: interaction?.id || 'unknown',
    customId: interaction?.customId || null,
    commandName: interaction?.commandName || null,
    deferred: Boolean(interaction?.deferred),
    replied: Boolean(interaction?.replied),
    ageMs: Math.max(0, Date.now() - Number(interaction?.createdTimestamp || Date.now())),
    pid: process.pid,
  };
}

function trace(stage, interaction, extra = {}) {
  console.log('[InteractionTrace]', JSON.stringify({
    stage,
    at: new Date().toISOString(),
    ...state(interaction),
    ...extra,
  }));
}

function wrapMethod(interaction, methodName) {
  if (typeof interaction?.[methodName] !== 'function') return;

  const marker = `__goliathTraceOriginal_${methodName}`;
  if (interaction[marker]) return;

  const original = interaction[methodName].bind(interaction);
  interaction[marker] = original;

  interaction[methodName] = async (...args) => {
    const startedAt = Date.now();
    trace('response:before', interaction, { method: methodName });

    try {
      const result = await original(...args);
      trace('response:success', interaction, {
        method: methodName,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      trace('response:error', interaction, {
        method: methodName,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || null,
        errorMessage: String(error?.message || error).slice(0, 500),
      });
      throw error;
    }
  };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction?.customId && !interaction?.isChatInputCommand?.()) return;

    trace('received', interaction, {
      type: interaction?.constructor?.name || typeof interaction,
    });

    for (const methodName of TRACE_METHODS) {
      wrapMethod(interaction, methodName);
    }

    trace('wrapped', interaction, {
      methods: TRACE_METHODS.filter((methodName) => typeof interaction?.[methodName] === 'function'),
    });
  },
};
