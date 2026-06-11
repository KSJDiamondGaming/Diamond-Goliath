'use strict';

// scripts/patch-embed-studio-step3.js
// Applies targeted Step 3 Embed Studio deployment UI/update-existing improvements.

const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'functions', 'embed', 'embedPanel.js');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }

  return source.replace(from, to);
}

function run() {
  if (!fs.existsSync(filePath)) {
    throw new Error(`embedPanel.js not found at ${filePath}`);
  }

  let source = fs.readFileSync(filePath, 'utf8');

  if (source.includes('formatDeploymentStatusLabel(')) {
    console.log('✅ Embed Studio Step 3 patch already applied.');
    return;
  }

  source = replaceOnce(
    source,
    `const {\n  saveEmbedDeployment,\n  getEmbedDeployment,\n  getDeploymentKeyFromState,\n} = require('./embedDeploymentStore');`,
    `const {\n  saveEmbedDeployment,\n  getEmbedDeployment,\n  getDeploymentKeyFromState,\n  resolveEmbedDeployment,\n  DEPLOYMENT_STATUS,\n} = require('./embedDeploymentStore');`,
    'embedDeploymentStore import'
  );

  source = replaceOnce(
    source,
    `function getAutoPresetName(state) {\n  return \`auto-\${state.template || 'custom'}\`;\n}\n`,
    `function getAutoPresetName(state) {\n  return \`auto-\${state.template || 'custom'}\`;\n}\n\nfunction formatDeploymentStatusLabel(status) {\n  const labels = {\n    [DEPLOYMENT_STATUS.ACTIVE]: '🟢 Active',\n    [DEPLOYMENT_STATUS.NOT_DEPLOYED]: '⚪ Not Deployed',\n    [DEPLOYMENT_STATUS.MISSING_MESSAGE]: '🟠 Missing Message',\n    [DEPLOYMENT_STATUS.MISSING_CHANNEL]: '🔴 Missing Channel',\n    [DEPLOYMENT_STATUS.PERMISSION_ERROR]: '🔒 Permission Error',\n    [DEPLOYMENT_STATUS.UNKNOWN]: '⚫ Unknown',\n  };\n\n  return labels[status] || labels[DEPLOYMENT_STATUS.UNKNOWN];\n}\n\nfunction formatDeploymentTime(value) {\n  if (!value) return 'Never';\n\n  const time = Date.parse(value);\n  if (!Number.isFinite(time)) return 'Unknown';\n\n  return \`<t:\${Math.floor(time / 1000)}:R>\`;\n}\n\nfunction getDeploymentSummary(state, interaction) {\n  const key = getDeploymentKeyFromState(state);\n  const deployment = getEmbedDeployment(interaction.guild.id, key);\n\n  if (!deployment) {\n    return [\n      '> **Deployment:** ⚪ Not Deployed',\n      '> **Channel:** Not linked',\n      '> **Message ID:** Not linked',\n      '> **Last Updated:** Never',\n    ].join('\\n');\n  }\n\n  return [\n    \`> **Deployment:** \${formatDeploymentStatusLabel(deployment.status || DEPLOYMENT_STATUS.ACTIVE)}\`,\n    \`> **Channel:** \${deployment.channelId ? \`<#\${deployment.channelId}>\` : 'Not linked'}\`,\n    \`> **Message ID:** \${deployment.messageId ? \`\\\`\${deployment.messageId}\\\`\` : 'Not linked'}\`,\n    \`> **Last Updated:** \${formatDeploymentTime(deployment.lastUpdatedAt)}\`,\n    deployment.lastUpdatedBy ? \`> **Updated By:** <@\${deployment.lastUpdatedBy}>\` : null,\n    deployment.missingReason ? \`> **Note:** \${deployment.missingReason}\` : null,\n  ].filter(Boolean).join('\\n');\n}\n`,
    'deployment helpers'
  );

  source = replaceOnce(
    source,
    "        `> **Buttons:** ${state.buttons?.length || 0}/20`,\n        `> **Unsaved Changes:** ${",
    "        `> **Buttons:** ${state.buttons?.length || 0}/20`,\n        '',\n        '**Deployment Status**',\n        getDeploymentSummary(state, interaction),\n        '',\n        `> **Unsaved Changes:** ${",
    'deployment status in editor panel'
  );

  source = replaceOnce(
    source,
    `if (interaction.customId === 'embed:update-existing') {\n\n  const deployment = getEmbedDeployment(\n    interaction.guild.id,\n    getDeploymentKeyFromState(state)\n  );\n\n  if (!deployment) {\n    await interaction.reply({\n      content: '⚠️ No deployed embed found. Use the embed first.',\n      flags: 64,\n    });\n\n    return true;\n  }\n\n  try {\n    const channel = await interaction.guild.channels.fetch(\n      deployment.channelId\n    );\n\n    const message = await channel.messages.fetch(\n      deployment.messageId\n    );\n\n    await message.edit({\n      content: state.allowUserPing\n        ? \`<@\${interaction.user.id}>\`\n        : '',\n      embeds: [buildPreviewEmbed(state, interaction)],\n      components: buildButtonComponents(state),\n      allowedMentions: getAllowedMentionsForState(\n        state,\n        interaction\n      ),\n    });\n\n    await interaction.reply({\n      content: '✅ Existing embed updated.',\n      flags: 64,\n    });\n\n  } catch (error) {\n    console.error(\n      'Failed to update existing embed:',\n      error\n    );\n\n    await interaction.reply({\n      content:\n        '⚠️ Original embed not found. Use the embed again to repost it.',\n      flags: 64,\n    });\n  }\n\n  return true;\n}\n`,
    `if (interaction.customId === 'embed:update-existing') {\n  const deploymentKey = getDeploymentKeyFromState(state);\n  const resolved = await resolveEmbedDeployment(interaction.guild, deploymentKey);\n\n  if (resolved.status !== DEPLOYMENT_STATUS.ACTIVE || !resolved.message) {\n    await interaction.reply({\n      content: [\n        \`⚠️ Existing embed cannot be updated.\`,\n        \`Status: **\${formatDeploymentStatusLabel(resolved.status)}**\`,\n        resolved.reason ? \`Reason: \${resolved.reason}\` : null,\n        '',\n        'Use **Use Embed** again to repost/relink it.',\n      ].filter(Boolean).join('\\n'),\n      flags: 64,\n    });\n\n    return true;\n  }\n\n  try {\n    await resolved.message.edit({\n      content: state.allowUserPing ? \`<@\${interaction.user.id}>\` : '',\n      embeds: [buildPreviewEmbed(state, interaction)],\n      components: buildButtonComponents(state),\n      allowedMentions: getAllowedMentionsForState(state, interaction),\n    });\n\n    const presetName = state.selectedPreset || resolved.deployment?.preset || getAutoPresetName(state);\n\n    guildManager.saveEmbedPreset(\n      interaction.guild.id,\n      presetName,\n      getPresetDataFromState(state),\n      interaction.guild\n    );\n\n    saveEmbedDeployment(\n      interaction.guild.id,\n      deploymentKey,\n      {\n        channelId: resolved.channel.id,\n        messageId: resolved.message.id,\n        template: state.template,\n        preset: presetName,\n        createdBy: resolved.deployment?.createdBy || interaction.user.id,\n        lastUpdatedBy: interaction.user.id,\n        status: DEPLOYMENT_STATUS.ACTIVE,\n        missingReason: null,\n      }\n    );\n\n    clearUnsaved(interaction, {\n      ...state,\n      selectedPreset: presetName,\n    });\n\n    await interaction.reply({\n      content: '✅ Existing embed updated, preset saved, and deployment metadata refreshed.',\n      flags: 64,\n    });\n  } catch (error) {\n    console.error('Failed to update existing embed:', error);\n\n    await interaction.reply({\n      content: '⚠️ Existing embed update failed. Check bot permissions, channel access, and message availability.',\n      flags: 64,\n    });\n  }\n\n  return true;\n}\n`,
    'update existing handler'
  );

  fs.writeFileSync(filePath, source, 'utf8');
  console.log('✅ Embed Studio Step 3 patch applied to src/functions/embed/embedPanel.js');
  console.log('Next: run node --check src/functions/embed/embedPanel.js');
}

try {
  run();
} catch (error) {
  console.error('❌ Embed Studio Step 3 patch failed:');
  console.error(error.message || error);
  process.exitCode = 1;
}
