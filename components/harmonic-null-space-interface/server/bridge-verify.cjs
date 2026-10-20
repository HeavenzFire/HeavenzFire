const assert = require('node:assert/strict');
(async () => {
  const health = await fetch('http://127.0.0.1:8082/health');
  assert.equal(health.status, 200);
  const h = await health.json();
  assert.equal(h.status, 'ONLINE');
  const ws = new WebSocket('ws://127.0.0.1:8082/');
  const messages = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket test timed out')), 4000);
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      messages.push(msg);
      if (msg.type === 'HELLO') {
        ws.send(JSON.stringify({type:'HNSI_UPDATE',targetRms:0.7071,residualRms:0.0291,attenuationDb:27.72}));
      } else if (msg.type === 'HNSI_STATE') {
        try {
          assert.equal(msg.node, 'Trip Archalien');
          assert.equal(msg.scope, 'SIMULATION_ONLY');
          assert.ok(Math.abs(msg.syntropyScore - (1 - 0.0291/0.7071)) < 0.00001);
          ws.send(JSON.stringify({type:'HNSI_UPDATE',targetRms:-1,residualRms:0.1,attenuationDb:2}));
        } catch (e) { clearTimeout(timer); reject(e); }
      } else if (msg.type === 'ERROR') {
        try { assert.equal(msg.code,'invalid_metrics'); clearTimeout(timer); ws.close(); resolve(); }
        catch(e) { clearTimeout(timer); reject(e); }
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')); };
  });
  console.log(JSON.stringify({health:h, messages, result:'PASS: health, WebSocket handshake, valid metrics, score calculation, invalid metrics rejection'},null,2));
})().catch(e=>{console.error(e);process.exit(1);});

[executed on device: ZDH (77b98796-cf81-45a3-96ca-7c08c8e2b595)]