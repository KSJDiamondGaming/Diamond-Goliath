'use strict';

module.exports = function replacePlaceholders(text, placeholders = {}) {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  const entries = placeholders && typeof placeholders === 'object'
    ? Object.entries(placeholders)
    : [];

  for (const [key, value] of entries) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
};
