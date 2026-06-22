import React from 'react';

import PageShell, { SectionCard, EmptyState, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

export default function Leveling({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);

  if (!guildId) {
    return (
      <PageShell title="Leveling" subtitle="Select a server to manage XP and levels." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage leveling." />
      </PageShell>
    );
  }

  return (
    <PageShell title="Leveling" subtitle="Manage XP settings, rewards, level roles and leaderboards." theme={theme} guild={{ id: guildId, name: 'Leveling' }}>
      <StatGrid min="min(200px, 100%)">
        <SummaryStat theme={theme} label="Tracked Users" value="0" accent="#3b82f6" description="modules.leveling.users" />
        <SummaryStat theme={theme} label="Rewards" value="0" accent="#22c55e" description="Level role rewards" />
        <SummaryStat theme={theme} label="Multiplier" value="1x" accent="#a855f7" description="Default XP rate" />
      </StatGrid>

      <SectionCard theme={theme} title="Leveling Foundation" subtitle="This page is ready for XP settings, rewards and leaderboard UI.">
        <EmptyState theme={theme} text="Next build: XP rules, cooldowns, level rewards, role rewards, leaderboard and analytics using modules.leveling." />
      </SectionCard>
    </PageShell>
  );
}
