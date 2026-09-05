'use strict';

const fs = require('fs');
const file = 'src/modules/utilityStudio/emojis/emojis.js';
let source = fs.readFileSync(file, 'utf8');

const oldLine = "    url: emoji.imageURL?.({ extension: 'webp', size: 128 }) || emoji.url || null,";
const newLine = "    url: emoji?.id ? `https://cdn.discordapp.com/emojis/${emoji.id}.webp?size=128${emoji.animated ? '&animated=true' : ''}` : (emoji.url || null),";
if (!source.includes(oldLine)) throw new Error('Missing serialized emoji URL anchor.');
source = source.replace(oldLine, newLine);
fs.writeFileSync(file, source);
console.log('Serialized animated emoji URLs now explicitly request animation.');
