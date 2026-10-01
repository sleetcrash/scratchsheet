// Prints the toolbar / formula bar geometry of the running app (for layout tuning).
const PORT = process.env.CDP_PORT || 9222;
(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    const h = (e) => { const j = JSON.parse(e.data); if (j.id === mid) { ws.removeEventListener('message', h); resolve(j.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const out = await evaluate(`(() => {
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return JSON.stringify({
      toolbarItems: [...document.querySelectorAll('[data-u-comp=ribbon-toolbar] [data-u-command]')].map((e) => e.dataset.uCommand),
      toolbar: rect('[data-u-comp=ribbon-toolbar]'),
      headerbar: rect('[data-u-comp=headerbar]'),
      formulaBar: rect('[data-u-comp=formula-bar]'),
      editor: rect('[data-u-comp=formula-editor]'),
      canvas: rect('[data-u-comp=render-canvas]'),
      fillPaths: [...document.querySelectorAll('[data-u-command="sheet.command.set-background-color"] .univer-toolbar-button-selector-main svg path')].map((p) => (p.getAttribute('fill') || '') + ' | ' + (p.getAttribute('d') || '').slice(0, 50)),
    }, null, 1);
  })()`);
  console.log(out);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
