module.exports = async function safeReply(interaction, data) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(data);
    }

    return await interaction.reply(data);
  } catch (error) {
    console.error('❌ safeReply error:', error);
  }
};