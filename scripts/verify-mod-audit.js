'use strict';

const assert = require('node:assert/strict');

const storage = require('../src/core/administration/mod/storage');

const required = [
  'recordCaseAudit',
  'getCaseAudit',
  'createCase',
  'getCaseById',
  'updateCaseReason',
  'updateCaseStatus',
  'updateCaseNote',
  'clearCaseNote',
];

for (const name of required) {
  assert.equal(typeof storage[name], 'function', `Missing Mod storage API: ${name}`);
}

assert.equal(typeof storage.EVENTS?.CASE_CREATED, 'string');
assert.equal(typeof storage.EVENTS?.CASE_STATUS_UPDATED, 'string');
assert.equal(typeof storage.EVENTS?.CASE_NOTE_UPDATED, 'string');

const audit = storage.getCaseAudit('__audit_smoke_missing_guild__', 1);
assert.deepEqual(audit, {
  results: [],
  total: 0,
  page: 0,
  pageSize: 25,
  totalPages: 0,
});

console.log('Mod persistent audit smoke check passed.');
