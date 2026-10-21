'use strict';

const UNIFIED_FIELD_TASK_ENDPOINT = 'http://127.0.0.1:18796/api/tasks';
const MAX_PROPOSAL_CHARS = 12000;

const statusNode = document.getElementById('status');
const proposalNode = document.getElementById('proposal');
const captureButton = document.getElementById('capture');
const submitButton = document.getElementById('submit');

function setStatus(message) {
  statusNode.textContent = message;
}

captureButton.addEventListener('click', async () => {
  setStatus('Capturing selection from the active tab…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') throw new Error('No active tab is available.');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { const selection = window.getSelection ? window.getSelection() : null; return selection ? selection.toString().slice(0, 12000) : ''; }
    });
    const selection = String(results && results[0] && results[0].result || '').trim();
    if (!selection) {
      setStatus('No selected text found. Select text in the page, then try again.');
      return;
    }
    proposalNode.value = selection;
    setStatus('Captured ' + selection.length + ' characters. Review or edit before submitting.');
  } catch {
    setStatus('Could not capture selection on this page. You can still type a proposal manually.');
  }
});

submitButton.addEventListener('click', async () => {
  const goal = proposalNode.value.trim();
  if (!goal) return setStatus('Enter or capture proposal text first.');
  if (goal.length > MAX_PROPOSAL_CHARS) return setStatus('Proposal is too long (maximum 12000 characters).');

  submitButton.disabled = true;
  setStatus('Sending proposal to the loopback-only Unified Field inbox…');
  try {
    const taskRecord = HeavenzFireTaskRecord.createTaskRecord(goal, goal.length);
    const response = await fetch(UNIFIED_FIELD_TASK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskRecord })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true || body.taskId !== taskRecord.taskId) {
      setStatus('Inbox rejected the proposal: ' + String(body.error || ('HTTP ' + response.status)));
      return;
    }
    setStatus((body.duplicate ? 'Already received' : 'Proposal received') +
      '. Status: proposed / pending. Task ID: ' + taskRecord.taskId);
  } catch {
    setStatus('Unified Field inbox is unavailable. Start the local inbox service and try again.');
  } finally {
    submitButton.disabled = false;
  }
});
