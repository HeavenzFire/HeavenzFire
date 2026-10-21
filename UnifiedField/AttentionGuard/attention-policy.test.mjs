import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DOMAINS,
  buildBlockRules,
  isFocusActive,
  normalizeDomain,
  validateFocusMinutes
} from "./attention-policy.mjs";

test("normalizes an exact domain", () => {
  assert.equal(normalizeDomain("  YouTube.COM. "), "youtube.com");
});

test("rejects schemes, paths, ports, and wildcards", () => {
  for (const value of ["https://youtube.com", "youtube.com/watch", "youtube.com:443", "*.youtube.com", ""]) {
    assert.throws(() => normalizeDomain(value));
  }
});

test("rejects malformed host labels", () => {
  for (const value of ["-bad.example", "bad-.example", "bad..example", "singlelabel"]) {
    assert.throws(() => normalizeDomain(value));
  }
});

test("focus duration is bounded to one through 180 whole minutes", () => {
  assert.equal(validateFocusMinutes("25"), 25);
  for (const value of [0, -1, 181, 1.5, "nope"]) assert.throws(() => validateFocusMinutes(value));
});

test("expired and inactive sessions create no blocking rules", () => {
  assert.equal(isFocusActive({ active: true, endsAt: 999 }, 1000), false);
  assert.deepEqual(buildBlockRules(["youtube.com"], { active: true, endsAt: 999 }, 1000), []);
  assert.deepEqual(buildBlockRules(["youtube.com"], { active: false, endsAt: 9999 }, 1000), []);
});

test("active session creates exact main-frame block rules", () => {
  const rules = buildBlockRules(["youtube.com", "reddit.com"], { active: true, endsAt: 5000 }, 1000);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], {
    id: 1000,
    priority: 1,
    action: { type: "block" },
    condition: { requestDomains: ["youtube.com"], resourceTypes: ["main_frame"] }
  });
});

test("duplicate domains are collapsed and invalid persisted values are ignored", () => {
  const rules = buildBlockRules(["youtube.com", "youtube.com", "*.bad.example"], { active: true, endsAt: 5000 }, 1000);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].condition.requestDomains[0], "youtube.com");
});

test("rule count is capped to the domain policy maximum", () => {
  const domains = Array.from({ length: MAX_DOMAINS + 1 }, (_, index) => `site${index}.example`);
  const rules = buildBlockRules(domains, { active: true, endsAt: 5000 }, 1000);
  assert.equal(rules.length, MAX_DOMAINS);
});