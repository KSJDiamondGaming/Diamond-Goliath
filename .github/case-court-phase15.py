from pathlib import Path

path = Path('src/core/administration/mod/cases.js')
source = path.read_text()

old_warn = """  if (action === 'warn') {
    const removed = linkedCaseId ? deleteWarningByCaseId(guild.id, linkedCaseId) : false;
    remedy = { attempted: true, action: 'remove-warning', ok: Boolean(removed), detail: removed ? `Warning Case #${linkedCaseId} removed.` : 'Linked warning record was already absent or unavailable.' };
"""
new_warn = """  if (action === 'warn') {
    const linkedWarning = linkedCaseId ? getCaseById(guild.id, linkedCaseId) : null;
    const removed = linkedCaseId ? deleteWarningByCaseId(guild.id, linkedCaseId) : false;
    const alreadyAbsent = Boolean(linkedCaseId && (!linkedWarning || linkedWarning.status !== 'active'));
    remedy = {
      attempted: true,
      action: 'remove-warning',
      ok: Boolean(removed) || alreadyAbsent,
      detail: removed
        ? `Warning Case #${linkedCaseId} removed.`
        : alreadyAbsent
          ? `Warning Case #${linkedCaseId} was already absent or inactive.`
          : 'Linked warning record could not be removed.',
    };
"""
if old_warn not in source:
    raise SystemExit('court warning remedy anchor not found')
source = source.replace(old_warn, new_warn, 1)

old_ban = """  } else if (action === 'ban') {
    try { await guild.bans.remove(modCase.userId, reason); remedy = { attempted: true, action: 'unban', ok: true, detail: 'Court-ordered ban removed.' }; }
    catch (error) { remedy = { attempted: true, action: 'unban', ok: false, detail: String(error?.message || 'Failed to remove ban.').slice(0, 300) }; }
"""
new_ban = """  } else if (action === 'ban') {
    try {
      await guild.bans.remove(modCase.userId, reason);
      remedy = { attempted: true, action: 'unban', ok: true, detail: 'Court-ordered ban removed.' };
    } catch (error) {
      const errorCode = Number(error?.code || error?.rawError?.code || 0);
      const errorText = String(error?.message || error?.rawError?.message || 'Failed to remove ban.');
      const alreadyUnbanned = errorCode === 10026 || /unknown ban|not banned/i.test(errorText);
      remedy = {
        attempted: true,
        action: 'unban',
        ok: alreadyUnbanned,
        detail: alreadyUnbanned ? 'Court-ordered ban was already absent.' : errorText.slice(0, 300),
      };
    }
"""
if old_ban not in source:
    raise SystemExit('court ban remedy anchor not found')
source = source.replace(old_ban, new_ban, 1)

path.write_text(source)
print('Applied Court appeal idempotency hardening')
