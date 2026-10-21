'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { indexSources, wavMetadata } = require('./index-voice-sources.cjs');

function makeWav(filePath) {
  const sampleRate = 16000, channels = 1, bits = 16, dataSize = 3200;
  const b = Buffer.alloc(44 + dataSize);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataSize, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22); b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * channels * bits / 8, 28);
  b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(filePath, b);
}

test('catalog indexes supported audio, hashes content, and extracts WAV format', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-voice-'));
  try {
    makeWav(path.join(root, 'voice.wav'));
    fs.writeFileSync(path.join(root, 'ignore.txt'), 'not audio');
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'nested', 'track.mp3'), Buffer.from([1, 2, 3]));
    const catalog = indexSources(root);
    assert.equal(catalog.fileCount, 2);
    assert.equal(catalog.files[0].relativePath, 'nested/track.mp3');
    assert.match(catalog.files[0].sha256, /^[a-f0-9]{64}$/);
    const wav = catalog.files.find(x => x.extension === '.wav');
    assert.equal(wav.wav.sampleRate, 16000);
    assert.equal(wav.wav.channels, 1);
    assert.equal(wav.wav.durationSeconds, 0.1);
    assert.match(catalog.policy, /no uploads/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('catalog rejects missing source directory', () => {
  assert.throws(() => indexSources(path.join(os.tmpdir(), 'no-such-heavenzfire-voice-dir')), /does not exist/);
});

test('WAV parser returns null for a non-WAV file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-wav-'));
  const file = path.join(root, 'bad.wav');
  try { fs.writeFileSync(file, 'not a wav'); assert.equal(wavMetadata(file), null); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
