const express = require('express');

const {
  getGuildData,
  setModuleEnabled,
} = require('../../guild/guildManager');

const router = express.Router();

function normalizeModuleMap(modules = {}) {
  const output = {};

  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
    return output;
  }

  for (const [key, value] of Object.entries(modules)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = {
        ...value,
        enabled: value.enabled !== false,
      };
      continue;
    }

    if (typeof value === 'boolean') {
      output[key] = { enabled: value !== false };
      continue;
    }

    output[key] = { enabled: true };
  }

  return output;
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const guildData = getGuildData(guildId);

    return res.json({
      success: true,
      guildId,
      modules: normalizeModuleMap(guildData.modules || {}),
    });
  } catch (error) {
    console.error('❌ Failed to load guild modules');
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load guild modules.',
    });
  }
});

router.patch('/:guildId/:moduleKey/enabled', (req, res) => {
  try {
    const { guildId, moduleKey } = req.params;
    const enabled = req.body?.enabled === true;

    const modules = setModuleEnabled(guildId, moduleKey, enabled);

    return res.json({
      success: true,
      guildId,
      moduleKey,
      enabled,
      modules: normalizeModuleMap(modules || {}),
    });
  } catch (error) {
    console.error('❌ Failed to update guild module state');
    console.error(error);

    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to update guild module state.',
    });
  }
});

module.exports = router;
