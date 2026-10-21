export const MAX_DOMAINS = 100;
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 180;
export const RULE_ID_BASE = 1000;

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomain(input) {
  if (typeof input !== "string") throw new TypeError("Enter a domain name");
  let domain = input.trim().toLowerCase();
  if (domain.endsWith(".")) domain = domain.slice(0, -1);
  if (!domain || domain.length > 253) throw new TypeError("Domain is empty or too long");
  if (/[\s/:?#@*]/.test(domain)) throw new TypeError("Enter a hostname only; schemes, paths, ports, and wildcards are not allowed");
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !LABEL_RE.test(label))) {
    throw new TypeError("Enter a valid fully qualified domain name, such as example.com");
  }
  return domain;
}

export function validateFocusMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) {
    throw new RangeError(`Focus duration must be an integer from ${MIN_FOCUS_MINUTES} to ${MAX_FOCUS_MINUTES} minutes`);
  }
  return minutes;
}

export function isFocusActive(focus, now = Date.now()) {
  return Boolean(
    focus &&
    focus.active === true &&
    Number.isFinite(focus.endsAt) &&
    focus.endsAt > now
  );
}

export function buildBlockRules(domains, focus, now = Date.now()) {
  if (!Array.isArray(domains) || !isFocusActive(focus, now)) return [];
  const uniqueDomains = [];
  const seen = new Set();
  for (const value of domains) {
    try {
      const domain = normalizeDomain(value);
      if (!seen.has(domain) && uniqueDomains.length < MAX_DOMAINS) {
        seen.add(domain);
        uniqueDomains.push(domain);
      }
    } catch {
      // Invalid persisted entries fail closed by being omitted from the rule set.
    }
  }
  return uniqueDomains.map((domain, index) => ({
    id: RULE_ID_BASE + index,
    priority: 1,
    action: { type: "block" },
    condition: {
      requestDomains: [domain],
      resourceTypes: ["main_frame"]
    }
  }));
}