'use strict';
const fs = require('node:fs');

const path = 'src/core/administration/mod/storage.js';
let source = fs.readFileSync(path, 'utf8');
const fnStart = source.indexOf('async function sendCaseAppealNotice');
if (fnStart < 0) throw new Error('sendCaseAppealNotice not found');

const start = source.indexOf("    const action = String(modCase.action || 'moderation action').toUpperCase();", fnStart);
const sentTrue = source.indexOf('    sent = true;', start);
if (start < 0 || sentTrue < 0) throw new Error('Appeal notice send block not found');
const sendEnd = source.lastIndexOf('    });', sentTrue);
if (sendEnd < start) throw new Error('Appeal notice send block end not found');

const replacement = `    const action = String(modCase.action || 'moderation action').toUpperCase();
    const reason = String(modCase.reason || 'No reason provided').slice(0, 900);
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('⚖️ Moderation Decision')
      .setDescription(\`A moderation action has been recorded for you in **\${String(guild.name || 'this server').slice(0, 120)}**.\\n\\nYou can review the details below and appeal if you believe the decision should be reconsidered.\`)
      .addFields(
        { name: 'Action', value: action.slice(0, 1024), inline: true },
        { name: 'Case', value: \`#\${modCase.caseId}\`, inline: true },
        { name: 'Reason', value: reason || 'No reason provided', inline: false },
        { name: 'Want to appeal?', value: 'Use **Appeal This Case** below. You can appeal even if you are no longer in the server.\\n\\nIf the button is unavailable, open your DM with **Goliath** and use \\`/appeal\\`. A web appeal option will also be available in the future.', inline: false },
      )
      .setFooter({ text: \`Goliath • \${String(guild.name || 'Moderation').slice(0, 100)} • Case #\${modCase.caseId}\` })
      .setTimestamp();
    await recipient.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(\`mod_appeal_external:\${guild.id}:\${modCase.caseId}\`).setLabel('Appeal This Case').setEmoji('⚖️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mod_appeal_lookup').setLabel('Appeal Another Case').setStyle(ButtonStyle.Secondary)
      )],
    });`;

source = source.slice(0, start) + replacement + source.slice(sendEnd + '    });'.length);
if (source.includes('/mod appeal:')) throw new Error('Legacy /mod appeal instruction remains');
if (!source.includes('use `/appeal`')) throw new Error('Public /appeal instruction missing');
fs.writeFileSync(path, source);
