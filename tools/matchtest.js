/* 完整对局测试：快速模式下让 AI 打完整局，验证结算、再战与投降流程 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 10100 + Math.floor(Math.random() * 300);
const os = require('os');
const PROFILE = path.join(os.tmpdir(), 'dbt-edge-match');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); }
}
function launch() {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?fast=1';
  return spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1600,1000', url
  ], { stdio: 'ignore', windowsHide: true });
}
async function pageTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('cannot connect');
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}
function client(ws) {
  let id = 0; const pending = new Map();
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    }
  };
  return (method, params) => new Promise((resolve, reject) => {
    const my = ++id; pending.set(my, { resolve, reject });
    ws.send(JSON.stringify({ id: my, method, params: params || {} }));
    setTimeout(() => { if (pending.has(my)) { pending.delete(my); reject(new Error('timeout ' + method)); } }, 30000);
  });
}

(async () => {
  const proc = launch();
  let ws = null;
  const errors = [];
  const cleanup = () => {
    try { ws && ws.close(); } catch (e) {}
    try { proc.kill(); } catch (e) {}
    try { require('child_process').execSync('taskkill /PID ' + proc.pid + '/T/F', { stdio: 'ignore' }); } catch (e) {}
  };
  try {
    const target = await pageTarget();
    ws = await connect(target.webSocketDebuggerUrl);
    ws.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push((d.exception && d.exception.description) || d.text);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map(a => a.value || a.description || '').join(' '));
      }
    });
    const send = client(ws);
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    async function ev(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('EVAL: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    }
    async function waitFor(expression, timeout) {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeout || 10000)) {
        let val = null;
        try { val = await ev(expression); } catch (e) {}
        if (val) return val;
        await sleep(120);
      }
      return null;
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ROOT, 'screenshots', name), Buffer.from(r.data, 'base64'));
      console.log('screenshot:', name);
    }

    await sleep(1200);
    console.log('\n[完整对局] 玩家持续结束回合，让 AI 推平');
    await ev(`DBUI.startBattle({playerDeck: DBUI.Cards.PRESETS.frost.cards.slice(), playerDeckName:'霜寒壁垒', enemyDeck: DBUI.Cards.PRESETS.ember.cards.slice(), enemyDeckName:'烈焰突袭'})`);
    await sleep(300);

    let turnsEnded = 0;
    while (turnsEnded < 30) {
      const state = await ev('({active:DBUI.ui.game.active, winner:DBUI.ui.game.winner, busy:DBUI.ui.busy, turn:DBUI.ui.game.turn})');
      if (state.winner != null) break;
      if (state.active === 0 && !state.busy) {
        await ev('document.querySelector("#btn-end-turn").click()');
        turnsEnded++;
        await waitFor('DBUI.ui.game.winner != null || (DBUI.ui.game.active === 0 && !DBUI.ui.busy)', 20000);
      } else {
        await sleep(150);
      }
    }
    const final = await ev('({winner:DBUI.ui.game.winner, turn:DBUI.ui.game.turn, hp0:DBUI.ui.game.players[0].hp, hp1:DBUI.ui.game.players[1].hp, reason:DBUI.ui.game.winReason})');
    check('完整对局能够结束', final.winner != null, final);
    await sleep(300);
    const resultOpen = await ev('document.querySelector("#modal-root").classList.contains("open") && !!document.querySelector(".result-panel")');
    check('结算界面出现', !!resultOpen, final);
    const record = await ev('DBUI.ui.record');
    check('战绩已记录', (record.wins + record.losses) >= 1, record);
    await shot('08-result.png');

    // 点击再战
    await ev('document.querySelector("[data-result=\\"rematch\\"]").click()');
    await sleep(500);
    const rematched = await ev('({active:DBUI.ui.game.active, turn:DBUI.ui.game.turn, open:document.querySelector("#modal-root").classList.contains("open"), winner:DBUI.ui.game.winner})');
    check('再战一局重新开始', rematched.active === 0 && rematched.turn === 1 && !rematched.open && rematched.winner == null, rematched);

    // 投降流程
    await ev('document.querySelector("#btn-concede-bottom").click()');
    await sleep(200);
    check('投降确认弹窗打开', await ev('document.querySelector("[data-confirm-concede]") !== null'));
    await ev('document.querySelector("[data-confirm-concede]").click()');
    await sleep(600);
    const conceded = await ev('({winner:DBUI.ui.game.winner, open:document.querySelector("#modal-root").classList.contains("open"), title:document.querySelector(".result-title") ? document.querySelector(".result-title").textContent : null})');
    check('投降后判定失败并弹出结算', conceded.winner === 1 && conceded.open && conceded.title.includes('败'), conceded);

    // 返回主菜单
    await ev('document.querySelector("[data-result=\\"title\\"]").click()');
    await sleep(500);
    check('可返回主菜单', await ev('document.querySelector("#screen-title").classList.contains("active") && DBUI.ui.game === null'));
    check('返回后无异常', errors.length === 0, errors);

    console.log('\n[结果]');
    console.log('JS 异常:', errors.length ? errors : '无');
    console.log('通过 ' + pass + ' / ' + (pass + fail));
    if (fail || errors.length) process.exitCode = 1;
  } finally {
    cleanup();
  }
  await sleep(300);
})().catch(err => {
  console.error('MATCHTEST FAILED:', err);
  process.exit(1);
});
