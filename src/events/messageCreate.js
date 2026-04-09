const { PermissionFlagsBits } = require('discord.js');
const { runAutomod } = require('../utils/automodEngine');
console.log('AUTOMOD RESULT:', result);

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    try {
      if (!message.guild || message.author.bot) return;

      const result = await runAutomod(message);

      if (result?.matched) {
        const me = message.guild.members.me;
        if (!me) return;

        if (
          result.deleteMessage &&
          message.deletable &&
          me.permissions.has(PermissionFlagsBits.ManageMessages)
        ) {
          await message.delete().catch(() => null);
        }

        if (result.punishment === 'warn') {
          const warning = await message.channel
            .send(`⚠️ ${message.author}, ${result.reason}`)
            .catch(() => null);

          if (warning) {
            setTimeout(() => warning.delete().catch(() => null), 8000);
          }
        }

        if (
          result.punishment === 'timeout' &&
          message.member.moderatable &&
          me.permissions.has(PermissionFlagsBits.ModerateMembers)
        ) {
          await message.member
            .timeout(
              (result.timeoutMinutes || 10) * 60 * 1000,
              `AutoMod: ${result.reason}`
            )
            .catch(() => null);
        }

        if (
          result.punishment === 'kick' &&
          message.member.kickable &&
          me.permissions.has(PermissionFlagsBits.KickMembers)
        ) {
          await message.member.kick(`AutoMod: ${result.reason}`).catch(() => null);
        }

        if (
          result.punishment === 'ban' &&
          message.member.bannable &&
          me.permissions.has(PermissionFlagsBits.BanMembers)
        ) {
          await message.member
            .ban({
              reason: `AutoMod: ${result.reason}`,
              deleteMessageSeconds: 0,
            })
            .catch(() => null);
        }

        return;
      }

      const prefix = '!';
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();

      if (!commandName) return;

      const command = message.client.commands.get(commandName);
      if (!command) return;

      await command.execute(message, args);
    } catch (error) {
      console.error('messageCreate error:', error);
    }
  },
};