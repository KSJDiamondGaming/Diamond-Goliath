const fs = require('fs');
const path = require('path');

function writeJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to write JSON to ${filePath}:`, error);
    return false;
  }
}

module.exports = writeJson;
