'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const verificationStore = require('../src/modules/verification/verificationStore');
const verificationManager = require('../src/modules/verification/verificationManager');

const VALID_ROLE_ID = '123456789012345678';
const VALID_CHANNEL_ID = '223456789012345678';
const VALID_MESSAGE_ID = '323456789012345678';

test('verification defaults are complete and safe', () => {
  const section = verificationStore.defaultVerificationSection();

  assert.equal(section.enabled, false);
  assert.equal(section.settings.dmOnVerify, true);
  assert.equal(section.settings.removePendingRole, true);
  assert.equal(section.settings.verifiedRoleId, null);
  assert.equal(section.panelTemplate.buttonStyle, 'success');
  assert.equal(section.analytics.verified, 0);
  assert.deepEqual(section.panels, {});
});

test('panel template normalization validates values', () => {
  const normalized = verificationStore.normalizePanelTemplate({
    title: '  Custom Verification  ',
    description: '  Verify here  ',
    color: 'invalid-colour',
    buttonLabel: '  Continue  ',
    buttonStyle: 'unknown',
    imageUrl: 'javascript:alert(1)',
    thumbnailUrl: 'https://example.com/thumb.png',
  });

  assert.equal(normalized.title, 'Custom Verification');
  assert.equal(normalized.description, 'Verify here');
  assert.equal(normalized.color, '#57f287');
  assert.equal(normalized.buttonLabel, 'Continue');
  assert.equal(normalized.buttonStyle, 'success');
  assert.equal(normalized.imageUrl, null);
  assert.equal(normalized.thumbnailUrl, 'https://example.com/thumb.png');
});

test('verification section normalization removes invalid Discord IDs', () => {
  const normalized = verificationStore.normalizeVerificationSection({
    enabled: true,
    settings: {
      verifiedRoleId: VALID_ROLE_ID,
      unverifiedRoleId: 'not-an-id',
      logChannelId: VALID_CHANNEL_ID,
      dmOnVerify: false,
      removePendingRole: false,
    },
  });

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.settings.verifiedRoleId, VALID_ROLE_ID);
  assert.equal(normalized.settings.unverifiedRoleId, null);
  assert.equal(normalized.settings.logChannelId, VALID_CHANNEL_ID);
  assert.equal(normalized.settings.dmOnVerify, false);
  assert.equal(normalized.settings.removePendingRole, false);
});

test('verification custom IDs round trip safely', () => {
  const customId = verificationManager.buildVerifyCustomId('verify_panel_1');

  assert.equal(customId, 'verify:button:verify_panel_1');
  assert.deepEqual(verificationManager.parseVerifyCustomId(customId), { panelId: 'verify_panel_1' });
  assert.equal(verificationManager.parseVerifyCustomId('wrong:button:id'), null);
  assert.equal(verificationManager.parseVerifyCustomId('verify:button'), null);
});

test('verification embed and button use saved design', () => {
  const panel = {
    panelId: 'verify_panel_1',
    title: 'Welcome',
    description: 'Press verify to continue.',
    color: '#5865f2',
    footer: 'Example Guild',
    buttonLabel: 'Continue',
    buttonEmoji: '✅',
    buttonStyle: 'primary',
  };

  const embed = verificationManager.buildVerificationEmbed(panel).toJSON();
  const rows = verificationManager.buildVerificationRows(panel).map((item) => item.toJSON());

  assert.equal(embed.title, 'Welcome');
  assert.equal(embed.description, 'Press verify to continue.');
  assert.equal(embed.footer.text, 'Example Guild');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].components[0].custom_id, 'verify:button:verify_panel_1');
  assert.equal(rows[0].components[0].label, 'Continue');
  assert.equal(rows[0].components[0].style, 1);
});

test('normalized saved panels preserve deployment metadata', () => {
  const section = verificationStore.normalizeVerificationSection({
    panels: {
      panel_one: {
        panelId: 'panel_one',
        channelId: VALID_CHANNEL_ID,
        messageId: VALID_MESSAGE_ID,
        title: 'Verify',
        buttonStyle: 'danger',
      },
    },
  });

  assert.equal(section.panels.panel_one.channelId, VALID_CHANNEL_ID);
  assert.equal(section.panels.panel_one.messageId, VALID_MESSAGE_ID);
  assert.equal(section.panels.panel_one.title, 'Verify');
  assert.equal(section.panels.panel_one.buttonStyle, 'danger');
});
