// XLSX export from a Univer workbook snapshot.
// Pure Node (no Electron) so it can be unit-tested directly.
// Carries over: values, formulas, bold, italic, font size, text color, fill color, borders, number format,
// merged cells, column widths. Conditional formatting rules are not exported.

const ExcelJS = require('exceljs');

// Univer's BorderStyleTypes (NONE = 0 ... THICK = 13) in order, as ExcelJS border style names.
const BORDER_STYLES = [null, 'thin', 'hair', 'dotted', 'dashed', 'dashDot', 'dashDotDot', 'double', 'medium',
  'mediumDashed', 'mediumDashDot', 'mediumDashDotDot', 'slantDashDot', 'thick'];
const BORDER_SIDES = { t: 'top', b: 'bottom', l: 'left', r: 'right' };

async function exportXlsx(snapshot, filePath) {
  const wb = buildWorkbook(snapshot);
  await wb.xlsx.writeFile(filePath);
}

function buildWorkbook(snapshot) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scratch Sheet';
  const styles = (snapshot && snapshot.styles) || {};
  const sheets = (snapshot && snapshot.sheets) || {};
  const order = (snapshot && snapshot.sheetOrder) || Object.keys(sheets);

  for (const sheetId of order) {
    const sheet = sheets[sheetId];
    if (!sheet) continue;
    const ws = wb.addWorksheet(sheet.name || 'Sheet1');
    const cellData = sheet.cellData || {};

    for (const r of Object.keys(cellData)) {
      const row = cellData[r];
      if (!row) continue;
      for (const c of Object.keys(row)) {
        const cell = row[c];
        if (!cell) continue;
        const hasValue = cell.v !== undefined && cell.v !== null && cell.v !== '';
        const hasFormula = typeof cell.f === 'string' && cell.f.startsWith('=');
        const style = typeof cell.s === 'string' ? styles[cell.s] : cell.s;
        if (!hasValue && !hasFormula && !style) continue;

        const xc = ws.getCell(Number(r) + 1, Number(c) + 1);
        if (hasFormula) {
          xc.value = { formula: cell.f.slice(1), result: hasValue ? cell.v : undefined };
        } else if (hasValue) {
          xc.value = cell.v;
        }
        if (style) {
          if (style.bl === 1) xc.font = { ...(xc.font || {}), bold: true };
          if (style.it === 1) xc.font = { ...(xc.font || {}), italic: true };
          if (style.fs) xc.font = { ...(xc.font || {}), size: style.fs };
          const cl = style.cl && style.cl.rgb;
          if (cl) xc.font = { ...(xc.font || {}), color: { argb: toArgb(cl) } };
          const bg = style.bg && style.bg.rgb;
          if (bg) {
            xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(bg) } };
          }
          if (style.bd) {
            const border = {};
            for (const [side, name] of Object.entries(BORDER_SIDES)) {
              const b = style.bd[side];
              const excelStyle = b && BORDER_STYLES[b.s];
              if (excelStyle) border[name] = { style: excelStyle, color: { argb: toArgb((b.cl && b.cl.rgb) || '#000000') } };
            }
            if (Object.keys(border).length) xc.border = border;
          }
          const pattern = style.n && style.n.pattern;
          if (pattern && pattern !== 'General') xc.numFmt = pattern;
        }
      }
    }

    // WithoutStyle: plain mergeCells copies the top-left cell's style over the others, dropping the
    // right and bottom edges of a border drawn around the merged range.
    for (const m of sheet.mergeData || []) {
      ws.mergeCellsWithoutStyle(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1);
    }

    // Column widths (Univer px -> Excel character units, roughly px / 7)
    const colData = sheet.columnData || {};
    for (const c of Object.keys(colData)) {
      const w = colData[c] && colData[c].w;
      if (w) ws.getColumn(Number(c) + 1).width = Math.max(4, Math.round(w / 7));
    }
  }
  return wb;
}

function toArgb(color) {
  // Accepts #rgb, #rrggbb, rgb(r,g,b)
  let hex = String(color).trim();
  const m = hex.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) hex = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  return ('FF' + hex.slice(0, 6)).toUpperCase();
}

module.exports = { exportXlsx, buildWorkbook, toArgb };
