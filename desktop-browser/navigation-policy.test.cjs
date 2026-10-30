"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWebUrl } = require("./navigation-policy.cjs");

test("defaults an empty address to the home page", () => {
  assert.equal(normalizeWebUrl(""), "https://www.google.com/");
  assert.equal(normalizeWebUrl("   "), "https://www.google.com/");
});

test("accepts HTTP and HTTPS URLs", () => {
  assert.equal(normalizeWebUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(normalizeWebUrl("http://localhost:3000/health"), "http://localhost:3000/health");
});

test("turns search phrases into encoded search URLs", () => {
  assert.equal(
    normalizeWebUrl("heavenzfire unified field"),
    "https://www.google.com/search?q=heavenzfire%20unified%20field"
  );
});

test("adds HTTPS to ordinary host names", () => {
  assert.equal(normalizeWebUrl("example.com"), "https://example.com/");
});

test("rejects non-web schemes", () => {
  for (const address of [
    "javascript:alert(1)",
    "file:///C:/Windows/win.ini",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/file"
  ]) {
    assert.throws(() => normalizeWebUrl(address), /Only HTTP and HTTPS/);
  }
});

test("rejects malformed URL input", () => {
  assert.throws(() => normalizeWebUrl("https://[invalid"), /not a valid URL/);
});
