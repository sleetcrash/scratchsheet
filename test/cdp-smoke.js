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

  // --- Baseline
  const title = await evaluate('document.title');
  check('page title', title === 'Scratch Sheet', title);
  check('univerAPI exposed', await evaluate('typeof window.univerAPI === "object"'));
  check('drag handle present', await evaluate('document.querySelector(".tb-drag").getBoundingClientRect().width > 40'));
  check('toolbar shows bold', await evaluate('!!document.querySelector("[data-u-command=\\"sheet.command.set-range-bold\\"]")'));
  check('toolbar shows italic', await evaluate('!!document.querySelector("[data-u-command=\\"sheet.command.set-range-italic\\"]")'));
  check('toolbar shows fill', await evaluate('!!document.querySelector("[data-u-command=\\"sheet.command.set-background-color\\"]")'));
  check('toolbar shows align', await evaluate('!!document.querySelector("[data-u-command=\\"sheet.command.set-horizontal-text-align\\"]")'));
  check('toolbar shows number format', await evaluate('!!document.querySelector("[data-u-command=\\"sheet.operation.open.numfmt.panel\\"]")'));
  check('font family hidden', await evaluate('!document.querySelector("[data-u-command=\\"sheet.command.set-range-font-family\\"]")'));
  check('formula bar present', await evaluate('!!document.querySelector("[class*=formula-bar], [class*=formulaBar], [data-u-comp=formula-bar]")'));

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
  await evaluate(`(document.querySelector('#sheet canvas') || document.body).focus()`);
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

  // --- Bold + highlight via toolbar buttons
  await evaluate(`void univerAPI.getActiveWorkbook().getActiveSheet().getRange('A3').activate()`);
  await evaluate(`document.querySelector('[data-u-command="sheet.command.set-range-bold"]').click()`);
  await sleep(200);
  const bold = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A3').getCellStyleData()`);
  check('bold applied via button', bold && bold.bl === 1, JSON.stringify(bold));
  await evaluate(`document.querySelector('[data-u-command="sheet.command.set-range-bold"]').click()`);
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

  // --- Copy all
  await evaluate(`document.getElementById('btn-copy').click()`);
  await sleep(500);
  const { execSync } = require('node:child_process');
  const clip = execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', { encoding: 'utf8' }).replace(/\r/g, '');
  check('copy all -> clipboard TSV', clip.includes('845\tUnits sold') && clip.includes('1590'), JSON.stringify(clip.slice(0, 120)));

  // --- Autosave happened
  await sleep(800);
  const fs = require('node:fs');
  const path = require('node:path');
  const candidates = ['scratchsheet', 'Scratch Sheet', 'Electron'].map((n) => path.join(process.env.APPDATA, n, 'sheet.json'));
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
    const out = path.join(process.env.TEMP, 'scratchsheet-test.xlsx');
    await wb.xlsx.writeFile(out);
    check('xlsx file written', fs.statSync(out).size > 2000, out);
  }

  // --- Clear is two-step
  await evaluate(`document.getElementById('btn-clear').click()`);
  const armed = await evaluate(`document.getElementById('btn-clear').textContent`);
  check('clear arms first', armed === 'Sure?', armed);
  const stillThere = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').getValue()`);
  check('first click does not clear', stillThere === 845, JSON.stringify(stillThere));
  await evaluate(`document.getElementById('btn-clear').click()`);
  await sleep(400);
  const cleared = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1:D3').getValues().flat().every(v => v === null || v === '')`);
  check('second click clears', cleared);
  // Undo brings it back
  await evaluate(`void univerAPI.undo()`);
  await sleep(400);
  const undone = await evaluate(`univerAPI.getActiveWorkbook().getActiveSheet().getRange('A1').getValue()`);
  check('undo restores after clear', undone === 845, JSON.stringify(undone));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('ERROR', err); process.exit(2); });
