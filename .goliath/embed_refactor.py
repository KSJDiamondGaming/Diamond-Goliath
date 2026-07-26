from pathlib import Path
import re

root = Path.cwd()
base = root / 'src/modules/messageStudio/embed'

(base / 'embedDeployments.js').write_text(
    (base / 'embedDeploymentStore.js').read_text(encoding='utf-8')
      .replace("./embedSocketEvents", "./embedTracking")
      .replace('// src/modules/messageStudio/embed/embedDeploymentStore.js', '// Canonical Embed deployment layer.'),
    encoding='utf-8', newline='\n'
)
(base / 'embedTracking.js').write_text(
    (base / 'embedSocketEvents.js').read_text(encoding='utf-8')
      .replace('// src/modules/messageStudio/embed/embedSocketEvents.js', '// Canonical Embed tracking and socket layer.'),
    encoding='utf-8', newline='\n'
)

template_sources = [
    ('embedPayloadNormalizer.js', 'payloadNormalizerApi'),
    ('embedTemplateManager.js', 'templateManagerApi'),
    ('presetStore.js', 'presetStoreApi'),
]
parts = ["'use strict';", '', '/**', ' * Canonical Embed templates layer.', ' * Owns templates, presets, imports, exports and payload normalisation.', ' */', '']
for _, api in template_sources:
    parts.append(f'let {api};')
parts.append('')
for filename, api in template_sources:
    text = (base / filename).read_text(encoding='utf-8')
    text = re.sub(r"^\s*['\"]use strict['\"];\s*\n", '', text, count=1)
    text = re.sub(r'^//\s*src/modules/messageStudio/embed/[^\n]+\n?', '', text, count=1)
    text = text.replace('module.exports =', f'{api} =', 1)
    parts.extend(['// ============================================================================', f'// {Path(filename).stem}', '// ============================================================================', '{'])
    parts.extend(('  ' + line if line else '') for line in text.strip().splitlines())
    parts.extend(['}', ''])
parts.extend([
    'module.exports = {',
    '  ...payloadNormalizerApi,',
    '  ...templateManagerApi,',
    '  ...presetStoreApi,',
    '  payloadNormalizer: payloadNormalizerApi,',
    '  templateManager: templateManagerApi,',
    '  presets: presetStoreApi,',
    '};',
    ''
])
(base / 'embedTemplates.js').write_text('\n'.join(parts), encoding='utf-8', newline='\n')

panel_path = base / 'embedPanel.js'
panel = panel_path.read_text(encoding='utf-8')
panel = panel.replace("./embedDeploymentStore", "./embedDeployments")
start = panel.index('async function replyOrUpdate(')
end = panel.index('\nmodule.exports = {', start)
handler_block = panel[start:end].rstrip() + '\n'
panel_without_handler = panel[:start].rstrip() + '\n\n'

function_names = re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', panel_without_handler)
const_names = re.findall(r'(?m)^const\s+([A-Za-z_$][\w$]*)\s*=', panel_without_handler)
exclude = {
    'EmbedBuilder','ActionRowBuilder','ButtonBuilder','ButtonStyle','StringSelectMenuBuilder',
    'ChannelSelectMenuBuilder','ChannelType','PermissionFlagsBits','ModalBuilder','TextInputBuilder',
    'TextInputStyle','saveEmbedDeployment','getEmbedDeployment','getDeploymentKeyFromState',
    'guildManager','validateChannelAccess','sessions'
}
exports = []
for name in function_names + const_names:
    if name not in exclude and name not in exports:
        exports.append(name)
for name in ['buildEmbedPanel','buildPreviewEmbed','buildPreviewEmbeds','TEMPLATES']:
    if name not in exports:
        exports.append(name)
panel_without_handler += 'module.exports = {\n' + ''.join(f'  {name},\n' for name in exports) + '};\n'
panel_path.write_text(panel_without_handler, encoding='utf-8', newline='\n')

interaction = """'use strict';

/**
 * Canonical Embed interactions layer.
 * Owns Discord component and modal routing for Embed Studio.
 */

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const {
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeployments');
const panel = require('./embedPanel');
const {
"""
interaction += ''.join(f'  {name},\n' for name in exports)
interaction += "} = panel;\n\n" + handler_block + "\nmodule.exports = { handleInteraction };\n"
(base / 'embedInteractions.js').write_text(interaction, encoding='utf-8', newline='\n')

(base / 'embedHealth.js').write_text("""'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { getAllEmbedDeployments, markEmbedDeploymentStatus, DEPLOYMENT_STATUS } = require('./embedDeployments');
const { listTemplates } = require('./embedTemplates');

function now() { return new Date().toISOString(); }

async function inspectDeployment(guild, deployment) {
  const issues = [];
  const channel = guild.channels.cache.get(deployment.channelId)
    || await guild.channels.fetch(deployment.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    issues.push({ code: 'channel_missing', deploymentKey: deployment.key || deployment.deploymentKey });
    return { deployment, healthy: false, issues };
  }
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  for (const permission of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]) {
    if (!permissions?.has(permission)) issues.push({ code: 'permission_missing', permission: String(permission), channelId: channel.id, deploymentKey: deployment.key });
  }
  if (deployment.messageId) {
    const message = await channel.messages.fetch(deployment.messageId).catch(() => null);
    if (!message) issues.push({ code: 'message_missing', channelId: channel.id, messageId: deployment.messageId, deploymentKey: deployment.key });
  }
  return { deployment, healthy: issues.length === 0, issues };
}

async function buildHealthReport(guild) {
  const deployments = Object.values(getAllEmbedDeployments(guild.id) || {});
  const checks = [];
  for (const deployment of deployments) checks.push(await inspectDeployment(guild, deployment));
  const issues = checks.flatMap((check) => check.issues);
  return {
    module: 'embed',
    healthy: issues.length === 0,
    templates: Object.keys(listTemplates(guild.id) || {}).length,
    deployments: deployments.length,
    issues,
    checkedAt: now(),
  };
}

async function repairAll(guild, actorId = null) {
  const report = await buildHealthReport(guild);
  for (const issue of report.issues) {
    if (!issue.deploymentKey) continue;
    const status = issue.code === 'channel_missing'
      ? DEPLOYMENT_STATUS.MISSING_CHANNEL
      : issue.code === 'message_missing'
        ? DEPLOYMENT_STATUS.MISSING_MESSAGE
        : DEPLOYMENT_STATUS.PERMISSION_ERROR;
    markEmbedDeploymentStatus(guild.id, issue.deploymentKey, status, {
      actorId,
      missingReason: issue.code,
      repairedAt: now(),
    });
  }
  return buildHealthReport(guild);
}

module.exports = { buildHealthReport, repairAll, inspectDeployment };
""", encoding='utf-8', newline='\n')

(base / 'embed.js').write_text("""'use strict';

const templates = require('./embedTemplates');
const deployments = require('./embedDeployments');
const panel = require('./embedPanel');
const interactions = require('./embedInteractions');
const tracking = require('./embedTracking');
const validation = require('./embedValidation');
const health = require('./embedHealth');

function getOverview(guildId) {
  const allTemplates = templates.listTemplates(guildId) || {};
  const allDeployments = Object.values(deployments.getAllEmbedDeployments(guildId) || {});
  return {
    enabled: true,
    templates: { total: Object.keys(allTemplates).length },
    deployments: {
      total: allDeployments.length,
      active: allDeployments.filter((item) => !item.status || item.status === 'active').length,
      unavailable: allDeployments.filter((item) => item.status && item.status !== 'active').length,
    },
  };
}

module.exports = {
  getOverview,
  buildHealthReport: health.buildHealthReport,
  repairAll: health.repairAll,
  handleInteraction: interactions.handleInteraction,
  templates,
  deployments,
  panel,
  interactions,
  tracking,
  validation,
  health,
};
""", encoding='utf-8', newline='\n')

old_route = root / 'src/server/routes/config/embeds.js'
new_route = root / 'src/server/routes/embeds.js'
route = old_route.read_text(encoding='utf-8')
route = route.replace("require('../../../core/guild/guildManager')", "require('../../core/guild/guildManager')")
route = route.replace("require('../../sockets/socketHub')", "require('../sockets/socketHub')")
new_route.write_text(route, encoding='utf-8', newline='\n')

replacements = {
    'embedTemplateManager': 'embedTemplates',
    'presetStore': 'embedTemplates',
    'embedPayloadNormalizer': 'embedTemplates',
    'embedDeploymentStore': 'embedDeployments',
    'embedSocketEvents': 'embedTracking',
}
for path in list((root / 'src').rglob('*.js')) + [root / 'server.js']:
    if not path.is_file() or path.parent == base:
        continue
    data = path.read_text(encoding='utf-8')
    original = data
    for old, new in replacements.items():
        data = data.replace(f'/embed/{old}', f'/embed/{new}')
        data = data.replace(f'./{old}', f'./{new}')
        data = data.replace(f'../embed/{old}', f'../embed/{new}')
    data = data.replace("optionalRequire('embed panel', '../../modules/messageStudio/embed/embedPanel')", "optionalRequire('embed interactions', '../../modules/messageStudio/embed/embedInteractions')")
    data = data.replace("./src/server/routes/config/embeds", "./src/server/routes/embeds")
    if data != original:
        path.write_text(data, encoding='utf-8', newline='\n')

for legacy in [
    'embedDeploymentStore.js', 'embedPayloadNormalizer.js', 'embedSocketEvents.js',
    'embedTemplateManager.js', 'presetStore.js'
]:
    (base / legacy).unlink(missing_ok=True)
old_route.unlink(missing_ok=True)

(root / 'docs/modules/embed.md').write_text("""# Embed Studio

Embed Studio is consolidated into eight canonical implementation files.

```text
src/modules/messageStudio/embed/
├── embed.js
├── embedPanel.js
├── embedInteractions.js
├── embedTemplates.js
├── embedDeployments.js
├── embedTracking.js
├── embedValidation.js
└── embedHealth.js
```

- `embed.js` — public API and module overview.
- `embedPanel.js` — all visible Discord UI, previews, buttons, menus and modals.
- `embedInteractions.js` — component and modal routing.
- `embedTemplates.js` — templates, presets, imports, exports and payload normalisation.
- `embedDeployments.js` — deployed message persistence and resolution.
- `embedTracking.js` — socket and deployment update events.
- `embedValidation.js` — Discord payload and URL validation.
- `embedHealth.js` — diagnostics and repair.

The HTTP configuration router lives at `src/server/routes/embeds.js` and is not a module implementation file.

No compatibility layers, wrappers, bridges or duplicate implementations are retained.
""", encoding='utf-8', newline='\n')

for temporary in [
    root / '.github/workflows/embed-refactor-export.yml',
    root / '.github/workflows/embed-refactor-build.yml',
    root / '.goliath/embed-export-artifact-id.txt',
    root / '.goliath/embed_refactor.py',
]:
    temporary.unlink(missing_ok=True)
