'use strict';

const { Events, ButtonStyle } = require('discord.js');
const birthdays = require('../../modules/communityStudio/birthdays/birthdays');
const panel = require('../../modules/communityStudio/birthdays/birthdaysPanel');

const timers = new WeakMap();
const processingClients = new WeakSet();

function birthdayButton(customId, label) {
  return { type: 2, style: ButtonStyle.Secondary, label, custom_id: customId, emoji: { name: '🎂' } };
}

function componentId(component) {
  return component?.customId || component?.custom_id || component?.data?.custom_id || null;
}

async function appendBirthdayButton(interaction, customId, label) {
  if (!interaction?.fetchReply || !interaction?.editReply) return false;
  const message = await interaction.fetchReply().catch(() => null);
  if (!message) return false;
  const rows = (message.components || []).map((row) => row.toJSON ? row.toJSON() : { ...row });
  if (rows.some((row) => (row.components || []).some((component) => componentId(component) === customId))) return true;

  const candidate = rows.find((row) => {
    const components = row.components || [];
    return components.length > 0 && components.length < 5 && components.every((component) => Number(component.type) === 2)
      && !components.some((component) => /back|home/i.test(String(component.label || '')));
  });
  if (candidate) candidate.components.push(birthdayButton(customId, label));
  else if (rows.length < 5) rows.splice(Math.max(0, rows.length - 1), 0, { type: 1, components: [birthdayButton(customId, label)] });
  else return false;

  await interaction.editReply({ components: rows }).catch(() => null);
  return true;
}

async function processAllGuilds(client, action) {
  if (!client || processingClients.has(client)) return;
  processingClients.add(client);
  try {
    for (const guild of client?.guilds?.cache?.values?.() || []) {
      await birthdays.processGuild(guild, { action }).catch((error) => console.warn(`[Birthdays] ${guild.id}: ${error.message}`));
    }
  } finally {
    processingClients.delete(client);
  }
}

function msUntilNextMinute() {
  const current = Date.now();
  return (60000 - (current % 60000)) + 100;
}

async function startWorker(client) {
  if (!client || timers.has(client)) return;
  await processAllGuilds(client, 'birthdays_startup_process');

  const worker = { alignmentTimer: null, intervalTimer: null };
  worker.alignmentTimer = setTimeout(() => {
    processAllGuilds(client, 'birthdays_boundary_process').catch((error) => console.warn(`[Birthdays] worker: ${error.message}`));
    worker.intervalTimer = setInterval(() => processAllGuilds(client, 'birthdays_interval_process').catch((error) => console.warn(`[Birthdays] worker: ${error.message}`)), birthdays.TICK_MS);
    worker.intervalTimer.unref?.();
  }, msUntilNextMinute());
  worker.alignmentTimer.unref?.();
  timers.set(client, worker);
}

async function safeError(interaction, error) {
  const payload = { content: `❌ Birthdays failed: ${String(error?.message || error).slice(0, 500)}`, flags: 64 };
  if (interaction?.deferred || interaction?.replied) await interaction.followUp(payload).catch(() => null);
  else await interaction?.reply?.(payload).catch(() => null);
}

module.exports = [
  {
    name: Events.ClientReady,
    once: true,
    async execute(client) { await startWorker(client); },
  },
  {
    name: Events.GuildMemberAdd,
    async execute(member) {
      try {
        const restored = birthdays.markMemberJoined(member.guild.id, member.id, { actorId: member.id });
        if (restored) await birthdays.processGuild(member.guild, { action: 'birthdays_member_join_process' });
      } catch (error) {
        console.warn(`[Birthdays] join ${member.guild.id}/${member.id}: ${error.message}`);
      }
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(member) {
      try {
        birthdays.markMemberLeft(member.guild.id, member.id, { actorId: member.id });
      } catch (error) {
        console.warn(`[Birthdays] leave ${member.guild.id}/${member.id}: ${error.message}`);
      }
    },
  },
  {
    name: Events.InteractionCreate,
    async execute(interaction) {
      try {
        const id = String(interaction?.customId || '');
        if (!id) return;

        if (id === 'admin:studio:communityStudio') {
          await appendBirthdayButton(interaction, 'admin:birthdays', 'Birthdays');
          return;
        }
        if (id === 'user:category:community') {
          await appendBirthdayButton(interaction, 'birthdays:user:open', 'Birthdays');
          return;
        }

        if (id.startsWith('admin:birthdays')) {
          await panel.handleAdmin(interaction);
          return;
        }
        if (id.startsWith('birthdays:user:')) {
          await panel.handleUser(interaction);
        }
      } catch (error) {
        await safeError(interaction, error);
      }
    },
  },
];
