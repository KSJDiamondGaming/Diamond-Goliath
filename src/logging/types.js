const LOG_TYPES = Object.freeze({
  ADMIN_ACTION: 'admin.action',
  ADMIN_CONFIG_UPDATE: 'admin.configUpdate',

  MODERATION_ACTION: 'moderation.action',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_TIMEOUT: 'moderation.timeout',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_BAN: 'moderation.ban',

  AUTOMOD_ACTION: 'automod.action',

  MEMBER_JOIN: 'member.join',
  MEMBER_LEAVE: 'member.leave',
  MEMBER_UPDATE: 'member.update',

  MESSAGE_DELETE: 'message.delete',
  MESSAGE_EDIT: 'message.edit',

  VOICE_JOIN: 'voice.join',
  VOICE_LEAVE: 'voice.leave',
  VOICE_MOVE: 'voice.move',
});

module.exports = {
  LOG_TYPES,
};