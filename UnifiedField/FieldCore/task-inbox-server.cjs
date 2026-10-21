'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const { validateTaskRecord } = require('./shared-task-contract.cjs');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 18796;
const MAX_BODY_BYTES = 65536;
const DEFAULT_INBOX_PATH = path.join(os.homedir(), '.heavenzfire', 'unified-field-inbox.jsonl');

function readExistingInbox(inboxPath) {
  const records = new Map();
  if (!fs.existsSync(inboxPath)) return records;
  const lines = fs.readFileSync(inboxPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('Invalid JSON in task inbox at line ' + (index + 1)); }
    if (event.type !== 'task_inbox_received' || !event.taskRecord) {
      throw new Error('Unexpected task inbox event at line ' + (index + 1));
    }
    validateTaskRecord(event.taskRecord);
    if (event.taskRecord.status !== 'proposed' || event.taskRecord.approvalState !== 'pending') {
      throw new Error('Persisted inbox task must remain proposed/pending');
    }
    const taskId = event.taskRecord.taskId;
    const prior = records.get(taskId);
    const current = JSON.stringify(event.taskRecord);
    if (prior && JSON.stringify(prior) !== current) throw new Error('Conflicting persisted task ID: ' + taskId);
    records.set(taskId, event.taskRecord);
  }
  return records;
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function createTaskInboxServer({ inboxPath = DEFAULT_INBOX_PATH, port = DEFAULT_PORT } = {}) {
  if (typeof inboxPath !== 'string' || !inboxPath.trim()) throw new TypeError('inboxPath must be a non-empty path');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('port must be an integer from 0 to 65535');
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  const records = readExistingInbox(inboxPath);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://' + HOST);
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {
          ok: true, service: 'heavenzfire-unified-field-task-inbox',
          host: HOST, port: server.address() ? server.address().port : port,
          storedTaskCount: records.size
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          return sendJson(res, 415, { ok: false, error: 'content_type_must_be_application_json' });
        }
        const body = await readJsonBody(req);
        const task = body.taskRecord;
        try { validateTaskRecord(task); }
        catch (error) { return sendJson(res, 400, { ok: false, error: 'invalid_task_record', detail: error.message }); }
        if (task.status !== 'proposed' || task.approvalState !== 'pending') {
          return sendJson(res, 422, { ok: false, error: 'task_must_be_proposed_pending' });
        }
        const prior = records.get(task.taskId);
        if (prior) {
          if (JSON.stringify(prior) !== JSON.stringify(task)) {
            return sendJson(res, 409, { ok: false, error: 'task_id_conflict', taskId: task.taskId });
          }
          return sendJson(res, 200, { ok: true, duplicate: true, taskId: task.taskId, status: 'proposed' });
        }
        const event = {
          timestamp: new Date().toISOString(),
          type: 'task_inbox_received',
          taskId: task.taskId,
          taskRecord: task
        };
        try {
          fs.appendFileSync(inboxPath, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: 'task_persistence_failed', detail: error.message });
        }
        records.set(task.taskId, task);
        return sendJson(res, 201, { ok: true, duplicate: false, taskId: task.taskId, status: 'proposed' });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
        const taskId = decodeURIComponent(url.pathname.slice('/api/tasks/'.length));
        const task = records.get(taskId);
        if (!task) return sendJson(res, 404, { ok: false, error: 'task_not_found' });
        return sendJson(res, 200, { ok: true, taskRecord: task, evidence: task.evidence });
      }
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return sendJson(res, error.status || 500, { ok: false, error: error.message || 'internal_error' });
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.HF_UNIFIED_FIELD_TASK_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('HF_UNIFIED_FIELD_TASK_PORT must be an integer from 1024 to 65535');
  }
  const inboxPath = process.env.HF_UNIFIED_FIELD_INBOX_FILE || DEFAULT_INBOX_PATH;
  const server = createTaskInboxServer({ inboxPath, port });
  server.listen(port, HOST, () => process.stdout.write('Unified Field task inbox listening on http://' + HOST + ':' + port + '\n'));
}

module.exports = { createTaskInboxServer, readExistingInbox, HOST, DEFAULT_PORT, DEFAULT_INBOX_PATH };
