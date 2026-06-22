import React from 'react';

import PageShell, { SectionCard, EmptyState, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

export default function WelcomeLeave({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);

  if (!guildId) {
    return (
      <PageShell title="Welcome & Leave" subtitle="Select a server to manage welcome and leave messages." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage Welcome & Leave." />
      </PageShell>
    );
  }

  return (
    <PageShell title="Welcome & Leave" subtitle="Manage join messages, leave messages, DM welcomes and analytics." theme={theme} guild={{ id: guildId, name: 'Welcome & Leave' }}>
      <StatGrid min="min(200px, 100%)">
        <SummaryStat theme={theme} label="Joins" value="0" accent="#22c55e" description="modules.welcome.analytics.joins" />
        <SummaryStat theme={theme} label="Leaves" value="0" accent="#f59e0b" description="modules.welcome.analytics.leaves" />
        <SummaryStat theme={theme} label="DM Welcome" value="Off" accent="#3b82f6" description="Optional direct message" />
      </StatGrid>

      <SectionCard theme={theme} title="Welcome & Leave Foundation" subtitle="Combined module for all member arrival and departure messaging.">
        <EmptyState theme={theme} text="Next build: welcome channel, welcome embed, leave channel, leave embed, DM welcome and variables using modules.welcome." />
      </SectionCard>
    </PageShell>
  );
}
