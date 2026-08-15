'use strict';

const panel = require('./embedPreviewCompat');
const media = require('./embedMedia');

module.exports = media.installStorageNormalization(panel);
