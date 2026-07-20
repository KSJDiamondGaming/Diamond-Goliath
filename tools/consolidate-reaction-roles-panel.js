'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const panelDir = path.join(root, 'src', 'modules', 'roleStudio', 'reactionRoles');
const targetPath = path.join(panelDir, 'reactionRolesPanel.js');
const doctorPath = path.join(root, 'tools', 'reaction-roles-doctor.js');
const tempPath = `${targetPath}.merged.tmp`;

const versionPaths = {
  v2: path.join(panelDir, 'reactionRolesPanelV2.js'),
  v3: path.join(panelDir, 'reactionRolesPanelV3.js'),
  v4: path.join(panelDir, 'reactionRolesPanelV4.js'),
  v5: path.join(panelDir, 'reactionRolesPanelV5.js'),
  v6: path.join(panelDir, 'reactionRolesPanelV6.js'),
  v7: path.join(panelDir, 'reactionRolesPanelV7.js'),
  v8: path.join(panelDir, 'reactionRolesPanelV8.js'),
};

function fail(message) {
  console.error(`[Reaction Roles Consolidation] ${message}`);
  process.exit(1);
}

function readRequired(filename) {
  if (!fs.existsSync(filename)) fail(`Missing required file: ${path.relative(root, filename)}`);
  return fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '');
}

function indent(source, spaces = 2) {
  const prefix = ' '.repeat(spaces);
  return source.split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}

function replaceExactly(source, search, replacement, label) {
  if (!source.includes(search)) fail(`Could not locate ${label}`);
  return source.replace(search, replacement);
}

function wrapModule(name, source) {
  return [
    `function load${name}() {`,
    '  const module = { exports: {} };',
    '  const exports = module.exports;',
    indent(source),
    '  return module.exports;',
    '}',
    `const panel${name} = load${name}();`,
  ].join('\n');
}

const current = readRequired(targetPath);
let v3 = readRequired(versionPaths.v3);
let v4 = readRequired(versionPaths.v4);
let v5 = readRequired(versionPaths.v5);
let v6 = readRequired(versionPaths.v6);
let v7 = readRequired(versionPaths.v7);
let v8 = readRequired(versionPaths.v8);

v4 = replaceExactly(v4, "const legacyPanel = require('./reactionRolesPanelV3');", 'const legacyPanel = panelV3;', 'V4 → V3 dependency');
v5 = replaceExactly(v5, "const basePanel = require('./reactionRolesPanelV4');", 'const basePanel = panelV4;', 'V5 → V4 dependency');
v5 = replaceExactly(v5, "const runtimePanel = require('./reactionRolesPanelV3');", 'const runtimePanel = panelV3;', 'V5 → V3 dependency');
v6 = replaceExactly(v6, "const panel = require('./reactionRolesPanelV5');", 'const panel = panelV5;', 'V6 → V5 dependency');
v7 = replaceExactly(v7, "const previousPanel = require('./reactionRolesPanelV6');", 'const previousPanel = panelV6;', 'V7 → V6 dependency');
v8 = replaceExactly(v8, "const panel = require('./reactionRolesPanelV7');", 'const panel = panelV7;', 'V8 → V7 dependency');

let entry = current;
entry = replaceExactly(entry, "const reactionPanel = require('./reactionRolesPanelV8');", 'const reactionPanel = panelV8;', 'production entry → V8 dependency');

const merged = [
  "'use strict';",
  '',
  '// Consolidated Reaction Roles admin panel.',
  '// Former V3–V8 layers are preserved below in isolated module scopes.',
  '// Behaviour stays stable while the cross-file version chain is removed.',
  '',
  wrapModule('V3', v3),
  '',
  wrapModule('V4', v4),
  '',
  wrapModule('V5', v5),
  '',
  wrapModule('V6', v6),
  '',
  wrapModule('V7', v7),
  '',
  wrapModule('V8', v8),
  '',
  '// Public production entry.',
  entry.replace(/^['\"]use strict['\"];?\s*/m, ''),
].join('\n');

fs.writeFileSync(tempPath, merged, 'utf8');
try {
  execFileSync(process.execPath, ['--check', tempPath], { stdio: 'pipe' });
} catch (error) {
  fs.rmSync(tempPath, { force: true });
  fail(`Generated panel failed syntax validation:\n${error.stderr?.toString() || error.message}`);
}

let doctor = readRequired(doctorPath);
doctor = doctor.replace("  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV2.js',\n", '');
doctor = doctor.replace(
  /contains\('src\/modules\/roleStudio\/reactionRoles\/reactionRolesPanel\.js', \[\s*"require\('\.\/reactionRolesPanelV2'\)",\s*\]\);/m,
  "contains('src/modules/roleStudio/reactionRoles/reactionRolesPanel.js', [\n  'Consolidated Reaction Roles admin panel',\n  'function loadV3()',\n  'function loadV8()',\n  'const reactionPanel = panelV8',\n  'buildReactionRolesAdminPanel',\n  'handleReactionRolesAdminInteraction',\n]);",
);
doctor = doctor.replace(/contains\('src\/modules\/roleStudio\/reactionRoles\/reactionRolesPanelV2\.js', \[[\s\S]*?\]\);\n/m, '');

if (doctor.includes('reactionRolesPanelV2.js')) {
  fs.rmSync(tempPath, { force: true });
  fail('Doctor still contains a V2 dependency; no files were changed.');
}

fs.renameSync(tempPath, targetPath);
fs.writeFileSync(doctorPath, doctor, 'utf8');
for (const filename of Object.values(versionPaths)) fs.rmSync(filename, { force: true });

try {
  execFileSync(process.execPath, ['--check', targetPath], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', doctorPath], { stdio: 'pipe' });
} catch (error) {
  fail(`Final syntax validation failed. Restore with Git before continuing:\n${error.stderr?.toString() || error.message}`);
}

console.log('[Reaction Roles Consolidation] PASS');
console.log(`Created: ${path.relative(root, targetPath)}`);
console.log('Removed versioned panel files V2–V8.');
console.log('Updated tools/reaction-roles-doctor.js.');
console.log('Next: npm run doctor && npm run test:reactionroles');
