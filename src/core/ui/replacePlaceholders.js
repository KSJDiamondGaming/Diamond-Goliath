'use strict';

module.exports = function replacePlaceholders(text, placeholders = {}) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
};
