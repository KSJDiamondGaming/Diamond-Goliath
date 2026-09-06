'use strict';

const fs = require('node:fs');
const path = 'scripts/patch-duplicator-strict-copy-once.js';
let source = fs.readFileSync(path, 'utf8');
const startMarker = "selective = replaceRange(selective, 'function resultPayload', 'function inferOutcome'";
const endMarker = 'fs.writeFileSync(selectivePath, selective);';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Could not locate broken resultPayload patch block.');
const lines = [
  "selective = replaceRange(selective, 'function resultPayload', 'function inferOutcome', `function resultPayload(session, response, manifest) {",
  "  const unresolvedRoles = manifest.roles.filter((item) => item.status !== 'mapped').length;",
  "  const unresolvedChannels = manifest.channels.filter((item) => item.status !== 'mapped').length;",
  "  const status = String(response.log?.status || 'unknown');",
  "  const outcome = manifest.outcome || copyOutcome(response, { roleMappings: manifest.roles, channelMappings: manifest.channels });",
  "  const ok = outcome === 'success';",
  "  const failed = outcome === 'failed';",
  "  const verification = response.log?.verification || {};",
  "  const title = ok ? '✅ Selective Copy Verified' : failed ? (status === 'blocked-preflight' ? '🛑 Selective Copy Blocked' : '❌ Selective Copy Failed') : '⚠️ Selective Copy Partial';",
  "  const color = ok ? 0x22c55e : failed ? 0xed4245 : 0xf59e0b;",
  "  return {",
  "    embeds: [embed(title, [",
  "      '**Transfer:** ' + manifest.id,",
  "      '**Destination:** ' + (manifest.destinationGuildName || manifest.destinationGuildId) + ' (' + manifest.destinationGuildId + ')',",
  "      '**Status:** ' + status,",
  "      '**Outcome:** ' + outcome.toUpperCase(),",
  "      '',",
  "      'Transfer plan: Categories ' + manifest.stats.categories + ' • Channels ' + manifest.stats.channels + ' • Required Roles ' + (manifest.stats.roleDependencies ?? manifest.stats.roles) + ' • Permission Overwrites ' + manifest.stats.permissionOverwrites,",
  "      'Manifest mapping: Roles ' + (manifest.roles.length - unresolvedRoles) + '/' + manifest.roles.length + ' • Structure ' + (manifest.channels.length - unresolvedChannels) + '/' + manifest.channels.length,",
  "      verification.structureExpected != null ? 'Engine verification: Structure ' + (verification.structureMapped || 0) + '/' + verification.structureExpected + ' • Permissions ' + (verification.permissionOverwritesVerified || 0) + '/' + (verification.permissionOverwritesExpected || 0) + ' • Roles ' + (verification.roleMappingsVerified || 0) + '/' + (verification.roleMappingsExpected || 0) : null,",
  "      '',",
  "      failed && status === 'blocked-preflight' ? '**No destination mutation was started because exact-copy preflight failed.**' : 'This transfer is permanently recorded in **Transfer History** with source → destination IDs and source permission data.',",
  "      ...(manifest.warnings || []).slice(0, 8).map((warning) => '⚠️ ' + warning),",
  "    ].filter(Boolean).join('\\n'), color)],",
  "    components: [new ActionRowBuilder().addComponents(",
  "      new ButtonBuilder().setCustomId(componentId(session, 'manifest-last')).setLabel('View Transfer Manifest').setEmoji('📜').setStyle(ButtonStyle.Primary),",
  "      new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('New Transfer').setStyle(ButtonStyle.Secondary),",
  "    )],",
  "  };",
  "}",
  "`, 'selective result payload');",
  "",
  "",
].join('\n');
source = source.slice(0, start) + lines + source.slice(end);
fs.writeFileSync(path, source);
