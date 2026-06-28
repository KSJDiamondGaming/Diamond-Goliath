'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MODE = String(process.env.BOT_MODE || process.argv[3] || 'dev').toLowerCase();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite']);

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function root(...parts) {
  return path.join(ROOT, ...parts);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js')) files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function banner(title, rows = {}) {
  console.log('============================================================');
  console.log(title);
  for (const [key, value] of Object.entries(rows)) console.log(`${key}: ${value}`);
  console.log('============================================================');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(read(filePath));
  } catch (error) {
    return { __error: error.message };
  }
}

function checkSyntax() {
  const files = [root('server.js'), ...walk(root('src')), ...walk(root('scripts'))]
    .filter((file) => !file.includes(`${path.sep}dashboard${path.sep}`));
  const uniqueFiles = [...new Set(files)];

  for (const file of uniqueFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Syntax check failed: ${rel(file)}\n${result.stderr || result.stdout}`);
  }

  return uniqueFiles.length;
}

function commandJson(command) {
  if (!command?.data) return null;
  if (typeof command.data.toJSON === 'function') return command.data.toJSON();
  if (typeof command.data === 'object') return command.data;
  return null;
}

function checkCommands() {
  const files = walk(root('src', 'commands'));
  const seen = new Set();
  const errors = [];
  const warnings = [];

  if (!files.length) throw new Error('No command files found in src/commands');

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);
      const json = commandJson(command);
      const name = json?.name || command?.data?.name || '';
      const description = json?.description || command?.data?.description || '';

      if (!command?.data) errors.push(`${rel(file)}: missing data export`);
      if (typeof command?.execute !== 'function') errors.push(`${rel(file)}: missing execute function`);
      if (!json) errors.push(`${rel(file)}: command data cannot be converted to JSON`);
      if (!name) errors.push(`${rel(file)}: missing command name`);
      if (name && seen.has(name)) errors.push(`${rel(file)}: duplicate command name ${name}`);
      if (name) seen.add(name);
      if (name && !/^[\w-]{1,32}$/.test(name)) errors.push(`${rel(file)}: invalid command name ${name}`);
      if (!description) warnings.push(`${rel(file)}: missing command description`);
      if (description.length > 100) errors.push(`${rel(file)}: command description exceeds 100 characters`);
      if (json) JSON.stringify(json);
    } catch (error) {
      errors.push(`${rel(file)}: ${error.message}`);
    }
  }

  return { files: files.length, errors, warnings };
}

function assertContains(file, needle, label) {
  const filePath = root(file);
  if (!fs.existsSync(filePath)) throw new Error(`${label} missing file: ${file}`);
  if (!read(filePath).includes(needle)) throw new Error(`${label} missing in ${file}: ${needle}`);
}

function checkDashboardContracts() {
  const contracts = [
    ['src/dashboard/js/services/apiClient.js', 'getGuildModules', 'Frontend modules loader contract'],
    ['src/dashboard/js/services/apiClient.js', 'setGuildModuleEnabled', 'Frontend modules toggle contract'],
    ['src/server/routes/modules.js', "router.get('/:guildId'", 'Backend modules root route'],
    ['src/server/routes/modules.js', "router.patch('/:guildId/:moduleKey/enabled'", 'Backend modules toggle route'],
    ['src/server/routes/config/generalSettings.js', 'dashboardPermissions', 'Admin dashboard permission persistence'],
    ['src/server/routes/config/generalSettings.js', 'moduleAccess', 'Admin module access persistence'],
    ['src/server/routes/config/generalSettings.js', 'roleAccess', 'Admin role access persistence'],
    ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Admin Role Workspace', 'Admin role workspace UI'],
    ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Dashboard Access', 'Admin dashboard access panel UI'],
    ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Module Access', 'Admin module access panel UI'],
    ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Command Access', 'Admin command access panel UI'],
    ['src/dashboard/js/pages/administration/AdminRoleWorkspace.jsx', 'Protected Actions', 'Admin protected actions panel UI'],
    ['src/server/routes/ownerDiagnostics.js', "router.get('/deployments'", 'Deployment diagnostics API route'],
    ['src/server/routes/ownerDiagnostics.js', 'buildDeploymentPayload', 'Deployment payload builder'],
    ['src/server/routes/tempVoice.js', "router.patch('/:guildId/channels/:channelId/controls'", 'Temp Voice controls route'],
    ['src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/claim'", 'Temp Voice claim route'],
    ['src/server/routes/tempVoice.js', "router.post('/:guildId/channels/:channelId/kick'", 'Temp Voice kick route'],
    ['src/server/routes/tempVoice.js', "router.delete('/:guildId/channels/:channelId'", 'Temp Voice close route'],
    ['src/events/interactions/interactionCreate.js', 'handleTempVoiceInteraction', 'Temp Voice interaction wiring'],
  ];

  for (const [file, needle, label] of contracts) assertContains(file, needle, label);
  return contracts.length;
}

function checkDashboardPages() {
  const layoutFile = root('src', 'dashboard', 'js', 'ui', 'layout.js');
  const registryFile = root('src', 'dashboard', 'js', 'shared', 'moduleRegistry.js');

  if (!fs.existsSync(layoutFile) || !fs.existsSync(registryFile)) return { skipped: true };

  const layout = read(layoutFile);
  const registry = read(registryFile);
  if (!layout.includes('ROUTES')) throw new Error('Dashboard ROUTES export missing');
  if (!layout.includes('PAGE_LAYOUTS')) throw new Error('Dashboard PAGE_LAYOUTS export missing');
  if (!layout.includes('SECTION_DEFS')) throw new Error('Dashboard SECTION_DEFS export missing');

  return {
    lazyPages: [...layout.matchAll(/lazy\(\(\)\s*=>\s*import\(/g)].length,
    moduleRoutes: [...registry.matchAll(/route:\s*['"]/g)].length,
  };
}

function checkAll() {
  const syntaxFiles = checkSyntax();
  const commands = checkCommands();
  const pages = checkDashboardPages();
  const contracts = checkDashboardContracts();

  for (const warning of commands.warnings) console.log(`⚠️ ${warning}`);
  if (commands.errors.length) throw new Error(commands.errors.join('\n'));

  banner('✅ Goliath checks complete', {
    'Syntax files': syntaxFiles,
    Commands: commands.files,
    'Command warnings': commands.warnings.length,
    'Dashboard lazy pages': pages.skipped ? 'skipped' : pages.lazyPages,
    'Dashboard module routes': pages.skipped ? 'skipped' : pages.moduleRoutes,
    Contracts: contracts,
  });
}

function verifyGuilds() {
  const { getRuntimePaths } = require(root('src', 'config', 'runtimePaths'));
  const guildManager = require(root('src', 'guild', 'guildManager'));
  const runtimePaths = getRuntimePaths(MODE);
  const guildsDir = runtimePaths.guilds;
  const expectedModules = Object.keys(guildManager.DEFAULT_MODULES || {});
  const files = fs.existsSync(guildsDir)
    ? fs.readdirSync(guildsDir).filter((file) => /^\d{16,25}\.json$/.test(file)).map((file) => path.join(guildsDir, file))
    : [];
  let failed = 0;
  let warnings = 0;

  for (const file of files) {
    const data = readJson(file);
    const guildId = path.basename(file, '.json');
    if (data.__error) {
      console.log(`❌ ${guildId}: ${data.__error}`);
      failed += 1;
      continue;
    }

    const guildData = guildManager.getGuildData(guildId, { forceReload: true });
    const modules = guildData.modules && typeof guildData.modules === 'object' ? guildData.modules : {};
    if (!guildData.modules || typeof guildData.modules !== 'object') {
      console.log(`❌ ${guildId}: missing modules object`);
      failed += 1;
    }

    for (const key of expectedModules) {
      if (!modules[key] || typeof modules[key] !== 'object') {
        console.log(`⚠️ ${guildId}: modules.${key} missing or invalid`);
        warnings += 1;
      }
    }
  }

  banner(failed ? '❌ Guild verification complete' : '✅ Guild verification complete', {
    Mode: MODE,
    'Guild files': files.length,
    Failed: failed,
    Warnings: warnings,
  });

  if (failed) process.exitCode = 1;
}

function auditRuntime() {
  const findings = [];
  const safeHints = ['getGuildSection', 'updateGuildSection', 'saveGuildSection', 'moduleSectionManager', 'backups', 'exports', 'cache', 'logs', 'transcripts', 'recovery'];

  for (const file of walk(root('src'))) {
    const source = read(file);
    if (!source.includes('writeFile') && !source.includes('path.join')) continue;
    if (!source.includes('runtime') && !source.includes('guilds') && !source.includes('data') && !source.includes('store')) continue;
    if (safeHints.some((hint) => source.includes(hint))) continue;
    findings.push(rel(file));
  }

  banner('Goliath runtime audit', { Mode: MODE, Findings: findings.length });
  for (const file of findings) console.log(`⚠️ ${file}`);
  if (findings.length) process.exitCode = 1;
}

function help() {
  console.log('Goliath unified scripts CLI');
  console.log('Usage: node scripts/scripts.js <command> [mode]');
  console.log('Commands: check | guilds | runtime | audit | help');
}

function main() {
  const command = process.argv[2] || 'help';

  try {
    if (command === 'check') checkAll();
    else if (command === 'guilds' || command === 'verify') verifyGuilds();
    else if (command === 'runtime' || command === 'audit') auditRuntime();
    else help();
  } catch (error) {
    console.error('❌ Script failed');
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

main();
