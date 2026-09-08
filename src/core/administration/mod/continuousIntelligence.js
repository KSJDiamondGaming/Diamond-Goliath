'use strict';

const decisioning = require('./memberDecisioning');
const joinIntelligence = require('./joinIntelligence');
const { recordModerationSystemEvent } = require('./permissions');

const COOLDOWN_MS = 60_000;
const recent = new Map();

function key(member) { return `${member.guild.id}:${member.id}`; }
function shouldRun(member) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) return false;
  const config = joinIntelligence.getConfig(member.guild.id);
  return config.enabled && config.continuousEnabled;
}

async function reevaluateMember(member, trigger = 'member_update', { force = false, deliver = true } = {}) {
  if (!shouldRun(member)) return { skipped: true, reason: 'disabled' };
  const cacheKey = key(member);
  const last = recent.get(cacheKey) || 0;
  if (!force && Date.now() - last < COOLDOWN_MS) return { skipped: true, reason: 'cooldown' };
  recent.set(cacheKey, Date.now());

  const local = joinIntelligence.localSummary(member.guild.id, member.id);
  const suspects = joinIntelligence.suspectedAccounts(member);
  const result = await decisioning.evaluateMember(member, local, suspects, { trigger });

  if (!result.change.changed) return { success: true, changed: false, result };

  recordModerationSystemEvent({
    guildId: member.guild.id,
    actorId: 'system:continuous-member-intelligence',
    event: 'moderation.intelligence.reassessed',
    action: 'member_intelligence_reassess',
    targetId: member.id,
    before: result.before,
    after: result.after,
    metadata: { trigger, changes: result.change.reasons },
  });

  const initialBaseline = !result.before;
  const silentInitialClear = initialBaseline && result.after?.decision === 'clear';
  if (!deliver || silentInitialClear) {
    return {
      success: true,
      changed: true,
      delivered: false,
      baselineStored: initialBaseline,
      reason: silentInitialClear ? 'initial_clear_baseline_silent' : undefined,
      result,
    };
  }

  const channel = await joinIntelligence.resolveOutputChannel(member);
  if (!channel?.send) return { success: true, changed: true, delivered: false, reason: 'missing_output_channel', result };

  const embed = decisioning.buildChangeEmbed(member, result, trigger);
  await channel.send({ embeds: [embed], components: joinIntelligence.buildActionRows(member), allowedMentions: { parse: [] } });
  return { success: true, changed: true, delivered: true, channelId: channel.id, result };
}

async function sweepClient(client) {
  let checked = 0;
  let changed = 0;
  let delivered = 0;
  let silentBaselines = 0;
  let failures = 0;

  for (const guild of client?.guilds?.cache?.values?.() || []) {
    const config = joinIntelligence.getConfig(guild.id);
    if (!config.enabled || !config.continuousEnabled) continue;

    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      checked += 1;
      try {
        const result = await reevaluateMember(member, 'periodic_sweep', { force: true, deliver: true });
        if (result?.changed) changed += 1;
        if (result?.delivered) delivered += 1;
        if (result?.reason === 'initial_clear_baseline_silent') silentBaselines += 1;
      } catch (error) {
        failures += 1;
        console.warn(`[Continuous Intelligence] ${guild.id}/${member.id}:`, error?.message || error);
      }
    }
  }

  return { checked, changed, delivered, silentBaselines, failures };
}

function getSweepIntervalMs(client) {
  let minutes = 15;
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    const config = joinIntelligence.getConfig(guild.id);
    if (config.enabled && config.continuousEnabled) minutes = Math.min(minutes, config.periodicMinutes || 15);
  }
  return Math.max(5, minutes) * 60_000;
}

module.exports = {
  reevaluateMember,
  sweepClient,
  getSweepIntervalMs,
};
