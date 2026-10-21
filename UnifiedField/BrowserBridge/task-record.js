(function (root) {
  'use strict';
  const SCHEMA = 'heavenzfire.shared-task.v1';
  function createTaskRecord(goal, proposalChars = 0) {
    if (typeof goal !== 'string' || !goal.trim()) throw new TypeError('goal must be a non-empty string');
    if (goal.length > 12000) throw new RangeError('goal exceeds 12000 characters');
    if (!Number.isInteger(proposalChars) || proposalChars < 0 || proposalChars > 12000) {
      throw new RangeError('proposalChars must be an integer from 0 to 12000');
    }
    if (!root.crypto || typeof root.crypto.randomUUID !== 'function') throw new Error('secure UUID support is required');
    const now = new Date().toISOString();
    return {
      schema: SCHEMA,
      taskId: root.crypto.randomUUID(),
      source: 'heavenzfire-browser-bridge',
      goal: goal.trim(),
      status: 'proposed',
      approvalState: 'pending',
      evidence: [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        sourceComponent: 'UnifiedFieldBrowserBridge',
        proposalChars
      }
    };
  }
  root.HeavenzFireTaskRecord = { SCHEMA, createTaskRecord };
  if (typeof module === 'object' && module.exports) module.exports = { SCHEMA, createTaskRecord };
})(globalThis);
