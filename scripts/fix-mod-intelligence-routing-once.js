'use strict';

const fs = require('fs');
const path = 'src/core/administration/mod/interactions.js';
let source = fs.readFileSync(path, 'utf8');

const handlerNeedle = "async function handleMemberScanButton(i) {\n  const id = String(i.customId || '');\n";
if (!source.includes(handlerNeedle)) throw new Error('handleMemberScanButton anchor not found');
source = source.replace(handlerNeedle, `${handlerNeedle}  if (id.startsWith('mod_dashboard:')) {\n    const [, targetId = 'none', requested = 'actions'] = id.split(':');\n    if (requested === 'intelligence' && targetId !== 'none') return runMemberScan(i, targetId, { record: false });\n  }\n`);

const routeOld = "  return routeHandlers(i, [handleExportInteraction, handleConfirmButton, value => handleCaseAction(value, { fetchTarget, createConfirmation }), handleDashboardNavigation, handleCancelButton, handleMemberScanButton, handleBulkButton, handleOpenActionButton, handleCaseToolButton]);";
const routeNew = "  return routeHandlers(i, [handleExportInteraction, handleConfirmButton, value => handleCaseAction(value, { fetchTarget, createConfirmation }), handleMemberScanButton, handleDashboardNavigation, handleCancelButton, handleBulkButton, handleOpenActionButton, handleCaseToolButton]);";
if (!source.includes(routeOld)) throw new Error('route order anchor not found');
source = source.replace(routeOld, routeNew);

fs.writeFileSync(path, source);
console.log('Patched Member Intelligence dashboard routing to canonical scan workspace.');
