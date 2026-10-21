'use strict';

function classifyWorkerHealth(httpOk, status, data) {
  if (!httpOk) return `HTTP ${status}`;
  if (!data || data.ok !== true || data.service !== 'heavenzfire-unified-field-worker') {
    return 'invalid health response';
  }
  if (data.writable === false) return 'degraded';
  return 'healthy';
}

module.exports = { classifyWorkerHealth };
