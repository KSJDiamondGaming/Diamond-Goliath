// src/commands/admin/securitytest.js

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const {
  logIncident,
  SEVERITY,
  INCIDENT_TYPES,
} = require('../../security/securitySystem');

const {
  createServerBackup,
} = require('../../security/serverBackup');

const BUTTON_PREFIX = 'securitytest:';

// OWNER_ID = Main Goliath owner account.
// BOT_OWNER_ID = Safe offline Discord Developer Portal application owner.
const OWNER_ID = String(process.env.OWNER_ID || '').trim();
const BOT_OWNER_ID = String(process.env.BOT_OWNER_ID || '').trim();

function getOwnerIds() {
  return OWNER_ID ? [OWNER_ID] : [];
}

function getOwnerId() {
  return OWNER_ID || null;
}

function getBotOwnerId() {
  return BOT_OWNER_ID || null;
}

function isOwner(interaction) {
  const userId = interaction?.user?.id;
  return Boolean(userId && OWNER_ID && String(userId) === OWNER_ID);
}

function incidentType(name, fallback = INCIDENT_TYPES.SUSPICIOUS_ADMIN_ACTION) {
  return INCIDENT_TYPES[name] || fallback;
}

function severity(name, fallback = SEVERITY.HIGH) {
  return SEVERITY[name] || fallback;
}

async function deferSafe(interaction) {
  try {
    if (interaction.deferred || interaction.replied) {
      return true;
    }

    if (interaction.isButton?.()) {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    return true;
  } catch (error) {
    if (error?.code === 10062) {
      console.warn('[securitytest] Interaction expired before it could be acknowledged.');
      return false;
    }

    console.error('[securitytest] Failed to defer interaction:', error);
    return false;
  }
}

async function sendSafe(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }

    return await interaction.reply({
      ...payload,
      flags: payload.flags ?? MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('[securitytest] Failed to send interaction response:', error);
    return null;
  }
}

function buildBaseIncident(interaction, overrides = {}) {
  return {
    type: overrides.type || INCIDENT_TYPES.SUSPICIOUS_ADMIN_ACTION,
    severity: overrides.severity || SEVERITY.HIGH,
    actorId: interaction.user.id,
    actorTag: interaction.user.tag,
    targetId: overrides.targetId || interaction.guild.id,
    targetName: overrides.targetName || interaction.guild.name,
    targetType: overrides.targetType || 'guild',
    reason: overrides.reason || 'Manual owner security test.',
    actionTaken:
      overrides.actionTaken ||
      'Simulated test incident sent to local logs and owner webhook mirror.',
    metadata: {
      simulated: true,
      testMode: true,
      dryRun: true,
      source: 'owner_security_test',
      command: '/securitytest',
      requestedBy: interaction.user.id,
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      ...overrides.metadata,
    },
  };
}

const TESTS = {
  'channel-delete': {
    label: 'Channel Delete',
    emoji: '📁',
    style: ButtonStyle.Danger,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: incidentType('CHANNEL_DELETE'),
        severity: severity('CRITICAL'),
        targetId: 'SIMULATED_CHANNEL_ID',
        targetName: '#simulated-deleted-channel',
        targetType: 'channel',
        reason: 'Simulated channel delete attack test.',
        actionTaken:
          'No channel was deleted. Channel delete anti-nuke logging was safely tested.',
        metadata: {
          testType: 'channel_delete_attack',
          fakeChannelId: 'SIMULATED_CHANNEL_ID',
          fakeChannelName: 'simulated-deleted-channel',
        },
      });
    },
  },

  'role-delete': {
    label: 'Role Delete',
    emoji: '🎭',
    style: ButtonStyle.Danger,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: incidentType('ROLE_DELETE'),
        severity: severity('CRITICAL'),
        targetId: 'SIMULATED_ROLE_ID',
        targetName: '@Simulated Deleted Role',
        targetType: 'role',
        reason: 'Simulated role delete attack test.',
        actionTaken:
          'No role was deleted. Role delete anti-nuke logging was safely tested.',
        metadata: {
          testType: 'role_delete_attack',
          fakeRoleId: 'SIMULATED_ROLE_ID',
          fakeRoleName: 'Simulated Deleted Role',
        },
      });
    },
  },

  'webhook-abuse': {
    label: 'Webhook Abuse',
    emoji: '🪝',
    style: ButtonStyle.Danger,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: incidentType('WEBHOOK_ABUSE'),
        severity: severity('HIGH'),
        targetId: 'SIMULATED_WEBHOOK_ID',
        targetName: 'Simulated Malicious Webhook',
        targetType: 'webhook',
        reason: 'Simulated webhook abuse test.',
        actionTaken:
          'No webhook was created or deleted. Webhook abuse logging was safely tested.',
        metadata: {
          testType: 'webhook_abuse',
          fakeWebhookId: 'SIMULATED_WEBHOOK_ID',
          fakeWebhookName: 'Simulated Malicious Webhook',
        },
      });
    },
  },

  lockdown: {
    label: 'Lockdown',
    emoji: '🔒',
    style: ButtonStyle.Primary,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: incidentType('LOCKDOWN_TRIGGERED'),
        severity: severity('CRITICAL'),
        targetType: 'guild',
        reason: 'Simulated lockdown trigger test.',
        actionTaken:
          'No lockdown was enabled. Lockdown trigger logging was safely tested.',
        metadata: {
          testType: 'lockdown_trigger',
          lockdownEnabled: false,
        },
      });
    },
  },

  quarantine: {
    label: 'Quarantine',
    emoji: '🚫',
    style: ButtonStyle.Primary,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: incidentType('USER_QUARANTINED'),
        severity: severity('HIGH'),
        targetId: 'SIMULATED_MEMBER_ID',
        targetName: 'Simulated Bad Actor',
        targetType: 'member',
        reason: 'Simulated quarantine flow test.',
        actionTaken:
          'No member was quarantined. Quarantine logging was safely tested.',
        metadata: {
          testType: 'quarantine_flow',
          fakeMemberId: 'SIMULATED_MEMBER_ID',
          fakeMemberTag: 'SimulatedBadActor#0000',
          quarantineApplied: false,
        },
      });
    },
  },

  'incident-log': {
    label: 'Incident Log',
    emoji: '🧾',
    style: ButtonStyle.Secondary,
    build(interaction) {
      return buildBaseIncident(interaction, {
        type: INCIDENT_TYPES.SUSPICIOUS_ADMIN_ACTION,
        severity: severity('MEDIUM'),
        reason: 'Manual owner incident logging test.',
        actionTaken:
          'Test incident sent to local logs and owner webhook mirror.',
        metadata: {
          testType: 'incident_log',
        },
      });
    },
  },

  'manual-backup': {
    label: 'Manual Backup',
    emoji: '💾',
    style: ButtonStyle.Success,

    async run(interaction) {
      const backup = await createServerBackup(interaction.guild, {
        type: 'runtime',
        createdBy: interaction.user.id,
        reason: `Manual security panel backup by ${interaction.user.tag}`,
      });

      return {
        success: true,
        message: [
          '',
          `Backup ID: \`${backup.backupId}\``,
          `Environment: \`${backup.environment}\``,
        ].join('\n'),
      };
    },
  },
};

function buildRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}channel-delete`)
        .setLabel(TESTS['channel-delete'].label)
        .setEmoji(TESTS['channel-delete'].emoji)
        .setStyle(TESTS['channel-delete'].style),

      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}role-delete`)
        .setLabel(TESTS['role-delete'].label)
        .setEmoji(TESTS['role-delete'].emoji)
        .setStyle(TESTS['role-delete'].style),

      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}webhook-abuse`)
        .setLabel(TESTS['webhook-abuse'].label)
        .setEmoji(TESTS['webhook-abuse'].emoji)
        .setStyle(TESTS['webhook-abuse'].style)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}lockdown`)
        .setLabel(TESTS.lockdown.label)
        .setEmoji(TESTS.lockdown.emoji)
        .setStyle(TESTS.lockdown.style),

      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}quarantine`)
        .setLabel(TESTS.quarantine.label)
        .setEmoji(TESTS.quarantine.emoji)
        .setStyle(TESTS.quarantine.style),

      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}incident-log`)
        .setLabel(TESTS['incident-log'].label)
        .setEmoji(TESTS['incident-log'].emoji)
        .setStyle(TESTS['incident-log'].style)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}full-run`)
        .setLabel('Run Full Safe Test')
        .setEmoji('🧪')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}manual-backup`)
        .setLabel(TESTS['manual-backup'].label)
        .setEmoji(TESTS['manual-backup'].emoji)
        .setStyle(TESTS['manual-backup'].style)
    ),
  ];
}

async function runTest(interaction, testKey) {
  if (!interaction.guild) {
    return sendSafe(interaction, {
      content: '❌ This can only be used inside a server.',
    });
  }

  if (!isOwner(interaction)) {
    return sendSafe(interaction, {
      content: [
        '❌ Owner only. You cannot run Goliath security tests.',
        '',
        `Your ID: \`${interaction.user.id}\``,
        `OWNER_ID loaded: \`${getOwnerId() || 'none'}\``,
        `BOT_OWNER_ID loaded: \`${getBotOwnerId() || 'none'}\``,
      ].join('\n'),
    });
  }

  const testsToRun =
    testKey === 'full-run'
      ? Object.entries(TESTS).filter(([key]) => key !== 'manual-backup')
      : [[testKey, TESTS[testKey]]];

  const results = [];

  for (const [key, test] of testsToRun) {
    if (!test) {
      results.push(`❌ Unknown test: ${key}`);
      continue;
    }

    try {
      if (typeof test.run === 'function') {
        const result = await test.run(interaction);

        results.push(`✅ ${test.emoji} ${test.label}`);

        if (result?.message) {
          results.push(result.message);
        }
      } else {
        await logIncident(interaction.guild, test.build(interaction));
        results.push(`✅ ${test.emoji} ${test.label}`);
      }
    } catch (error) {
      console.error(`[securitytest] Failed test: ${key}`, error);
      results.push(`❌ ${test.emoji} ${test.label}`);
      results.push(`\`${error.message}\``);
    }
  }

  return sendSafe(interaction, {
    content: [
      '🧪 **Goliath Security Test Complete**',
      '',
      ...results,
      '',
      'Safe mode: `true`',
      'Destructive actions: `none`',
    ].join('\n'),
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('securitytest')
    .setDescription('Owner-only safe test panel for Goliath security systems.'),

  async execute(interaction) {
    const deferred = await deferSafe(interaction);

    if (!deferred) {
      return;
    }

    try {
      if (!interaction.guild) {
        return sendSafe(interaction, {
          content: '❌ This command can only be used inside a server.',
        });
      }

      if (!isOwner(interaction)) {
        return sendSafe(interaction, {
          content: [
            '❌ Owner only. You cannot open Goliath security tests.',
            '',
            `Your ID: \`${interaction.user.id}\``,
            `OWNER_ID loaded: \`${getOwnerId() || 'none'}\``,
            `BOT_OWNER_ID loaded: \`${getBotOwnerId() || 'none'}\``,
          ].join('\n'),
        });
      }

      return sendSafe(interaction, {
        content: [
          '🧪 **Goliath Security Test Panel**',
          '',
          'Choose a safe simulated test below.',
          '',
          'No channels will be deleted.',
          'No roles will be deleted.',
          'No webhooks will be created or deleted.',
          'No members will be quarantined.',
          'No lockdown will actually be enabled.',
          '',
          'Manual Backup creates a real runtime backup.',
        ].join('\n'),
        components: buildRows(),
      });
    } catch (error) {
      console.error('[securitytest] Execute error:', error);

      return sendSafe(interaction, {
        content: '❌ Security test failed. Check the console for details.',
      });
    }
  },

  async handleButton(interaction) {
    if (!interaction.customId?.startsWith(BUTTON_PREFIX)) return false;

    const deferred = await deferSafe(interaction);

    if (!deferred) {
      return true;
    }

    try {
      const testKey = interaction.customId.replace(BUTTON_PREFIX, '');

      await runTest(interaction, testKey);

      return true;
    } catch (error) {
      console.error('[securitytest] Button error:', error);

      await sendSafe(interaction, {
        content: '❌ Security test button failed. Check the console for details.',
      });

      return true;
    }
  },

  getOwnerIds,
  getOwnerId,
  getBotOwnerId,
};