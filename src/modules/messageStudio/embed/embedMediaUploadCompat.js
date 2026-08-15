'use strict';

const panel = require('./embedPreviewCompat');
const media = require('./embedMedia');

media.installStorageNormalization(panel);
media.installUploadModals(panel);
media.installMediaOptionsUi(panel);
media.installMediaManagerUi(panel);

module.exports = panel;
