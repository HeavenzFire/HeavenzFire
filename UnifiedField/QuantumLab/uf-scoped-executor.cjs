'use strict';

// Scoped local task executor. No arbitrary shell strings, no network ingress, no admin actions.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 256 * 1024;

function createScopedExecutor(options = {}) {
  const root = path.resolve(options.workspaceRoot || process.cwd());
  function resolvePath(relativePath) {
    if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
      throw new Error('relative workspace path required');
    }
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('path escapes workspace root');
    return target;
  }
  function capabilities() {
    return {
      workspace_root_configured: Boolean(options.workspaceRoot || process.env.HEAVENZFIRE_WORKSPACE_ROOT),
      actions: ['workspace.read_file', 'workspace.write_file', 'git.status', 'node.test'],
      requires_approval: true,
      arbitrary_shell: false,
      admin_actions: false,
      max_file_bytes: MAX_FILE_BYTES
    };
  }
  async function execute(action, input) {
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input must be an object');
      if (action === 'workspace.read_file') {
        const target = resolvePath(input.path);
        const stat = fs.statSync(target);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('file missing, not regular, or exceeds 256 KiB');
        return { ok: true, path: input.path, content: fs.readFileSync(target, 'utf8') };
      }
      if (action === 'workspace.write_file') {
        const target = resolvePath(input.path);
        if (typeof input.content !== 'string' || Buffer.byteLength(input.content, 'utf8') > MAX_FILE_BYTES) throw new Error('content must be a string no larger than 256 KiB');
        if (input.overwrite !== true && fs.existsSync(target)) throw new Error('target exists; set overwrite=true for an approved replacement');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temp = target + '.hf-tmp-' + process.pid;
        try {
          fs.writeFileSync(temp, input.content, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(temp, target);
        } finally {
          try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
        }
        return { ok: true, path: input.path, bytes_written: Buffer.byteLength(input.content, 'utf8') };
      }
      if (action === 'git.status') {
        const cwd = resolvePath(input.path || '.');
        const result = await execFileAsync('git', ['status', '--short', '--branch'], { cwd, timeout: 5000, windowsHide: true, maxBuffer: 64 * 1024 });
        return { ok: true, cwd, stdout: result.stdout.slice(0, 16000), stderr: result.stderr.slice(0, 2000) };
      }
      if (action === 'node.test') {
        const testPath = resolvePath(input.path);
        if (!testPath.endsWith('.test.cjs') && !testPath.endsWith('.test.js')) throw new Error('only explicitly named .test.cjs or .test.js files may run');
        if (!fs.statSync(testPath).isFile()) throw new Error('test file does not exist');
        const result = await execFileAsync(process.execPath, ['--test', testPath], { cwd: root, timeout: 20000, windowsHide: true, maxBuffer: 128 * 1024 });
        return { ok: true, exit_code: 0, stdout: result.stdout.slice(0, 24000), stderr: result.stderr.slice(0, 4000) };
      }
      throw new Error('action_not_allowlisted');
    } catch (error) {
      return { ok: false, error: String(error.message || error).slice(0, 1000) };
    }
  }
  return { execute, capabilities, workspaceRoot: root };
}
module.exports = { createScopedExecutor, MAX_FILE_BYTES };
