'use strict';

function createRestartPolicy(options = {}) {
  const maxRestarts = Math.max(1, Math.min(Number(options.maxRestarts) || 5, 20));
  const windowMs = Math.max(60000, Math.min(Number(options.windowMs) || 10 * 60 * 1000, 24 * 60 * 60 * 1000));
  const baseDelayMs = Math.max(100, Math.min(Number(options.baseDelayMs) || 1000, 30000));
  const maxDelayMs = Math.max(baseDelayMs, Math.min(Number(options.maxDelayMs) || 30000, 120000));
  const restartTimes = [];

  function prune(now) {
    while (restartTimes.length && now - restartTimes[0] >= windowMs) restartTimes.shift();
  }

  return Object.freeze({
    recordRestart(now = Date.now()) {
      prune(now);
      if (restartTimes.length >= maxRestarts) {
        return Object.freeze({ allowed: false, count: restartTimes.length, delayMs: null, windowMs });
      }
      restartTimes.push(now);
      const exponent = Math.min(restartTimes.length - 1, 16);
      const delayMs = Math.min(baseDelayMs * (2 ** exponent), maxDelayMs);
      return Object.freeze({ allowed: true, count: restartTimes.length, delayMs, windowMs });
    },
    snapshot(now = Date.now()) {
      prune(now);
      return Object.freeze({ count: restartTimes.length, maxRestarts, windowMs });
    },
  });
}

module.exports = { createRestartPolicy };
