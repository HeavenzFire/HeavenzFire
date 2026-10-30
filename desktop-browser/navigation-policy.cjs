"use strict";

function normalizeWebUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "https://www.google.com/";
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) ? value :
    (value.includes(" ") || (!value.includes(".") && value !== "localhost")
      ? "https://www.google.com/search?q=" + encodeURIComponent(value)
      : "https://" + value);
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new Error("That address is not a valid URL or search query."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS pages are allowed.");
  return parsed.toString();
}

module.exports = { normalizeWebUrl };
