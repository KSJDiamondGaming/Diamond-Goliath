const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'data', 'stats.json');

function ensureFile() {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
}

function read() {
  ensureFile();
  return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
}

function write(data) {
  ensureFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function get(guildId) {
  const data = read();
  return data[guildId] || null;
}

function set(guildId, value) {
  const data = read();
  data[guildId] = value;
  write(data);
}

function remove(guildId) {
  const data = read();
  delete data[guildId];
  write(data);
}

module.exports = { get, set, remove };