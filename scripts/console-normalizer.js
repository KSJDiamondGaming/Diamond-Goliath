'use strict';

const REPLACEMENTS = Object.freeze([
  ['âœ…', '✅'],
  ['âŒ', '❌'],
  ['âš ï¸', '⚠️'],
  ['âšª', '⚪'],
  ['ðŸŸ¢', '🟢'],
  ['ðŸŸ¡', '🟡'],
  ['â€”', '—'],
]);

function normalize(value) {
  let output = String(value ?? '');
  for (const [broken, correct] of REPLACEMENTS) {
    output = output.split(broken).join(correct);
  }
  return output;
}

function patch(stream) {
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    if (Buffer.isBuffer(chunk)) {
      return originalWrite(normalize(chunk.toString('utf8')), 'utf8', callback);
    }
    return originalWrite(normalize(chunk), encoding, callback);
  };
}

patch(process.stdout);
patch(process.stderr);
