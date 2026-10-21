import {
  MAX_DOMAINS,
  buildBlockRules,
  isFocusActive,
  normalizeDomain,
  validateFocusMinutes
} from "./attention-policy.mjs";

const DEFAULT_FOCUS = { active: false, endsAt: null };
let syncQueue = Promise.resolve();

async function readState() {
  const stored = await chrome.storage.local.get(["domains", "focus"]);
  const domains = Array.isArray(stored.domains) ? stored.domains : [];
  const unique = [];
  const seen = new Set();
  for (const value of domains) {
    try {
      const domain = normalizeDomain(value);
      if (!seen.has(domain) && unique.length < MAX_DOMAINS) {
        seen.add(domain);
        unique.push(domain);
      }
    } catch {
      // Ignore invalid local entries; never turn malformed data into a broad rule.
    }
  }
  let focus = stored.focus && typeof stored.focus === "object" ? stored.focus : DEFAULT_FOCUS;
  if (!isFocusActive(focus)) {
    focus = DEFAULT_FOCUS;
    if (stored.focus?.active === true) {
      await chrome.storage.local.set({ focus });
    }
  }
  return { domains: unique, focus };
}

async function syncRules() {
  const state = await readState();
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = buildBlockRules(state.domains, state.focus);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map(rule => rule.id),
    addRules
  });
}

function scheduleSync() {
  syncQueue = syncQueue.catch(() => {}).then(syncRules);
  return syncQueue;
}

async function startFocus(value) {
  const minutes = validateFocusMinutes(value);
  const focus = { active: true, endsAt: Date.now() + minutes * 60_000 };
  await chrome.storage.local.set({ focus });
  chrome.alarms.create("attention-guard-focus-expiry", { when: focus.endsAt });
  await scheduleSync();
  return focus;
}

async function stopFocus() {
  await chrome.storage.local.set({ focus: DEFAULT_FOCUS });
  await chrome.alarms.clear("attention-guard-focus-expiry");
  await scheduleSync();
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(["domains", "focus"]);
  const defaults = {};
  if (!Array.isArray(stored.domains)) defaults.domains = [];
  if (!stored.focus) defaults.focus = DEFAULT_FOCUS;
  if (Object.keys(defaults).length) await chrome.storage.local.set(defaults);
  await scheduleSync();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleSync().catch(error => console.error("Attention Guard rule sync failed", error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.domains || changes.focus)) {
    scheduleSync().catch(error => console.error("Attention Guard rule sync failed", error));
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "attention-guard-focus-expiry") return;
  await chrome.storage.local.set({ focus: DEFAULT_FOCUS });
  await scheduleSync();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return false;
  if (message.type === "start-focus") {
    startFocus(message.minutes)
      .then(focus => sendResponse({ ok: true, focus }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-focus") {
    stopFocus()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});