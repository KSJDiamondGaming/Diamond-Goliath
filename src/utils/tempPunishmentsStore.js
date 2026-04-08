const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/tempPunishments.json');

function loadData() {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath));
}

function saveData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function addPunishment(entry) {
  const data = loadData();
  data.push(entry);
  saveData(data);
}

function removePunishment(userId, guildId, type) {
  let data = loadData();
  data = data.filter(p => !(p.userId === userId && p.guildId === guildId && p.type === type));
  saveData(data);
}

function getPunishments() {
  return loadData();
}

module.exports = {
  addPunishment,
  removePunishment,
  getPunishments
};