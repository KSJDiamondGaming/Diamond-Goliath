const fs = require('fs');

function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to read JSON from ${filePath}:`, error);
    return fallback;
  }
}

module.exports = readJson;
