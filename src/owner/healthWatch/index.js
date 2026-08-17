'use strict';
const healthWatch = require('./healthWatch');
const coverage = require('./coverage');
const incidents = require('./incidentStore');
module.exports = { ...healthWatch, coverage, incidents };
