# Unified Field Browser Bridge

A minimal Manifest V3 extension that sends user-reviewed text to the local Unified Field proposal inbox.

## Permission and data boundaries

- Requests only `activeTab` and `scripting`; it does not register a content script or read all pages automatically.
- Has host permission only for `http://127.0.0.1:18796/*`.
- Capturing text requires a click in the popup. The captured text is shown in an editable field, and sending requires a separate explicit click.
- It creates a `heavenzfire.shared-task.v1` record in `proposed` / `pending` state. It does not approve or execute the proposal.
- No provider API keys, external hosts, or page URLs are copied into task metadata.

## Local setup

1. Start the Unified Field core inbox from the matching core branch on the same computer:
   `node .\task-inbox-server.cjs`
2. In Chromium/Edge, open the Extensions page and enable Developer mode.
3. Choose **Load unpacked** and select this `BrowserBridge` directory.
4. Select text in a page, open the extension, choose **Capture selected text**, review/edit the text, then choose **Submit pending proposal**.

If the inbox is not running, the extension reports the connection failure and does not send the text elsewhere.
