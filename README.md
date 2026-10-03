# Scratch Sheet

A floating, always-on-top spreadsheet post-it for quick math on Windows.

It sits in the system tray, pops up on a global hotkey, and behaves like a tiny Google Sheet: formulas, number formats, bold, cell highlights, arrow-key navigation, scrollbars, copy and paste. Everything autosaves and reopens exactly where you left it, so you can keep scrolling down to fresh space forever.

## Features

- No title bar at all. Hold **Ctrl** and drag anywhere on the sheet to move the window; resize from any edge
- Full formula engine (Univer): `SUM`, `AVERAGE`, `IF`, `ROUND`, `VLOOKUP`, `CONCATENATE` and hundreds more
- Typing `$12,133` or `5.7%` keeps the number and applies the format, like Sheets
- Formula bar like Sheets: `A1`, `fx`, the formula. Top-right corner holds **Save**, **Clear**, and **×** (hide to tray)
- Right-click a cell for **Number format** (Automatic, Number, Percent, Currency, Date, Time, Plain text) and **Align**
- Bold, italic, undo, redo are keyboard only: Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+Y
- Two floating circles you can drag anywhere: the menu (**Copy all**, theme, always on top, quit) and the format tools (paint bucket, `%`, `$`, `.0←`, `.00→`)
- Global show/hide hotkey, default `Ctrl+Alt+Space`
- Launches at login, hidden in the tray. Close and minimize both hide to the tray. Quit is in the tray menu
- Dark mode by default; switch in the floating menu or the tray menu
- Autosave with atomic writes, including scroll position and active cell

## Setup

```powershell
npm install
npm run build        # builds the renderer and the installer: release\Scratch Sheet Setup <version>.exe
```

Run the installer once. It is a per-user install (no admin prompt) into `%LOCALAPPDATA%\Programs\scratchsheet`, adds a Start Menu entry and an uninstaller under Settings > Apps. On first launch the app registers itself to start hidden at login; after that you only need the hotkey. Your sheet lives in `%APPDATA%\Scratch Sheet\` and survives reinstalls and uninstalls.

To update: quit from the tray, run the new installer, start it from the Start Menu.

### Hotkey on a Logitech G key

G keys only send whatever G HUB assigns them, so map a G key to the combo `Ctrl+Alt+Space` in G HUB. To change the combo, open the tray menu, pick **Edit config**, change `hotkey` (Electron accelerator syntax, e.g. `Control+Shift+F12`), and restart the app.

## Development

```powershell
npm run dev          # vite build + electron .
npm run build:dir    # unpacked build in release\win-unpacked (no installer)
npm test             # DevTools Protocol smoke test against an instance started with --remote-debugging-port=9222
# QUIET=1 never shows the window (skips right-click steps); SKIP_CLIPBOARD=1 skips the Copy-all check
```

Data lives in `%APPDATA%\Scratch Sheet\`: `config.json` (hotkey, theme, window bounds, always-on-top, launch-at-login) and `sheet.json` (the sheet snapshot).

## Layout

```
electron/main.js     window, tray, hotkey, IPC, login item
electron/preload.js  contextBridge API exposed as window.scratch
electron/export.js   snapshot -> .xlsx (ExcelJS), pure Node
src/                 renderer: Univer grid, toolbar, autosave
build/make-icon.js   generates build/icon.png with no dependencies
test/                CDP smoke and restart tests
```

## Stack

Electron 44, Univer 1.x (Apache 2.0), Vite 8, ExcelJS 4, electron-builder 26.
