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
  if (!Array.isArray(task.allowedOrigins) || task.allowedOrigins.length < 1 || task.allowedOrigins.length > 20) throw new Error('allowedOrigins must contain 1-20 exact origins.');
  const origins = task.allowedOrigins.map(function (origin) {
    if (typeof origin !== 'string' || origin !== origin.toLowerCase()) throw new Error('allowedOrigins entries must be lowercase exact HTTP(S) origins.');
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('allowedOrigins entries must be valid HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('allowedOrigins entries must be canonical origins with no path, query, or credentials.');
    return origin;
  });
  if (new Set(origins).size !== origins.length || !origins.includes(url.origin)) throw new Error('The initial URL origin must appear exactly once in allowedOrigins.');
  if (!Array.isArray(task.actions) || task.actions.length > 30) throw new Error('actions must be an array with at most 30 entries.');
  if (!Array.isArray(task.assertions) || task.assertions.length > 30) throw new Error('assertions must be an array with at most 30 entries.');
  const timeoutMs = Number(task.timeoutMs || 10000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 20000) throw new Error('timeoutMs must be an integer from 1000 to 20000.');
  for (const a of task.actions) {
    if (!a || !['click', 'fill', 'waitForText', 'navigate', 'extractText'].includes(a.type)) throw new Error('Unsupported browser action type.');
    if (a.type === 'navigate') {
      if (typeof a.url !== 'string' || a.url.length > 2048) throw new Error('navigate requires a URL <= 2048 characters.');
      const target = new URL(a.url);
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || !origins.includes(target.origin)) throw new Error('navigate URL must use an exact allowlisted origin without credentials, query, or fragment.');
    } else {
      if (typeof a.selector !== 'string' || !a.selector.trim() || a.selector.length > 300) throw new Error('Browser action selector must be 1-300 characters.');
      if (a.type === 'fill' && (typeof a.value !== 'string' || a.value.length > 2000)) throw new Error('fill value must be a string <= 2000 characters.');
      if (a.type === 'waitForText' && (typeof a.text !== 'string' || a.text.length > 1000)) throw new Error('waitForText text must be a string <= 1000 characters.');
      if (a.type === 'extractText' && a.maxChars !== undefined && (!Number.isInteger(a.maxChars) || a.maxChars < 1 || a.maxChars > 12000)) throw new Error('extractText maxChars must be 1-12000.');
    }
  }
  for (const a of task.assertions) {
    if (!a || !['textEquals', 'titleEquals', 'pathEquals'].includes(a.type)) throw new Error('Assertions must be textEquals, titleEquals, or pathEquals.');
    if (a.type === 'textEquals' && (typeof a.selector !== 'string' || typeof a.expected !== 'string')) throw new Error('textEquals requires selector and expected strings.');
    if (a.type === 'titleEquals' && typeof a.expected !== 'string') throw new Error('titleEquals requires expected string.');
    if (a.type === 'pathEquals' && (typeof a.expected !== 'string' || !a.expected.startsWith('/') || a.expected.length > 500)) throw new Error('pathEquals requires a path beginning with /.');
  }
  return { task: task, url: url, origins: origins, timeoutMs: timeoutMs };
}

function findEdge() {
  const edge = EDGE_CANDIDATES.find(function (p) { return p && fs.existsSync(p); });
  if (!edge) throw new Error('Microsoft Edge executable not found. Set HF_BROWSER_EXECUTABLE to its full path.');
  return edge;
}

function getChromeCdpUrl() {
  const configured = String(process.env.HF_BROWSER_CDP_URL || '').trim();
  if (!configured) return null;
  let endpoint;
  try { endpoint = new URL(configured); } catch { throw new Error('HF_BROWSER_CDP_URL_invalid'); }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('HF_BROWSER_CDP_URL_must_be_http_loopback_root');
  }
  return endpoint.origin;
}

async function runTask(taskInput, options) {
  const checked = validateTask(taskInput);
  const task = checked.task;
  const started = Date.now();
  const cdpUrl = getChromeCdpUrl();
  const browserWSEndpoint = options && typeof options.browserWSEndpoint === 'string' ? options.browserWSEndpoint : null;
  const keepPageOpen = !!(options && options.keepPageOpen);
  const profile = (cdpUrl || browserWSEndpoint) ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-task-'));
  const evidencePath = process.env.HF_BROWSER_EVIDENCE_PATH || path.join(ROOT, 'browser-runner-evidence.jsonl');
  const blockedOrigins = new Set();
  const extractedText = [];
  let browser;
  let page;
  let connectedToPersistentChrome = false;
  try {
    if (browserWSEndpoint) {
      browser = await puppeteer.connect({ browserWSEndpoint, defaultViewport: null });
      connectedToPersistentChrome = true;
    } else if (cdpUrl) {
      browser = await puppeteer.connect({ browserURL: cdpUrl, defaultViewport: null });
      connectedToPersistentChrome = true;
    } else {
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
    }
    page = await browser.newPage();
    await page.bringToFront();
    page.setDefaultTimeout(checked.timeoutMs);
    page.setDefaultNavigationTimeout(checked.timeoutMs);
    await page.setRequestInterception(true);
    page.on('request', function (request) {
      let origin = '';
      try { origin = new URL(request.url()).origin; } catch {}
      if (checked.origins.includes(origin)) request.continue().catch(function () {});
      else {
        blockedOrigins.add(origin || 'invalid-url');
        request.abort('blockedbyclient').catch(function () {});
      }
    });
    page.on('popup', function (popup) { popup.close().catch(function () {}); });
    await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: checked.timeoutMs });

    const actionResults = [];
    for (const action of task.actions) {
      if (action.type === 'navigate') {
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: checked.timeoutMs });
        actionResults.push({ type: action.type, ok: true, url: page.url() });
        continue;
      } else if (action.type === 'extractText') {
        const text = await page.$eval(action.selector, function (element) { return (element.innerText || element.textContent || '').trim(); });
        const value = text.slice(0, action.maxChars || 12000);
        extractedText.push({ selector: action.selector, text: value, truncated: text.length > value.length });
        actionResults.push({ type: action.type, ok: true, characters: value.length, truncated: text.length > value.length });
        continue;
      } else if (action.type === 'click') await page.click(action.selector);
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
      browser: (cdpUrl || browserWSEndpoint) ? 'Google Chrome visible, persistent automation profile' : 'Microsoft Edge headless, isolated temporary profile',
      finalUrl: page.url(),
      pageTitle: await page.title(),
      extractedText,
      durationMs: Date.now() - started,
      actionResults: actionResults,
      assertionResults: assertionResults,
      blockedOrigins: Array.from(blockedOrigins).sort(),
      outboundPolicy: 'Page requests are intercepted; only exact allowedOrigins are continued.',
      externalCallsAllowed: false
    };
    fs.appendFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), taskId: task.id, status: result.status, durationMs: result.durationMs, blockedOrigins: result.blockedOrigins }) + os.EOL, 'utf8');
    return result;
  } catch (error) {
    const result = {
      schema: 'heavenzfire.browser-task-result.v1',
      taskId: task.id,
      status: 'FAIL',
      durationMs: Date.now() - started,
      error: String(error && error.message || error).slice(0, 300),
      blockedOrigins: Array.from(blockedOrigins).sort(),
      externalCallsAllowed: false
    };
    try { fs.appendFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), taskId: task.id, status: result.status, durationMs: result.durationMs, error: result.error, blockedOrigins: result.blockedOrigins }) + os.EOL, 'utf8'); } catch {}
    return result;
  } finally {
    if (page && !keepPageOpen) { try { await page.close(); } catch {} }
    if (browser) {
      try { if (connectedToPersistentChrome) browser.disconnect(); else await browser.close(); } catch {}
    }
    if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
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