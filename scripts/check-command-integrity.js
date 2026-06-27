'use strict';

const { printHeader, relative, resolveRoot, walk } = require('./lib/scriptUtils');

const COMMANDS_DIR = resolveRoot('src', 'commands');
const IGNORE_SUFFIXES = ['.test.js', '.spec.js'];

function getCommandJson(command) {
  if (!command?.data) return null;
  if (typeof command.data.toJSON === 'function') return command.data.toJSON();
  if (typeof command.data === 'object') return command.data;
  return null;
}

function validateCommand(filePath, command, seenNames) {
  const errors = [];
  const warnings = [];
  const json = getCommandJson(command);

  if (!command || typeof command !== 'object') {
    errors.push('Command module must export an object.');
    return { file: relative(filePath), name: '(unknown)', errors, warnings };
  }

  if (!command.data) errors.push('Missing data export.');
  if (typeof command.execute !== 'function') errors.push('Missing execute(interaction, client) function.');

  if (!json || typeof json !== 'object') {
    errors.push('Command data cannot be converted to JSON.');
    return { file: relative(filePath), name: '(unknown)', errors, warnings };
  }

  const name = json.name || command.data?.name || '(unknown)';
  const description = json.description || command.data?.description || '';

  if (!name || typeof name !== 'string' || name === '(unknown)') errors.push('Missing command name.');
  if (typeof name === 'string' && !/^[\w-]{1,32}$/.test(name)) errors.push(`Invalid command name: ${name}`);
  if (seenNames.has(name)) errors.push(`Duplicate command name: ${name}`);
  if (name && name !== '(unknown)') seenNames.add(name);

  if (!description || typeof description !== 'string') warnings.push('Missing command description.');
  if (typeof description === 'string' && description.length > 100) errors.push('Command description exceeds Discord 100 character limit.');

  try {
    JSON.stringify(json);
  } catch (error) {
    errors.push(`Command JSON is not serializable: ${error.message}`);
  }

  return { file: relative(filePath), name, errors, warnings };
}

function auditCommands() {
  const files = walk(COMMANDS_DIR, { ignoreSuffixes: IGNORE_SUFFIXES });
  const seenNames = new Set();
  const results = [];

  if (!files.length) {
    throw new Error(`No command files found in ${relative(COMMANDS_DIR)}`);
  }

  for (const filePath of files) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);
      results.push(validateCommand(filePath, command, seenNames));
    } catch (error) {
      results.push({
        file: relative(filePath),
        name: '(import failed)',
        errors: [`Failed to import command: ${error.message}`],
        warnings: [],
      });
    }
  }

  return results;
}

function main() {
  const results = auditCommands();
  const failed = results.filter((result) => result.errors.length);
  const warned = results.filter((result) => result.warnings.length && !result.errors.length);
  const passed = results.filter((result) => !result.errors.length && !result.warnings.length);

  printHeader('🧪 Goliath Command Integrity Check', {
    'Commands scanned': results.length,
    'Passed': passed.length,
    'Warnings': warned.length,
    'Failed': failed.length,
  });

  for (const result of results) {
    if (!result.errors.length && !result.warnings.length) continue;

    console.log(`\n${result.errors.length ? '❌' : '⚠️'} ${result.name} — ${result.file}`);

    for (const error of result.errors) {
      console.log(`  ❌ ${error}`);
    }

    for (const warning of result.warnings) {
      console.log(`  ⚠️ ${warning}`);
    }
  }

  if (failed.length) {
    console.log('\n❌ Command integrity check failed. Fix the command errors above.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ Command integrity OK');
}

main();
