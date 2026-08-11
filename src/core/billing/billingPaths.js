'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimeRoot } = require('../../config/runtimePaths');

function getBillingDir() {
  const billingDir = path.join(getRuntimeRoot(process.env.BOT_MODE), 'billing');
  fs.mkdirSync(billingDir, { recursive: true });
  return billingDir;
}

function resolveBillingPath(...segments) {
  return path.join(getBillingDir(), ...segments);
}

module.exports = {
  getBillingDir,
  resolveBillingPath,
};
