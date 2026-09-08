from pathlib import Path

p = Path('src/core/administration/mod/storage.js')
s = p.read_text()
fn = s.index('async function sendCaseAppealNotice')
start = s.index("    const action = String(modCase.action || 'moderation action').toUpperCase();", fn)
end = s.index('    sent = true;', start)
old_end = s.rfind('    });', start, end) + len('    });')
replacement = """    const action = String(modCase.action || 'moderation action').toUpperCase();
    const reason = String(modCase.reason || 'No reason provided').slice(0, 900);
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('⚖️ Moderation Decision')
      .setDescription(`A moderation action has been recorded for you in **${String(guild.name || 'this server').slice(0, 120)}**.\n\nYou can review the details below and appeal if you believe the decision should be reconsidered.`)
      .addFields(
        { name: 'Action', value: action.slice(0, 1024), inline: true },
        { name: 'Case', value: `#${modCase.caseId}`, inline: true },
        { name: 'Reason', value: reason || 'No reason provided', inline: false },
        { name: 'How to appeal', value: 'Use **Appeal This Case** below. You can appeal even if you are no longer in the server.\n\nIf the button is unavailable, open your DM with **Goliath** and use `/appeal`. A secure web appeal option will also be available in the future.', inline: false },
      )
      .setFooter({ text: `Goliath • ${String(guild.name || 'Moderation').slice(0, 100)} • Case #${modCase.caseId}` })
      .setTimestamp();
    await recipient.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mod_appeal_external:${guild.id}:${modCase.caseId}`).setLabel('Appeal This Case').setEmoji('⚖️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mod_appeal_lookup').setLabel('Appeal Another Case').setStyle(ButtonStyle.Secondary)
      )],
    });"""
s = s[:start] + replacement + s[old_end:]
if '/mod appeal:' in s:
    raise SystemExit('legacy /mod appeal instruction remains')
p.write_text(s)
