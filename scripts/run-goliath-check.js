'use strict';

const command = process.argv[2] || 'check';

process.argv[2] = command;
require('./goliath');

const exitCode = Number.isInteger(process.exitCode) ? process.exitCode : 0;
process.exit(exitCode);
