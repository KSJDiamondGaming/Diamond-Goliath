from pathlib import Path
p=Path('src/core/administration/mod/caseManagementUx.js')
s=p.read_text()

s=s.replace("""  function buildDisplayTitle(caseId, memberName, shortTitle) {
    const prefix = `Case #${caseId} • ${memberName} • `;
    const remaining = Math.max(16, 180 - prefix.length);
    return `${prefix}${String(shortTitle || 'Untitled Case').replace(/\\s+/g, ' ').trim().slice(0, remaining)}`;
  }

  function caseDisplayTitle(modCase, fallbackMemberName = null) {
    if (!modCase) return null;
    const court = modCase.metadata?.court || {};
    if (court.displayTitle) return String(court.displayTitle);
    const base = String(court.title || court.allegations || modCase.reason || 'Untitled Case').replace(/\\s+/g, ' ').trim();
    const memberName = String(court.subjectName || fallbackMemberName || modCase.userId || 'Unknown Member');
    return buildDisplayTitle(modCase.caseId, memberName, base);
  }
""", """  function buildDisplayTitle(caseId, memberName, shortTitle, userId = '') {
    const identity = [memberName, userId, shortTitle || 'Untitled Case'].filter(Boolean).join(' • ');
    return String(identity).replace(/\\s+/g, ' ').trim().slice(0, 180);
  }

  function liveSubjectName(interaction, userId, storedName = null) {
    const cached = interaction?.guild?.members?.cache?.get?.(String(userId));
    const live = subjectName(cached, '');
    if (live && live !== 'Unknown Member') return live;
    const stored = String(storedName || '').trim();
    if (stored && stored !== String(userId) && !/^\\d{15,25}$/.test(stored)) return stored;
    return String(userId || 'Unknown Member');
  }

  function caseDisplayTitle(modCase, fallbackMemberName = null) {
    if (!modCase) return null;
    const court = modCase.metadata?.court || {};
    const base = String(court.title || court.allegations || modCase.reason || 'Untitled Case').replace(/\\s+/g, ' ').trim();
    const memberName = String(fallbackMemberName || court.subjectName || modCase.userId || 'Unknown Member');
    return buildDisplayTitle(modCase.caseId, memberName, base, modCase.userId);
  }
""",1)

s=s.replace("function decorateEmbed(embed, guildId) {", "function decorateEmbed(embed, interaction) {\n    const guildId = interaction?.guildId || interaction?.guild?.id;",1)
s=s.replace("const display = caseDisplayTitle(modCase);", "const display = caseDisplayTitle(modCase, liveSubjectName(interaction, modCase?.userId, modCase?.metadata?.court?.subjectName));",1)
s=s.replace("const display = caseDisplayTitle(entry, targetId);", "const display = caseDisplayTitle(entry, liveSubjectName(interaction, targetId, entry?.metadata?.court?.subjectName));",1)

old="""  function decorateComponents(components, guildId) {
    if (!Array.isArray(components)) return components;
    for (const row of components) {
      const items = row?.components || row?.data?.components;
      if (!Array.isArray(items)) continue;
      for (const component of items) {
        const data = component?.data || component;
        const customId = data?.custom_id || data?.customId;
        if (!String(customId || '').startsWith('mod_court_open:')) continue;
        const options = component?.options || data?.options;
        if (!Array.isArray(options)) continue;
        for (const option of options) {
          const optionData = option?.data || option;
          const modCase = getCase(guildId, optionData?.value);
          const display = caseDisplayTitle(modCase);
          if (!display) continue;
          const label = display.slice(0, 100);
          if (option?.data) option.data.label = label;
          else option.label = label;
        }
      }
    }
    return components;
  }
"""
new="""  function decorateComponents(components, interaction) {
    if (!Array.isArray(components)) return components;
    const guildId = interaction?.guildId || interaction?.guild?.id;
    for (const row of components) {
      const items = row?.components || row?.data?.components;
      if (!Array.isArray(items)) continue;
      for (const component of items) {
        const data = component?.data || component;
        const customId = data?.custom_id || data?.customId;
        if (!String(customId || '').startsWith('mod_court_open:')) continue;
        const targetId = String(customId).split(':')[1] || '';
        const options = component?.options || data?.options;
        if (!Array.isArray(options)) continue;
        for (const option of options) {
          const optionData = option?.data || option;
          const modCase = getCase(guildId, optionData?.value);
          if (!modCase) continue;
          const court = modCase.metadata?.court || {};
          const memberName = liveSubjectName(interaction, targetId || modCase.userId, court.subjectName);
          const caseTitle = String(court.title || court.allegations || modCase.reason || 'Untitled Case').replace(/\\s+/g, ' ').trim();
          const label = buildDisplayTitle(modCase.caseId, memberName, caseTitle, targetId || modCase.userId).slice(0, 100);
          const stage = caseCourt.stageText(court.stage || 'investigation').replace(/^\\S+\\s/, '');
          const severity = caseCourt.severityText(court.severity || 1);
          const description = `Case #${modCase.caseId} • ${stage} • Severity ${severity}`.slice(0, 100);
          if (option?.data) { option.data.label = label; option.data.description = description; }
          else { option.label = label; option.description = description; }
        }
      }
    }
    return components;
  }
"""
if old not in s: raise SystemExit('decorateComponents anchor not found')
s=s.replace(old,new,1)

s=s.replace("if (payload.embed) decorateEmbed(payload.embed, guildId);", "if (payload.embed) decorateEmbed(payload.embed, interaction);",1)
s=s.replace("if (Array.isArray(payload.embeds)) for (const embed of payload.embeds) decorateEmbed(embed, guildId);", "if (Array.isArray(payload.embeds)) for (const embed of payload.embeds) decorateEmbed(embed, interaction);",1)
s=s.replace("decorateComponents(payload.components, guildId);", "decorateComponents(payload.components, interaction);",1)

s=s.replace("const displayTitle = buildDisplayTitle(created.caseId, memberName, shortTitle);", "const displayTitle = buildDisplayTitle(created.caseId, memberName, shortTitle, targetId);",1)

p.write_text(s)
