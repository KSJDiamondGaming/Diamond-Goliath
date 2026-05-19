const express = require('express');
const router = express.Router();

const guildManager = require('../../guild/guildManager');

function getGuildId(req) {
  return (
    req.query.guildId ||
    req.session?.guildId ||
    req.session?.selectedGuildId ||
    null
  );
}

router.get('/overview', async (req, res) => {
  try {
    const guildId = getGuildId(req);

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guildId.',
      });
    }

    const security = guildManager.getSecurityConfig(guildId) || {};

    return res.json({
      ok: true,
      guildId,

      threatLevel: security.threatLevel || 'low',

      incidents: {
        total: security.totalIncidents || 0,
        critical: security.criticalIncidents || 0,
        recent: Array.isArray(security.incidents)
          ? security.incidents.slice(0, 25)
          : [],
      },

      lockdown: security.lockdown || {
        active: false,
      },

      quarantine: security.quarantine || {
        users: {},
      },

      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Security Routes] overview failed:', error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;