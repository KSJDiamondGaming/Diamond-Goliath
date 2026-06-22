import React from 'react';

import PageShell, { SectionCard, EmptyState, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

export default function ReactionRoles({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);

  if (!guildId) {
    return (
      <PageShell title="Reaction Roles" subtitle="Select a server to manage reaction role panels." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage reaction roles." />
      </PageShell>
    );
  }

  return (
    <PageShell title="Reaction Roles" subtitle="Create role menus, emoji mappings and reaction role panels." theme={theme} guild={{ id: guildId, name: 'Reaction Roles' }}>
      <StatGrid min="min(200px, 100%)">
        <SummaryStat theme={theme} label="Panels" value="0" accent="#3b82f6" description="modules.reactionRoles.panels" />
        <SummaryStat theme={theme} label="Roles" value="0" accent="#22c55e" description="Configured role mappings" />
        <SummaryStat theme={theme} label="Deployments" value="0" accent="#a855f7" description="Tracked panel messages" />
      </StatGrid>

      <SectionCard theme={theme} title="Reaction Roles Foundation" subtitle="This page is ready for the reaction roles backend and panel builder.">
        <EmptyState theme={theme} text="Next build: panel builder, emoji mapping, deploy/update existing panel, and analytics using modules.reactionRoles." />
      </SectionCard>
    </PageShell>
  );
}
