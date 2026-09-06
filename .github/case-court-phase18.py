from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
source = path.read_text()

if "executedWithoutMember: true" in source:
    print('Court absent-member ban support already present.')
    raise SystemExit(0)

old = """    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);\n    if (!target) {\n      const failed = { ...claimedExecution, status: 'failed', executedAt: now(), error: 'Member is not currently available in this server.' };\n      saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: failed }, interaction.user.id, 'case.court.sanction_failed', claimedExecution);\n      COURT_EXECUTION_LOCKS.delete(lockKey);\n      await interaction.reply({ content: '❌ The member is not currently available in this server, so this sanction cannot be executed from Case Court.', flags: 64 }); return true;\n    }\n"""
new = """    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);\n    if (!target && action !== 'ban') {\n      const failed = { ...claimedExecution, status: 'failed', executedAt: now(), error: 'Member is not currently available in this server.' };\n      saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: failed }, interaction.user.id, 'case.court.sanction_failed', claimedExecution);\n      COURT_EXECUTION_LOCKS.delete(lockKey);\n      await interaction.reply({ content: '❌ The member is not currently available in this server, so this sanction cannot be executed from Case Court.', flags: 64 }); return true;\n    }\n"""
if old not in source:
    raise RuntimeError('Target availability anchor not found')
source = source.replace(old, new, 1)

old = """      } else {\n        const metadata = { sourceCourtCaseId: caseId, courtOrdered: true };\n        if (action === 'timeout') {\n          metadata.durationRaw = parameter;\n          metadata.durationMs = durationMs;\n        }\n        if (action === 'ban') metadata.deleteDays = deleteDays;\n        const result = await executeEnginePunishment(interaction, target, action, reason, metadata, { logAction: `Court ${action}` });\n        linkedCaseId = result?.modCase?.caseId || null;\n        resultSummary = `${action} applied successfully.`;\n      }\n"""
new = """      } else if (action === 'ban' && !target) {\n        await interaction.guild.members.ban(modCase.userId, {\n          deleteMessageSeconds: deleteDays * 24 * 60 * 60,\n          reason,\n        });\n        const linked = createCase({\n          guildId: interaction.guildId,\n          userId: modCase.userId,\n          moderatorId: interaction.user.id,\n          action: 'ban',\n          reason,\n          metadata: {\n            sourceCourtCaseId: caseId,\n            courtOrdered: true,\n            deleteDays,\n            executedWithoutMember: true,\n          },\n          status: 'active',\n          actorId: interaction.user.id,\n        });\n        linkedCaseId = linked?.caseId || null;\n        resultSummary = 'ban applied successfully to a user who was no longer in the server.';\n      } else {\n        const metadata = { sourceCourtCaseId: caseId, courtOrdered: true };\n        if (action === 'timeout') {\n          metadata.durationRaw = parameter;\n          metadata.durationMs = durationMs;\n        }\n        if (action === 'ban') metadata.deleteDays = deleteDays;\n        const result = await executeEnginePunishment(interaction, target, action, reason, metadata, { logAction: `Court ${action}` });\n        linkedCaseId = result?.modCase?.caseId || null;\n        resultSummary = `${action} applied successfully.`;\n      }\n"""
if old not in source:
    raise RuntimeError('Punishment execution anchor not found')
source = source.replace(old, new, 1)

path.write_text(source)
print('Court absent-member ban support applied.')
