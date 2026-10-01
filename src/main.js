// Scratch Sheet - renderer
// Univer grid + its formatting toolbar, plus a thin title bar. Autosaves every change to disk
// through the preload bridge.

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';

const api = window.scratch;

const SHEET_ID = 'sheet1';
const ROWS = 1000;
const COLS = 26;

// Gridline colors tuned so cell borders are clearly visible on each theme.
const GRIDLINES = { dark: '#4b5563', light: '#c3c8d0' };
const SET_GRIDLINES_COLOR_CMD = 'sheet.command.set-gridlines-color';

// Univer's cell editor stamps this explicit text color on every typed cell, which is
// black-on-black in dark mode. We strip it so cells use the theme's default text color.
const EDITOR_TEXT_COLOR = '#1b1c1f';

// Toolbar items we do not need on a scratch pad. Everything else in Univer's toolbar stays
// (undo/redo, font, bold/italic/underline/strike, text + fill color, borders, merge, align,
// wrap, number format, format painter...).
const HIDDEN_MENU_ITEMS = [
  // Only fill, %, $, and the two decimal buttons stay in the toolbar. Bold/italic are
  // Ctrl+B / Ctrl+I, undo/redo are Ctrl+Z / Ctrl+Y, number format + alignment live in
  // the right-click menu (see registerContextMenus).
  'univer.command.undo',
  'univer.command.redo',
  'ui.operation.activate-format-painter',
  'ui.command.clear-formatting',
  'sheet.menu.paste',
  'sheet.command.set-range-font-family',
  'sheet.command.set-range-fontsize',
  'sheet.command.set-range-font-increase',
  'sheet.command.set-range-font-decrease',
  'sheet.command.set-range-bold',
  'sheet.command.set-range-italic',
  'sheet.command.set-range-underline',
  'sheet.command.set-range-stroke',
  'sheet.command.set-range-text-color',
  'sheet.command.set-border-basic',
  'sheet.command.set-horizontal-text-align',
  'sheet.command.set-vertical-text-align',
  'sheet.command.set-text-wrap',
  'sheet.command.set-shrink-to-fit',
  'sheet.command.set-text-rotation',
  'sheet.command.add-worksheet-merge',
  'sheet.operation.open.numfmt.panel',
  'ui.operation.open-feature-search',
  'formula-ui.operation.insert-function.common',
  'formula-ui.operation.insert-function.financial',
  'formula-ui.operation.insert-function.logical',
  'formula-ui.operation.insert-function.text',
  'formula-ui.operation.insert-function.date',
  'formula-ui.operation.insert-function.lookup',
  'formula-ui.operation.insert-function.math',
  'formula-ui.operation.insert-function.statistical',
  'formula-ui.operation.insert-function.engineering',
  'formula-ui.operation.insert-function.information',
  'formula-ui.operation.insert-function.database',
  'sheet.toolbar.sheet-frozen',
  'sheet.command.toggle-gridlines',
  'sheet.command.add-range-protection-from-toolbar',
  'sheet.menu.zoom-ratio',
  'sheet.command.set-zoom-ratio-from-toolbar',
  'base-ui.operation.toggle-fullscreen',
  'base-ui.operation.toggle-shortcut-panel',
];

// Right-click menu additions (replaces the toolbar's number-format dropdown and align button).
const NUMBER_FORMATS = [
  ['Automatic', 'General'],
  ['Number', '#,##0.00'],
  ['Percent', '0.00%'],
  ['Currency', '$#,##0.00'],
  ['Currency (rounded)', '$#,##0'],
  null,
  ['Date', 'm/d/yyyy'],
  ['Time', 'h:mm AM/PM'],
  ['Date time', 'm/d/yyyy h:mm'],
  null,
  ['Plain text', '@'],
];

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const config = await api.getConfig();
applyTheme(config);

const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS) },
  darkMode: !!config.darkMode,
  presets: [
    UniverSheetsCorePreset({
      container: 'sheet',
      header: true,
      toolbar: true,
      ribbonType: 'simple',
      footer: false,
      formulaBar: true,
      contextMenu: true,
      menu: Object.fromEntries(HIDDEN_MENU_ITEMS.map((id) => [id, { hidden: true }])),
    }),
  ],
});

// Exposed for debugging / automated tests only.
window.univerAPI = univerAPI;

registerContextMenus();

const saved = await api.loadSheet();
const workbookData = saved && saved.sheets ? saved : freshWorkbook();
applyGridlinesToSnapshot(workbookData, config.darkMode);
stripEditorTextColorFromSnapshot(workbookData);
univerAPI.createWorkbook(workbookData);

// Strip the editor's forced text color before each cell write lands.
univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (ev) => {
  if (ev.id === 'sheet.command.set-range-values' && ev.params) stripEditorTextColor(ev.params.value);
});

// Restore where the user was last working once the grid has rendered.
univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
  if (stage !== univerAPI.Enum.LifecycleStages.Rendered) return;
  restorePosition(saved && saved.__scratch);
});

// Autosave on every mutation (cell edits, formatting, row/col changes, undo/redo).
const scheduleSave = debounce(persist, 350);
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (ev) => {
  if (ev.type === univerAPI.Enum.CommandType.MUTATION) scheduleSave();
});

window.addEventListener('beforeunload', () => persist());
api.onShown(() => focusGrid());
api.onConfigChanged((cfg) => {
  applyTheme(cfg);
  univerAPI.toggleDarkMode(!!cfg.darkMode);
  setGridlinesColor(cfg.darkMode);
});

// ---------------------------------------------------------------------------
// Context menu: Number format + Align submenus
// ---------------------------------------------------------------------------
function activeRange() {
  return univerAPI.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange() || null;
}

function registerContextMenus() {
  const fmtMenu = univerAPI.createSubmenu({ id: 'scratch.number-format', title: 'Number format' });
  for (const entry of NUMBER_FORMATS) {
    if (!entry) { fmtMenu.addSeparator(); continue; }
    const [title, pattern] = entry;
    fmtMenu.addSubmenu(univerAPI.createMenu({
      id: `scratch.number-format.${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title,
      action: () => { const r = activeRange(); if (r) r.setNumberFormat(pattern); focusGrid(); },
    }));
  }
  fmtMenu.appendTo('contextMenu.format');

  const H = univerAPI.Enum.HorizontalAlign;
  const alignMenu = univerAPI.createSubmenu({ id: 'scratch.align', title: 'Align' });
  for (const [title, value] of [['Left', H.LEFT], ['Center', H.CENTER], ['Right', H.RIGHT]]) {
    alignMenu.addSubmenu(univerAPI.createMenu({
      id: `scratch.align.${title.toLowerCase()}`,
      title,
      action: () => { univerAPI.executeCommand('sheet.command.set-horizontal-text-align', { value }); focusGrid(); },
    }));
  }
  alignMenu.appendTo('contextMenu.format');
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function freshWorkbook() {
  return {
    id: 'scratch-sheet',
    name: 'Scratch Sheet',
    appVersion: '1.0.0',
    locale: LocaleType.EN_US,
    sheetOrder: [SHEET_ID],
    styles: {},
    sheets: {
      [SHEET_ID]: {
        id: SHEET_ID,
        name: 'Sheet1',
        rowCount: ROWS,
        columnCount: COLS,
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        cellData: {},
        rowData: {},
        columnData: {},
        rowHeader: { width: 40 },
        columnHeader: { height: 22 },
        showGridlines: 1,
      },
    },
  };
}

function isEditorTextColor(style) {
  const rgb = style && style.cl && style.cl.rgb;
  return typeof rgb === 'string' && rgb.toLowerCase() === EDITOR_TEXT_COLOR;
}

// `value` is either a single ICellData or a {row: {col: ICellData}} matrix.
function stripEditorTextColor(value) {
  if (!value || typeof value !== 'object') return;
  const cells = ('v' in value || 's' in value || 'f' in value || 'p' in value)
    ? [value]
    : Object.values(value).flatMap((row) => (row && typeof row === 'object' ? Object.values(row) : []));
  for (const cell of cells) {
    // Only remove the color; keep the style object itself so Univer's number-format
    // detection (which runs inside the same command) can still attach its pattern to it.
    if (cell && cell.s && typeof cell.s === 'object' && isEditorTextColor(cell.s)) delete cell.s.cl;
  }
}

function stripEditorTextColorFromSnapshot(snapshot) {
  for (const style of Object.values(snapshot.styles || {})) {
    if (isEditorTextColor(style)) delete style.cl;
  }
  for (const sheet of Object.values(snapshot.sheets || {})) {
    for (const row of Object.values(sheet.cellData || {})) {
      for (const cell of Object.values(row || {})) {
        if (cell && cell.s && typeof cell.s === 'object' && isEditorTextColor(cell.s)) delete cell.s.cl;
      }
    }
  }
}

function applyGridlinesToSnapshot(snapshot, dark) {
  for (const sheet of Object.values(snapshot.sheets || {})) {
    sheet.showGridlines = 1;
    sheet.gridlinesColor = dark ? GRIDLINES.dark : GRIDLINES.light;
  }
}

function setGridlinesColor(dark) {
  try {
    const wb = univerAPI.getActiveWorkbook();
    const ws = wb?.getActiveSheet();
    if (!ws) return;
    univerAPI.executeCommand(SET_GRIDLINES_COLOR_CMD, {
      unitId: wb.getId(),
      subUnitId: ws.getSheetId(),
      color: dark ? GRIDLINES.dark : GRIDLINES.light,
    });
  } catch (err) {
    console.warn('gridline color update failed', err);
  }
}

let persistInFlight = false;
let persistQueued = false;
async function persist() {
  if (persistInFlight) { persistQueued = true; return; }
  persistInFlight = true;
  try {
    const wb = univerAPI.getActiveWorkbook();
    if (!wb) return;
    const snapshot = wb.save();
    snapshot.__scratch = currentPosition();
    await api.saveSheet(snapshot);
  } catch (err) {
    console.error('save failed', err);
    toast('Save failed', true);
  } finally {
    persistInFlight = false;
    if (persistQueued) { persistQueued = false; persist(); }
  }
}

function currentPosition() {
  try {
    const wb = univerAPI.getActiveWorkbook();
    const ws = wb.getActiveSheet();
    const range = ws.getSelection()?.getActiveRange();
    const scroll = wb.getScrollStateBySheetId?.(ws.getSheetId());
    return {
      row: range ? range.getRow() : 0,
      col: range ? range.getColumn() : 0,
      scrollRow: scroll ? scroll.sheetViewStartRow : 0,
      scrollCol: scroll ? scroll.sheetViewStartColumn : 0,
    };
  } catch {
    return null;
  }
}

function restorePosition(pos) {
  if (!pos) { focusGrid(); return; }
  try {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    ws.scrollToCell(pos.scrollRow || 0, pos.scrollCol || 0);
    ws.getRange(pos.row || 0, pos.col || 0).activate();
  } catch (err) {
    console.warn('restore position failed', err);
  }
  focusGrid();
}

function focusGrid() {
  // The formula bar is also a canvas, so pick the biggest one: that is the grid.
  const canvases = [...document.querySelectorAll('#sheet canvas')];
  const grid = canvases.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const el = grid || $('sheet');
  if (el && el.focus) el.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Floating action button (draggable, expands into the menu)
// ---------------------------------------------------------------------------
const fab = $('fab');
const fabMain = $('fab-main');
const fabMenu = $('fab-menu');
const FAB_POS_KEY = 'scratch.fab';

function placeFab(x, y) {
  const margin = 8;
  const w = fab.offsetWidth || 36;
  const h = fabMain.offsetHeight || 36;
  const maxX = window.innerWidth - w - margin;
  const maxY = window.innerHeight - h - margin;
  x = Math.min(Math.max(margin, x), Math.max(margin, maxX));
  y = Math.min(Math.max(margin, y), Math.max(margin, maxY));
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
  fab.style.left = `${x}px`;
  fab.style.top = `${y}px`;
  // Open the menu toward the side with room, and align it to the near edge.
  fab.classList.toggle('open-down', y < window.innerHeight / 2);
  fab.classList.toggle('align-left', x < window.innerWidth / 2);
}

function loadFabPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { placeFab(saved.x, saved.y); return; }
  } catch { /* ignore */ }
  placeFab(window.innerWidth - 36 - 22, window.innerHeight - 36 - 22);
}

function saveFabPosition() {
  try { localStorage.setItem(FAB_POS_KEY, JSON.stringify({ x: fab.offsetLeft, y: fab.offsetTop })); } catch { /* ignore */ }
}

function openFabMenu(open) {
  fabMenu.hidden = !open;
  fab.classList.toggle('open', open);
  if (open) {
    // Keep the expanded menu inside the window.
    const r = fabMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) fab.classList.add('align-left');
    if (r.left < 0) fab.classList.remove('align-left');
    if (r.bottom > window.innerHeight) fab.classList.remove('open-down');
    if (r.top < 0) fab.classList.add('open-down');
  }
}

// Drag the button; a click (no real movement) toggles the menu.
(function wireFabDrag() {
  let start = null;
  fabMain.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, left: fab.offsetLeft, top: fab.offsetTop, moved: false };
    fabMain.setPointerCapture(e.pointerId);
  });
  fabMain.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) { start.moved = true; openFabMenu(false); fab.classList.add('dragging'); }
    placeFab(start.left + dx, start.top + dy);
  });
  const finish = (e) => {
    if (!start) return;
    const wasDrag = start.moved;
    start = null;
    fab.classList.remove('dragging');
    try { fabMain.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDrag) saveFabPosition();
    else openFabMenu(fabMenu.hidden);
  };
  fabMain.addEventListener('pointerup', finish);
  fabMain.addEventListener('pointercancel', finish);
})();

document.addEventListener('pointerdown', (e) => {
  if (!fabMenu.hidden && !fab.contains(e.target)) openFabMenu(false);
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !fabMenu.hidden) openFabMenu(false);
});
window.addEventListener('resize', () => placeFab(fab.offsetLeft, fab.offsetTop));
loadFabPosition();

// ---------------------------------------------------------------------------
// Ctrl-drag: hold Ctrl and the whole sheet becomes a drag handle for the window
// ---------------------------------------------------------------------------
const dragOverlay = $('drag-overlay');
function setDragOverlay(on) {
  if (dragOverlay.hidden === !on) return;
  dragOverlay.hidden = !on;
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control' && !e.repeat) setDragOverlay(true);
}, true);
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') setDragOverlay(false);
}, true);
window.addEventListener('blur', () => setDragOverlay(false));

// ---------------------------------------------------------------------------
// Menu actions
// ---------------------------------------------------------------------------
$('btn-copy').addEventListener('click', async () => {
  openFabMenu(false);
  try {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    const rows = ws.getDataRange().getDisplayValues();
    const text = rows.map((row) => row.map((v) => (v ?? '').toString().replace(/\t/g, ' ')).join('\t')).join('\n');
    await api.writeClipboard(text);
    toast(text.trim() ? 'Copied whole sheet' : 'Sheet is empty');
  } catch (err) {
    console.error(err);
    toast('Copy failed', true);
  }
  focusGrid();
});

$('btn-save').addEventListener('click', async () => {
  openFabMenu(false);
  try {
    const snapshot = univerAPI.getActiveWorkbook().save();
    const res = await api.exportSheet(snapshot);
    if (res.ok) toast('Saved ' + res.filePath.split(/[\\/]/).pop());
    else if (!res.canceled) toast('Save failed: ' + res.error, true);
  } catch (err) {
    console.error(err);
    toast('Save failed', true);
  }
  focusGrid();
});

// Clear is two-step: first click arms it for 3 s, second click wipes. Undo (Ctrl+Z) still works after.
let clearArmTimer = null;
$('btn-clear').addEventListener('click', () => {
  const btn = $('btn-clear');
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.lastChild.textContent = 'Sure? Click again';
    clearArmTimer = setTimeout(disarmClear, 3000);
    return;
  }
  disarmClear();
  openFabMenu(false);
  try {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    ws.clear();
    ws.getRange(0, 0).activate();
    ws.scrollToCell(0, 0);
    toast('Cleared (Ctrl+Z to undo)');
  } catch (err) {
    console.error(err);
    toast('Clear failed', true);
  }
  focusGrid();
});
function disarmClear() {
  clearTimeout(clearArmTimer);
  const btn = $('btn-clear');
  btn.classList.remove('confirm');
  btn.lastChild.textContent = 'Clear';
}

$('btn-pin').addEventListener('click', () => api.togglePin());
$('btn-theme').addEventListener('click', () => api.toggleTheme());
$('btn-hide').addEventListener('click', () => { openFabMenu(false); api.hide(); });
$('btn-quit').addEventListener('click', () => api.quit());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function applyTheme(cfg) {
  document.documentElement.dataset.theme = cfg.darkMode ? 'dark' : 'light';
  $('btn-pin').classList.toggle('is-on', !!cfg.alwaysOnTop);
  $('btn-theme').querySelector('.fab-ico').innerHTML = cfg.darkMode ? '&#9788;' : '&#9790;';
  $('btn-theme').lastChild.textContent = cfg.darkMode ? 'Light mode' : 'Dark mode';
  if (cfg.hotkey) $('fab-hotkey').textContent = cfg.hotkey.replace(/Control/g, 'Ctrl').replace(/\+/g, '+');
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
