const fs = require('fs');
const path = require('path');

function clone(value) {
  try {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return false;

  fs.mkdirSync(dirPath, { recursive: true });
  return true;
}

function read(filePath, fallback = {}) {
  try {
    if (!filePath || typeof filePath !== 'string') return clone(fallback);
    if (!fs.existsSync(filePath)) return clone(fallback);

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return clone(fallback);

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : clone(fallback);
  } catch (error) {
    console.error(`[fileStore] Failed to read file: ${filePath}`, error);
    return clone(fallback);
  }
}

function write(filePath, data = {}) {
  try {
    if (!filePath || typeof filePath !== 'string') return false;

    ensureDir(path.dirname(filePath));

    const tempPath = `${filePath}.tmp`;
    const json = JSON.stringify(data ?? {}, null, 2);

    fs.writeFileSync(tempPath, json, 'utf8');

    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        fs.writeFileSync(filePath, json, 'utf8');

        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}

        return true;
      }

      throw error;
    }

    return true;
  } catch (error) {
    console.error(`[fileStore] Failed to write file: ${filePath}`, error);
    return false;
  }
}

function remove(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.error(`[fileStore] Failed to remove file: ${filePath}`, error);
    return false;
  }
}

function exists(filePath) {
  try {
    return Boolean(filePath && typeof filePath === 'string' && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

module.exports = {
  clone,
  ensureDir,
  read,
  write,
  remove,
  exists,
};