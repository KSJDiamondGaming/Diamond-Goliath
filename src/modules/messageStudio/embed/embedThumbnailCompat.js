'use strict';

const panel = require('./embedPanel');
const media = require('./embedMedia');

module.exports = media.installThumbnailUi(panel);
