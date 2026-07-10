'use strict';

const {
  MODULE_MATURITY,
  REQUIRED_CAPABILITIES,
  getMissingCapabilities,
  isModuleComplete,
} = require('../src/core/modules/moduleStandard');
const { moduleManifest } = require('../src/core/modules/moduleManifest');

function auditModuleStandard() {
  console.log('\nModule standard audit');
  console.log('=====================');

  const modules = Object.values(moduleManifest);
  const errors = [];
  const active = modules.filter((moduleDefinition) => moduleDefinition.maturity === MODULE_MATURITY.IN_PROGRESS);

  if (active.length > 1) {
    errors.push(`Only one module may be in progress; found ${active.map((item) => item.name).join(', ')}.`);
  }

  for (const moduleDefinition of modules.sort((a, b) => a.name.localeCompare(b.name))) {
    const missing = getMissingCapabilities(moduleDefinition);
    const complete = isModuleComplete(moduleDefinition);

    if (moduleDefinition.maturity === MODULE_MATURITY.COMPLETE && !complete) {
      errors.push(`${moduleDefinition.name} is marked complete but is missing: ${missing.join(', ')}.`);
    }

    if (!moduleDefinition.capabilities || typeof moduleDefinition.capabilities !== 'object') {
      errors.push(`${moduleDefinition.name} has no capability map.`);
    } else {
      for (const capability of REQUIRED_CAPABILITIES) {
        if (typeof moduleDefinition.capabilities[capability] !== 'boolean') {
          errors.push(`${moduleDefinition.name}.${capability} must be boolean.`);
        }
      }
    }

    const marker = complete ? '🟢' : moduleDefinition.maturity === MODULE_MATURITY.IN_PROGRESS ? '🟡' : '⚪';
    console.log(`${marker} ${moduleDefinition.name} — ${moduleDefinition.maturity}${missing.length ? ` (${missing.length} capability gaps)` : ''}`);
  }

  console.log(`\nModules tracked: ${modules.length}`);
  console.log(`Complete: ${modules.filter(isModuleComplete).length}`);
  console.log(`In progress: ${active.length}`);
  console.log(`Not started: ${modules.filter((item) => item.maturity === MODULE_MATURITY.NOT_STARTED).length}`);

  if (errors.length) {
    console.log(`Module standard issues: ${errors.length}`);
    for (const error of errors) console.log(` - ${error}`);
    process.exitCode = 1;
    return false;
  }

  console.log('✅ Module standard audit passed.');
  return true;
}

if (require.main === module) auditModuleStandard();

module.exports = { auditModuleStandard };
