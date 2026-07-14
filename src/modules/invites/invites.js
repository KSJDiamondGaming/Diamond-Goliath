const inviteManager = require('./invitesManager');
const inviteTracker = require('./inviteTracker');

module.exports = {
  name: 'invites',
  async init(client) {
    inviteTracker.attach(client);
    await inviteManager.validateAll(client);
  },
};
