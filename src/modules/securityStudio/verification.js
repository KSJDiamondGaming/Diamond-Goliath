'use strict';

const guildManager = require('../../core/guild/guildManager');
const verificationHealth = require('./verificationHealth');

async function startupVerification(client) {
  if (!client?.guilds?.cache) {
    return { ok: false, reason: 'Missing Discord client.', guildsChecked: 0, results: [] };
  }

  const results = [];
  for (const guild of client.guilds.cache.values()) {
    const enabled = guildManager.isModuleEnabled(guild.id, 'verification') === true;

    if (!enabled) {
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        ok: true,
        enabled: false,
        skipped: true,
        warnings: [],
        panels: [],
      });
      continue;
    }

    try {
      const report = await verificationHealth.buildHealthReport(guild);
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        ok: report.warnings.length === 0,
        enabled: true,
        skipped: false,
        warnings: report.warnings,
        panels: report.panels,
      });
    } catch (error) {
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        ok: false,
        enabled: true,
        skipped: false,
        warnings: [error.message || 'Verification startup check failed.'],
        panels: [],
      });
    }
  }

  const enabledResults = results.filter((result) => result.enabled === true);
  const summary = {
    ok: enabledResults.every((result) => result.ok),
    guildsChecked: results.length,
    enabledGuilds: enabledResults.length,
    skippedGuilds: results.filter((result) => result.skipped === true).length,
    totalPanels: enabledResults.reduce((total, result) => total + (result.panels?.length || 0), 0),
    totalWarnings: enabledResults.reduce((total, result) => total + (result.warnings?.length || 0), 0),
    results,
  };

  console.log(`[Verification] Startup check complete: ${summary.guildsChecked} guild(s), ${summary.enabledGuilds} enabled, ${summary.skippedGuilds} skipped, ${summary.totalPanels} panel(s), ${summary.totalWarnings} warning(s).`);
  for (const result of enabledResults) {
    if (result.warnings?.length) {
      console.warn(`[Verification] ${result.guildName || result.guildId}: ${result.warnings.join(' | ')}`);
    }
  }

  return summary;
}

module.exports = {
  startupVerification,
};
