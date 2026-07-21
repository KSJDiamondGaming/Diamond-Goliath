'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tools = path.join(root, 'tools');
const mode = process.env.BOT_MODE || 'dev';
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'];
const TEXT_EXTENSIONS = [...SOURCE_EXTENSIONS, '.json', '.md', '.txt', '.yml', '.yaml'];
const IMPORT_TIMEOUT_MS = Number(process.env.GOLIATH_IMPORT_AUDIT_TIMEOUT_MS || 15000);
const SLOW_IMPORT_MS = Number(process.env.GOLIATH_IMPORT_AUDIT_SLOW_MS || 3000);
const MOJIBAKE_MARKERS = [0x00e2, 0x00f0, 0x00ef, 0x00c3, 0xfffd].map((code) => String.fromCharCode(code));

const TOOL_FILES = Object.freeze({
  social: 'social-doctor.js',
  invitesDoctor: 'invites-doctor.js',
  invitesTest: 'invites-smoke-test.js',
  goodbye: 'goodbye-doctor.js',
  reactionDoctor: 'reaction-roles-doctor.js',
  reactionTest: 'reaction-roles-smoke-test.js',
  roleStudioTest: 'role-studio-smoke-test.js',
});

function absolute(file) { return path.join(root, file); }
function rel(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function normalise(value) { return path.normalize(value).replace(/\\/g, '/'); }
function section(title) { console.log(`\n${title}`); console.log('='.repeat(title.length)); }

function walk(dir, extensions = ['.js']) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath, extensions));
    else if (entry.isFile() && extensions.includes(path.extname(entry.name))) files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function extractRelativeImports(source) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /export\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) imports.add(match[1]);
  }
  return [...imports];
}

function resolveImport(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [];
  if (SOURCE_EXTENSIONS.includes(path.extname(base))) candidates.push(base);
  else {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(base + extension);
    for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`));
  }
  return candidates.map(normalise).find((candidate) => fs.existsSync(candidate)) || null;
}

function checkProjectShape() {
  section('Project shape');
  const expected = ['server.js', 'package.json', 'src/commands', 'src/core', 'src/dashboard', 'src/events', 'src/modules', 'src/runtime', 'src/server'];
  const missing = [];
  for (const item of expected) {
    const present = fs.existsSync(absolute(item));
    console.log(`${present ? '✅' : '❌'} ${item}`);
    if (!present) missing.push(item);
  }
  return missing.length === 0;
}

function auditCommands() {
  section('Command audit');
  const files = walk(absolute('src/commands'));
  const errors = [];
  const names = new Set();
  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);
      const name = command?.data?.toJSON?.()?.name;
      if (!name) throw new Error('missing command data/name');
      if (names.has(name)) throw new Error(`duplicate command name /${name}`);
      if (typeof command.execute !== 'function') throw new Error('missing execute function');
      names.add(name);
      console.log(`✅ /${name}`);
    } catch (error) {
      errors.push(`${rel(file)}: ${error.message}`);
      console.log(`❌ ${rel(file)}`);
    }
  }
  console.log(`\nCommand files scanned: ${files.length}`);
  for (const error of errors) console.log(` - ${error}`);
  if (!errors.length) console.log('✅ Command audit passed.');
  return errors.length === 0;
}

function auditDashboardFiles() {
  section('Dashboard file audit');
  const dashboardRoot = absolute('src/dashboard/js');
  const files = walk(dashboardRoot, SOURCE_EXTENSIONS).map(normalise);
  const fileSet = new Set(files);
  const inbound = new Map(files.map((file) => [file, 0]));
  const entries = new Set([
    normalise(path.join(dashboardRoot, 'main.jsx')),
    normalise(path.join(dashboardRoot, 'App.jsx')),
    normalise(path.join(dashboardRoot, 'ui', 'layout.js')),
  ]);
  const broken = [];
  for (const file of files) {
    for (const request of extractRelativeImports(read(file))) {
      const resolved = resolveImport(file, request);
      if (!resolved) broken.push(`${rel(file)} -> ${request}`);
      else if (fileSet.has(resolved)) inbound.set(resolved, (inbound.get(resolved) || 0) + 1);
    }
  }
  const orphans = files.filter((file) => !entries.has(file) && (inbound.get(file) || 0) === 0).map(rel).sort();
  console.log(`Scanned files: ${files.length}`);
  console.log(`Broken relative imports: ${broken.length}`);
  console.log(`Orphan candidates: ${orphans.length}`);
  for (const item of broken) console.log(`- ${item}`);
  for (const file of orphans) console.log(`- ${file}`);
  return broken.length === 0 && orphans.length === 0;
}

function auditDashboardRoutes() {
  section('Dashboard route audit');
  const layoutPath = absolute('src/dashboard/js/ui/layout.js');
  const registryPath = absolute('src/dashboard/js/shared/moduleRegistry.js');
  if (!fs.existsSync(layoutPath) || !fs.existsSync(registryPath)) return false;
  const routes = new Set([...read(layoutPath).matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
  const modules = [...read(registryPath).matchAll(/\{[\s\S]*?key:\s*['"]([^'"]+)['"][\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?route:\s*['"]([^'"]+)['"][\s\S]*?\}/g)]
    .map((match) => ({ key: match[1], name: match[2], route: match[3] }));
  const broken = modules.filter((module) => !routes.has(module.route));
  console.log(`Routes found: ${routes.size}`);
  console.log(`Module registry entries: ${modules.length}`);
  console.log(`Broken module routes: ${broken.length}`);
  for (const module of broken) console.log(`- ${module.name} (${module.key}) -> ${module.route}`);
  return broken.length === 0;
}

function auditSourceText() {
  section('UTF-8 and legacy path audit');
  const files = walk(root, TEXT_EXTENSIONS);
  const encodingIssues = [];
  const legacyImports = [];
  const windowsPaths = [];
  const rootCore = `${normalise(absolute('core'))}/`;
  for (const file of files) {
    const source = read(file);
    const relative = rel(file);
    if (MOJIBAKE_MARKERS.some((marker) => source.includes(marker))) encodingIssues.push(relative);
    if (!SOURCE_EXTENSIONS.includes(path.extname(file))) continue;
    for (const request of extractRelativeImports(source)) {
      const resolved = normalise(path.resolve(path.dirname(file), request));
      if (resolved.startsWith(rootCore)) legacyImports.push(`${relative} -> ${request}`);
    }
    if (/[A-Za-z]:\\[^\s'"`]+/.test(source)) windowsPaths.push(relative);
  }
  console.log(`Text files scanned: ${files.length}`);
  console.log(`UTF-8 corruption candidates: ${encodingIssues.length}`);
  console.log(`Root core imports: ${legacyImports.length}`);
  console.log(`Absolute Windows paths: ${windowsPaths.length}`);
  for (const file of encodingIssues) console.log(`- UTF-8: ${file}`);
  for (const item of legacyImports) console.log(`- Legacy core: ${item}`);
  for (const file of windowsPaths) console.log(`- Windows path: ${file}`);
  return encodingIssues.length === 0 && legacyImports.length === 0 && windowsPaths.length === 0;
}

function collectRuntimeTargets() {
  const directories = [absolute('src/events'), absolute('src/core/admin/functions'), absolute('src/server/routes')];
  const explicit = [
    'src/modules/roleStudio/autoRoles/autoRoles.js', 'src/modules/roleStudio/autoRoles/autoRolesPanel.js',
    'src/modules/roleStudio/autoRoles/autoRolesRoute.js', 'src/modules/verification/verification.js',
    'src/modules/verification/verificationPanel.js', 'src/modules/verification/verificationRoute.js',
    'src/modules/welcome/welcome.js', 'src/modules/goodbye/goodbye.js', 'src/modules/tickets/ticketStartup.js',
    'src/modules/translation/translationStartup.js', 'src/modules/roles/rolesStartup.js', 'src/modules/giveaways/giveawayScheduler.js',
  ].map(absolute).filter(fs.existsSync);
  return [...new Set([...directories.flatMap((dir) => walk(dir)), ...explicit])].sort((a, b) => a.localeCompare(b));
}

function auditRuntimeImports() {
  section('Runtime import audit');
  const files = collectRuntimeTargets();
  const errors = [];
  const code = "const file=process.argv[1];try{require(file);process.exit(0)}catch(error){console.error(error?.stack||error?.message||error);process.exit(1)}";
  for (const file of files) {
    process.stdout.write(`Checking ${rel(file)}... `);
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, ['-e', code, file], {
      cwd: root, encoding: 'utf8', timeout: IMPORT_TIMEOUT_MS, windowsHide: true,
      env: { ...process.env, GOLIATH_IMPORT_AUDIT: 'true' },
    });
    const duration = Date.now() - startedAt;
    if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      console.log('❌'); errors.push(`${rel(file)}: import exceeded ${IMPORT_TIMEOUT_MS}ms`);
    } else if (result.status !== 0) {
      console.log('❌'); errors.push(`${rel(file)}: ${String(result.stderr || result.stdout || 'Unknown import failure').trim().split('\n').slice(0, 8).join('\n')}`);
    } else {
      console.log(duration >= SLOW_IMPORT_MS ? `⚠️ ${duration}ms` : `✅ ${duration}ms`);
    }
  }
  for (const error of errors) console.log(` - ${error}`);
  if (!errors.length) console.log('✅ Runtime import audit passed.');
  return errors.length === 0;
}

function auditModuleStandard() {
  section('Module standard audit');
  const { MODULE_MATURITY, REQUIRED_CAPABILITIES, getMissingCapabilities, isModuleComplete } = require('../src/core/modules/moduleStandard');
  const { moduleManifest } = require('../src/core/modules/moduleManifest');
  const modules = Object.values(moduleManifest);
  const errors = [];
  const active = modules.filter((definition) => definition.maturity === MODULE_MATURITY.IN_PROGRESS);
  if (active.length > 1) errors.push(`Only one module may be in progress; found ${active.map((item) => item.name).join(', ')}.`);
  for (const definition of modules.sort((a, b) => a.name.localeCompare(b.name))) {
    const missing = getMissingCapabilities(definition);
    const complete = isModuleComplete(definition);
    if (definition.maturity === MODULE_MATURITY.COMPLETE && !complete) errors.push(`${definition.name} is marked complete but is missing: ${missing.join(', ')}.`);
    for (const capability of REQUIRED_CAPABILITIES) {
      if (typeof definition.capabilities?.[capability] !== 'boolean') errors.push(`${definition.name}.${capability} must be boolean.`);
    }
    console.log(`${complete ? '🟢' : definition.maturity === MODULE_MATURITY.IN_PROGRESS ? '🟡' : '⚪'} ${definition.name} — ${definition.maturity}${missing.length ? ` (${missing.length} capability gaps)` : ''}`);
  }
  for (const error of errors) console.log(` - ${error}`);
  if (!errors.length) console.log('✅ Module standard audit passed.');
  return errors.length === 0;
}

function auditCanonicalModuleManifest() {
  section('Canonical module manifest');
  const { MODULE_MATURITY, REQUIRED_CAPABILITIES, getMissingCapabilities, isModuleComplete } = require('../src/core/modules/moduleStandard');
  const { moduleManifest } = require('../src/core/modules/moduleManifest');
  const validMaturities = new Set(Object.values(MODULE_MATURITY));
  const errors = [];
  const canonicalFiles = Object.freeze({
    schedule: [
      'src/modules/schedule/schedule.js',
      'src/modules/schedule/scheduleRoute.js',
      'src/events/schedule/scheduleReady.js',
      'docs/modules/schedule.md',
    ],
    social: [
      'src/modules/social/social.js',
      'src/modules/social/socialPanel.js',
      'src/modules/social/socialCreatorPanel.js',
      'src/modules/social/socialRoute.js',
      'src/modules/social/socialHealth.js',
      'src/modules/social/socialDiagnostics.js',
      'src/dashboard/js/pages/modules/Social.jsx',
      'docs/modules/social-alerts.md',
    ],
  });
  const definitions = Object.values(moduleManifest).sort((a, b) => a.name.localeCompare(b.name));
  const active = definitions.filter((definition) => definition.maturity === MODULE_MATURITY.IN_PROGRESS);

  if (active.length !== 1) errors.push(`Exactly one module must be in progress; found ${active.length}: ${active.map((item) => item.name).join(', ') || 'none'}.`);

  for (const definition of definitions) {
    if (!definition.key || !definition.name) errors.push('Every module requires a key and name.');
    if (!validMaturities.has(definition.maturity)) errors.push(`${definition.name || definition.key}: invalid maturity ${definition.maturity}.`);
    for (const capability of REQUIRED_CAPABILITIES) {
      if (typeof definition.capabilities?.[capability] !== 'boolean') errors.push(`${definition.name}.${capability} must be boolean.`);
    }
    const missing = getMissingCapabilities(definition);
    if (definition.maturity === MODULE_MATURITY.COMPLETE && !isModuleComplete(definition)) errors.push(`${definition.name} is complete but missing: ${missing.join(', ')}.`);
    if (definition.maturity === MODULE_MATURITY.NOT_STARTED && missing.length !== REQUIRED_CAPABILITIES.length) errors.push(`${definition.name} has implemented capabilities but is marked not_started; use paused.`);
    const marker = definition.maturity === MODULE_MATURITY.COMPLETE ? '🟢'
      : definition.maturity === MODULE_MATURITY.IN_PROGRESS ? '🟡'
        : definition.maturity === MODULE_MATURITY.PAUSED ? '🔵' : '⚪';
    console.log(`${marker} ${definition.name} — ${definition.maturity}${missing.length ? ` (${missing.length} gaps)` : ''}`);
    for (const relativePath of canonicalFiles[definition.key] || []) {
      if (!fs.existsSync(absolute(relativePath))) errors.push(`${definition.name}: missing ${relativePath}.`);
    }
  }

  if (moduleManifest.social?.name !== 'Social Studio') errors.push('The canonical social module name must be Social Studio.');
  if (moduleManifest.schedule?.maturity !== MODULE_MATURITY.IN_PROGRESS) errors.push('Schedule must be the active module.');
  if (moduleManifest.stats?.maturity !== MODULE_MATURITY.PAUSED) errors.push('Stats must remain paused while Schedule is active.');
  if (moduleManifest.tickets?.maturity !== MODULE_MATURITY.PAUSED) errors.push('Tickets must remain paused while Schedule is active.');

  console.log(`\nModules tracked: ${definitions.length}`);
  console.log(`Complete: ${definitions.filter(isModuleComplete).length}`);
  console.log(`Active: ${active.length}`);
  console.log(`Paused: ${definitions.filter((item) => item.maturity === MODULE_MATURITY.PAUSED).length}`);
  console.log(`Not started: ${definitions.filter((item) => item.maturity === MODULE_MATURITY.NOT_STARTED).length}`);
  for (const error of errors) console.error(` - ${error}`);
  if (!errors.length) console.log('✅ Canonical module manifest passed.');
  return errors.length === 0;
}

function inspectRuntime() {
  section('Runtime');
  const modeRoot = absolute(`src/runtime/${mode}`);
  const folders = ['guilds', 'logs', 'database', 'data', 'backups'];
  console.log(`BOT_MODE: ${mode}`);
  if (!fs.existsSync(modeRoot)) return false;
  for (const folder of folders) {
    const fullPath = path.join(modeRoot, folder);
    const count = fs.existsSync(fullPath) ? fs.readdirSync(fullPath).length : 0;
    console.log(`${fs.existsSync(fullPath) ? '✅' : '⚠️'} ${rel(fullPath)} (${count})`);
  }
  return true;
}

function inspectGuilds() {
  section('Guild configs');
  const guildsDir = absolute(`src/runtime/${mode}/guilds`);
  if (!fs.existsSync(guildsDir)) return false;
  const files = fs.readdirSync(guildsDir).filter((file) => file.endsWith('.json')).sort();
  console.log(`Found guild config files: ${files.length}`);
  for (const file of files) console.log(`- ${file}`);
  return true;
}

function checkMediaDependencies() {
  section('Media dependencies');
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  let sharp = true;
  try { require.resolve('sharp'); } catch { sharp = false; }
  console.log(`FFmpeg: ${ffmpeg.status === 0 ? '✅ available' : '❌ missing'}`);
  console.log(`Sharp:   ${sharp ? '✅ available' : '❌ missing'}`);
  return ffmpeg.status === 0 && sharp;
}

function runTool(file) {
  const result = spawnSync(process.execPath, [path.join(tools, file)], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(`Failed to run ${file}: ${result.error.message}`);
  return !result.error && result.status === 0;
}

function runTools(files) { return files.every(runTool); }
function runDashboard() { return [auditDashboardFiles(), auditDashboardRoutes()].every(Boolean); }
function runModules() { return [auditModuleStandard(), auditCanonicalModuleManifest()].every(Boolean); }
function runCoreCheck() { return [checkProjectShape(), auditCommands(), runDashboard(), auditSourceText(), auditRuntimeImports(), runModules(), inspectRuntime()].every(Boolean); }

const doctorSuites = Object.freeze({
  social: [TOOL_FILES.social],
  invites: [TOOL_FILES.invitesDoctor, TOOL_FILES.invitesTest],
  goodbye: [TOOL_FILES.goodbye],
  reaction: [TOOL_FILES.reactionDoctor, TOOL_FILES.reactionTest],
  reactionroles: [TOOL_FILES.reactionDoctor, TOOL_FILES.reactionTest],
  'reaction-roles': [TOOL_FILES.reactionDoctor, TOOL_FILES.reactionTest],
  'role-studio': [TOOL_FILES.roleStudioTest],
  rolestudio: [TOOL_FILES.roleStudioTest],
});
const allModuleTools = [...new Set(Object.values(doctorSuites).flat())];

function runDoctor(target) {
  if (target === 'modules') return runModules();
  if (target) return doctorSuites[target] ? runTools(doctorSuites[target]) : false;
  return runCoreCheck() && runTools(allModuleTools);
}
function runAudit() { return runDoctor() && inspectGuilds(); }

function printHelp() {
  console.log('Goliath CLI');
  console.log('===========');
  console.log(`Mode: ${mode}`);
  console.log('  doctor [suite]    Run core and module diagnostics');
  console.log('  audit             Run doctor plus guild inspection');
  console.log('  commands          Check slash command files');
  console.log('  modules           Check module standards and manifest');
  console.log('  dashboard         Check dashboard imports and routes');
  console.log('  runtime           Inspect runtime folders');
  console.log('  imports           Check runtime imports');
  console.log('  guilds            List guild configurations');
  console.log('  media             Check FFmpeg and Sharp');
  console.log('  source            Check UTF-8 and unsafe paths');
}

const command = String(process.argv[2] || 'help').toLowerCase();
const target = String(process.argv[3] || '').toLowerCase();
const commands = {
  help: printHelp,
  doctor: () => runDoctor(target),
  check: () => runDoctor(target),
  audit: runAudit,
  commands: auditCommands,
  modules: runModules,
  standards: runModules,
  dashboard: runDashboard,
  runtime: inspectRuntime,
  imports: auditRuntimeImports,
  guilds: inspectGuilds,
  media: checkMediaDependencies,
  source: auditSourceText,
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
const result = commands[command]();
if (result === false) process.exit(1);
