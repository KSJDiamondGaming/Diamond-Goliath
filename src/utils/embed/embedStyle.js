const { EmbedBuilder } = require('discord.js');

function baseEmbed() {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTimestamp();
}

function successEmbed(description) {
  return baseEmbed()
    .setDescription(`✅ ${description}`);
}

function errorEmbed(description) {
  return baseEmbed()
    .setColor('#ED4245')
    .setDescription(`❌ ${description}`);
}

function infoEmbed(description) {
  return baseEmbed()
    .setColor('#5865F2')
    .setDescription(`ℹ️ ${description}`);
}

module.exports = {
  baseEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed
};