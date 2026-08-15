// functions/embed/embedValidation.js

const MAX_BUTTONS = 20;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_COMPONENT_ROWS = 5;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);

function toCleanString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function isHttpUrl(value) {
  const text = toCleanString(value);
  if (!text) return false;

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isVariableUrl(value) {
  const text = toCleanString(value);
  return /^\{[a-zA-Z0-9]+\}$/.test(text);
}

function isUsableUrl(value) {
  return isHttpUrl(value) || isVariableUrl(value);
}

function normaliseButtonStyle(style) {
  const value = toCleanString(style).toLowerCase();

  if (value === 'secondary') return 'Secondary';
  if (value === 'success') return 'Success';
  if (value === 'danger') return 'Danger';
  if (value === 'link') return 'Link';

  return 'Primary';
}

function getButtonValidationErrors(buttons = []) {
  const errors = [];
  const safeButtons = Array.isArray(buttons) ? buttons : [];

  if (safeButtons.length > MAX_BUTTONS) {
    errors.push(`You can only add up to ${MAX_BUTTONS} buttons.`);
  }

  const requiredRows = Math.ceil(safeButtons.length / MAX_BUTTONS_PER_ROW);

  if (requiredRows > MAX_COMPONENT_ROWS) {
    errors.push(`Discord only supports ${MAX_COMPONENT_ROWS} button rows.`);
  }

  safeButtons.forEach((button, index) => {
    const number = index + 1;
    const label = toCleanString(button?.label);
    const style = normaliseButtonStyle(button?.style);
    const url = toCleanString(button?.url);

    if (!label) {
      errors.push(`Button ${number} is missing a label.`);
    }

    if (style === 'Link' || url) {
      if (!url) {
        errors.push(`Button ${number} is a Link button but has no URL.`);
      } else if (!isUsableUrl(url)) {
        errors.push(`Button ${number} has an invalid URL.`);
      }
    }
  });

  return errors;
}

function getUrlValidationErrors(state = {}) {
  const errors = [];

  const urlFields = [
    ['Author icon', state.authorIcon],
    ['Author URL', state.authorUrl],
    ['Footer icon', state.footerIcon],
    ['Thumbnail', state.thumbnail],
    ['Image', state.image],
  ];

  urlFields.forEach(([label, value]) => {
    const text = toCleanString(value);
    if (!text) return;

    if (!isUsableUrl(text)) {
      errors.push(`${label} must be a valid http(s) URL or supported variable.`);
    }
  });

  return errors;
}

function sourceExtension(source = '') {
  try {
    const clean = String(source).split('?')[0].split('#')[0];
    const name = clean.split('/').pop() || '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}

function isVariableSource(source = '') {
  return /\{\{[^{}]+\}\}|\$\{[^{}]+\}/.test(String(source).trim());
}

function detectKind(source = '', declaredType = 'auto') {
  const declared = String(declaredType || 'auto').toLowerCase();
  if (declared === 'image' || declared === 'video') return declared;
  const ext = sourceExtension(source);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return ext ? 'file' : 'auto';
}

function validateSource(source = '', options = {}) {
  const value = String(source || '').trim();
  const kind = detectKind(value, options.type);
  if (!value) return { status: 'missing', valid: false, kind, message: 'No source set' };
  if (isVariableSource(value)) return { status: 'dynamic', valid: true, kind, message: 'Variable source — resolved when sent' };
  if (value.startsWith('attachment://')) return { status: 'ready', valid: true, kind, message: 'Cached attachment source' };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { status: 'invalid', valid: false, kind, message: 'Source is not a valid URL or variable' };
  }

  if (url.protocol === 'https:') return { status: 'ready', valid: true, kind, message: kind === 'auto' ? 'HTTPS source — media type detected when sent' : `HTTPS ${kind} source` };
  if (url.protocol === 'http:') return { status: 'warning', valid: true, kind, message: 'HTTP source — HTTPS is recommended' };
  return { status: 'invalid', valid: false, kind, message: `Unsupported ${url.protocol} source` };
}

function validatePanelMedia(media = {}) {
  const thumbnail = validateSource(media?.thumbnail?.source || '', { type: 'image' });
  const gallery = (media?.gallery || []).map((item, index) => ({ index, item, ...validateSource(item?.source || '', { type: item?.type || 'auto' }) }));
  const files = (media?.files || []).map((item, index) => ({ index, item, ...validateSource(item?.source || '') }));
  const all = [...gallery, ...files, ...(media?.thumbnail?.source ? [thumbnail] : [])];
  return {
    thumbnail,
    gallery,
    files,
    ready: all.filter((entry) => entry.valid).length,
    warnings: all.filter((entry) => entry.status === 'warning').length,
    invalid: all.filter((entry) => !entry.valid).length,
  };
}

function statusIcon(status) {
  if (status === 'ready') return '✅';
  if (status === 'dynamic') return '🔄';
  if (status === 'warning') return '⚠️';
  if (status === 'invalid') return '❌';
  return '➖';
}

function validateEmbedState(state = {}) {
  return [
    ...getButtonValidationErrors(state.buttons),
    ...getUrlValidationErrors(state),
  ];
}

function formatValidationErrors(errors = []) {
  if (!errors.length) return '';

  return [
    '⚠️ Embed Studio validation failed:',
    '',
    ...errors.slice(0, 10).map((error) => `• ${error}`),
    errors.length > 10 ? `• And ${errors.length - 10} more issue(s).` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  MAX_BUTTONS,
  MAX_BUTTONS_PER_ROW,
  MAX_COMPONENT_ROWS,
  toCleanString,
  isHttpUrl,
  isVariableUrl,
  isUsableUrl,
  normaliseButtonStyle,
  getButtonValidationErrors,
  getUrlValidationErrors,
  sourceExtension,
  isVariableSource,
  detectKind,
  validateSource,
  validatePanelMedia,
  statusIcon,
  validateEmbedState,
  formatValidationErrors,
};
