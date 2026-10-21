'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArtifact(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function latestWorkerResults(directory, minMtime = 0) {
  let files;
  try {
    files = fs.readdirSync(directory)
      .filter(name => name.toLowerCase().startsWith('worker-smoke-') && name.toLowerCase().endsWith('.json'))
      .map(name => ({ name, mtime: fs.statSync(path.join(directory, name)).mtimeMs }))
      .filter(item => item.mtime >= minMtime)
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return null;
  }
  if (!files.length) return null;

  const newestByModel = new Map();
  for (const file of files) {
    const parsed = parseArtifact(path.join(directory, file.name));
    const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    for (const row of rows) {
      if (!row || typeof row.model !== 'string' || !row.model.trim() || newestByModel.has(row.model)) continue;
      newestByModel.set(row.model, { ...row, artifact_file: file.name });
    }
  }
  return {
    file: files[0].name,
    results: [...newestByModel.values()],
    artifacts_seen: files.length
  };
}

module.exports = { latestWorkerResults };