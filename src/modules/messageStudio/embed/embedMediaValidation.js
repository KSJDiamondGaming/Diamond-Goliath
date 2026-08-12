'use strict';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);

function sourceExtension(source = '') {
  try { const clean = String(source).split('?')[0].split('#')[0]; const name = clean.split('/').pop() || ''; const dot = name.lastIndexOf('.'); return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''; } catch { return ''; }
}
function isVariableSource(source = '') { return /\{\{[^{}]+\}\}|\$\{[^{}]+\}/.test(String(source).trim()); }
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
  const value = String(source || '').trim(); const kind = detectKind(value, options.type);
  if (!value) return { status: 'missing', valid: false, kind, message: 'No source set' };
  if (isVariableSource(value)) return { status: 'dynamic', valid: true, kind, message: 'Variable source — resolved when sent' };
  if (value.startsWith('attachment://')) return { status: 'ready', valid: true, kind, message: 'Cached attachment source' };
  let url; try { url = new URL(value); } catch { return { status: 'invalid', valid: false, kind, message: 'Source is not a valid URL or variable' }; }
  if (url.protocol === 'https:') return { status: 'ready', valid: true, kind, message: kind === 'auto' ? 'HTTPS source — media type detected when sent' : `HTTPS ${kind} source` };
  if (url.protocol === 'http:') return { status: 'warning', valid: true, kind, message: 'HTTP source — HTTPS is recommended' };
  return { status: 'invalid', valid: false, kind, message: `Unsupported ${url.protocol} source` };
}
function validatePanelMedia(media = {}) {
  const thumbnail = validateSource(media?.thumbnail?.source || '', { type: 'image' });
  const gallery = (media?.gallery || []).map((item, index) => ({ index, item, ...validateSource(item?.source || '', { type: item?.type || 'auto' }) }));
  const files = (media?.files || []).map((item, index) => ({ index, item, ...validateSource(item?.source || '') }));
  const all = [...gallery, ...files, ...(media?.thumbnail?.source ? [thumbnail] : [])];
  return { thumbnail, gallery, files, ready: all.filter((entry) => entry.valid).length, warnings: all.filter((entry) => entry.status === 'warning').length, invalid: all.filter((entry) => !entry.valid).length };
}
function statusIcon(status) { if (status === 'ready') return '✅'; if (status === 'dynamic') return '🔄'; if (status === 'warning') return '⚠️'; if (status === 'invalid') return '❌'; return '➖'; }
module.exports = { sourceExtension, isVariableSource, detectKind, validateSource, validatePanelMedia, statusIcon };
