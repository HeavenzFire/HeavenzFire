'use strict';
const http = require('node:http');
const path = require('node:path');
const { indexSources } = require('./index-voice-sources.cjs');

const HOST = '127.0.0.1';
const PORT = Number(process.env.HEAVENZFIRE_VOICE_PORT || 8793);
const SOURCES = path.join(__dirname, 'sources');
const MAX_TEXT_BYTES = 1024;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Read-only service; GET only' });
    if (req.url === '/health') return send(res, 200, {
      ok: true, service: 'heavenzfire-voice-source-intake', host: HOST, port: PORT,
      synthesis: 'not_configured', sourcePolicy: 'local_only_read_only'
    });
    if (req.url === '/api/voice/status') return send(res, 200, {
      ok: true, service: 'heavenzfire-voice-source-intake',
      synthesis: { state: 'not_configured', identityModel: false },
      catalog: { sourceDirectory: SOURCES, state: 'available_for_inventory' },
      integrations: { digitalBrain: 'not_connected', avatarBody: 'not_connected' }
    });
    if (req.url === '/api/voice/catalog') {
      try {
        const catalog = indexSources(SOURCES);
        return send(res, 200, {
          ok: true, schema: catalog.schema, generatedAt: catalog.generatedAt,
          fileCount: catalog.fileCount, totalBytes: catalog.totalBytes,
          files: catalog.files.map(file => ({
            relativePath: file.relativePath, extension: file.extension, sizeBytes: file.sizeBytes,
            sha256: file.sha256, wav: file.wav, error: file.error
          }))
        });
      } catch (error) { return send(res, 500, { ok: false, error: String(error.message || error) }); }
    }
    return send(res, 404, { ok: false, error: 'Not found' });
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => process.stdout.write('HeavenzFire voice source intake listening on http://' + HOST + ':' + PORT + '\n'));
}
module.exports = { createServer };
