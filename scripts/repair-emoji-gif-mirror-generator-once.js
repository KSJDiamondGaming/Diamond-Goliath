'use strict';

const fs = require('node:fs');
const file = 'scripts/patch-emoji-gif-mirror-once.js';
let source = fs.readFileSync(file, 'utf8');
const oldValue = ".addOptions(clean.map((entry) => ({ label: cleanSearchName(entry).slice(0, 100), value: String(entry.id), description: cleanSearchCategory(entry).slice(0, 100) }))));";
const newValue = ".addOptions(clean.map((entry) => ({ label: cleanSearchName(entry).slice(0, 100), value: String(entry.id), description: cleanSearchCategory(entry).slice(0, 100) })))));";
if (!source.includes(oldValue)) throw new Error('GIF search select generator anchor missing');
source = source.replace(oldValue, newValue);
fs.writeFileSync(file, source);
console.log('Repaired GIF search select generator.');
