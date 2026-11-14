// ==UserScript==
// @name         HeavenzFire 144A Companion
// @namespace    https://github.com/HeavenzFire/HeavenzFire
// @version      0.1.0
// @description  Pull-only local companion for the HeavenzFire 144A BrowserBridge.
// @match        http://127.0.0.1:18795/*
// @match        http://localhost:18795/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self || document.getElementById('hf144a-companion')) return;

  var API = location.origin;
  var MAX_TASKS = 8;
  var REQUEST_TIMEOUT_MS = 2500;
  var WATCH_LIMIT_MS = 30000;
  var watchActive = false;
  var watchTaskId = null;
  var watchStartedAt = 0;
  var watchDelay = 500;
  var latestTasks = [];

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'className') node.className = attrs[key];
      else if (key === 'textContent') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function request(path) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: API + path,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Accept': 'application/json' },
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('HTTP ' + response.status));
            return;
          }
          try { resolve(JSON.parse(response.responseText)); }
          catch (error) { reject(new Error('Invalid JSON response')); }
        },
        onerror: function () { reject(new Error('Local bridge unavailable')); },
        ontimeout: function () { reject(new Error('Request timed out')); }
      });
    });
  }

  function getTaskId(task) {
    return String(task && (task.id || task.taskId || task.task_id) || '');
  }

  function getStatus(task) {
    return String(task && (task.status || task.state) || 'unknown').toLowerCase();
  }

  function getTaskArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.tasks)) return payload.tasks;
    if (payload && payload.data && Array.isArray(payload.data.tasks)) return payload.data.tasks;
    return [];
  }

  var style = el('style', {});
  style.textContent = [
    '#hf144a-companion{position:fixed;right:16px;bottom:16px;z-index:2147483646;font:13px/1.4 system-ui,sans-serif;color:#e8edf5}',
    '#hf144a-companion *{box-sizing:border-box}',
    '#hf144a-companion button{cursor:pointer;border:1px solid #526174;border-radius:7px;padding:7px 10px;background:#263446;color:#f4f7fb}',
    '#hf144a-companion button:disabled{opacity:.45;cursor:default}',
    '#hf144a-companion .hf-launch{border-radius:999px;padding:10px 14px;box-shadow:0 3px 16px #0008}',
    '#hf144a-companion .hf-panel{display:none;width:340px;max-height:70vh;overflow:auto;margin-bottom:8px;padding:12px;border:1px solid #526174;border-radius:10px;background:#111923;box-shadow:0 8px 28px #0009}',
    '#hf144a-companion.open .hf-panel{display:block}',
    '#hf144a-companion .hf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}',
    '#hf144a-companion .hf-muted{color:#aab6c5;font-size:12px}',
    '#hf144a-companion .hf-task{padding:8px;margin:6px 0;border:1px solid #354354;border-radius:7px;overflow-wrap:anywhere}',
    '#hf144a-companion .hf-task strong{display:block}',
    '#hf144a-companion .hf-status{min-height:18px;margin:8px 0;color:#b9d8ff}',
    '#hf144a-companion .hf-close{margin-left:auto}'
  ].join('\n');
  document.documentElement.appendChild(style);

  var root = el('div', { id: 'hf144a-companion' });
  var panel = el('section', { className: 'hf-panel', 'aria-label': 'HeavenzFire Companion' });
  var header = el('div', { className: 'hf-row' });
  header.appendChild(el('strong', {}, 'HeavenzFire 144A'));
  var close = el('button', { type: 'button', className: 'hf-close' }, 'Close');
  header.appendChild(close);
  panel.appendChild(header);
  panel.appendChild(el('div', { className: 'hf-muted' }, 'Local-only. Pull to refresh; no background polling.'));
  var controls = el('div', { className: 'hf-row' });
  var refreshButton = el('button', { type: 'button' }, 'Refresh');
  var watchButton = el('button', { type: 'button', disabled: 'disabled' }, 'Watch selected');
  controls.appendChild(refreshButton);
  controls.appendChild(watchButton);
  panel.appendChild(controls);
  var statusNode = el('div', { className: 'hf-status', role: 'status', 'aria-live': 'polite' }, 'Idle.');
  panel.appendChild(statusNode);
  var healthNode = el('div', { className: 'hf-muted' }, 'Health: not checked');
  panel.appendChild(healthNode);
  var taskList = el('div', {});
  panel.appendChild(taskList);
  var launch = el('button', { type: 'button', className: 'hf-launch' }, 'HF Companion');
  root.appendChild(panel);
  root.appendChild(launch);
  document.documentElement.appendChild(root);

  function setStatus(message) {
    statusNode.textContent = message;
  }

  function renderTasks(tasks) {
    latestTasks = tasks;
    taskList.textContent = '';
    var shown = tasks.slice(0, MAX_TASKS);
    if (!shown.length) taskList.appendChild(el('div', { className: 'hf-muted' }, 'No tasks returned by the bridge.'));
    shown.forEach(function (task) {
      var id = getTaskId(task);
      var card = el('div', { className: 'hf-task' });
      var label = String(task.title || task.goal || task.name || id || 'Untitled task');
      var radio = el('input', { type: 'radio', name: 'hf144a-selected-task', value: id });
      radio.disabled = !id;
      var row = el('div', { className: 'hf-row' });
      row.appendChild(radio);
      row.appendChild(el('strong', {}, label.slice(0, 180)));
      card.appendChild(row);
      card.appendChild(el('div', { className: 'hf-muted' }, 'Status: ' + getStatus(task) + (id ? ' | ID: ' + id : '')));
      taskList.appendChild(card);
    });
    if (tasks.length > MAX_TASKS) {
      taskList.appendChild(el('div', { className: 'hf-muted' }, 'Showing 8 of ' + tasks.length + ' tasks. Use the bridge UI to filter the rest.'));
    }
    watchButton.disabled = !tasks.some(function (task) { return !!getTaskId(task); }) || watchActive;
  }

  async function refresh() {
    refreshButton.disabled = true;
    setStatus('Reading local bridge...');
    try {
      var results = await Promise.all([
        request('/health'),
        request('/api/tasks?limit=100')
      ]);
      healthNode.textContent = 'Health: ' + (results[0].ok === false ? 'degraded' : 'reachable');
      renderTasks(getTaskArray(results[1]));
      setStatus('Updated manually at ' + new Date().toLocaleTimeString() + '.');
    } catch (error) {
      setStatus('Refresh failed: ' + error.message);
    } finally {
      refreshButton.disabled = false;
    }
  }

  function findWatchedTask(tasks) {
    for (var i = 0; i < tasks.length; i += 1) {
      if (getTaskId(tasks[i]) === watchTaskId) return tasks[i];
    }
    return null;
  }

  function stopWatch(message) {
    watchActive = false;
    watchTaskId = null;
    watchButton.disabled = false;
    watchButton.textContent = 'Watch selected';
    setStatus(message);
  }

  async function watchNext() {
    if (!watchActive) return;
    if (document.hidden) {
      document.addEventListener('visibilitychange', resumeWatch, { once: true });
      setStatus('Watch paused while this tab is hidden.');
      return;
    }
    if (Date.now() - watchStartedAt >= WATCH_LIMIT_MS) {
      stopWatch('Watch window ended after 30 seconds. Refresh when ready.');
      return;
    }
    try {
      var payload = await request('/api/tasks?limit=100');
      var task = findWatchedTask(getTaskArray(payload));
      if (!task) {
        stopWatch('Selected task is no longer in the returned task list.');
        return;
      }
      var state = getStatus(task);
      if (state === 'completed' || state === 'complete' || state === 'failed' || state === 'cancelled' || state === 'canceled') {
        renderTasks(getTaskArray(payload));
        stopWatch('Task reached terminal state: ' + state + '. No next task was started.');
        return;
      }
      setStatus('Watching ' + watchTaskId + ' (' + state + '). Next check in ' + (watchDelay / 1000) + 's.');
      watchDelay = Math.min(watchDelay * 2, 4000);
      window.setTimeout(watchNext, watchDelay);
    } catch (error) {
      stopWatch('Watch stopped: ' + error.message);
    }
  }

  function resumeWatch() {
    if (watchActive && !document.hidden) {
      setStatus('Watch resumed.');
      window.setTimeout(watchNext, 0);
    }
  }

  refreshButton.addEventListener('click', refresh);
  watchButton.addEventListener('click', function () {
    var selected = root.querySelector('input[name="hf144a-selected-task"]:checked');
    if (!selected || !selected.value || watchActive) return;
    watchTaskId = selected.value;
    watchActive = true;
    watchStartedAt = Date.now();
    watchDelay = 500;
    watchButton.disabled = true;
    watchButton.textContent = 'Watching...';
    setStatus('Watch started by user. First check in 500ms.');
    window.setTimeout(watchNext, 500);
  });
  launch.addEventListener('click', function () { root.classList.toggle('open'); });
  close.addEventListener('click', function () { root.classList.remove('open'); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && watchActive) setStatus('Watch paused while this tab is hidden.');
  });
})();