'use strict';

const { assertContains, printHeader } = require('./lib/scriptUtils');

const CONTRACTS = [
  ['src/dashboard/js/services/apiClient.js', 'getGuildModules: (guildId) => request(`/api/modules/${guildId}`)', 'Frontend modules loader contract'],
  ['src/dashboard/js/services/apiClient.js', 'setGuildModuleEnabled: (guildId, moduleKey, enabled) => request(`/api/modules/${guildId}/${moduleKey}/enabled`', 'Frontend modules toggle contract'],
  ['src/server/routes/modules.js', "router.get('/:guildId'", 'Backend modules root route'],
  ['src/server/routes/modules.js', "router.patch('/:guildId/:moduleKey/enabled'", 'Backend modules toggle route'],

  ['src/server/routes/config/generalSettings.js', 'dashboardPermissions', 'Admin dashboard permission persistence'],
  ['src/server/routes/config/generalSettings.js', 'moduleAccess', 'Admin dashboard control persistence'],
  ['src/server/routes/config/generalSettings.js', 'roleAccess', 'Admin per-role permission persistence'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Admin Role Workspace', 'Admin role workspace UI'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Dashboard Access', 'Admin dashboard access panel UI'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Module Access', 'Admin module access panel UI'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Command Access', 'Admin command access panel UI'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Protected Actions', 'Admin protected actions panel UI'],
  ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Permission Presets', 'Admin permission presets UI'],

  ['src/server/routes/ownerDiagnostics.js', "router.get('/deployments'", 'Deployment Centre diagnostics API route'],
  ['src/server/routes/ownerDiagnostics.js', 'buildDeploymentPayload', 'Deployment Centre payload builder'],

  ['src/dashboard/js/pages/modules/TempVoice.jsx', 'api.request(`/api/temp-voice/${guildId}`)', 'Frontend Temp Voice loader contract'],
  ['src/dashboard/js/pages/modules/TempVoice.jsx', 'TempVoiceControlCentre', 'Frontend Temp Voice control centre wiring'],
  ['src/dashboard/js/pages/modules/TempVoice.jsx', 'Activity Log', 'Frontend Temp Voice activity log panel'],
  ['src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/controls', 'Frontend Temp Voice channel controls contract'],
  ['src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/claim', 'Frontend Temp Voice claim contract'],
  ['src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}/kick', 'Frontend Temp Voice member control contract'],
  ['src/dashboard/js/pages/modules/tempvoice/TempVoiceControlCentre.jsx', '/api/temp-voice/${guildId}/channels/${channelId}`', 'Frontend Temp Voice channel close contract'],
  ['src/server/routes/tempVoice.js', "router.patch('/:guildId/channels/:channelId/controls'", 'Backend Temp Voice controls route'],
  ['src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/claim'", 'Backend Temp Voice claim route'],
  ['src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/kick'", 'Backend Temp Voice member control route'],
  ['src/server/routes/tempVoice.js', "router.delete('/:guildId/channels/:channelId'", 'Backend Temp Voice channel close route'],
  ['src/server/routes/tempVoice.js', 'syncHubToDiscord', 'Backend Temp Voice hub edit Discord sync'],
  ['src/server/routes/tempVoice.js', 'deleteHubDiscordResources', 'Backend Temp Voice hub delete Discord cleanup'],
  ['src/server/routes/tempVoice.js', 'scanTempVoiceOrphans', 'Backend Temp Voice orphan scanner'],
  ['src/server/routes/tempVoice.js', 'cleanupTempVoiceOrphans', 'Backend Temp Voice orphan cleanup'],
  ['src/server/routes/tempVoice.js', "router.get('/:guildId/health'", 'Backend Temp Voice health route'],
  ['src/server/routes/tempVoice.js', "router.post('/:guildId/cleanup-orphans'", 'Backend Temp Voice cleanup route'],
  ['src/server/routes/tempVoice.js', "router.put('/:guildId/hubs/:hubId'", 'Backend Temp Voice hub edit route'],
  ['src/server/routes/tempVoice.js', "router.delete('/:guildId/hubs/:hubId'", 'Backend Temp Voice hub delete route'],
  ['src/modules/tempvoice/tempVoiceInteractionHandler.js', 'buildControlRows', 'Discord Temp Voice owner panel buttons'],
  ['src/events/interactions/interactionCreate.js', 'handleTempVoiceInteraction', 'Discord Temp Voice interaction wiring'],
  ['src/modules/tempvoice/tempVoiceManager.js', 'postOwnerPanel', 'Temp Voice owner panel posting'],
  ['src/modules/tempvoice/tempVoiceStore.js', 'addActivity', 'Temp Voice activity storage'],
];

function main() {
  for (const [file, needle, label] of CONTRACTS) {
    assertContains(file, needle, label);
  }

  printHeader('✅ Dashboard API contracts OK', {
    Contracts: CONTRACTS.length,
  });
}

main();
