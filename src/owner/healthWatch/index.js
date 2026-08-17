'use strict';

const healthWatch = require('./healthWatch.js');
const coverage = require('./coverage.js');
const incidents = require('./incidentStore.js');

module.exports = {
  ...healthWatch,
  coverage,
  incidents,
};
