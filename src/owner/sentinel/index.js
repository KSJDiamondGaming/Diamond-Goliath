'use strict';

const sentinel = require('./sentinel.js');
const coverage = require('./coverage.js');
const incidents = require('./incidentStore.js');

module.exports = {
  ...sentinel,
  coverage,
  incidents,
};
