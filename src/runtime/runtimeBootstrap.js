const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!dirPath) {
    throw new Error(
      'ensureDir received invalid path'
    );
  }

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {
      recursive: true,
    });
  }

  return dirPath;
}

function getModeKey(mode) {
  const value = String(
    mode || 'DEV'
  ).toUpperCase();

  if (value === 'PRODUCTION') {
    return 'production';
  }

  if (value === 'BETA') {
    return 'beta';
  }

  return 'dev';
}

function bootstrapRuntime(mode = 'DEV') {
  const modeKey = getModeKey(mode);

  const modeRoot = path.join(
    process.cwd(),
    'src',
    'runtime',
    modeKey
  );

  const paths = {
    root: modeRoot,

    backups: path.join(
      modeRoot,
      'backups'
    ),

    database: path.join(
      modeRoot,
      'database'
    ),

    data: path.join(
      modeRoot,
      'data'
    ),

    restoreRequests: path.join(
      modeRoot,
      'data',
      'restoreRequests'
    ),

    backupSync: path.join(
      modeRoot,
      'data',
      'backupSync'
    ),
  };

  const requiredDirectories = [
    paths.root,
    paths.backups,
    paths.database,
    paths.data,
    paths.restoreRequests,
    paths.backupSync,
  ];

  for (const dir of requiredDirectories) {
    ensureDir(dir);
  }

  console.log(
    `✅ Runtime folders ready: ${modeRoot}`
  );

  return {
    mode: modeKey,
    root: paths.root,
    ...paths,
  };
}

module.exports = {
  bootstrapRuntime,
};