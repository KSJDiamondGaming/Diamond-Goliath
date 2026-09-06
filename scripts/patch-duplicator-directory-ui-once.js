'use strict';

const fs = require('node:fs');

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker missing`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label}: end marker missing`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const corePath = 'src/owner/dev/duplicator/core.js';
let core = fs.readFileSync(corePath, 'utf8');

core = replaceRange(core, 'async function getGuildDirectory(client)', 'async function refreshSessionDirectory', `async function getGuildDirectory(client) {
  const byId = new Map();
  const bridgeStatus = {};
  for (const item of localGuildDirectory(client)) byId.set(item.id, { ...item, environments: [item.environment] });
  await Promise.all(Object.keys(BRIDGE_PORTS).filter((env) => env !== mode()).map(async (environment) => {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await bridgeRequest(environment, 'GET', '/guilds', null, 3500);
        bridgeStatus[environment] = { ok: true, guilds: (response.guilds || []).length };
        for (const item of response.guilds || []) {
          const existing = byId.get(item.id);
          if (existing) existing.environments = [...new Set([...(existing.environments || [existing.environment]), item.environment || environment])];
          else byId.set(item.id, { ...item, environment: item.environment || environment, environments: [item.environment || environment] });
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    bridgeStatus[environment] = { ok: false, error: lastError?.message || 'unavailable' };
    console.warn(\`[Duplicator] ${environment} bridge unavailable after retry: ${lastError?.message || 'unknown error'}\`);
  }));
  const guilds = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  Object.defineProperty(guilds, 'bridgeStatus', { value: bridgeStatus, enumerable: false });
  return guilds;
}
`, 'directory retry');

core = core.replace(
  "async function refreshSessionDirectory(client, session) { session.guildDirectory = await getGuildDirectory(client); return session.guildDirectory; }",
  "async function refreshSessionDirectory(client, session) { session.guildDirectory = await getGuildDirectory(client); session.bridgeStatus = session.guildDirectory.bridgeStatus || {}; return session.guildDirectory; }"
);

core = replaceRange(core, 'async function copyPanel(interaction, session)', 'async function analysePanel', `async function copyPanel(interaction, session) {
  if (!session.guildDirectory?.length) await refreshSessionDirectory(interaction.client, session);
  const unavailable = Object.entries(session.bridgeStatus || {}).filter(([, state]) => !state?.ok).map(([environment]) => environment);
  const directoryNote = unavailable.length
    ? \`Visible servers: **${session.guildDirectory.length}**. Bridge unavailable: **${unavailable.join(', ')}** — use **Refresh Guilds** after those bot environments are online.\`
    : \`Visible servers across Goliath environments: **${session.guildDirectory.length}**.\`;
  return { embeds: [embed('🛠️ Server Duplicator — Copy', [
    \`Source: ${guildDisplay(session, interaction.client, session.sourceGuildId)}\`,
    \`Destination: ${guildDisplay(session, interaction.client, session.destinationGuildId)}\`,
    \`Conflict: \\`${session.conflictMode}\\`\`,
    \`Dry run: **${session.dryRun ? 'ON' : 'OFF'}**\`,
    '',
    directoryNote,
    '',
    'Exact-copy preflight blocks the transfer before mutation when required role/channel permissions cannot be reproduced safely.',
  ].join('\\n'))], components: [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'source')).setPlaceholder('Source server').addOptions(guildChoices(session, session.sourceGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildChoices(session, session.destinationGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'options')).setPlaceholder('What to copy').setMinValues(1).setMaxValues(Object.keys(COPY_OPTIONS).length).addOptions(copyOptionChoices(session.selectedOptions))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'conflict')).setPlaceholder('Conflict mode').addOptions(conflictChoices(session.conflictMode))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'start')).setLabel('Start Copy').setStyle(ButtonStyle.Success).setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId),
      new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'refresh')).setLabel('Refresh Guilds').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'dryrun')).setLabel(\`Dry Run: ${session.dryRun ? 'ON' : 'OFF'}\`).setStyle(session.dryRun ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'cancel')).setLabel('Cancel').setStyle(ButtonStyle.Danger),
    ),
  ], flags: MessageFlags.Ephemeral };
}
`, 'copy panel');

core = replaceRange(core, 'async function analysePanel(interaction, session)', 'async function startCopy', `async function analysePanel(interaction, session) {
  if (!session.guildDirectory?.length) await refreshSessionDirectory(interaction.client, session);
  const unavailable = Object.entries(session.bridgeStatus || {}).filter(([, state]) => !state?.ok).map(([environment]) => environment);
  const directoryNote = unavailable.length
    ? \`Visible servers: **${session.guildDirectory.length}**. Bridge unavailable: **${unavailable.join(', ')}**.\`
    : \`Visible servers across Goliath environments: **${session.guildDirectory.length}**.\`;
  return { embeds: [embed('🔎 Server Duplicator — Analyse', [
    'Choose the source and destination from the shared Goliath server directory — no server IDs required.',
    '',
    directoryNote,
  ].join('\\n'))], components: [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'source')).setPlaceholder('Source server').addOptions(guildChoices(session, session.sourceGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildChoices(session, session.destinationGuildId))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'start')).setLabel('Analyse Servers').setStyle(ButtonStyle.Primary).setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId),
      new ButtonBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'refresh')).setLabel('Refresh Guilds').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'cancel')).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ),
  ], flags: MessageFlags.Ephemeral };
}
`, 'analyse panel');

core = core.replace(
  "  else if (data.action === 'conflict') session.conflictMode = interaction.values?.[0] || 'skip';\n  else if (data.action === 'cancel')",
  "  else if (data.action === 'conflict') session.conflictMode = interaction.values?.[0] || 'skip';\n  else if (data.action === 'refresh') { await refreshSessionDirectory(interaction.client, session); session.expiresAt = Date.now() + SESSION_TTL_MS; }\n  else if (data.action === 'dryrun') session.dryRun = !session.dryRun;\n  else if (data.action === 'cancel')"
);

core = core.replace(
  "  if (data.action === 'source') session.sourceGuildId = interaction.values?.[0];\n  else if (data.action === 'destination') session.destinationGuildId = interaction.values?.[0];\n  else if (data.action === 'start') {",
  "  if (data.action === 'source') session.sourceGuildId = interaction.values?.[0];\n  else if (data.action === 'destination') session.destinationGuildId = interaction.values?.[0];\n  else if (data.action === 'refresh') { await refreshSessionDirectory(interaction.client, session); session.expiresAt = Date.now() + SESSION_TTL_MS; }\n  else if (data.action === 'cancel') { analyseSessions.delete(session.id); return interaction.update({ embeds: [embed('❌ Analyse Cancelled', 'No changes were made.', 0xef4444)], components: [] }); }\n  else if (data.action === 'start') {"
);

fs.writeFileSync(corePath, core);

const ownerPath = 'src/owner/command.js';
let owner = fs.readFileSync(ownerPath, 'utf8');
const modalStart = owner.indexOf('function analyseModal(');
const modalEnd = owner.indexOf('function exportModal(', modalStart);
if (modalStart >= 0 && modalEnd > modalStart) owner = owner.slice(0, modalStart) + owner.slice(modalEnd);
const legacyStart = owner.indexOf("  if (id === `${OWNER_PREFIX}server-analyse-submit`) {");
const legacyEnd = owner.indexOf("  if (id === `${OWNER_PREFIX}server-export-submit`) {", legacyStart);
if (legacyStart >= 0 && legacyEnd > legacyStart) owner = owner.slice(0, legacyStart) + owner.slice(legacyEnd);
fs.writeFileSync(ownerPath, owner);

console.log('Duplicator shared-directory UI repair applied.');
