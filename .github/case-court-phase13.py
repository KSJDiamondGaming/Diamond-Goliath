from pathlib import Path

path = Path('src/core/administration/mod/cases.js')
text = path.read_text()

old = """  if (modCase.action === 'warn') {\n    const removed = deleteWarningByCaseId(guild.id, modCase.caseId);\n    updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n    return { attempted: true, action: 'remove-warning', ok: Boolean(removed), detail: removed ? 'Warning removed.' : 'Warning record was already absent.' };\n  }\n"""
new = """  if (modCase.action === 'warn') {\n    const removed = deleteWarningByCaseId(guild.id, modCase.caseId);\n    // Desired end state is warning absent. Treat an already-absent warning as idempotent success.\n    updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n    return { attempted: true, action: 'remove-warning', ok: true, detail: removed ? 'Warning removed.' : 'Warning record was already absent; no further warning action was required.' };\n  }\n"""
assert old in text, 'warn remedy block not found'
text = text.replace(old, new, 1)

old = """    if (!target) {\n      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n      return { attempted: true, action: 'remove-timeout', ok: false, detail: 'Member not available to clear timeout; case status reversed.' };\n    }\n"""
new = """    if (!target) {\n      return { attempted: true, action: 'remove-timeout', ok: false, detail: 'Member not available to clear timeout. Case remains active until the remedy succeeds.' };\n    }\n"""
assert old in text, 'missing-target timeout block not found'
text = text.replace(old, new, 1)

old = """    } catch (error) {\n      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n      return { attempted: true, action: 'remove-timeout', ok: false, detail: String(error?.message || 'Failed to clear timeout.').slice(0, 300) };\n    }\n  }\n  if (modCase.action === 'ban') {\n"""
new = """    } catch (error) {\n      return { attempted: true, action: 'remove-timeout', ok: false, detail: `${String(error?.message || 'Failed to clear timeout.').slice(0, 260)} Case remains active until the remedy succeeds.` };\n    }\n  }\n  if (modCase.action === 'ban') {\n"""
assert old in text, 'timeout failure block not found'
text = text.replace(old, new, 1)

old = """    } catch (error) {\n      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n      return { attempted: true, action: 'unban', ok: false, detail: String(error?.message || 'Failed to remove ban.').slice(0, 300) };\n    }\n  }\n"""
new = """    } catch (error) {\n      const message = String(error?.message || 'Failed to remove ban.');\n      const alreadyAbsent = /unknown ban|not banned|10026/i.test(message);\n      if (alreadyAbsent) {\n        updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);\n        return { attempted: true, action: 'unban', ok: true, detail: 'Ban was already absent; desired appeal remedy state is satisfied.' };\n      }\n      return { attempted: true, action: 'unban', ok: false, detail: `${message.slice(0, 260)} Case remains active until the remedy succeeds.` };\n    }\n  }\n"""
assert old in text, 'ban failure block not found'
text = text.replace(old, new, 1)

path.write_text(text)
