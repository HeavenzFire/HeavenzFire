import {
  MAX_DOMAINS,
  normalizeDomain,
  validateFocusMinutes
} from "./attention-policy.mjs";

const form = document.querySelector("#add-domain-form");
const domainInput = document.querySelector("#domain-input");
const domainError = document.querySelector("#domain-error");
const domainList = document.querySelector("#domain-list");
const emptyList = document.querySelector("#empty-list");
const focusStatus = document.querySelector("#focus-status");
const focusMinutes = document.querySelector("#focus-minutes");
const startButton = document.querySelector("#start-focus");
const stopButton = document.querySelector("#stop-focus");

async function readState() {
  const state = await chrome.storage.local.get({ domains: [], focus: { active: false, endsAt: null } });
  return {
    domains: Array.isArray(state.domains) ? state.domains : [],
    focus: state.focus && typeof state.focus === "object" ? state.focus : { active: false, endsAt: null }
  };
}

function formatEndTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function render() {
  const state = await readState();
  const active = state.focus.active === true && Number.isFinite(state.focus.endsAt) && state.focus.endsAt > Date.now();
  focusStatus.textContent = active
    ? `Focus mode is on until ${formatEndTime(state.focus.endsAt)}. Only your selected domains are blocked.`
    : "Focus mode is off. Your domains are not blocked.";
  startButton.disabled = active;
  stopButton.disabled = !active;

  domainList.replaceChildren();
  for (const domain of state.domains) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.className = "domain";
    text.textContent = domain;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${domain} from blocklist`);
    remove.addEventListener("click", async () => {
      const current = await readState();
      await chrome.storage.local.set({ domains: current.domains.filter(value => value !== domain) });
      await render();
    });
    item.append(text, remove);
    domainList.append(item);
  }
  emptyList.hidden = state.domains.length > 0;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  domainError.textContent = "";
  try {
    const domain = normalizeDomain(domainInput.value);
    const state = await readState();
    const domains = [...new Set([...state.domains.map(normalizeDomain), domain])];
    if (domains.length > MAX_DOMAINS) throw new RangeError(`Limit reached: at most ${MAX_DOMAINS} domains`);
    await chrome.storage.local.set({ domains });
    domainInput.value = "";
    await render();
  } catch (error) {
    domainError.textContent = error.message || "Could not add domain";
  }
});

startButton.addEventListener("click", async () => {
  domainError.textContent = "";
  try {
    const minutes = validateFocusMinutes(focusMinutes.value);
    const result = await chrome.runtime.sendMessage({ type: "start-focus", minutes });
    if (!result?.ok) throw new Error(result?.error || "Could not start focus session");
    await render();
  } catch (error) {
    domainError.textContent = error.message || "Could not start focus session";
  }
});

stopButton.addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "stop-focus" });
  if (!result?.ok) domainError.textContent = result?.error || "Could not stop focus session";
  await render();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.domains || changes.focus)) render();
});

render().catch(error => { domainError.textContent = error.message || "Could not load settings"; });