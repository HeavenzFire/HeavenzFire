# HeavenzFire Desktop Browser

A native Windows desktop browser shell built on Electron/Chromium. It provides a real browser view (not an iframe), URL/search bar, multiple tabs, back/forward/reload/home, and keyboard shortcuts. It can navigate to HTTPS websites and Google AI Mode share links; Google may still require sign-in or limit access to particular shared pages.

## Run on Windows

Requirements: Node.js 20+ and npm.

PowerShell:

    cd desktop-browser
    npm install
    npm test
    npm start

Build a Windows installer:

    npm run dist

The installer is written to the release directory. This source repository does not include a prebuilt Windows binary.

## Controls

- Ctrl+L: focus the address bar
- Ctrl+T: new tab
- Ctrl+W: close active tab
- Enter: navigate to a URL or search phrase
- Back, Forward, Reload, and Home buttons are available in the toolbar

## Security boundaries

- Remote pages run in isolated Chromium WebContentsView instances.
- Node integration is disabled; context isolation and sandboxing are enabled.
- Only HTTP and HTTPS navigation is allowed; file:, javascript:, and other schemes are rejected.
- Site permissions are denied by default.
- The app does not expose filesystem, shell, or local service APIs to remote pages.
- This is a focused browser shell, not a complete Chrome replacement: password sync, extensions, bookmarks sync, and a built-in password manager are not included.

Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
