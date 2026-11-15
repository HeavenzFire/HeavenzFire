'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { runTask, validateTask } = require('./browser-task-runner.cjs');

const HOME = path.resolve(process.env.USERPROFILE || os.homedir(), 'HeavenzFire');
const DATA = path.join(HOME, '144A');
const TASKS = path.join(DATA, 'tasks');
const STATE = path.join(DATA, 'browser-worker-state.json');
const LOCK = path.join(DATA, 'browser-worker.pid');
const LOG = path.join(DATA, 'browser-worker.log');
const PROFILE = path.join(process.env.LOCALAPPDATA || os.homedir(), 'HeavenzFire', '144A-BrowserProfiles', 'AutonomousWorker-v4');
const CHROME_CANDIDATES = [
  process.env.HF_CHROME_EXECUTABLE,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
].filter(Boolean);
const DASHBOARD = 'http://127.0.0.1:18795/';
const POLL_MS = 1200;
let browser = null;
let busy = false;
let stopping = false;
let dashboardTarget = null;
let lastError = null;

fs.mkdirSync(TASKS, { recursive: true });
fs.mkdirSync(path.dirname(PROFILE), { recursive: true });

function log(event, detail) {
  const row = { at: new Date().toISOString(), pid: process.pid, event, detail: detail || null };
  try { fs.appendFileSync(LOG, JSON.stringify(row) + os.EOL, 'utf8'); } catch {}
}
function atomicWrite(file, value) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
    fs.copyFileSync(tmp, file);
    fs.unlinkSync(tmp);
  }
}
function writeState(status, extra) {
  const value = {
    schema: 'heavenzfire.chrome-worker-state.v1',
    pid: process.pid,
    status,
    browser: browser && browser.connected ? 'Chrome visible / persistent profile' : 'not_connected',
    profile: PROFILE,
    pollIntervalMs: POLL_MS,
    busy,
    lastError,
    updatedAt: new Date().toISOString(),
    ...(extra || {})
  };
  try { atomicWrite(STATE, value); } catch (e) { log('StateWriteFailed', String(e.message || e)); }
}
function readTask(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}
function saveTask(file, task) {
  task.updated = new Date().toISOString();
  atomicWrite(file, task);
}
function appendTaskEvent(task, name, detail) {
  task.events = Array.isArray(task.events) ? task.events : [];
  task.events.push({ at: new Date().toISOString(), event: name, detail: detail || null });
}
function isReadOnlySpec(spec) {
  const checked = validateTask(spec);
  if (checked.task.actions.some(a => !['navigate', 'waitForText', 'extractText'].includes(a.type))) {
    throw new Error('Autonomous Chrome worker is read-only: only navigate, waitForText, and extractText are permitted.');
  }
  return checked;
}
function findChrome() {
  const executable = CHROME_CANDIDATES.find(p => p && fs.existsSync(p));
  if (!executable) throw new Error('Google Chrome executable not found.');
  return executable;
}
async function ensureBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: false,
    userDataDir: PROFILE,
    defaultViewport: null,
    pipe: false,
    timeout: 20000,
    protocolTimeout: 10000,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--window-size=1440,1000'
    ]
  });
  browser.on('disconnected', () => {
    browser = null;
    dashboardTarget = null;
    writeState(stopping ? 'stopping' : 'degraded');
    log('ChromeDisconnected');
  });
  const page = await browser.newPage();
  await page.bringToFront();
  try { await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 5000 }); }
  catch (e) { log('DashboardUnavailable', String(e.message || e)); }
  dashboardTarget = page.target();
  log('ChromeStarted', { executable: findChrome(), profile: PROFILE, wsEndpoint: browser.wsEndpoint().replace(/\/devtools\/browser\/.*/, '/devtools/browser/[redacted]') });
  writeState('running');
  return browser;
}
async function closeOldTaskTabs() {
  if (!browser || !browser.connected) return;
  for (const page of await browser.pages()) {
    if (page.target() === dashboardTarget) continue;
    try { await page.close(); } catch {}
  }
}
function listQueuedJobs() {
  const files = fs.readdirSync(TASKS).filter(n => n.endsWith('.json')).sort();
  for (const name of files) {
    const file = path.join(TASKS, name);
    const task = readTask(file);
    if (!task || !task.browserAutomation) continue;
    if (task.browserAutomation.status === 'Running') {
      task.browserAutomation.status = 'Queued';
      task.browserAutomation.recoveredAt = new Date().toISOString();
      task.status = 'BrowserQueued';
      appendTaskEvent(task, 'BrowserWorkerRecovered', 'Re-queued after worker restart; approval retained.');
      try { saveTask(file, task); } catch (e) { log('RecoveryWriteFailed', { taskId: task.id, error: String(e.message || e) }); }
    }
    if (task.browserAutomation.status === 'Queued' && task.browserAutomation.approved === true) return { file, task };
  }
  return null;
}
async function processJob(job) {
  const { file, task } = job;
  const automation = task.browserAutomation;
  isReadOnlySpec(automation.spec);
  busy = true;
  automation.status = 'Running';
  automation.startedAt = new Date().toISOString();
  task.status = 'BrowserRunning';
  appendTaskEvent(task, 'BrowserWorkerStarted', {
    approved: automation.approved,
    allowedOrigins: automation.spec.allowedOrigins,
    policy: 'read-only navigation and text extraction; no form fill, clicks, purchases, posts, or messages'
  });
  saveTask(file, task);
  writeState('running', { activeTaskId: task.id, activeTaskTitle: task.title });
  log('JobStarted', { taskId: task.id, origins: automation.spec.allowedOrigins });
  try {
    const chrome = await ensureBrowser();
    await closeOldTaskTabs();
    const result = await runTask(automation.spec, {
      browserWSEndpoint: chrome.wsEndpoint(),
      keepPageOpen: true
    });
    automation.result = result;
    automation.status = result.status;
    automation.finishedAt = new Date().toISOString();
    task.status = 'ReviewRequired';
    appendTaskEvent(task, 'BrowserWorkerFinished', {
      result: result.status,
      pageTitle: result.pageTitle || null,
      finalUrl: result.finalUrl || null,
      durationMs: result.durationMs,
      evidence: 'browser-runner-evidence.jsonl'
    });
    task.browserAutomation = automation;
    saveTask(file, task);
    log('JobFinished', { taskId: task.id, result: result.status, durationMs: result.durationMs });
    lastError = result.status === 'PASS' ? null : result.error || 'Browser task failed.';
  } catch (error) {
    automation.status = 'FAIL';
    automation.error = String(error && error.message || error).slice(0, 400);
    automation.finishedAt = new Date().toISOString();
    task.browserAutomation = automation;
    task.status = 'ReviewRequired';
    appendTaskEvent(task, 'BrowserWorkerFailed', automation.error);
    saveTask(file, task);
    lastError = automation.error;
    log('JobFailed', { taskId: task.id, error: lastError });
  } finally {
    busy = false;
    writeState(lastError ? 'degraded' : 'running');
  }
}
async function poll() {
  if (stopping || busy) return;
  const job = listQueuedJobs();
  if (!job) { writeState(lastError ? 'degraded' : (browser && browser.connected ? 'running' : 'idle')); return; }
  try { await processJob(job); }
  catch (e) { lastError = String(e.message || e); log('WorkerLoopError', lastError); writeState('degraded'); }
}
function acquireLock() {
  try {
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let pid = 0;
    try { pid = Number(fs.readFileSync(LOCK, 'utf8').trim()); } catch {}
    if (pid > 0) {
      try { process.kill(pid, 0); return false; } catch {}
    }
    try { fs.unlinkSync(LOCK); } catch {}
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  }
}
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log('WorkerStopping', signal);
  writeState('stopping');
  if (browser && browser.connected) { try { await browser.close(); } catch {} }
  try {
    if (fs.existsSync(LOCK) && Number(fs.readFileSync(LOCK, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK);
  } catch {}
  process.exit(0);
}
async function main() {
  if (!acquireLock()) {
    log('DuplicateWorkerPrevented');
    process.exit(0);
    return;
  }
  writeState('starting');
  log('WorkerStarted', { pollIntervalMs: POLL_MS, profile: PROFILE });
  try { await ensureBrowser(); }
  catch (e) { lastError = String(e.message || e); log('InitialChromeLaunchFailed', lastError); writeState('degraded'); }
  await poll();
  setInterval(() => { poll().catch(e => { lastError = String(e.message || e); log('PollFailed', lastError); writeState('degraded'); }); }, POLL_MS);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', e => { lastError = String(e.message || e); log('UncaughtException', lastError); writeState('degraded'); });
process.on('unhandledRejection', e => { lastError = String(e && e.message || e); log('UnhandledRejection', lastError); writeState('degraded'); });
if (require.main === module) main().catch(e => { process.stderr.write(String(e.stack || e) + os.EOL); process.exitCode = 1; });
module.exports = { isReadOnlySpec };