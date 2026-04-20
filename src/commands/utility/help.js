const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Help panel • browse all commands and features'),

  async execute(interaction, client) {
    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const commands = [...client.commands.values()].sort((a, b) =>
        a.data.name.localeCompare(b.data.name)
      );

      const commandLines = commands.map((command) => {
        const name = command.data?.name || 'unknown';
        const description = command.data?.description || 'No description provided.';
        return `**/${name}** — ${description}`;
      });

      const chunks = [];
      let currentChunk = '';

      for (const line of commandLines) {
        const candidate = currentChunk ? `${currentChunk}\n${line}` : line;
        if (candidate.length > 1024) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk = candidate;
        }
      }

      if (currentChunk) chunks.push(currentChunk);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📘 Help Menu')
        .setDescription('Browse all currently loaded bot commands.')
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
        .setFooter({
          text: `${client.user.username} • Total Commands: ${commands.length}`,
          iconURL: client.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      if (!chunks.length) {
        embed.addFields({
          name: 'Commands',
          value: 'No commands are currently loaded.',
        });
      } else {
        chunks.forEach((chunk, index) => {
          embed.addFields({
            name: index === 0 ? 'Commands' : `Commands (cont. ${index + 1})`,
            value: chunk,
          });
        });
      }

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('❌ Help command failed:', error);

      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to load the help menu.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to load the help menu.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send help failure response:', replyError);
      }
    }
  },
};