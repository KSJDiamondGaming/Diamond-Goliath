const express = require('express');
const router = express.Router();

const guildManager = require('../../guild/guildManager');
const { requireEntitlement } = require('../middleware/requireEntitlement');

function getGuildId(req) {
  return (
    req.params.guildId ||
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

      premium: {
        advancedSecurityLocked: true,
        requiredFeature: 'security.advanced',
        requiredPlan: 'pro',
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

router.get('/:guildId/advanced', requireEntitlement('security.advanced'), async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const security = guildManager.getSecurityConfig(guildId) || {};
    const incidents = Array.isArray(security.incidents) ? security.incidents : [];

    return res.json({
      success: true,
      guildId,
      advanced: {
        enabled: true,
        featureKey: 'security.advanced',
        threatLevel: security.threatLevel || 'low',
        incidents,
        trends: {
          totalIncidents: incidents.length,
          criticalIncidents: incidents.filter((incident) => incident.severity === 'critical').length,
          highIncidents: incidents.filter((incident) => incident.severity === 'high').length,
          latestIncidentAt: incidents[0]?.createdAt || incidents[0]?.timestamp || null,
        },
        auditViews: {
          lockdown: security.lockdown || { active: false },
          quarantine: security.quarantine || { users: {} },
          webhooks: security.webhooks || {},
          ownerMonitoring: security.ownerMonitoring || {},
        },
      },
    });
  } catch (error) {
    console.error('[Security Routes] advanced failed:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load advanced security.',
    });
  }
});

module.exports = router;
