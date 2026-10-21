import test from "node:test";
import assert from "node:assert/strict";

const listeners = {
  installed: [],
  startup: [],
  message: [],
  storageChanged: [],
  alarm: []
};
const storageData = {};
const dynamicRules = new Map();
const alarms = new Map();

function register(target, listener) {
  target.push(listener);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

globalThis.chrome = {
  runtime: {
    id: "attention-guard-test-extension",
    onInstalled: { addListener: listener => register(listeners.installed, listener) },
    onStartup: { addListener: listener => register(listeners.startup, listener) },
    onMessage: { addListener: listener => register(listeners.message, listener) }
  },
  storage: {
    local: {
      async get(keys) {
        const result = {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(storageData, key)) result[key] = clone(storageData[key]);
        }
        return result;
      },
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          const oldValue = storageData[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
            changes[key] = { oldValue: clone(oldValue), newValue: clone(value) };
          }
          storageData[key] = clone(value);
        }
        if (Object.keys(changes).length) {
          for (const listener of listeners.storageChanged) listener(changes, "local");
        }
      }
    },
    onChanged: { addListener: listener => register(listeners.storageChanged, listener) }
  },
  declarativeNetRequest: {
    async getDynamicRules() { return Array.from(dynamicRules.values()); },
    async updateDynamicRules({ removeRuleIds, addRules }) {
      for (const id of removeRuleIds) dynamicRules.delete(id);
      for (const rule of addRules) dynamicRules.set(rule.id, clone(rule));
    }
  },
  alarms: {
    create(name, info) { alarms.set(name, clone(info)); },
    async clear(name) { return alarms.delete(name); },
    onAlarm: { addListener: listener => register(listeners.alarm, listener) }
  }
};

await import("./service-worker.js");

async function sendMessage(message) {
  return new Promise(resolve => {
    const listener = listeners.message[0];
    const didRespondAsync = listener(message, { id: chrome.runtime.id }, resolve);
    if (didRespondAsync !== true) resolve({ ok: false, error: "message_not_handled" });
  });
}

test("service worker initializes defaults and refuses focus without a domain", async () => {
  await listeners.installed[0]();
  assert.deepEqual(storageData.domains, []);
  assert.deepEqual(storageData.focus, { active: false, endsAt: null });
  const result = await sendMessage({ type: "start-focus", minutes: 15 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Add at least one domain/);
  assert.equal(dynamicRules.size, 0);
  assert.equal(alarms.has("attention-guard-focus-expiry"), false);
});

test("service worker installs only selected-domain rules and stop removes them", async () => {
  await chrome.storage.local.set({ domains: ["example.com"] });
  await listeners.startup[0]();
  const started = await sendMessage({ type: "start-focus", minutes: 15 });
  assert.equal(started.ok, true);
  assert.equal(started.focus.active, true);
  assert.equal(dynamicRules.size, 1);
  const [rule] = Array.from(dynamicRules.values());
  assert.equal(rule.action.type, "block");
  assert.deepEqual(rule.condition.requestDomains, ["example.com"]);
  assert.equal(rule.condition.resourceTypes.includes("main_frame"), true);
  assert.equal(alarms.has("attention-guard-focus-expiry"), true);

  const stopped = await sendMessage({ type: "stop-focus" });
  assert.equal(stopped.ok, true);
  assert.equal(storageData.focus.active, false);
  assert.equal(dynamicRules.size, 0);
  assert.equal(alarms.has("attention-guard-focus-expiry"), false);
});

test("service worker resets an expired focus session on startup", async () => {
  await chrome.storage.local.set({
    domains: ["example.com"],
    focus: { active: true, endsAt: Date.now() - 1000 }
  });
  await listeners.startup[0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(storageData.focus.active, false);
  assert.equal(dynamicRules.size, 0);
});
