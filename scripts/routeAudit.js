'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const source = fs.readFileSync(path.resolve('server.js'), 'utf8');
const mountedRoutes = [
  ...new Set(
    [...source.matchAll(/route\([^,]+,\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ),
];

let failed = false;
const probe = [
  "try {",
  "  require(require('path').resolve(process.argv[1]));",
  "  process.exit(0);",
  "} catch (error) {",
  "  console.error(error && error.stack || error);",
  "  process.exit(1);",
  "}",
].join('\n');

for (const file of mountedRoutes.sort()) {
  const result = spawnSync(process.execPath, ['-e', probe, file], {
    encoding: 'utf8',
    env: { ...process.env, GOLIATH_IMPORT_AUDIT: 'true' },
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`❌ ${file}`);
    console.error(
      String(result.stderr || result.stdout || 'Route import failed')
        .trim()
        .split('\n')
        .slice(0, 6)
        .join('\n'),
    );
  }
}

if (failed) process.exit(1);
console.log(`✅ Route import audit: ${mountedRoutes.length} mounted routes`);
