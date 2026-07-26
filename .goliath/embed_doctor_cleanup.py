from pathlib import Path

root = Path.cwd()

# Repair stale imports exposed by the full repository Doctor scan.
reaction_roles = root / 'src/modules/roleStudio/reactionRoles/reactionRoles.js'
text = reaction_roles.read_text(encoding='utf-8')
text = text.replace("require('../../embed/embedTemplateManager')", "require('../../messageStudio/embed/embedTemplates')")
text = text.replace("require('../../embed/embedTemplates')", "require('../../messageStudio/embed/embedTemplates')")
reaction_roles.write_text(text, encoding='utf-8', newline='\n')

forms_tracking = root / 'src/modules/feedbackStudio/forms/formsTracking.js'
text = forms_tracking.read_text(encoding='utf-8')
text = text.replace("require('../tickets/ticketManager')", "require('../tickets/ticketsLifecycle')")
text = text.replace("require('../tickets/ticketChannelManager')", "require('../tickets/ticketsChannels')")
text = text.replace("require('../tickets/ticketPanelManager')", "require('../tickets/ticketsPanel')")
text = text.replace("require('../tickets/ticketStore')", "require('../tickets/tickets')")
forms_tracking.write_text(text, encoding='utf-8', newline='\n')

# These event files point to a retired Social runtime implementation and are orphaned.
for orphan in [
    root / 'src/events/social/socialReady.js',
    root / 'src/events/social/socialShardResume.js',
]:
    orphan.unlink(missing_ok=True)

# Keep the canonical Invite Studio documentation available at the Doctor path.
invite_doc = root / 'docs/modules/invites.md'
canonical_invite_doc = root / 'docs/modules/communityStudio/invites.md'
canonical_invite_doc.parent.mkdir(parents=True, exist_ok=True)
if invite_doc.exists():
    canonical_invite_doc.write_text(invite_doc.read_text(encoding='utf-8'), encoding='utf-8', newline='\n')

# Remove diagnostic-only files after the successful build commits.
for temporary in [
    root / '.goliath/embed_doctor_cleanup.py',
    root / '.goliath/embed-doctor-error.txt',
]:
    temporary.unlink(missing_ok=True)
