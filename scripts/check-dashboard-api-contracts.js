'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertContains(file, needle, label) {
  const source = read(file);
  if (!source.includes(needle)) {
    throw new Error(`${label} missing in ${file}: ${needle}`);
  }
}

function main() {
  assertContains('src/dashboard/js/services/apiClient.js', 'getGuildModules: (guildId) => request(`/api/modules/${guildId}`)', 'Frontend modules loader contract');
  assertContains('src/dashboard/js/services/apiClient.js', 'setGuildModuleEnabled: (guildId, moduleKey, enabled) => request(`/api/modules/${guildId}/${moduleKey}/enabled`', 'Frontend modules toggle contract');
  assertContains('src/server/routes/modules.js', "router.get('/:guildId'", 'Backend modules root route');
  assertContains('src/server/routes/modules.js', "router.patch('/:guildId/:moduleKey/enabled'", 'Backend modules toggle route');

  assertContains('src/server/routes/ownerDiagnostics.js', "router.get('/deployments'", 'Deployment Centre diagnostics API route');
  assertContains('src/server/routes/ownerDiagnostics.js', 'buildDeploymentPayload', 'Deployment Centre payload builder');

  assertContains('src/dashboard/js/pages/modules/TempVoice.jsx', 'api.request(`/api/temp-voice/${guildId}`)', 'Frontend Temp Voice loader contract');
  assertContains('src/dashboard/js/pages/modules/TempVoice.jsx', 'TempVoiceControlCentre', 'Frontend Temp Voice control centre wiring');
  assertContains('src/dashboard/js/pages/modules/TempVoice.jsx', 'Activity Log', 'Frontend Temp Voice activity log panel');
  assertContains('src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/controls', 'Frontend Temp Voice channel controls contract');
  assertContains('src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/claim', 'Frontend Temp Voice claim contract');
  assertContains('src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/kick', 'Frontend Temp Voice member control contract');
  assertContains('src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}`', 'Frontend Temp Voice channel close contract');
  assertContains('src/server/routes/tempVoice.js', "router.patch('/:guildId/channels/:channelId/controls'", 'Backend Temp Voice controls route');
  assertContains('src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/claim'", 'Backend Temp Voice claim route');
  assertContains('src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/kick'", 'Backend Temp Voice member control route');
  assertContains('src/server/routes/tempVoice.js', "router.delete('/:guildId/channels/:channelId'", 'Backend Temp Voice channel close route');
  assertContains('src/modules/tempvoice/tempVoiceInteractionHandler.js', 'buildControlRows', 'Discord Temp Voice owner panel buttons');
  assertContains('src/events/interactions/interactionCreate.js', 'handleTempVoiceInteraction', 'Discord Temp Voice interaction wiring');
  assertContains('src/modules/tempvoice/tempVoiceManager.js', 'postOwnerPanel', 'Temp Voice owner panel posting');
  assertContains('src/modules/tempvoice/tempVoiceStore.js', 'addActivity', 'Temp Voice activity storage');

  console.log('✅ Dashboard API contracts OK');
}

main();
