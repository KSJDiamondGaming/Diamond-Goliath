const fs = require('fs');
const path = require('path');

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function read(filePath, fallback = {}) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return clone(fallback);
    }

    if (!fs.existsSync(filePath)) {
      return clone(fallback);
    }

    const raw = fs.readFileSync(filePath, 'utf8');

    if (!raw || !raw.trim()) {
      return clone(fallback);
    }

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object'
      ? parsed
      : clone(fallback);
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`, error);
    return clone(fallback);
  }
}

function write(filePath, data) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    const dir = path.dirname(filePath);

    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${filePath}.tmp`;

    fs.writeFileSync(
      tempPath,
      JSON.stringify(data ?? {}, null, 2),
      'utf8'
    );

    fs.renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    console.error(`Failed to write file: ${filePath}`, error);
    return false;
  }
}

module.exports = {
  read,
  write,
};