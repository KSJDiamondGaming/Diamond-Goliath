'use strict';

const intelligence = require('../../core/administration/mod/intelligence');

module.exports = [
  {
    name: 'guildMemberAdd',
    execute(member) {
      try { intelligence.observeJoin(member); }
      catch (error) { console.warn('[Member Intelligence] join capture failed:', error?.message || error); }
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
