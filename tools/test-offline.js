/* 单文件离线版冒烟测试：无头 Edge 打开 HTML，确认游戏启动且无外部资源 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILE = path.join(ROOT, '龙裔王座-离线版.html');
const PORT = 9633 + Math.floor(Math.random() * 200);
const PROFILE = path.join(os.tmpdir(), 'dbt-offline-smoke');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  const url = pathToFileURL(FILE).href + '?demo=battle';
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1600,1000', url
  ], { stdio: 'ignore', windowsHide: true });
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      page = list.find(t => t.type === 'page');
    } catch (e) { await sleep(200); }
  }
  if (!page) throw new Error('无法连接 Edge CDP');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const my = ++id; pending.set(my, { resolve, reject });
    ws.send(JSON.stringify({ id: my, method, params: params || {} }));
    setTimeout(() => { if (pending.has(my)) { pending.delete(my); reject(new Error('timeout ' + method)); } }, 20000);
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.reload');
  await sleep(2000);
  const expr = `(() => {
    const out = {};
    try {
      out.title = document.title;
      out.battle = !!(document.querySelector('#screen-battle') && document.querySelector('#screen-battle').classList.contains('active'));
      out.cards = (typeof DBCards !== 'undefined') ? DBCards.CARDS.length : -1;
      out.cardsGlobal = typeof DBCards;
      out.engine = typeof DBEngine;
      out.ui = typeof DBUI;
      out.scripts = document.querySelectorAll('script').length;
      out.scriptSrc = document.querySelectorAll('script[src]').length;
      out.externalScripts = document.querySelectorAll('script[src]').length;
      out.styles = document.querySelectorAll('link[rel="stylesheet"]').length;
      out.resources = performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file:') && !n.startsWith('data:'));
      out.bodyClass = document.body.className;
    } catch (e) { out.error = String(e); }
    return out;
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const out = r.result.value;
  console.log(JSON.stringify(out, null, 2));
  for (const ev of events.slice(-20)) console.log('EVENT', JSON.stringify(ev).slice(0, 500));
  const ok = out && out.cards === 39 && out.engine === 'object' && out.ui === 'object' && out.battle && out.externalScripts === 0 && out.styles === 0 && out.resources.length === 0;
  console.log('CHECK', { ok, cards: out && out.cards, engine: out && out.engine, ui: out && out.ui, battle: out && out.battle, externalScripts: out && out.externalScripts, styles: out && out.styles, resources: out && out.resources && out.resources.length });
  proc.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(ok ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
