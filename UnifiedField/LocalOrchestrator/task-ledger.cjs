'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_RECORD_BYTES = 1024 * 1024;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error && error.code === 'EPERM'; }
}

function createTaskLedger({ filePath, lockTimeoutMs = 5000, staleLockMs = 30000 } = {}) {
  if (!filePath || typeof filePath !== 'string') throw new Error('ledger_file_path_required');
  const target = path.resolve(filePath);
  const directory = path.dirname(target);
  const lockPath = target + '.lock';
  fs.mkdirSync(directory, { recursive: true });

  function withLock(operation) {
    const started = Date.now();
    let lockFd;
    let token;
    while (lockFd === undefined) {
      token = crypto.randomUUID();
      try {
        lockFd = fs.openSync(lockPath, 'wx', 0o600);
        fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }));
        fs.fsyncSync(lockFd);
      } catch (error) {
        if (lockFd !== undefined) {
          try { fs.closeSync(lockFd); } catch {}
          lockFd = undefined;
        }
        if (!error || error.code !== 'EEXIST') throw error;
        try {
          const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          const age = Date.now() - Number(lock.createdAt || 0);
          if (age > staleLockMs && !processIsAlive(Number(lock.pid))) fs.unlinkSync(lockPath);
        } catch (readError) {
          if (readError && readError.code === 'ENOENT') continue;
          try {
            const stat = fs.statSync(lockPath);
            if (Date.now() - stat.mtimeMs > staleLockMs) fs.unlinkSync(lockPath);
          } catch {}
        }
        if (Date.now() - started >= lockTimeoutMs) throw new Error('ledger_lock_timeout');
        sleepSync(10);
      }
    }
    try { return operation(); }
    finally {
      try { fs.closeSync(lockFd); } catch {}
      try {
        const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (current.token === token) fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  function repairAndRead() {
    if (!fs.existsSync(target)) return [];
    const buffer = fs.readFileSync(target);
    if (buffer.length === 0) return [];
    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline !== buffer.length - 1) {
      const fd = fs.openSync(target, 'r+');
      try { fs.ftruncateSync(fd, lastNewline + 1); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    }
    const content = fs.readFileSync(target, 'utf8');
    const latest = new Map();
    for (const [index, line] of content.split('\n').entries()) {
      if (!line) continue;
      if (Buffer.byteLength(line) > MAX_RECORD_BYTES) throw new Error('ledger_record_too_large_at_line_' + (index + 1));
      let record;
      try { record = JSON.parse(line); }
      catch { throw new Error('ledger_corrupt_record_at_line_' + (index + 1)); }
      if (record.v !== 1 || !record.task || typeof record.task.id !== 'string' || !record.task.id) {
        throw new Error('ledger_invalid_record_at_line_' + (index + 1));
      }
      latest.set(record.task.id, record.task);
    }
    return Array.from(latest.values());
  }

  function load() {
    return withLock(() => repairAndRead());
  }

  function save(task) {
    if (!task || typeof task.id !== 'string' || !task.id) throw new Error('ledger_task_id_required');
    const line = JSON.stringify({ v: 1, task }) + '\n';
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) throw new Error('ledger_record_too_large');
    return withLock(() => {
      const fd = fs.openSync(target, 'a', 0o600);
      try {
        const buffer = Buffer.from(line, 'utf8');
        let offset = 0;
        while (offset < buffer.length) {
          offset += fs.writeSync(fd, buffer, offset, buffer.length - offset, null);
        }
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      return task;
    });
  }

  return Object.freeze({ load, save, filePath: target });
}

module.exports = { createTaskLedger };
