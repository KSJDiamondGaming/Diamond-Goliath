'use strict';

const fs = require('fs');
const path = 'src/owner/command.js';
let source = fs.readFileSync(path, 'utf8');

const oldNavigation = `  const navigation = new ActionRowBuilder().addComponents(\n    new ButtonBuilder()\n      .setCustomId(contextualOwnerId('refresh', interaction))\n      .setLabel('Refresh')\n      .setEmoji('🔄')\n      .setStyle(ButtonStyle.Secondary)\n  );`;

const newNavigation = `  const navigationComponents = [\n    new ButtonBuilder()\n      .setCustomId(contextualOwnerId('refresh', interaction))\n      .setLabel('Refresh')\n      .setEmoji('🔄')\n      .setStyle(ButtonStyle.Secondary),\n  ];\n\n  if (isDev) {\n    navigationComponents.push(\n      new ButtonBuilder()\n        .setLabel('Sync DEV Now')\n        .setEmoji('🚀')\n        .setStyle(ButtonStyle.Link)\n        .setURL('https://github.com/KSJHub/Goliath/actions/workflows/sync-dev-now.yml')\n    );\n  }\n\n  const navigation = new ActionRowBuilder().addComponents(...navigationComponents);`;

if (!source.includes(oldNavigation)) {
  throw new Error('Owner panel navigation patch anchor not found.');
}
source = source.replace(oldNavigation, newNavigation);

source = source.replace(
  "{ name: 'Owner Tools', value: showCommandCenter ? '🟢 Server Tools • Security • Command Center' : '🟢 Server Tools • Security', inline: true },",
  "{ name: 'Owner Tools', value: showCommandCenter ? '🟢 Server Tools • Security • DEV Sync • Command Center' : (isDev ? '🟢 Server Tools • Security • DEV Sync' : '🟢 Server Tools • Security'), inline: true },"
);

fs.writeFileSync(path, source);
console.log('Owner DEV sync button patch applied.');
