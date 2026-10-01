// Scratch Sheet - renderer
// Univer grid + a thin toolbar. Autosaves every change to disk through the preload bridge.

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';

const api = window.scratch;

const SHEET_ID = 'sheet1';
const ROWS = 1000;
const COLS = 26;

const HIGHLIGHTS = [
  '#fde68a', '#fca5a5', '#86efac', '#93c5fd', '#d8b4fe',
  '#fdba74', '#f9a8d4', '#5eead4', '#cbd5e1', null,
];
let currentFill = HIGHLIGHTS[0];

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
      toolbar: false,
      footer: false,
      formulaBar: true,
      contextMenu: true,
    }),
  ],
});

// Exposed for debugging / automated tests only.
window.univerAPI = univerAPI;

const saved = await api.loadSheet();
const workbookData = saved && saved.sheets ? saved : freshWorkbook();
univerAPI.createWorkbook(workbookData);

// Restore where the user was last working once the grid has rendered.
univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
  if (stage !== univerAPI.Enum.LifecycleStages.Rendered) return;
  restorePosition(saved && saved.__scratch);
});

// Autosave on every mutation (cell edits, formatting, row/col changes, undo/redo).
const scheduleSave = debounce(persist, 350);
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (ev) => {
  if (ev.type === univerAPI.Enum.CommandType?.MUTATION || ev.type === 2) scheduleSave();
});

window.addEventListener('beforeunload', () => persist());
api.onShown(() => focusGrid());
api.onConfigChanged((cfg) => {
  applyTheme(cfg);
  univerAPI.toggleDarkMode(!!cfg.darkMode);
});

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
  // Univer listens on the container's canvas; focusing the container is enough for arrow keys.
  const el = document.querySelector('#sheet canvas') || $('sheet');
  if (el && el.focus) el.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Toolbar actions
// ---------------------------------------------------------------------------
function activeRange() {
  const ws = univerAPI.getActiveWorkbook()?.getActiveSheet();
  return ws?.getSelection()?.getActiveRange() || null;
}

$('btn-bold').addEventListener('click', () => {
  const r = activeRange();
  if (!r) return;
  const style = r.getCellStyleData?.();
  const isBold = !!(style && style.bl === 1);
  r.setFontWeight(isBold ? 'normal' : 'bold');
  focusGrid();
});

$('btn-fill').addEventListener('click', () => applyFill(currentFill));

$('btn-fill-more').addEventListener('click', (e) => {
  e.stopPropagation();
  const pal = $('fill-palette');
  pal.hidden = !pal.hidden;
});

(function buildPalette() {
  const pal = $('fill-palette');
  for (const color of HIGHLIGHTS) {
    const b = document.createElement('button');
    b.type = 'button';
    if (color) {
      b.style.background = color;
      b.title = color;
    } else {
      b.className = 'none';
      b.title = 'Remove highlight';
    }
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (color) {
        currentFill = color;
        $('fill-swatch').style.background = color;
      }
      applyFill(color);
      pal.hidden = true;
    });
    pal.appendChild(b);
  }
  document.addEventListener('click', () => { pal.hidden = true; });
})();

function applyFill(color) {
  const r = activeRange();
  if (!r) return;
  if (color) {
    const current = r.getBackground?.();
    // Clicking the same color again toggles it off.
    if (current && current.toLowerCase() === color.toLowerCase()) r.setBackground(null);
    else r.setBackground(color);
  } else {
    r.setBackground(null);
  }
  focusGrid();
}

$('btn-copy').addEventListener('click', async () => {
  try {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    const data = ws.getDataRange();
    const rows = data.getDisplayValues();
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
    btn.textContent = 'Sure?';
    clearArmTimer = setTimeout(disarmClear, 3000);
    return;
  }
  disarmClear();
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
  btn.textContent = 'Clear';
}

$('btn-pin').addEventListener('click', () => api.togglePin());
$('btn-min').addEventListener('click', () => api.hide());
$('btn-close').addEventListener('click', () => api.hide());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function applyTheme(cfg) {
  document.documentElement.dataset.theme = cfg.darkMode ? 'dark' : 'light';
  $('btn-pin').classList.toggle('is-on', !!cfg.alwaysOnTop);
  $('btn-pin').title = cfg.alwaysOnTop ? 'Always on top: on' : 'Always on top: off';
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
