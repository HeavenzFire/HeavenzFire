'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Digital Brain inline JavaScript parses as executable JavaScript', () => {
  const html = read('HeavenzFire-DigitalBrain.html');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'Digital Brain page must include its runtime script');
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script[1]));
});

test('camera uses the same-origin Digital Brain proxy rather than a cross-origin frame request', () => {
  const html = read('HeavenzFire-DigitalBrain.html');
  assert.match(html, /getUserMedia/);
  assert.match(html, /fetch\('\/api\/vision\/analyze'/);
  assert.doesNotMatch(html, /fetch\('http:\/\/127\.0\.0\.1:11802\/analyze'/);
  assert.match(html, /NotFoundError/);
  assert.match(html, /NotAllowedError/);
});

test('Digital Brain exposes bounded loopback-only vision proxy endpoints', () => {
  const server = read('HeavenzFire-DigitalBrain-Server.cjs');
  assert.match(server, /\/api\/vision\/health/);
  assert.match(server, /\/api\/vision\/analyze/);
  assert.match(server, /127\.0\.0\.1:11802\/analyze/);
  assert.match(server, /bytes>262144/);
  assert.match(server, /Content-Type must be image\/jpeg/);
});

test('Unified Field dashboard embeds the Digital Brain and surfaces perception health', () => {
  const html = read('UnifiedField-Dashboard.html');
  const server = read('UnifiedField-Dashboard-Server.cjs');
  assert.match(html, /id="avatarFrame"/);
  assert.match(html, /http:\/\/127\.0\.0\.1:8797\//);
  assert.match(html, /avatarVisionState/);
  assert.match(server, /\/api\/avatar\/vision-health/);
});

test('avatar speech output follows assistant replies and scales the canvas for device pixel ratio', () => {
  const html = read('HeavenzFire-DigitalBrain.html');
  assert.match(html, /avatar\.voice&&'speechSynthesis'in window/);
  assert.match(html, /speechSynthesis\.speak\(new SpeechSynthesisUtterance\(text\)\)/);
  assert.match(html, /devicePixelRatio/);
});
