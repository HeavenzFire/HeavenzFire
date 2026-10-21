'use strict';

// Local-only source inventory. Never uploads, modifies, transcodes, or deletes audio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wma']);
const MAX_FILES = 5000;
const MAX_DEPTH = 8;

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytes;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes > 0) hash.update(buffer.subarray(0, bytes));
    } while (bytes > 0);
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function wavMetadata(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    if (fs.readSync(fd, header, 0, 12, 0) !== 12 ||
        header.toString('ascii', 0, 4) !== 'RIFF' ||
        header.toString('ascii', 8, 12) !== 'WAVE') return null;
    let offset = 12, format = null, dataBytes = null;
    const chunkHeader = Buffer.alloc(8);
    const fileSize = fs.fstatSync(fd).size;
    while (offset + 8 <= fileSize) {
      if (fs.readSync(fd, chunkHeader, 0, 8, offset) !== 8) break;
      const id = chunkHeader.toString('ascii', 0, 4);
      const size = chunkHeader.readUInt32LE(4);
      if (id === 'fmt ' && size >= 16 && size <= 4096) {
        const chunk = Buffer.alloc(size);
        if (fs.readSync(fd, chunk, 0, size, offset + 8) !== size) break;
        const codecId = chunk.readUInt16LE(0);
        format = { codec: codecId === 1 ? 'pcm' : codecId === 3 ? 'ieee-float' : 'wav-codec-' + codecId,
          channels: chunk.readUInt16LE(2), sampleRate: chunk.readUInt32LE(4), bitsPerSample: chunk.readUInt16LE(14) };
      } else if (id === 'data') dataBytes = size;
      offset += 8 + size + (size % 2);
      if (format && dataBytes !== null) break;
    }
    if (!format) return null;
    const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
    return { ...format, durationSeconds: bytesPerSecond > 0 && dataBytes !== null ? Number((dataBytes / bytesPerSecond).toFixed(3)) : null };
  } finally { fs.closeSync(fd); }
}

function walkAudio(root, current, depth, output) {
  if (depth > MAX_DEPTH || output.length >= MAX_FILES) return;
  let entries;
  try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (output.length >= MAX_FILES) break;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walkAudio(root, full, depth + 1, output);
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      try {
        const stat = fs.statSync(full);
        output.push({ relativePath: path.relative(root, full).split(path.sep).join('/'),
          extension: path.extname(entry.name).toLowerCase(), sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(),
          sha256: sha256File(full), wav: path.extname(entry.name).toLowerCase() === '.wav' ? wavMetadata(full) : null });
      } catch (error) { output.push({ relativePath: path.relative(root, full).split(path.sep).join('/'), error: String(error.message || error) }); }
    }
  }
}

function indexSources(root) {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error('Source directory does not exist: ' + resolved);
  const files = [];
  walkAudio(resolved, resolved, 0, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { schema: 'heavenzfire.voice-source-catalog.v1', generatedAt: new Date().toISOString(),
    sourceDirectory: resolved, policy: 'local-only; read-only; no uploads; no source modifications',
    fileCount: files.length, totalBytes: files.reduce((sum, item) => sum + (item.sizeBytes || 0), 0), files };
}

if (require.main === module) {
  const root = process.argv[2] || path.join(__dirname, 'sources');
  const outputPath = process.argv[3] || path.join(__dirname, 'voice-source-catalog.json');
  try {
    const catalog = indexSources(root);
    fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + '\n', { flag: 'w' });
    process.stdout.write(JSON.stringify({ ok: true, fileCount: catalog.fileCount, totalBytes: catalog.totalBytes,
      outputPath: path.resolve(outputPath), policy: catalog.policy }) + '\n');
  } catch (error) { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; }
}

module.exports = { AUDIO_EXTENSIONS, indexSources, wavMetadata };
