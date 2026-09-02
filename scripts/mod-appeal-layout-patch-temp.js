'use strict';

const fs = require('fs');

const file = 'src/core/administration/mod/cases.js';
let source = fs.readFileSync(file, 'utf8');

const oldStatus = `  const statusRow = new ActionRowBuilder().addComponents(\n    ...['pending', 'approved', 'denied', 'all'].map((status) => new ButtonBuilder()\n      .setCustomId(\`mod_case_appeal_queue_status:\${activeToken}:\${status}\`)\n      .setLabel(status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'All')\n      .setStyle(normalizedStatus === status ? ButtonStyle.Primary : ButtonStyle.Secondary))\n  );\n  const pageRow = new ActionRowBuilder().addComponents(\n    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.max(0, page - 1)}\`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),\n    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.min(totalPages - 1, page + 1)}\`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)\n  );`;

const newStatus = `  const statusRow = new ActionRowBuilder().addComponents(\n    ...['pending', 'approved', 'denied'].map((status) => new ButtonBuilder()\n      .setCustomId(\`mod_case_appeal_queue_status:\${activeToken}:\${status}\`)\n      .setLabel(status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Denied')\n      .setStyle(normalizedStatus === status ? ButtonStyle.Primary : ButtonStyle.Secondary))\n  );\n  const pageRow = new ActionRowBuilder().addComponents(\n    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.max(0, page - 1)}\`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),\n    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue_status:\${activeToken}:all\`).setLabel('All').setStyle(normalizedStatus === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),\n    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.min(totalPages - 1, page + 1)}\`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)\n  );`;

if (!source.includes(oldStatus)) {
  throw new Error('Expected Appeal Queue control block was not found; refusing to patch stale source.');
}

source = source.replace(oldStatus, newStatus);
fs.writeFileSync(file, source);

console.log('✅ Appeal Queue controls updated:');
console.log('   Row 1: Pending | Approved | Denied');
console.log('   Row 2: Previous | All | Next');
