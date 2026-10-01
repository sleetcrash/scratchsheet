# Scratch Sheet

A floating, always-on-top spreadsheet post-it for quick math on Windows.

It sits in the system tray, pops up on a global hotkey, and behaves like a tiny Google Sheet: formulas, number formats, bold, cell highlights, arrow-key navigation, scrollbars, copy and paste. Everything autosaves and reopens exactly where you left it, so you can keep scrolling down to fresh space forever.

## Features

- Frameless, resizable window with a Windows Terminal style header bar that doubles as the drag handle
- Full formula engine (Univer): `SUM`, `AVERAGE`, `IF`, `ROUND`, `VLOOKUP`, `CONCATENATE` and hundreds more
- Typing `$12,133` or `5.7%` keeps the number and applies the format, like Sheets
- Formatting toolbar: undo, redo, bold, italic, text color, fill, borders, align, number format (General, Number, Percent, Currency, Date and more), quick `%` and `$`, add or remove decimals
- Title bar actions: **Copy all** (tab-separated, pastes straight into Sheets or Excel), **Save** (.xlsx), **Clear** (two-step, undoable with Ctrl+Z)
- Global show/hide hotkey, default `Ctrl+Alt+Space`
- Launches at login, hidden in the tray. Close and minimize both hide to the tray. Quit is in the tray menu
- Dark mode by default, light mode in the tray menu
- Autosave with atomic writes, including scroll position and active cell

## Setup

```powershell
npm install
npm run build        # builds the renderer and packages release\win-unpacked\Scratch Sheet.exe
```

Run `release\win-unpacked\Scratch Sheet.exe` once. It registers itself to launch at login (hidden) and from then on you only need the hotkey.

### Hotkey on a Logitech G key

G keys only send whatever G HUB assigns them, so map a G key to the combo `Ctrl+Alt+Space` in G HUB. To change the combo, open the tray menu, pick **Edit config**, change `hotkey` (Electron accelerator syntax, e.g. `Control+Shift+F12`), and restart the app.

## Development

```powershell
npm run dev          # vite build + electron .
npm test             # runs the DevTools Protocol smoke test against a running instance started with --remote-debugging-port=9222
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
