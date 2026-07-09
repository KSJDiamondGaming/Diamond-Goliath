'use strict';

const { spawnSync } = require('child_process');

function checkCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command,
    available: result.status === 0,
    output: String(result.stdout || result.stderr || '').split('\n').slice(0, 2).join(' ').trim(),
  };
}

function checkNodeModule(name) {
  try {
    require.resolve(name);
    return { module: name, available: true };
  } catch (error) {
    return { module: name, available: false, error: error.message };
  }
}

const ffmpeg = checkCommand('ffmpeg', ['-version']);
const sharp = checkNodeModule('sharp');

console.log('🧰 Goliath Media Tools dependency check');
console.log('');
console.log(`FFmpeg: ${ffmpeg.available ? '✅ available' : '❌ missing'}`);
if (ffmpeg.output) console.log(`  ${ffmpeg.output}`);
console.log(`Sharp:   ${sharp.available ? '✅ available' : '❌ missing'}`);

if (!ffmpeg.available) {
  console.log('');
  console.log('Install FFmpeg on the host to enable real GIF conversion and video trimming.');
  console.log('Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y ffmpeg');
}

if (!sharp.available) {
  console.log('');
  console.log('Install Sharp with: npm install sharp');
}

if (!ffmpeg.available || !sharp.available) {
  process.exitCode = 1;
}
