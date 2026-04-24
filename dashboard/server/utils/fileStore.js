const fs = require('fs');
const path = require('path');

function read(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`, error);
    return fallback;
  }
}

function write(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to write file: ${filePath}`, error);
    return false;
  }
}

module.exports = {
  read,
  write,
};