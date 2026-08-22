'use strict';

const security = require('../../../core/security/securityCore');
const base = require('./timedRoles');
const service = require('./timedRolesService');

const PATCH_KEY = Symbol.for('goliath.timedRoles.compatPatchInstalled');

function installTimedRolesCompat() {
  if (globalThis[PATCH_KEY]) return;
  globalThis[PATCH_KEY] = true;

  // Safe compatibility surface: these service functions do not recurse through
  // the corresponding base method, so legacy imports can use the hardened path.
  base.applyProgressionToMember = service.applyProgressionToMember;
  base.scanGuild = service.scanGuild;
  base.simulateGuild = service.simulateGuild;
  base.startup = service.startup;

  try {
    const panel = require('./timedRolesPanel');
    if (!panel.__timedRolesSecurityWrapped && typeof panel.handleTimedRolesInteraction === 'function') {
      const original = panel.handleTimedRolesInteraction;
      panel.handleTimedRolesInteraction = async function hardenedTimedRolesInteraction(interaction) {
        const allowed = await security.enforceInteractionSecurity(interaction, { level: 'admin', guildOnly: true });
        if (!allowed) return true;

        const customId = String(interaction.customId || '');
        if (customId.startsWith('admin:timedRoles:createSubmit:')) {
          const roleId = customId.split(':').pop();
          const duplicate = base.listRules(interaction.guild.id).find((rule) => rule.roleId === roleId);
          if (duplicate) throw new Error(`That Discord role is already used by the Timed Roles milestone “${duplicate.name}”.`);
        }
        if (customId.startsWith('admin:timedRoles:duplicate:')) {
          const payload = { content: '❌ A Timed Roles milestone cannot duplicate the same award role. Choose a different role for the new milestone.', ephemeral: true };
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
          else await interaction.reply(payload).catch(() => null);
          return true;
        }
        return original(interaction);
      };
      Object.defineProperty(panel, '__timedRolesSecurityWrapped', { value: true });
    }
  } catch (error) {
    globalThis[PATCH_KEY] = false;
    console.error('[TimedRoles] Compatibility hardening failed:', error);
  }
}

installTimedRolesCompat();

module.exports = { installTimedRolesCompat };
