'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { MEDIA_ROOT } = require('./mediaConfig');

function cleanupMediaTempFiles({ maxAgeMs = 1000 * 60 * 60 * 24 } = {}) {
  const now = Date.now();
  let deleted = 0;

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (!full.includes(`${path.sep}uploads${path.sep}`)) continue;
      const stats = fs.statSync(full);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    }
  }

  walk(MEDIA_ROOT);
  return { deleted };
}

module.exports = {
  cleanupMediaTempFiles,
};
