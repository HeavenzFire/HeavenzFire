'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createPeerLinkHub } = require('./peerlink-hub.cjs');
const { createPeerLinkAgent } = require('./peerlink-agent.cjs');

async function main() {
  const mode = process.env.HF_PEERLINK_MODE || process.argv[2] || 'hub';
  if (mode === 'hub') {
    let tls = null;
    const keyPath = process.env.HF_PEERLINK_TLS_KEY;
    const certPath = process.env.HF_PEERLINK_TLS_CERT;
    if (keyPath || certPath) {
      if (!keyPath || !certPath) throw new Error('both HF_PEERLINK_TLS_KEY and HF_PEERLINK_TLS_CERT are required');
      tls = { key: fs.readFileSync(path.resolve(keyPath)), cert: fs.readFileSync(path.resolve(certPath)) };
    }
    const hub = createPeerLinkHub({ tls });
    const address = await hub.listen();
    process.stdout.write(JSON.stringify({
      event: 'peerlink_hub_ready', host: address.address, port: address.port,
      protocol_version: 1, journal: process.env.HF_PEERLINK_JOURNAL || 'state/peerlink-events.jsonl'
    }) + '\n');
    const stop = async () => { await hub.close(); process.exitCode = 0; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return;
  }
  if (mode === 'agent') {
    const agent = createPeerLinkAgent();
    const session = await agent.connect();
    process.stdout.write(JSON.stringify({ event: 'peerlink_agent_connected', ...session }) + '\n');
    await agent.run();
    return;
  }
  throw new Error('mode must be hub or agent');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ event: 'peerlink_start_failed', code: error.code || 'startup_error', message: error.message }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { main };
