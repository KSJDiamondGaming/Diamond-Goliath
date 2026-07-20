'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tools = path.join(root, 'tools');
const consoleNormalizer = path.join(__dirname, 'console-normalizer.js');

const TOOL_FILES = Object.freeze({
  core: 'goliath-core.js',
  moduleManifest: 'module-manifest-doctor.js',
  social: 'social-doctor.js',
  invitesDoctor: 'invites-doctor.js',
  invitesTest: 'invites-smoke-test.js',
  goodbye: 'goodbye-doctor.js',
  reactionDoctor: 'reaction-roles-doctor.js',
  reactionTest: 'reaction-roles-smoke-test.js',
  roleStudioTest: 'role-studio-smoke-test.js',
});

function runTool(file, args = []) {
  const result = spawnSync(
    process.execPath,
    ['--require', consoleNormalizer, path.join(tools, file), ...args],
    {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    }
  );

  if (result.error) {
    console.error(`Failed to run ${file}: ${result.error.message}`);
    return false;
  }

  return result.status === 0;
}

function runSequence(steps) {
  for (const [file, args = []] of steps) {
    if (!runTool(file, args)) return false;
  }
  return true;
}

const doctorSuites = Object.freeze({
  modules: [[TOOL_FILES.moduleManifest]],
  social: [[TOOL_FILES.social]],
  invites: [[TOOL_FILES.invitesDoctor], [TOOL_FILES.invitesTest]],
  goodbye: [[TOOL_FILES.goodbye]],
  reaction: [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  reactionroles: [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  'reaction-roles': [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  'role-studio': [[TOOL_FILES.roleStudioTest]],
  rolestudio: [[TOOL_FILES.roleStudioTest]],
});

const testSuites = Object.freeze({
  invites: [[TOOL_FILES.invitesDoctor], [TOOL_FILES.invitesTest]],
  reaction: [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  reactionroles: [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  'reaction-roles': [[TOOL_FILES.reactionDoctor], [TOOL_FILES.reactionTest]],
  'role-studio': [[TOOL_FILES.roleStudioTest]],
  rolestudio: [[TOOL_FILES.roleStudioTest]],
});

const fullDoctor = [
  [TOOL_FILES.core, ['check']],
  [TOOL_FILES.moduleManifest],
  [TOOL_FILES.social],
  [TOOL_FILES.invitesDoctor],
  [TOOL_FILES.invitesTest],
  [TOOL_FILES.goodbye],
  [TOOL_FILES.reactionDoctor],
  [TOOL_FILES.reactionTest],
  [TOOL_FILES.roleStudioTest],
];

const fullAudit = [
  [TOOL_FILES.core, ['audit']],
  [TOOL_FILES.moduleManifest],
  [TOOL_FILES.social],
  [TOOL_FILES.invitesDoctor],
  [TOOL_FILES.invitesTest],
  [TOOL_FILES.goodbye],
  [TOOL_FILES.reactionDoctor],
  [TOOL_FILES.reactionTest],
  [TOOL_FILES.roleStudioTest],
];

const coreCommands = new Set([
  'commands',
  'modules',
  'dashboard',
  'runtime',
  'imports',
  'standards',
  'guilds',
  'media',
]);

function printHelp() {
  console.log('Goliath CLI');
  console.log('===========');
  console.log('');
  console.log('Main commands:');
  console.log('  doctor                    Run every doctor and smoke test');
  console.log('  audit                     Run the full audit plus guild inspection');
  console.log('  doctor <suite>            Run one diagnostic suite');
  console.log('  test <suite>              Run one smoke-test suite');
  console.log('');
  console.log('Doctor suites: modules, social, invites, goodbye, reaction, role-studio');
  console.log('Test suites:   invites, reaction, role-studio');
  console.log('');
  console.log('Core checks: commands, modules, dashboard, runtime, imports, standards, guilds, media');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/goliath.js doctor');
  console.log('  node scripts/goliath.js doctor reaction');
  console.log('  node scripts/goliath.js test role-studio');
  console.log('  node scripts/goliath.js dashboard');
}

function unknown(kind, name, available) {
  console.error(`Unknown ${kind}: ${name || '(missing)'}`);
  console.error(`Available: ${available.join(', ')}`);
  return false;
}

function main() {
  const command = String(process.argv[2] || 'help').toLowerCase();
  const target = String(process.argv[3] || '').toLowerCase();

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return true;
  }

  if (command === 'doctor' || command === 'check') {
    if (!target) return runSequence(fullDoctor);
    const suite = doctorSuites[target];
    return suite ? runSequence(suite) : unknown('doctor suite', target, Object.keys(doctorSuites));
  }

  if (command === 'audit') return runSequence(fullAudit);

  if (command === 'test') {
    const suite = testSuites[target];
    return suite ? runSequence(suite) : unknown('test suite', target, Object.keys(testSuites));
  }

  if (coreCommands.has(command)) return runTool(TOOL_FILES.core, [command]);

  return unknown('command', command, ['doctor', 'audit', 'test', ...coreCommands]);
}

if (!main()) process.exit(1);
