'use strict';

const intelligence = require('../../core/administration/mod/intelligence');
const joinIntelligence = require('../../core/administration/mod/joinIntelligence');

try {
  require('../../modules/securityStudio/verificationIntelligenceExtension').install();
} catch (error) {
  console.warn('[Join Intelligence] Verification UI extension failed to load:', error?.message || error);
}

module.exports = [
  {
    name: 'guildMemberAdd',
    async execute(member) {
      try { intelligence.observeJoin(member); }
      catch (error) { console.warn('[Member Intelligence] join capture failed:', error?.message || error); }

      try {
        const result = await joinIntelligence.scanMemberOnJoin(member);
        if (result?.success && result?.delivered) {
          console.log(`[Join Intelligence] ${member.guild?.name || member.guild?.id}: scanned ${member.user?.tag || member.id} -> ${result.channelId} (${result.risk?.score || 0}/100).`);
        }
      } catch (error) {
        console.warn('[Join Intelligence] automatic join scan failed:', error?.message || error);
      }
    },
  },
  {
    name: 'guildMemberUpdate',
    execute(oldMember, newMember) {
      try { intelligence.observeUpdate(oldMember, newMember); }
      catch (error) { console.warn('[Member Intelligence] member update capture failed:', error?.message || error); }
    },
  },
  {
    name: 'guildMemberRemove',
    execute(member) {
      try { intelligence.observeLeave(member, 'leave'); }
      catch (error) { console.warn('[Member Intelligence] leave capture failed:', error?.message || error); }
    },
  },
  {
    name: 'guildBanAdd',
    execute(ban) {
      try {
        const member = ban?.guild?.members?.cache?.get?.(ban.user?.id);
        if (member) intelligence.observeLeave(member, 'ban');
      } catch (error) { console.warn('[Member Intelligence] ban capture failed:', error?.message || error); }
    },
  },
  {
    name: 'userUpdate',
    execute(oldUser, newUser) {
      try { intelligence.observeUserUpdate(newUser?.client, oldUser, newUser); }
      catch (error) { console.warn('[Member Intelligence] identity update capture failed:', error?.message || error); }
    },
  },
];
