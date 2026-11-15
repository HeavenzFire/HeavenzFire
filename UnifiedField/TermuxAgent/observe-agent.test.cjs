'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runObservationCommand, SYSTEM_PROMPT } = require('./agent.cjs');

test('agent routes explicit search command to the observation adapter', async () => {
  let query;
  const result = await runObservationCommand(':search quantum computing', {
    searchWeb: async value => { query = value; return { evidence_type: 'search-result-list', results: [] }; }
  });
  assert.equal(query, 'quantum computing');
  assert.equal(result.evidence_type, 'search-result-list');
});

test('agent routes page command to the observation adapter', async () => {
  let url;
  const result = await runObservationCommand(':page https://example.com', {
    observePage: async value => { url = value; return { evidence_type: 'retrieved-html-text' }; }
  });
  assert.equal(url, 'https://example.com');
  assert.equal(result.evidence_type, 'retrieved-html-text');
});

test('agent routes YouTube URL and caption option', async () => {
  let args;
  const result = await runObservationCommand(':youtube https://youtu.be/abc --captions', {
    observeYouTube: async (...values) => { args = values; return { evidence_type: 'youtube-metadata-and-captions' }; }
  });
  assert.deepEqual(args, ['https://youtu.be/abc', { captions: true }]);
  assert.match(SYSTEM_PROMPT, /A transcript is not visual inspection/);
});

test('unknown observation command is not silently treated as a tool call', async () => {
  assert.equal(await runObservationCommand(':shell rm -rf /'), null);
});
