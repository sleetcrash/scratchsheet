// Scratch Sheet - renderer
// Univer grid, a corner strip, and three floating format circles. Autosaves every change to disk
// through the preload bridge.

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { IEditorService, matchRefDrawToken, UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import sheetsCfEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US';
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css';

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
  // What stays is split across the floating circles (see the data-fmt-open rules in style.css): font size -/+,
  // text color, fill | %, $, decimals, date | conditional formatting, borders, merge.
  // Bold/italic are Ctrl+B / Ctrl+I, undo/redo are Ctrl+Z / Ctrl+Y, number format + alignment
  // live in the right-click menu (see registerContextMenus).
  'univer.command.undo',
  'univer.command.redo',
  'ui.operation.activate-format-painter',
  'ui.command.clear-formatting',
  'sheet.menu.paste',
  'sheet.command.set-range-font-family',
  'sheet.command.set-range-fontsize',
  'sheet.command.set-range-bold',
  'sheet.command.set-range-italic',
  'sheet.command.set-range-underline',
  'sheet.command.set-range-stroke',
  'sheet.command.set-horizontal-text-align',
  'sheet.command.set-vertical-text-align',
  'sheet.command.set-text-wrap',
  'sheet.command.set-shrink-to-fit',
  'sheet.command.set-text-rotation',
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
  // Conditional formatting quick-insert buttons; its dropdown covers data bars and icon sets
  'sheet.command.add-data-bar-conditional-rule',
  'sheet.command.add-icon-set-conditional-rule',
];

const DATE_FORMAT = 'm/d/yyyy';

// Right-click menu additions (replaces the toolbar's number-format dropdown and align button).
const NUMBER_FORMATS = [
  ['Automatic', 'General'],
  ['Number', '#,##0.00'],
  ['Percent', '0.00%'],
  ['Currency', '$#,##0.00'],
  ['Currency (rounded)', '$#,##0'],
  null,
  ['Date', DATE_FORMAT],
  ['Time', 'h:mm AM/PM'],
  ['Date time', 'm/d/yyyy h:mm'],
  null,
  ['Plain text', '@'],
];


const $ = (id) => document.getElementById(id);
const sheetEl = $('sheet');

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const config = await api.getConfig();
applyConfig(config);

const { univer, univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS, sheetsCfEnUS) },
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
    UniverSheetsConditionalFormattingPreset(),
  ],
});

// Exposed for debugging / automated tests only.
window.univerAPI = univerAPI;

registerContextMenus();
registerToolbarMenus();
pointLikeSheets();

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
  // The snapshot's rowHeader.width is not honored reliably; set it through the UI facade.
  try { univerAPI.getActiveWorkbook().getActiveSheet().setRowHeaderWidth(ROW_HEADER_W); } catch (err) { console.warn('row header width', err); }
  restorePosition(saved && saved.__scratch);
  watchSidebar();
});

// Autosave on every mutation (cell edits, formatting, row/col changes, undo/redo).
const scheduleSave = debounce(persist, 350);
univerAPI.addEvent(univerAPI.Event.CommandExecuted, (ev) => {
  if (ev.type === univerAPI.Enum.CommandType.MUTATION) scheduleSave();
});

window.addEventListener('beforeunload', () => persist());
api.onShown(() => focusGrid());
api.onConfigChanged((cfg) => {
  applyConfig(cfg);
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

// Toolbar addition: a Date button in the number group.
function registerToolbarMenus() {
  univerAPI.createMenu({
    id: 'scratch.numfmt.date',
    title: 'Date',
    action: () => { const r = activeRange(); if (r) r.setNumberFormat(DATE_FORMAT); focusGrid(); },
  }).appendTo('ribbon.start.number');
}

// ---------------------------------------------------------------------------
// Univer fixes (plus patches/, which stops arrow keys wrapping around the sheet's edges)
// ---------------------------------------------------------------------------
// Arrow keys point at cells while typing a formula, as in Google Sheets. Univer 1.0.3 moved the real
// cell cursor on the first arrow (so Enter and Esc landed on the wrong cell) and grew a reference typed
// after an operator from the previous reference instead of from the cell being edited.
function pointLikeSheets() {
  const editorService = univer.__getInjector().get(IEditorService);
  // The editor cursor sits where a new reference goes: right after =, (, an operator or a comma.
  const addingReference = () => {
    const editor = editorService.getFocusEditor();
    const text = editor?.getDocumentDataModel()?.getBody()?.dataStream;
    const cursor = editor?.getSelectionRanges()?.[0];
    return !!text && !!cursor?.collapsed && matchRefDrawToken(text[cursor.startOffset - 1] ?? '');
  };
  univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, ({ id, params }) => {
    if (params?.extra !== 'formula-editor') return;
    // fromCurrentSelection: start from the real selection (the edited cell) rather than the last reference
    if (id === 'sheet.command.move-selection') params.fromCurrentSelection ||= addingReference();
    // and write the move to the formula's references only, never to the real selection
    else if (id === 'sheet.operation.set-selections') params.fromCurrentSelection = false;
  });
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
        rowHeader: { width: 48 },
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

// Row-number column width; the name box above it is given the same width in CSS (--row-header-w).
const ROW_HEADER_W = 48;

function applyGridlinesToSnapshot(snapshot, dark) {
  for (const sheet of Object.values(snapshot.sheets || {})) {
    sheet.showGridlines = 1;
    sheet.gridlinesColor = dark ? GRIDLINES.dark : GRIDLINES.light;
    sheet.rowHeader = { ...(sheet.rowHeader || {}), width: ROW_HEADER_W };
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
// Floating circles (dragged as a group; each opens its own set of format tools)
// ---------------------------------------------------------------------------
const fab = $('fab');
const FAB_POS_KEY = 'scratch.fab';
// Which pill each circle opens: Univer's one toolbar, filtered in CSS by #sheet[data-fmt-open].
const PILLS = { text: $('fab-text'), number: $('fab-number'), cells: $('fab-cells') };
const FAB_SIZE = 36;          // one circle
const FAB_GAP = 8;
const FAB_CLUSTER_W = Object.keys(PILLS).length * (FAB_SIZE + FAB_GAP) - FAB_GAP;  // circles side by side
const FAB_MARGIN = 8;

function placeFab(x, y) {
  const maxX = window.innerWidth - FAB_CLUSTER_W - FAB_MARGIN;
  const maxY = window.innerHeight - FAB_SIZE - FAB_MARGIN;
  x = Math.min(Math.max(FAB_MARGIN, x), Math.max(FAB_MARGIN, maxX));
  y = Math.min(Math.max(FAB_MARGIN, y), Math.max(FAB_MARGIN, maxY));
  fab.style.left = `${x}px`;
  fab.style.top = `${y}px`;
  // The pill opens toward the side with more room.
  fab.classList.toggle('align-left', x + FAB_CLUSTER_W / 2 < window.innerWidth / 2);
  if (openPill()) positionFormatPill();
}

// Stored as fractions of the window so the circles keep their corner when the note is resized.
function loadFabPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
    if (saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
      placeFab(saved.fx * window.innerWidth, saved.fy * window.innerHeight);
      return;
    }
  } catch { /* ignore */ }
  placeFab(window.innerWidth - FAB_CLUSTER_W - 22, window.innerHeight - FAB_SIZE - 22);
}

function saveFabPosition() {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ fx: fab.offsetLeft / window.innerWidth, fy: fab.offsetTop / window.innerHeight }));
  } catch { /* ignore */ }
}

// Univer's right sidebar (conditional formatting rules) opens beside the grid. While it is open the
// corner strip sits over it instead of the formula bar, and the pill gets out of its way.
function watchSidebar() {
  const sidebar = sheetEl.querySelector('[data-u-comp="right-sidebar"]');
  if (!sidebar) return;
  new ResizeObserver(() => {
    const open = sidebar.offsetWidth > 0;
    sheetEl.toggleAttribute('data-sidebar-open', open);
    if (open) showPill(null);
  }).observe(sidebar);
}

// Univer's toolbar floats as a pill beside the circles.
function headerbar() { return sheetEl.querySelector('[data-u-comp="headerbar"]'); }

function positionFormatPill() {
  const bar = headerbar();
  if (!bar) return;
  const pillW = bar.offsetWidth;
  const pillH = bar.offsetHeight;
  const gap = 10;
  const rightSide = fab.classList.contains('align-left');
  let x = rightSide ? fab.offsetLeft + FAB_CLUSTER_W + gap : fab.offsetLeft - gap - pillW;
  let y = fab.offsetTop + (FAB_SIZE - pillH) / 2;
  // Fall back to above/below the circles when there is no room beside them.
  if (x < 4 || x + pillW > window.innerWidth - 4) {
    x = Math.min(Math.max(4, fab.offsetLeft + FAB_CLUSTER_W / 2 - pillW / 2), window.innerWidth - 4 - pillW);
    y = fab.offsetTop > window.innerHeight / 2 ? fab.offsetTop - gap - pillH : fab.offsetTop + FAB_SIZE + gap;
  }
  y = Math.min(Math.max(4, y), window.innerHeight - 4 - pillH);
  bar.style.left = `${Math.round(x)}px`;
  bar.style.top = `${Math.round(y)}px`;
}

function openPill() { return sheetEl.dataset.fmtOpen || null; }

// kind: a PILLS key, or null to close.
function showPill(kind) {
  if (kind) sheetEl.dataset.fmtOpen = kind;
  else delete sheetEl.dataset.fmtOpen;
  for (const [k, circle] of Object.entries(PILLS)) circle.classList.toggle('is-open', k === kind);
  if (kind) positionFormatPill();
}

// Drag any circle to move the group; a click (no real movement) toggles that circle's pill.
function wireFabCircle(kind) {
  const circle = PILLS[kind];
  let drag = null;
  circle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: fab.offsetLeft, top: fab.offsetTop, moved: false };
    circle.setPointerCapture(e.pointerId);
  });
  circle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; showPill(null); }
    placeFab(drag.left + dx, drag.top + dy);
  });
  const end = (e) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    try { circle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDrag) saveFabPosition();
    else showPill(openPill() === kind ? null : kind);
  };
  circle.addEventListener('pointerup', end);
  circle.addEventListener('pointercancel', end);
}
for (const kind of Object.keys(PILLS)) wireFabCircle(kind);

document.addEventListener('pointerdown', (e) => {
  const bar = headerbar();
  if (openPill() && !fab.contains(e.target) && !(bar && bar.contains(e.target))
      && !e.target.closest('[data-radix-popper-content-wrapper], .univer-popup, [role="menu"]')) {
    showPill(null);
  }
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') showPill(null);
});
window.addEventListener('resize', () => { showPill(null); loadFabPosition(); });
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
// Corner actions
// ---------------------------------------------------------------------------
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

// One click wipes the sheet; Ctrl+Z brings it back.
$('btn-clear').addEventListener('click', () => {
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

$('btn-pin').addEventListener('click', () => api.togglePin());
$('btn-theme').addEventListener('click', () => api.toggleTheme());
$('btn-hide').addEventListener('click', () => api.hide());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function applyConfig(cfg) {
  document.documentElement.dataset.theme = cfg.darkMode ? 'dark' : 'light';
  const pin = $('btn-pin');
  pin.classList.toggle('is-on', !!cfg.alwaysOnTop);
  pin.setAttribute('aria-pressed', String(!!cfg.alwaysOnTop));
  // The theme button shows the mode it switches to.
  const theme = $('btn-theme');
  theme.querySelector('.ico').className = `ico ${cfg.darkMode ? 'ico-light' : 'ico-dark'}`;
  theme.setAttribute('aria-label', cfg.darkMode ? 'Light mode' : 'Dark mode');
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
