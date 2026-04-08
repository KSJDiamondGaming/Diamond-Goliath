const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setembed')
    .setDescription('Configure the global embed system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub
        .setName('color')
        .setDescription('Set embed color')
        .addStringOption(opt =>
          opt
            .setName('hex')
            .setDescription('Example: #00ffae')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('footer')
        .setDescription('Set embed footer text')
        .addStringOption(opt =>
          opt
            .setName('text')
            .setDescription('Footer text')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('footericon')
        .setDescription('Set footer icon URL')
        .addStringOption(opt =>
          opt
            .setName('url')
            .setDescription('Image URL')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('title')
        .setDescription('Set default embed title')
        .addStringOption(opt =>
          opt
            .setName('text')
            .setDescription('Title text')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('preview')
        .setDescription('Preview embed style')
    )

    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset embed settings')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const dataPath = path.join(__dirname, '..', '..', 'data', 'embedConfigs.json');

    let data = {};
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      data = raw ? JSON.parse(raw) : {};
    }

    if (!data[interaction.guild.id]) {
      data[interaction.guild.id] = {};
    }

    const config = data[interaction.guild.id];

    if (sub === 'color') {
      const hex = interaction.options.getString('hex').trim();
      const valid = /^#?[0-9A-Fa-f]{6}$/;

      if (!valid.test(hex)) {
        return interaction.reply({
          content: 'Invalid hex. Use something like `#00ffae`',
          ephemeral: true,
        });
      }

      config.color = hex.startsWith('#') ? hex : `#${hex}`;
    }

    if (sub === 'footer') {
      config.footerText = interaction.options.getString('text');
    }

    if (sub === 'footericon') {
      config.footerIcon = interaction.options.getString('url');
    }

    if (sub === 'title') {
      config.defaultTitle = interaction.options.getString('text');
    }

    if (sub === 'reset') {
      data[interaction.guild.id] = {};
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      return interaction.reply({
        content: '♻️ Embed settings reset.',
      });
    }

    if (sub !== 'preview') {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      return interaction.reply({
        content: '✅ Embed settings updated.',
      });
    }

    if (sub === 'preview') {
      const embed = new EmbedBuilder()
        .setTitle(config.defaultTitle || 'Preview Title')
        .setDescription('This is your global embed style preview.')
        .setColor(config.color || '#2b2d31')
        .setTimestamp();

      if (config.footerText) {
        embed.setFooter({
          text: config.footerText,
          iconURL: config.footerIcon || undefined,
        });
      }

      return interaction.reply({ embeds: [embed] });
    }
  },
};