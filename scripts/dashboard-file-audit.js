'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanRoots = [
  path.join(root, 'src', 'dashboard', 'js'),
];

const extensions = ['.js', '.jsx', '.mjs', '.cjs'];
const entryFiles = new Set([
  normalise(path.join(root, 'src', 'dashboard', 'js', 'main.jsx')),
  normalise(path.join(root, 'src', 'dashboard', 'js', 'App.jsx')),
  normalise(path.join(root, 'src', 'dashboard', 'js', 'ui', 'layout.js')),
]);

function normalise(value) {
  return path.normalize(value).replace(/\\/g, '/');
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (extensions.includes(path.extname(entry.name))) {
      files.push(normalise(fullPath));
    }
  }

  return files;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractRelativeImports(source) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
    /export\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function resolveImport(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [];

  if (extensions.includes(path.extname(base))) {
    candidates.push(base);
  } else {
    for (const extension of extensions) candidates.push(base + extension);
    for (const extension of extensions) candidates.push(path.join(base, `index${extension}`));
  }

  return candidates.map(normalise).find((candidate) => fs.existsSync(candidate)) || null;
}

function relative(file) {
  return normalise(path.relative(root, file));
}

function main() {
  const files = scanRoots.flatMap((dir) => walk(dir));
  const fileSet = new Set(files);
  const inbound = new Map(files.map((file) => [file, new Set()]));
  const broken = [];

  for (const file of files) {
    const source = read(file);
    const imports = extractRelativeImports(source);

    for (const request of imports) {
      const resolved = resolveImport(file, request);

      if (!resolved) {
        broken.push({ from: file, request });
        continue;
      }

      if (fileSet.has(resolved)) {
        inbound.get(resolved)?.add(file);
      }
    }
  }

  const orphanCandidates = files
    .filter((file) => !entryFiles.has(file))
    .filter((file) => (inbound.get(file)?.size || 0) === 0)
    .map(relative)
    .sort();

  console.log('Dashboard file audit');
  console.log('====================');
  console.log(`Scanned files: ${files.length}`);
  console.log(`Broken relative imports: ${broken.length}`);
  console.log(`Orphan candidates: ${orphanCandidates.length}`);

  if (broken.length) {
    console.log('\nBroken imports:');
    for (const item of broken) {
      console.log(`- ${relative(item.from)} -> ${item.request}`);
    }
  }

  if (orphanCandidates.length) {
    console.log('\nOrphan candidates, verify before deleting:');
    for (const file of orphanCandidates) {
      console.log(`- ${file}`);
    }
  }

  if (broken.length) {
    process.exitCode = 1;
  }
}

main();
