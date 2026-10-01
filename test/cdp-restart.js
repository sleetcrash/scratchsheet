// Persistence test. Run `node test/cdp-restart.js prep`, restart the app, then `node test/cdp-restart.js verify`.
// `node test/cdp-restart.js visible` prints the window's visibility state (for the hotkey test).

const PORT = process.env.CDP_PORT || 9222;
const mode = process.argv[2] || 'verify';

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
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
  return { ws, evaluate };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

(async () => {
  const { ws, evaluate } = await connect();
  if (mode === 'prep') {
    await evaluate(`(() => {
      const ws = univerAPI.getActiveWorkbook().getActiveSheet();
      ws.getRange('B45').setValue('deep down');
      ws.getRange('B46').setValue('=LEN(B45)');
      ws.scrollToCell(40, 0);
      ws.getRange('B46').activate();
      return true;
    })()`);
    await sleep(1200); // let the debounced autosave flush
    const pos = await evaluate(`(() => {
      const wb = univerAPI.getActiveWorkbook(); const ws = wb.getActiveSheet();
      const s = wb.getScrollStateBySheetId(ws.getSheetId());
      return { active: ws.getSelection().getActiveRange().getA1Notation(), startRow: s && s.sheetViewStartRow };
    })()`);
    console.log('prepared', JSON.stringify(pos));
  } else if (mode === 'verify') {
    await sleep(500);
    const r = await evaluate(`(() => {
      const wb = univerAPI.getActiveWorkbook(); const ws = wb.getActiveSheet();
      const s = wb.getScrollStateBySheetId(ws.getSheetId());
      return {
        a1: ws.getRange('A1').getValue(),
        b45: ws.getRange('B45').getValue(),
        b46: ws.getRange('B46').getValue(),
        active: ws.getSelection().getActiveRange().getA1Notation(),
        startRow: s && s.sheetViewStartRow,
      };
    })()`);
    check('A1 survives restart', r.a1 === 845, JSON.stringify(r.a1));
    check('B45 text survives restart', r.b45 === 'deep down', JSON.stringify(r.b45));
    check('B46 formula recomputes after restart', r.b46 === 9, JSON.stringify(r.b46));
    check('active cell restored', r.active === 'B46', r.active);
    check('scroll position restored', typeof r.startRow === 'number' && r.startRow >= 35, String(r.startRow));
  } else if (mode === 'visible') {
    console.log(await evaluate('document.visibilityState'));
  }
  ws.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
