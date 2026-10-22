'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const ROOT = __dirname;
const EDGE_CANDIDATES = [
  process.env.HF_BROWSER_EXECUTABLE,
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
].filter(Boolean);

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Task must be a JSON object.');
  if (typeof task.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(task.id)) throw new Error('Task id must be 1-64 safe characters.');
  if (typeof task.url !== 'string' || task.url.length > 2048) throw new Error('Task url is required and must be <= 2048 characters.');
  const url = new URL(task.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Only HTTP(S) URLs without credentials, query strings, or fragments are permitted.');
  }
  if (!Array.isArray(task.allowedHosts) || task.allowedHosts.length < 1 || task.allowedHosts.length > 20) throw new Error('allowedHosts must contain 1-20 exact hostnames.');
  const hosts = task.allowedHosts.map(function (h) {
    if (typeof h !== 'string' || h !== h.toLowerCase() || h.includes('*') || h.includes('/') || h.includes(':')) throw new Error('allowedHosts entries must be lowercase exact hostnames without wildcards or ports.');
    return h;
  });
  if (new Set(hosts).size !== hosts.length || !hosts.includes(url.hostname.toLowerCase())) throw new Error('The initial URL host must appear exactly once in allowedHosts.');
  if (!Array.isArray(task.actions) || task.actions.length > 30) throw new Error('actions must be an array with at most 30 entries.');
  if (!Array.isArray(task.assertions) || task.assertions.length > 30) throw new Error('assertions must be an array with at most 30 entries.');
  const timeoutMs = Number(task.timeoutMs || 10000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 20000) throw new Error('timeoutMs must be an integer from 1000 to 20000.');
  for (const a of task.actions) {
    if (!a || !['click', 'fill', 'waitForText'].includes(a.type) || typeof a.selector !== 'string' || a.selector.length > 300) throw new Error('Each action must be click, fill, or waitForText with a selector <= 300 characters.');
    if (a.type === 'fill' && (typeof a.value !== 'string' || a.value.length > 2000)) throw new Error('fill value must be a string <= 2000 characters.');
    if (a.type === 'waitForText' && (typeof a.text !== 'string' || a.text.length > 1000)) throw new Error('waitForText text must be a string <= 1000 characters.');
  }
  for (const a of task.assertions) {
    if (!a || !['textEquals', 'titleEquals', 'pathEquals'].includes(a.type)) throw new Error('Assertions must be textEquals, titleEquals, or pathEquals.');
    if (a.type === 'textEquals' && (typeof a.selector !== 'string' || typeof a.expected !== 'string')) throw new Error('textEquals requires selector and expected strings.');
    if (a.type === 'titleEquals' && typeof a.expected !== 'string') throw new Error('titleEquals requires expected string.');
    if (a.type === 'pathEquals' && (typeof a.expected !== 'string' || !a.expected.startsWith('/') || a.expected.length > 500)) throw new Error('pathEquals requires a path beginning with /.');
  }
  return { task: task, url: url, hosts: hosts, timeoutMs: timeoutMs };
}

function findEdge() {
  const edge = EDGE_CANDIDATES.find(function (p) { return p && fs.existsSync(p); });
  if (!edge) throw new Error('Microsoft Edge executable not found. Set HF_BROWSER_EXECUTABLE to its full path.');
  return edge;
}

async function runTask(taskInput) {
  const checked = validateTask(taskInput);
  const task = checked.task;
  const started = Date.now();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-task-'));
  const evidencePath = process.env.HF_BROWSER_EVIDENCE_PATH || path.join(ROOT, 'browser-runner-evidence.jsonl');
  const blockedHosts = new Set();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: findEdge(),
      headless: true,
      userDataDir: profile,
      timeout: 10000,
      protocolTimeout: 5000,
      args: [
        '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--no-proxy-server'
      ]
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(checked.timeoutMs);
    page.setDefaultNavigationTimeout(checked.timeoutMs);
    await page.setRequestInterception(true);
    page.on('request', function (request) {
      let host = '';
      try { host = new URL(request.url()).hostname.toLowerCase(); } catch {}
      if (checked.hosts.includes(host)) request.continue().catch(function () {});
      else {
        blockedHosts.add(host || 'invalid-url');
        request.abort('blockedbyclient').catch(function () {});
      }
    });
    page.on('popup', function (popup) { popup.close().catch(function () {}); });
    await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: checked.timeoutMs });

    const actionResults = [];
    for (const action of task.actions) {
      if (action.type === 'click') await page.click(action.selector);
      else if (action.type === 'fill') {
        await page.$eval(action.selector, function (element, value) {
          element.focus();
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, action.value);
      } else {
        await page.waitForFunction(function (selector, text) {
          const element = document.querySelector(selector);
          return !!element && (element.innerText || element.textContent || '').includes(text);
        }, { timeout: checked.timeoutMs }, action.selector, action.text);
      }
      actionResults.push({ type: action.type, ok: true });
    }

    const assertionResults = [];
    for (const assertion of task.assertions) {
      let ok = false;
      if (assertion.type === 'titleEquals') ok = (await page.title()) === assertion.expected;
      else if (assertion.type === 'pathEquals') ok = (new URL(page.url())).pathname === assertion.expected;
      else {
        const actual = await page.$eval(assertion.selector, function (element) {
          return (element.innerText || element.textContent || '').trim();
        }).catch(function () { return null; });
        ok = actual === assertion.expected;
      }
      assertionResults.push({ type: assertion.type, ok: ok });
      if (!ok) throw new Error('Assertion failed: ' + assertion.type + (assertion.selector ? ' on selector ' + assertion.selector : ''));
    }

    const result = {
      schema: 'heavenzfire.browser-task-result.v1',
      taskId: task.id,
      status: 'PASS',
      browser: 'Microsoft Edge headless, isolated temporary profile',
      durationMs: Date.now() - started,
      actionResults: actionResults,
      assertionResults: assertionResults,
      blockedHosts: Array.from(blockedHosts).sort(),
      outboundPolicy: 'Page requests are intercepted; only exact allowedHosts are continued.',
      externalCallsAllowed: false
    };
    fs.appendFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), taskId: task.id, status: result.status, durationMs: result.durationMs, blockedHosts: result.blockedHosts }) + os.EOL, 'utf8');
    return result;
  } catch (error) {
    const result = {
      schema: 'heavenzfire.browser-task-result.v1',
      taskId: task.id,
      status: 'FAIL',
      durationMs: Date.now() - started,
      error: String(error && error.message || error).slice(0, 300),
      blockedHosts: Array.from(blockedHosts).sort(),
      externalCallsAllowed: false
    };
    try { fs.appendFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), taskId: task.id, status: result.status, durationMs: result.durationMs, error: result.error, blockedHosts: result.blockedHosts }) + os.EOL, 'utf8'); } catch {}
    return result;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('Usage: node browser-task-runner.cjs <task.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const task = JSON.parse(fs.readFileSync(path.resolve(arg), 'utf8'));
      runTask(task).then(function (result) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        if (result.status !== 'PASS') process.exitCode = 1;
      }).catch(function (error) {
        process.stderr.write(String(error && error.message || error) + '\n');
        process.exitCode = 1;
      });
    } catch (error) {
      process.stderr.write(String(error && error.message || error) + '\n');
      process.exitCode = 1;
    }
  }
}

module.exports = { validateTask: validateTask, runTask: runTask };