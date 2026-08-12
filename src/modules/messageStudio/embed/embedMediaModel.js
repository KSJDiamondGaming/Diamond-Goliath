'use strict';

const MEDIA_SCHEMA_VERSION = 2;
const MAX_GALLERY_ITEMS = 10;
const MAX_FILES = 10;

function clone(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function cleanString(value, maxLength = 2048) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanSource(value) {
  return cleanString(value, 2048);
}

function normalizeThumbnail(value = {}, legacySource = '') {
  const source = typeof value === 'string'
    ? value
    : value?.source || value?.url || value?.attachment || legacySource;
  return {
    source: cleanSource(source),
    alt: cleanString(value?.alt || value?.description || '', 1024),
  };
}

function normalizeGalleryItem(value = {}) {
  const source = typeof value === 'string'
    ? value
    : value?.source || value?.url || value?.attachment || '';
  return {
    source: cleanSource(source),
    alt: cleanString(value?.alt || value?.description || '', 1024),
    spoiler: value?.spoiler === true,
    type: ['auto', 'image', 'video'].includes(String(value?.type || '').toLowerCase())
      ? String(value.type).toLowerCase()
      : 'auto',
  };
}

function normalizeFile(value = {}) {
  const source = typeof value === 'string'
    ? value
    : value?.source || value?.url || value?.attachment || '';
  return {
    source: cleanSource(source),
    name: cleanString(value?.name || '', 256),
    description: cleanString(value?.description || value?.alt || '', 1024),
    spoiler: value?.spoiler === true,
  };
}

function normalizePanelMedia(value = {}, legacyPanel = {}) {
  const galleryInput = Array.isArray(value?.gallery) ? value.gallery : [];
  const gallery = galleryInput
    .map(normalizeGalleryItem)
    .filter((item) => item.source)
    .slice(0, MAX_GALLERY_ITEMS);

  const legacyImage = cleanSource(legacyPanel?.image || legacyPanel?.imageURL || '');
  if (!gallery.length && legacyImage) {
    gallery.push(normalizeGalleryItem({ source: legacyImage, type: 'auto' }));
  }

  const files = (Array.isArray(value?.files) ? value.files : [])
    .map(normalizeFile)
    .filter((item) => item.source)
    .slice(0, MAX_FILES);

  return {
    thumbnail: normalizeThumbnail(value?.thumbnail || {}, legacyPanel?.thumbnail || legacyPanel?.thumbnailURL || ''),
    gallery,
    files,
  };
}

function normalizeMediaV2(value = {}, panels = []) {
  const panelList = Array.isArray(panels) ? panels : [];
  const inputPanels = Array.isArray(value?.panels) ? value.panels : [];
  const length = Math.max(panelList.length, inputPanels.length, 1);
  const normalizedPanels = [];

  for (let index = 0; index < length; index += 1) {
    normalizedPanels.push(normalizePanelMedia(inputPanels[index] || {}, panelList[index] || {}));
  }

  return {
    version: MEDIA_SCHEMA_VERSION,
    panels: normalizedPanels,
  };
}

function ensureStateMedia(state = {}) {
  const panels = Array.isArray(state?.panels) ? state.panels : [];
  return {
    ...state,
    mediaV2: normalizeMediaV2(state?.mediaV2 || {}, panels),
  };
}

function syncLegacyPatch(state = {}, patch = {}) {
  const safe = ensureStateMedia(state);
  const index = Math.max(0, Math.min(Number(safe.selectedPanelIndex) || 0, safe.mediaV2.panels.length - 1));
  const panelMedia = clone(safe.mediaV2.panels[index], normalizePanelMedia());

  if (Object.prototype.hasOwnProperty.call(patch, 'thumbnail')) {
    panelMedia.thumbnail = normalizeThumbnail({ source: patch.thumbnail });
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'image')) {
    const source = cleanSource(patch.image);
    if (source) {
      if (panelMedia.gallery.length) panelMedia.gallery[0] = { ...panelMedia.gallery[0], source };
      else panelMedia.gallery.push(normalizeGalleryItem({ source }));
    } else if (panelMedia.gallery.length <= 1) {
      panelMedia.gallery = [];
    } else {
      panelMedia.gallery[0] = { ...panelMedia.gallery[0], source: '' };
      panelMedia.gallery = panelMedia.gallery.filter((item) => item.source);
    }
  }

  const mediaPanels = safe.mediaV2.panels.map((entry, n) => n === index ? normalizePanelMedia(panelMedia) : entry);
  return {
    ...safe,
    mediaV2: {
      version: MEDIA_SCHEMA_VERSION,
      panels: mediaPanels,
    },
  };
}

function mediaForPanel(state = {}, index = null) {
  const safe = ensureStateMedia(state);
  const selected = index == null ? Number(safe.selectedPanelIndex) || 0 : Number(index) || 0;
  return clone(safe.mediaV2.panels[Math.max(0, Math.min(selected, safe.mediaV2.panels.length - 1))], normalizePanelMedia());
}

function setPanelMedia(state = {}, index, media = {}) {
  const safe = ensureStateMedia(state);
  const selected = Math.max(0, Math.min(Number(index) || 0, safe.mediaV2.panels.length - 1));
  const nextPanels = safe.mediaV2.panels.map((entry, n) => n === selected ? normalizePanelMedia(media, safe.panels?.[n] || {}) : entry);
  return {
    ...safe,
    mediaV2: {
      version: MEDIA_SCHEMA_VERSION,
      panels: nextPanels,
    },
  };
}

function addPanelMedia(state = {}, afterIndex = null, sourceMedia = null) {
  const safe = ensureStateMedia(state);
  const index = afterIndex == null ? safe.mediaV2.panels.length - 1 : Math.max(-1, Math.min(Number(afterIndex), safe.mediaV2.panels.length - 1));
  const nextPanels = [...safe.mediaV2.panels];
  nextPanels.splice(index + 1, 0, normalizePanelMedia(sourceMedia || {}));
  return { ...safe, mediaV2: { version: MEDIA_SCHEMA_VERSION, panels: nextPanels } };
}

function removePanelMedia(state = {}, index) {
  const safe = ensureStateMedia(state);
  const nextPanels = [...safe.mediaV2.panels];
  if (nextPanels.length > 1) nextPanels.splice(Math.max(0, Math.min(Number(index) || 0, nextPanels.length - 1)), 1);
  return { ...safe, mediaV2: { version: MEDIA_SCHEMA_VERSION, panels: nextPanels } };
}

function movePanelMedia(state = {}, from, to) {
  const safe = ensureStateMedia(state);
  const nextPanels = [...safe.mediaV2.panels];
  const a = Number(from);
  const b = Number(to);
  if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < nextPanels.length && b < nextPanels.length) {
    [nextPanels[a], nextPanels[b]] = [nextPanels[b], nextPanels[a]];
  }
  return { ...safe, mediaV2: { version: MEDIA_SCHEMA_VERSION, panels: nextPanels } };
}

module.exports = {
  MEDIA_SCHEMA_VERSION,
  MAX_GALLERY_ITEMS,
  MAX_FILES,
  normalizeThumbnail,
  normalizeGalleryItem,
  normalizeFile,
  normalizePanelMedia,
  normalizeMediaV2,
  ensureStateMedia,
  syncLegacyPatch,
  mediaForPanel,
  setPanelMedia,
  addPanelMedia,
  removePanelMedia,
  movePanelMedia,
};
