// Drives the running app over the Chrome DevTools Protocol (launch with --remote-debugging-port=9222).
// Usage: node test/cdp-smoke.js
// Uses Node's built-in WebSocket (Node 22+). No deps.

const PORT = process.env.CDP_PORT || 9222;

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /Scratch Sheet/.test(t.title)) || targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  };

  // --- Mouse-driven steps (right-click menu) need the window on screen and on top.
  // QUIET=1 skips those steps and never shows or pins the window (the user is at the PC).
  const QUIET = !!process.env.QUIET;
  const startCfg = await evaluate('window.scratch.getConfig()');
  let restorePin = async () => {};
  if (!QUIET) {
    if (!startCfg.alwaysOnTop) { await evaluate('void window.scratch.togglePin()'); await sleep(300); }
    if (await evaluate('document.visibilityState') === 'hidden') {
      const { execSync: run } = require('node:child_process');
      run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${require('node:path').join(__dirname, 'send-hotkey.ps1')}"`);
      await sleep(900);
    }
    check('window visible', await evaluate('document.visibilityState') === 'visible');
    restorePin = async () => { if (!startCfg.alwaysOnTop) await evaluate('void window.scratch.togglePin()'); };
  }

  // --- Baseline
  const title = await evaluate('document.title');
  check('page title', title === 'Scratch Sheet', title);
  check('univerAPI exposed', await evaluate('typeof window.univerAPI === "object"'));
  check('no title bar', await evaluate('!document.getElementById("titlebar")'));
  check('name box visible (A1)', await evaluate('(() => { const e = document.querySelector("[data-u-comp=defined-name]"); return !!e && e.getBoundingClientRect().width > 30; })()'));
  check('fx label visible, x/check hidden', await evaluate('(() => { const kids = [...document.querySelector("[data-u-comp=formula-bar-actions]").children]; const vis = kids.map(k => k.getBoundingClientRect().width > 0); return vis.length >= 3 && !vis[0] && !vis[1] && vis[vis.length - 1]; })()'));
  // Ctrl held -> drag overlay appears; released -> gone
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  await sleep(100);
  check('ctrl shows drag overlay', await evaluate('!document.getElementById("drag-overlay").hidden'));
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  await sleep(100);
  check('ctrl release hides drag overlay', await evaluate('document.getElementById("drag-overlay").hidden'));
  check('name box right edge = row header edge', await evaluate('(() => { const r = document.querySelector("[data-u-comp=defined-name] input").getBoundingClientRect().right; const w = univerAPI.getActiveWorkbook().getActiveSheet().getSkeleton().rowHeaderWidth; return Math.abs(r - w) < 0.5; })()'));
  check('three circles float: palette, 123, cells', await evaluate('[...document.getElementById("fab").children].map(c => c.id).join() === "fab-text,fab-number,fab-cells" && !document.getElementById("fab-menu")'));
  check('corner order: pin, theme, Clear, Save, x', await evaluate('[...document.getElementById("corner").children].map(c => c.id).join()') === 'btn-pin,btn-theme,btn-clear,btn-save,btn-hide');
  check('no hover tooltips on our controls', await evaluate('document.querySelectorAll("body > :not(#sheet) [title], body > [title]").length === 0'));
  check('formula bar reserves the corner width', await evaluate('parseFloat(getComputedStyle(document.querySelector("[data-u-comp=formula-bar]")).paddingRight) >= document.getElementById("corner").getBoundingClientRect().width'));
  // Pin button flips always-on-top and its pressed state, then back
  const pinBefore = (await evaluate('window.scratch.getConfig()')).alwaysOnTop;
  await evaluate(`document.getElementById('btn-pin').click()`);
  await sleep(300);
  check('pin button flips always on top', (await evaluate('window.scratch.getConfig()')).alwaysOnTop === !pinBefore);
  check('pin button pressed state follows', await evaluate('document.getElementById("btn-pin").getAttribute("aria-pressed")') === String(!pinBefore));
  await evaluate(`document.getElementById('btn-pin').click()`);
  await sleep(300);
  check('pin button flips back', (await evaluate('window.scratch.getConfig()')).alwaysOnTop === pinBefore);
  check('drag handle is a tab in the bottom-right corner', await evaluate('(() => { const el = document.getElementById("drag-handle"); const r = el.getBoundingClientRect(); return Math.abs(r.bottom - window.innerHeight) < 1 && Math.abs(r.right - window.innerWidth) < 1 && getComputedStyle(el).borderTopLeftRadius === "100%"; })()'));
  check('drag handle drags the window', await evaluate('getComputedStyle(document.getElementById("drag-handle")).webkitAppRegion') === 'drag');
  check('drag handle and all circles share the inverse colors', await evaluate('(() => { const key = (id) => { const c = getComputedStyle(document.getElementById(id)); return c.backgroundColor + c.color; }; return ["fab-text", "fab-number", "fab-cells"].every(id => key(id) === key("drag-handle")); })()'));
  check('corner strip at top-right', await evaluate('(() => { const r = document.getElementById("corner").getBoundingClientRect(); return r.top === 0 && Math.abs(r.right - window.innerWidth) < 1 && !!document.getElementById("btn-save") && !!document.getElementById("btn-clear") && !!document.getElementById("btn-hide"); })()'));
  check('format pill hidden by default', await evaluate('getComputedStyle(document.querySelector("[data-u-comp=headerbar]")).visibility === "hidden"'));
  const tapFab = (id) => evaluate(`(() => { const b = document.getElementById('${id}'); const r = b.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, button: 0, pointerId: 1 }; b.dispatchEvent(new PointerEvent('pointerdown', o)); b.dispatchEvent(new PointerEvent('pointerup', o)); })()`);
  const pillVisible = () => evaluate('getComputedStyle(document.querySelector("[data-u-comp=headerbar]")).visibility === "visible"');
  // Tools showing in the pill, left to right, and whether they all sit inside it unclipped
  const pillTools = () => evaluate('[...document.querySelectorAll("[data-u-comp=ribbon-toolbar] [data-u-command]")].filter(e => e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(e => e.dataset.uCommand.replace("sheet.command.", ""))');
  const pillFits = () => evaluate('(() => { const p = document.querySelector("[data-u-comp=headerbar]").getBoundingClientRect(); const tb = document.querySelector("[data-u-comp=ribbon-toolbar]"); const shown = [...tb.querySelectorAll("[data-u-command]")].filter(e => e.getBoundingClientRect().width > 0); return shown.length > 0 && tb.scrollWidth <= tb.clientWidth && !tb.querySelector(":scope > .univer-pl-2") && shown.every(e => { const r = e.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right; }); })()');
  const pillBeside = () => evaluate('(() => { const p = document.querySelector("[data-u-comp=headerbar]").getBoundingClientRect(); const f = document.getElementById("fab").getBoundingClientRect(); const inside = p.left >= 0 && p.top >= 0 && p.right <= window.innerWidth && p.bottom <= window.innerHeight; const beside = Math.abs((p.top + p.height / 2) - (f.top + f.height / 2)) < 12 || Math.abs(p.bottom - f.top) < 20 || Math.abs(p.top - f.bottom) < 20; return inside && beside; })()');
  await tapFab('fab-text');
  await sleep(300);
  check('palette circle opens the text pill', await pillVisible());
  const textTools = await pillTools();
  check('text pill is A- A+ text color, fill', JSON.stringify(textTools) === JSON.stringify(['set-range-font-decrease', 'set-range-font-increase', 'set-range-text-color', 'set-background-color']), JSON.stringify(textTools));
  check('text pill fits its tools, inside the window beside the circles', await pillFits() && await pillBeside());
  check('text color shows the live color bar under the Material A', await evaluate(`(() => { const paths = [...document.querySelectorAll('[data-u-comp=ribbon-toolbar] [data-u-command="sheet.command.set-range-text-color"] .univer-toolbar-button-selector-main svg path')]; return paths.length > 1 && getComputedStyle(paths[0]).display !== 'none' && paths.slice(1).every((p) => getComputedStyle(p).display === 'none'); })()`));
  await tapFab('fab-number');
  await sleep(300);
  const numberTools = await pillTools();
  check('123 circle switches to the number pill: % $ date .0 .00', await pillVisible() && JSON.stringify(numberTools) === JSON.stringify(['numfmt.set.percent', 'numfmt.set.currency', 'scratch.numfmt.date', 'numfmt.subtract.decimal.command', 'numfmt.add.decimal.command']), JSON.stringify(numberTools));
  check('number pill fits its tools, inside the window beside the circles', await pillFits() && await pillBeside());
  check('only the open circle is marked open', await evaluate('[...document.querySelectorAll(".fab-circle.is-open")].map(c => c.id).join()') === 'fab-number');
  await tapFab('fab-cells');
  await sleep(300);
  const cellsTools = await pillTools();
  check('cells circle switches to conditional formatting, borders, merge', await pillVisible() && JSON.stringify(cellsTools) === JSON.stringify(['sheet.operation.open.conditional.formatting.panel', 'set-border-basic', 'add-worksheet-merge']), JSON.stringify(cellsTools));
  check('cells pill fits its tools, inside the window beside the circles', await pillFits() && await pillBeside());
  await tapFab('fab-cells');
  await sleep(200);
  check('cells circle closes its pill', !(await pillVisible()));
  check('toolbar uses Material icon masks', await evaluate('["sheet.command.numfmt.set.percent","sheet.command.numfmt.set.currency","sheet.command.numfmt.add.decimal.command","sheet.command.numfmt.subtract.decimal.command","sheet.command.set-range-font-increase","sheet.command.set-range-font-decrease","scratch.numfmt.date"].every(id => /svg/.test(getComputedStyle(document.querySelector(`[data-u-command="${id}"]`), "::before").webkitMaskImage || ""))'));
  check('formula bar present', await evaluate('!!document.querySelector("[class*=formula-bar], [class*=formulaBar], [data-u-comp=formula-bar]")'));

  // Conditional formatting rules left on the sheet would tint the cells the checks below read
  await evaluate('void univerAPI.getActiveWorkbook().getActiveSheet().clearConditionalFormatRules()');

  // --- Values + formulas via facade (simulates typed input through the command system)
  await evaluate(`(() => {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    ws.getRange('A1').setValue(845);
    ws.getRange('A2').setValue(745);
    ws.getRange('A3').setValue('=A1+A2');
    ws.getRange('B1').setValue('Units sold');
    ws.getRange('B2').setValue('=SUM(A1:A2)*2');
    ws.getRange('B3').setValue('=AVERAGE(A1:A2)');
    ws.getRange('C1').setValue('=IF(A3>1000,"big","small")');
    ws.getRange('C2').setValue('=ROUND(A1/A3*100,2)');
    ws.getRange('C3').setValue('=CONCATENATE("x",A1)');
    return true;
  })()`);
  await sleep(600);
  const vals = await evaluate(`(() => {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    return ws.getRange('A1:C3').getDisplayValues();
  })()`);
  check('A3 = A1+A2', vals[2][0] === '1590', JSON.stringify(vals[2][0]));
  check('B2 = SUM*2', vals[1][1] === '3180', JSON.stringify(vals[1][1]));
  check('B3 = AVERAGE', vals[2][1] === '795', JSON.stringify(vals[2][1]));
  check('C1 = IF', vals[0][2] === 'big', JSON.stringify(vals[0][2]));
  check('C2 = ROUND', vals[1][2] === '53.14', JSON.stringify(vals[1][2]));
  check('C3 = CONCATENATE', vals[2][2] === 'x845', JSON.stringify(vals[2][2]));
  check('text cell', vals[0][1] === 'Units sold', JSON.stringify(vals[0][1]));

  // --- Typed input through the real editor: currency + percent auto-format
  // Click cell D1 by activating it then sending keys via CDP Input domain.
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('D1').activate()`);
  await sleep(200);
  const typeText = async (text) => {
    for (const ch of text) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
  };
  const pressEnter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };
  // Focus the canvas so Univer's keyboard handler gets the keys
  const GRID = `[...document.querySelectorAll('#sheet canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]`;
  await evaluate(`(${GRID} || document.body).focus()`);
  await typeText('$12,133');
  await pressEnter();
  await sleep(300);
  await typeText('5.7%');
  await pressEnter();
  await sleep(600);
  const typed = await evaluate(`(() => {
    const ws = univerAPI.getActiveWorkbook().getActiveSheet();
    const r = ws.getRange('D1:D2');
    return { display: r.getDisplayValues(), values: r.getValues() };
  })()`);
  check('typed $12,133 shows as currency', typed.display[0][0] === '$12,133', JSON.stringify(typed));
  const rawTyped = await evaluate(`(() => {
    const snap = univerAPI.getActiveWorkbook().save();
    const cd = snap.sheets.sheet1.cellData;
    return { d1: cd[0][3], d2: cd[1][3], s1: snap.styles[cd[0][3].s], s2: snap.styles[cd[1][3].s] };
  })()`);
  check('typed $12,133 stored as number', rawTyped.d1.v === 12133, JSON.stringify(rawTyped.d1));
  check('typed $12,133 gets currency numFmt', rawTyped.s1 && /\$/.test(rawTyped.s1.n?.pattern || ''), JSON.stringify(rawTyped.s1));
  check('typed 5.7% stored as 0.057', Math.abs(rawTyped.d2.v - 0.057) < 1e-9, JSON.stringify(rawTyped.d2));
  check('typed 5.7% gets percent numFmt', rawTyped.s2 && /%/.test(rawTyped.s2.n?.pattern || ''), JSON.stringify(rawTyped.s2));
  // Formulas over formatted cells still compute on the raw number
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('D3').setValue('=D1*D2')`);
  await sleep(400);
  const d3 = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('D3').getValue()`);
  check('formula over currency*percent', Math.abs(d3 - 12133 * 0.057) < 1e-6, JSON.stringify(d3));

  // --- Typed cells must not carry the editor's forced text color (black-on-black in dark mode)
  check('typed cell has no forced text color', !rawTyped.s1 || !rawTyped.s1.cl, JSON.stringify(rawTyped.s1));
  check('typed percent cell has no forced text color', !rawTyped.s2 || !rawTyped.s2.cl, JSON.stringify(rawTyped.s2));

  // --- Pointing at cells with the arrow keys while typing a formula, as in Google Sheets: the cell
  // cursor stays on the cell being edited and every new reference starts from that cell
  const pressKey = async (key, modifiers = 0) => {
    const vk = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27 }[key];
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, modifiers });
    await sleep(150);
  };
  const SHIFT = 8;
  const editorText = () => evaluate(`univerAPI.getDocument('__INTERNAL_EDITOR__DOCS_NORMAL').getBody().dataStream.replace(/\\r\\n$/, '')`);
  const checkCell = async (name, want) => {
    const cell = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getSelection().getActiveRange().getA1Notation()`);
    check(name, cell === want, cell);
  };
  await evaluate(`(() => { const ws = univerAPI.getActiveWorkbook().getActiveSheet(); ws.getRange('A20:B22').setValues([[1, 10], [2, 20], [3, 30]]); ws.getRange('D21').activate(); })()`);
  await sleep(200);
  await evaluate(`(${GRID}).focus()`);
  await typeText('=SUM(');
  await pressKey('ArrowLeft');
  let pointed = await editorText();
  check('arrow after ( points at the cell beside the edited one', pointed === '=SUM(C21', pointed);
  await pressKey('ArrowLeft');
  await pressKey('ArrowUp');
  await pressKey('ArrowDown', SHIFT);
  pointed = await editorText();
  check('arrows move the reference, shift+arrow extends it', pointed === '=SUM(B20:B21', pointed);
  await checkCell('cell cursor stays on the edited cell while pointing', 'D21');
  await typeText(')+');
  await pressKey('ArrowLeft');
  pointed = await editorText();
  check('a new reference starts from the edited cell', pointed === '=SUM(B20:B21)+C21', pointed);
  await pressKey('ArrowDown');
  await pressKey('ArrowLeft');
  pointed = await editorText();
  check('the new reference keeps moving', pointed === '=SUM(B20:B21)+B22', pointed);
  await pressEnter();
  await sleep(500);
  const d21 = await evaluate(`(() => { const r = univerAPI.getActiveWorkbook().getActiveSheet().getRange('D21'); return { f: r.getFormula(), v: r.getValue() }; })()`);
  check('pointed formula lands in the edited cell', d21.f === '=SUM(B20:B21)+B22' && d21.v === 60, JSON.stringify(d21));
  await checkCell('Enter moves down from the edited cell', 'D22');
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('D23').activate()`);
  await sleep(200);
  await evaluate(`(${GRID}).focus()`);
  await typeText('=');
  for (let i = 0; i < 5; i++) await pressKey('ArrowLeft');
  pointed = await editorText();
  check('pointing stops at column A instead of wrapping', pointed === '=A23', pointed);
  await pressKey('Escape');
  await sleep(300);
  await checkCell('Escape leaves the cursor on the edited cell', 'D23');
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A22').activate()`);
  await evaluate(`(${GRID}).focus()`);
  await pressKey('ArrowLeft');
  await checkCell('Left at column A stays put instead of wrapping', 'A22');
  // Rows 20+ scrolled the grid; the right-click steps below click at fixed row-1 pixels
  await evaluate(`(() => { const ws = univerAPI.getActiveWorkbook().getActiveSheet(); ws.getRange('A20:D23').clear(); ws.scrollToCell(0, 0); })()`);

  // --- The copy marquee crawls slowly at the same pace on any refresh rate. The page's clipboard
  // calls are stubbed for the copy, so the system clipboard is never written.
  const marquee = await evaluate(`(async () => {
    const wb = univerAPI.getActiveWorkbook();
    const ws = wb.getActiveSheet();
    ws.getRange('A1:B2').activate();
    const real = { write: navigator.clipboard.write, writeText: navigator.clipboard.writeText, exec: document.execCommand };
    navigator.clipboard.write = async () => {};
    navigator.clipboard.writeText = async () => {};
    document.execCommand = () => true;
    try { await univerAPI.executeCommand('univer.command.copy'); } finally {
      navigator.clipboard.write = real.write; navigator.clipboard.writeText = real.writeText; document.execCommand = real.exec;
    }
    const dashed = [];
    const walk = (o) => { if (o.strokeDashArray && o.strokeDashOffset !== undefined && o.visible !== false) dashed.push(o); (o.getObjects?.() || []).forEach(walk); };
    ws._getSheetRenderComponent(wb.getId(), '__SpreadsheetRender__').getScene().getAllObjectsByOrder().forEach(walk);
    if (dashed.length !== 1) return { count: dashed.length };
    const ant = dashed[0];
    let travelled = 0;
    let last = ant.strokeDashOffset;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100));
      travelled += ((last - ant.strokeDashOffset) % 160 + 160) % 160;
      last = ant.strokeDashOffset;
    }
    return { count: 1, pxPerSec: Math.round(travelled / ((performance.now() - t0) / 1000) * 10) / 10 };
  })()`);
  check('copy marquee crawls slowly (4 to 20 px/s)', marquee.count === 1 && marquee.pxPerSec >= 4 && marquee.pxPerSec <= 20, JSON.stringify(marquee));
  await pressKey('Escape');

  // --- Theme toggle button flips dark/light and back; the floating circle is always the inverse of the theme
  const circleColors = () => evaluate('(() => { const c = getComputedStyle(document.getElementById("fab-text")); return [c.backgroundColor, c.color]; })()');
  const INVERSE_CIRCLE = { dark: ['rgb(255, 255, 255)', 'rgb(27, 31, 36)'], light: ['rgb(27, 31, 36)', 'rgb(255, 255, 255)'] };
  const darkBefore = (await evaluate('window.scratch.getConfig()')).darkMode;
  await evaluate(`document.getElementById('btn-theme').click()`);
  await sleep(500);
  const darkAfter = (await evaluate('window.scratch.getConfig()')).darkMode;
  check('theme toggle flips mode', darkAfter === !darkBefore, `${darkBefore} -> ${darkAfter}`);
  check('html data-theme follows', await evaluate('document.documentElement.dataset.theme') === (darkAfter ? 'dark' : 'light'));
  check(`circle is the inverse in ${darkAfter ? 'dark' : 'light'} mode`, JSON.stringify(await circleColors()) === JSON.stringify(INVERSE_CIRCLE[darkAfter ? 'dark' : 'light']), JSON.stringify(await circleColors()));
  check('theme icon offers the other mode', await evaluate('document.querySelector("#btn-theme .ico").classList.contains("' + (darkAfter ? 'ico-light' : 'ico-dark') + '")'));
  check('univer dark class follows', await evaluate('document.documentElement.classList.contains("univer-dark")') === darkAfter);
  await evaluate(`document.getElementById('btn-theme').click()`);
  await sleep(1500); // Univer re-themes the whole workbench; give it time before mouse-driven steps
  check('theme toggle flips back', (await evaluate('window.scratch.getConfig()')).darkMode === darkBefore);
  check(`circle is the inverse in ${darkBefore ? 'dark' : 'light'} mode`, JSON.stringify(await circleColors()) === JSON.stringify(INVERSE_CIRCLE[darkBefore ? 'dark' : 'light']), JSON.stringify(await circleColors()));

  // --- Bold + highlight via toolbar buttons
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A3').activate()`);
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-bold')`);
  await sleep(200);
  const bold = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A3').getCellStyleData()`);
  check('bold applied via Ctrl+B command', bold && bold.bl === 1, JSON.stringify(bold));
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-bold')`);
  await sleep(200);
  const unbold = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A3').getCellStyleData()`);
  check('bold toggles off', !unbold || unbold.bl !== 1, JSON.stringify(unbold));

  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:A2').activate()`);
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-background-color', { value: '#fde68a' })`);
  await sleep(200);
  const bg = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:A2').getBackgrounds()`);
  check('fill applied via toolbar command', Array.isArray(bg) && bg.flat().every((c) => c && c.toLowerCase() === '#fde68a'), JSON.stringify(bg));
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:A2').setBackground(null)`);
  await sleep(200);
  const bg2 = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:A2').getBackgrounds()`);
  check('fill removed', bg2.flat().every((c) => !c || c.toLowerCase() !== '#fde68a'), JSON.stringify(bg2));

  // --- Font size -/+ and text color from the pill (B1 keeps them so the export check below sees them)
  const b1Style = `univerAPI.getActiveWorkbook().getActiveSheet().getRange('B1').getCellStyleData()`;
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('B1').activate()`);
  const fsStart = (await evaluate(b1Style))?.fs ?? 11;
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-font-increase')`);
  await sleep(150);
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-font-increase')`);
  await sleep(150);
  const fsUp = (await evaluate(b1Style))?.fs;
  check('font size + steps up', fsUp === fsStart + 2, `${fsStart} -> ${fsUp}`);
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-font-decrease')`);
  await sleep(150);
  const fsDown = (await evaluate(b1Style))?.fs;
  check('font size - steps down', fsDown === fsStart + 1, `${fsUp} -> ${fsDown}`);
  await evaluate(`void univerAPI.executeCommand('sheet.command.set-range-text-color', { value: '#dc2626' })`);
  await sleep(200);
  const b1 = await evaluate(b1Style);
  check('text color applied', b1?.cl?.rgb?.toLowerCase() === '#dc2626', JSON.stringify(b1));

  // --- Date button in the number pill (a click on the real toolbar button)
  await evaluate(`(() => { const ws = univerAPI.getActiveWorkbook().getActiveSheet(); ws.getRange('D10').setValue(45000); ws.getRange('D10').activate(); })()`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-u-comp=ribbon-toolbar] [data-u-command="scratch.numfmt.date"]').click()`);
  await sleep(300);
  const d10 = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('D10').getDisplayValue()`);
  check('Date button formats a serial as m/d/yyyy', d10 === '3/15/2023', JSON.stringify(d10));

  // --- Borders and merge (cells pill tools), kept for the export check below
  await evaluate(`(() => { const ws = univerAPI.getActiveWorkbook().getActiveSheet(); ws.getRange('C5:D6').setBorder(univerAPI.Enum.BorderType.ALL, univerAPI.Enum.BorderStyleTypes.THIN, '#000000'); ws.getRange('E8:F9').breakApart(); ws.getRange('E8').setValue('merged'); ws.getRange('E8:F9').merge(); ws.getRange('E8:F9').setBorder(univerAPI.Enum.BorderType.OUTSIDE, univerAPI.Enum.BorderStyleTypes.THIN, '#000000'); })()`);
  await sleep(300);
  const c5 = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('C5').getCellStyleData()`);
  check('borders applied', ['t', 'b', 'l', 'r'].every((k) => c5?.bd?.[k]?.s === 1), JSON.stringify(c5?.bd));
  check('cells merged', await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('E8:F9').isMerged()`));

  // --- Conditional formatting: a rule on A1:A3 that saves with the sheet
  await evaluate(`(() => { const ws = univerAPI.getActiveWorkbook().getActiveSheet(); ws.clearConditionalFormatRules(); ws.addConditionalFormattingRule(ws.newConditionalFormattingRule().whenNumberGreaterThan(800).setBackground('#bbf7d0').setRanges([ws.getRange('A1:A3').getRange()]).build()); })()`);
  await sleep(300);
  check('conditional formatting rule added', await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getConditionalFormattingRules().length`) === 1);
  // Its rule panel opens in Univer's right sidebar: below the corner strip, formula bar unsqueezed, pill closed
  await evaluate(`void univerAPI.executeCommand('sheet.operation.open.conditional.formatting.panel', { value: 2 })`);
  await sleep(600);
  const sidebar = await evaluate(`(() => { const close = document.querySelector('[data-u-comp=sidebar] .univerjs-icon-close-icon').getBoundingClientRect(); const hit = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2); return { open: document.getElementById('sheet').hasAttribute('data-sidebar-open'), closeReachable: !!hit.closest('[data-u-comp=sidebar]'), formulaPad: getComputedStyle(document.querySelector('[data-u-comp=formula-bar]')).paddingRight, pill: document.getElementById('sheet').dataset.fmtOpen || null }; })()`);
  check('rule panel opens clear of the corner strip, formula bar keeps its width', sidebar.open && sidebar.closeReachable && sidebar.formulaPad === '0px' && !sidebar.pill, JSON.stringify(sidebar));
  await evaluate(`document.querySelector('[data-u-comp=sidebar] .univerjs-icon-close-icon').closest('button').click()`);
  await sleep(600);
  check('rule panel closes, corner reservation returns', await evaluate(`!document.getElementById('sheet').hasAttribute('data-sidebar-open') && getComputedStyle(document.querySelector('[data-u-comp=formula-bar]')).paddingRight !== '0px'`));

  if (QUIET) {
    console.log('SKIP  right-click menu steps (QUIET set)');
  } else {
    // --- Right-click menu: Number format + Align submenus
    await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').activate()`);
    // Row 1 / column A: past the 40px row header and the 22px column header.
    const cellXY = await evaluate(`(() => { const b = ${GRID}.getBoundingClientRect(); return [Math.round(b.left + 70), Math.round(b.top + 36)]; })()`);
    // Left-click the cell first so the grid owns pointer focus, then right-click it.
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cellXY[0], y: cellXY[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cellXY[0], y: cellXY[1], button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cellXY[0], y: cellXY[1], button: 'left', clickCount: 1 });
    await sleep(300);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cellXY[0], y: cellXY[1], button: 'right', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cellXY[0], y: cellXY[1], button: 'right', clickCount: 1 });
    await sleep(800);
    // Univer's context menu has no ARIA roles; find items by their visible leaf text.
    const LEAF = `(() => [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && e.children.length === 0 && !e.closest('#titlebar'); }))()`;
    const menuTexts = await evaluate(`${LEAF}.map(e => e.textContent.trim()).filter(Boolean)`);
    check('context menu has Number format', menuTexts.some((t) => t === 'Number format'), JSON.stringify(menuTexts.slice(0, 30)));
    check('context menu has Align', menuTexts.some((t) => t === 'Align'));
    const centerOf = (text) => `(() => { const el = ${LEAF}.find(e => e.textContent.trim() === '${text}'); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`;
    const fmtItemXY = await evaluate(centerOf('Number format'));
    if (fmtItemXY) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fmtItemXY[0], y: fmtItemXY[1] });
      await sleep(500);
      const pctXY = await evaluate(centerOf('Percent'));
      check('Number format submenu opens', !!pctXY);
      if (pctXY) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pctXY[0], y: pctXY[1] });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pctXY[0], y: pctXY[1], button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pctXY[0], y: pctXY[1], button: 'left', clickCount: 1 });
        await sleep(400);
        const a1 = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').getDisplayValue()`);
        check('Percent applied from context menu', a1 === '84500.00%', JSON.stringify(a1));
        await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').setNumberFormat('General')`);
      }
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(200);

  }

  // --- Autosave happened
  await sleep(800);
  const fs = require('node:fs');
  const path = require('node:path');
  // SCRATCH_DATA points at a dev instance's --user-data-dir so tests never touch the real sheet.
  const candidates = process.env.SCRATCH_DATA
    ? [path.join(process.env.SCRATCH_DATA, 'sheet.json')]
    : ['scratchsheet', 'Scratch Sheet', 'Electron'].map((n) => path.join(process.env.APPDATA, n, 'sheet.json'));
  const sheetFile = candidates.find((f) => fs.existsSync(f));
  check('sheet.json written', !!sheetFile, sheetFile || candidates.join(' | '));
  if (sheetFile) {
    const snap = JSON.parse(fs.readFileSync(sheetFile, 'utf8'));
    const a3 = snap.sheets.sheet1.cellData[2][0];
    check('snapshot keeps formula', a3 && a3.f === '=A1+A2', JSON.stringify(a3));
    check('snapshot keeps position', !!snap.__scratch, JSON.stringify(snap.__scratch));
    // Export test (pure node)
    const { buildWorkbook } = require('../electron/export');
    const wb = buildWorkbook(snap);
    const xws = wb.getWorksheet(1);
    const xa3 = xws.getCell('A3').value;
    const xd1 = xws.getCell('D1');
    check('xlsx export carries formula', xa3 && xa3.formula === 'A1+A2' && xa3.result === 1590, JSON.stringify(xa3));
    check('xlsx export carries numFmt', typeof xd1.numFmt === 'string' && xd1.numFmt.includes('$'), JSON.stringify(xd1.numFmt));
    const xb1 = xws.getCell('B1').font || {};
    check('xlsx export carries font size and color', xb1.size === fsDown && xb1.color?.argb === 'FFDC2626', JSON.stringify(xb1));
    const xc5 = xws.getCell('C5').border || {};
    check('xlsx export carries borders', ['top', 'bottom', 'left', 'right'].every((k) => xc5[k]?.style === 'thin'), JSON.stringify(xc5));
    check('xlsx export carries merged cells', xws.getCell('F9').isMerged && xws.getCell('F9').master.address === 'E8');
    const xf9 = xws.getCell('F9').border || {};
    check('merged cell keeps its outer border on export', xf9.right?.style === 'thin' && xf9.bottom?.style === 'thin', JSON.stringify(xf9));
    const cf = (snap.resources || []).find((r) => r.name === 'SHEET_CONDITIONAL_FORMATTING_PLUGIN');
    check('conditional formatting saved with the sheet', !!cf && JSON.parse(cf.data).sheet1?.length === 1, cf && cf.data.slice(0, 80));
    const out = path.join(process.env.TEMP, 'scratchsheet-test.xlsx');
    await wb.xlsx.writeFile(out);
    check('xlsx file written', fs.statSync(out).size > 2000, out);
  }

  // --- One click on Clear wipes the sheet
  await evaluate(`document.getElementById('btn-clear').click()`);
  await sleep(400);
  const cleared = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:D3').getValues().flat().every(v => v === null || v === '')`);
  check('one click clears', cleared);
  check('Clear pops up no notification', await evaluate(`document.getElementById('toast').hidden`));
  // Undo brings it back
  await evaluate(`void univerAPI.undo()`);
  await sleep(400);
  const undone = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').getValue()`);
  check('undo restores after clear', undone === 845, JSON.stringify(undone));

  await evaluate('void univerAPI.getActiveWorkbook().getActiveSheet().clearConditionalFormatRules()');
  await restorePin();
  await sleep(500);
  if (!QUIET) check('pin state restored', (await evaluate('window.scratch.getConfig()')).alwaysOnTop === !!startCfg.alwaysOnTop);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('ERROR', err); process.exit(2); });
