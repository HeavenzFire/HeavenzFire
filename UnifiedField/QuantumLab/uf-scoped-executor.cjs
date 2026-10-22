'use strict';

// Scoped local task executor. No arbitrary shell strings, no network ingress, no admin actions.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 256 * 1024;

function createScopedExecutor(options = {}) {
  const requestedRoot = typeof options.workspaceRoot === 'string' && options.workspaceRoot.trim()
    ? options.workspaceRoot.trim()
    : (typeof process.env.HEAVENZFIRE_WORKSPACE_ROOT === 'string' && process.env.HEAVENZFIRE_WORKSPACE_ROOT.trim()
      ? process.env.HEAVENZFIRE_WORKSPACE_ROOT.trim()
      : '');
  let root = null;
  let rootError = 'workspace_root_not_configured';
  if (requestedRoot) {
    try {
      const candidate = path.resolve(requestedRoot);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('workspace root must be an existing, non-symlink directory');
      root = fs.realpathSync(candidate);
      rootError = '';
    } catch (error) {
      rootError = String(error.message || error).slice(0, 300);
    }
  }

  function isWithinRoot(target) {
    const relative = path.relative(root, target);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  }

  // Reject symlinks at every existing path component. This is intentionally stricter
  // than following an in-workspace symlink: the workspace boundary remains unambiguous.
  function assertNoSymlinkComponents(target) {
    if (!root) throw new Error(rootError || 'workspace_root_not_configured');
    if (!isWithinRoot(target)) throw new Error('path escapes workspace root');
    let cursor = root;
    const rootStat = fs.lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('workspace root is not a safe directory');
    const relative = path.relative(root, target);
    for (const component of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, component);
      try {
        const stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink()) throw new Error('symbolic links are not allowed in workspace paths');
      } catch (error) {
        if (error.code === 'ENOENT') break;
        throw error;
      }
    }
  }

  function resolvePath(relativePath) {
    if (!root) throw new Error(rootError || 'workspace_root_not_configured');
    if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
      throw new Error('relative workspace path required');
    }
    const target = path.resolve(root, relativePath);
    assertNoSymlinkComponents(target);
    return target;
  }

  function canonicalizeTarget(target) {
    const parent = fs.realpathSync(path.dirname(target));
    if (!isWithinRoot(parent)) throw new Error('resolved parent escapes workspace root');
    const canonicalTarget = path.join(parent, path.basename(target));
    // Use the resolved parent for subsequent I/O so a later symlink swap on the
    // original lexical path cannot redirect the operation outside the workspace.
    assertNoSymlinkComponents(canonicalTarget);
    return canonicalTarget;
  }

  function ensureSafeParentDirectories(target) {
    const parent = path.dirname(target);
    const relative = path.relative(root, parent);
    let cursor = root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      const candidate = path.join(cursor, component);
      try {
        const stat = fs.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('workspace parent must be a non-symlink directory');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fs.mkdirSync(candidate);
      }
      const resolved = fs.realpathSync(candidate);
      if (!isWithinRoot(resolved) || resolved !== candidate) throw new Error('workspace parent resolved outside the canonical workspace path');
      cursor = resolved;
    }
    assertNoSymlinkComponents(path.join(cursor, path.basename(target)));
  }

  function capabilities() {
    return {
      workspace_root_configured: Boolean(root),
      actions: root ? ['workspace.read_file', 'workspace.write_file', 'git.status'] : [],
      configuration_error: root ? null : rootError,
      requires_approval: true,
      arbitrary_shell: false,
      admin_actions: false,
      max_file_bytes: MAX_FILE_BYTES
    };
  }

  async function execute(action, input) {
    try {
      if (!root) throw new Error(rootError || 'workspace_root_not_configured');
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input must be an object');
      if (action === 'workspace.read_file') {
        const target = canonicalizeTarget(resolvePath(input.path));
        const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try {
          const stat = fs.fstatSync(fd);
          if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('file missing, unsafe, not regular, or exceeds 256 KiB');
          return { ok: true, path: input.path, content: fs.readFileSync(fd, 'utf8') };
        } finally { fs.closeSync(fd); }
      }
      if (action === 'workspace.write_file') {
        let target = resolvePath(input.path);
        if (typeof input.content !== 'string' || Buffer.byteLength(input.content, 'utf8') > MAX_FILE_BYTES) throw new Error('content must be a string no larger than 256 KiB');
        ensureSafeParentDirectories(target);
        target = canonicalizeTarget(target);
        if (input.overwrite === true) {
          const temp = target + '.hf-tmp-' + process.pid + '-' + require('node:crypto').randomBytes(6).toString('hex');
          try {
            fs.writeFileSync(temp, input.content, { encoding: 'utf8', flag: 'wx' });
            assertNoSymlinkComponents(target);
            fs.renameSync(temp, target);
          } finally {
            try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
          }
        } else {
          // O_EXCL ('wx') makes no-overwrite creation atomic against competing writers.
          const fd = fs.openSync(target, 'wx');
          try { fs.writeFileSync(fd, input.content, { encoding: 'utf8' }); }
          catch (error) { try { fs.unlinkSync(target); } catch {} throw error; }
          finally { fs.closeSync(fd); }
        }
        return { ok: true, path: input.path, bytes_written: Buffer.byteLength(input.content, 'utf8') };
      }
      if (action === 'git.status') {
        const requestedCwd = resolvePath(input.path || '.');
        const cwd = fs.realpathSync(requestedCwd);
        if (!isWithinRoot(cwd)) throw new Error('Git working directory escapes workspace root');
        const discovered = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 5000, windowsHide: true, maxBuffer: 16 * 1024 });
        const gitRoot = fs.realpathSync(discovered.stdout.trim());
        if (gitRoot !== root) throw new Error('git worktree root must exactly match the configured workspace root');
        const result = await execFileAsync('git', ['status', '--short', '--branch'], { cwd, timeout: 5000, windowsHide: true, maxBuffer: 64 * 1024 });
        return { ok: true, cwd, stdout: result.stdout.slice(0, 16000), stderr: result.stderr.slice(0, 2000) };
      }
      throw new Error('action_not_allowlisted');
    } catch (error) {
      return { ok: false, error: String(error.message || error).slice(0, 1000) };
    }
  }
  return { execute, capabilities, workspaceRoot: root };
}
module.exports = { createScopedExecutor, MAX_FILE_BYTES };
