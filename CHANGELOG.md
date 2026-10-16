# Changelog

Notable changes to Scratch Sheet, newest first. Downloads are on the [Releases](https://github.com/sleetcrash/scratchsheet/releases) page.

## 0.1.1 (2026-10-15)

- Fixed: Save keeps every formula that was filled down or pasted across a range. In 0.1.0, only the first cells of such a range kept their formula in the .xlsx, and the rest were saved as plain values.

[Release notes and download](https://github.com/sleetcrash/scratchsheet/releases/tag/v0.1.1)

## 0.1.0 (2026-10-15)

First release.

- Floating, always-on-top spreadsheet with no title bar. Move it with the corner tab or by holding Ctrl and dragging; resize from any edge.
- Global show and hide hotkey, Ctrl+Alt+Space by default, changeable in `config.json`.
- Lives in the system tray and, after the first launch, starts hidden at login. The tray menu holds Show / Hide, Always on top, Dark mode, Launch at startup, Open data folder, Edit config, and Quit.
- Full formula engine from Univer, number formats, bold and italic, text and fill colors, borders, merged cells, and conditional formatting.
- Three floating tool circles: text tools, number tools with a format painter, and grid tools.
- Right-click menu for number formats and alignment.
- Corner strip with an Always on top pin, a dark or light mode toggle, one-click Clear (undo with Ctrl+Z), Save, and hide to tray.
- Save exports an .xlsx with values, formulas, number formats, bold and italic, font sizes, text and fill colors, borders, merged cells, and column widths.
- Autosave with atomic writes, including scroll position and active cell.
- Arrow keys point at cells while you type a formula, and they stop at the sheet edges instead of wrapping around.
- Per-user Windows installer with no admin prompt.

[Release notes and download](https://github.com/sleetcrash/scratchsheet/releases/tag/v0.1.0)
