/* QA / 截图脚本：用无头 Edge + CDP 打开游戏、执行脚本并截图 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 300);
const os = require('os');
const PROFILE = path.join(os.tmpdir(), 'dbt-edge-qa');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function launch(width, height) {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--window-size=' + width + ',' + height,
    url
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore', windowsHide: true });
  return { proc, url };
}

async function pageTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json');
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
      if (page) return page;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('无法连接 Edge CDP');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = err => reject(err);
  });
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const my = ++id;
      pending.set(my, { resolve, reject });
      ws.send(JSON.stringify({ id: my, method, params: params || {} }));
      setTimeout(() => {
        if (pending.has(my)) { pending.delete(my); reject(new Error('CDP timeout: ' + method)); }
      }, 20000);
    });
  }
  return { send, events };
}

async function main() {
  const width = 1600, height = 1000;
  const { proc } = launch(width, height);
  const cleanup = () => {
    try { ws.close(); } catch (e) {}
    try { proc.kill(); } catch (e) {}
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /PID ' + proc.pid + ' /T /F', { stdio: 'ignore' });
    } catch (e) {}
  };
  let ws = null;
  try {
  const target = await pageTarget();
  ws = await connect(target.webSocketDebuggerUrl);
  const cdp = makeClient(ws);
  const errors = [];

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  ws.addEventListener('message', e => {
    let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXCEPTION: ' + (d.exception && d.exception.description || d.text));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('LOG: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args.map(a => a.value || a.description || '').join(' '));
    }
  });

  async function evaluate(expression) {
    const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error('EVAL: ' + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
    }
    return res.result.value;
  }
  async function shot(name) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const file = path.join(ROOT, 'screenshots', name);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('screenshot:', file);
  }

  await sleep(1500);
  console.log('TITLE:', await evaluate('document.title'));
  console.log('SCREENS:', await evaluate('Array.from(document.querySelectorAll(".screen")).map(s=>s.id+":"+s.classList.contains("active"))'));
  await shot('01-title.png');

  // 卡组选择弹窗
  await evaluate('document.querySelector("#btn-play").click()');
  await sleep(500);
  await shot('10-deck-select.png');
  await evaluate('document.querySelector("#modal-root").classList.remove("open"); document.querySelector("#modal-root").innerHTML=""');

  // 开始对战
  await evaluate('DBUI.startBattle({playerDeck: DBUI.Cards.PRESETS.ember.cards.slice(), playerDeckName: "烈焰突袭", enemyDeck: DBUI.Cards.PRESETS.frost.cards.slice(), enemyDeckName: "霜寒壁垒"})');
  await sleep(1800);
  console.log('GAME:', await evaluate('DBUI.ui.game ? {active: DBUI.ui.game.active, turn: DBUI.ui.game.turn, hand: DBUI.ui.game.players[0].hand.length} : null'));
  console.log('OVERFLOW:', await evaluate('({sw:document.documentElement.scrollWidth, iw:innerWidth, sh:document.documentElement.scrollHeight, ih:innerHeight})'));
  await shot('02-battle-start.png');

  // 手牌悬停预览
  await evaluate(`(() => { const c = document.querySelector('[data-hand-index="0"]'); c.dispatchEvent(new MouseEvent('mouseover', {bubbles:true})); return true; })()`);
  await sleep(400);
  await shot('09-card-preview.png');

  // 构筑一个中局战场用于视觉检查
  const setup = `(() => {
    const { ui, Engine, Cards } = DBUI;
    const g = ui.game;
    if (!g) return 'no game';
    const p0 = g.players[0], p1 = g.players[1];
    // 清空
    p0.front=[]; p0.support=[]; p0.hand=[]; p0.graveyard=[]; p1.front=[]; p1.support=[]; p1.hand=[]; p1.graveyard=[];
    p0.crystals=8; p0.maxCrystals=10; p1.crystals=7; p1.maxCrystals=10;
    p0.hp=14; p1.hp=9; g.turn=8; g.active=0; g.winner=null; g.log=[];
    function dep(side,id){ g.active=side; g.players[side].crystals=99; g.players[side].hand=[id]; const r=Engine.playCard(g,side,0,null); if(!r.ok) throw new Error(id+':'+r.error); const us=g.players[side].front.concat(g.players[side].support); return us[us.length-1]; }
    function front(side,u){ g.active=side; u.exhausted=false; Engine.moveUnit(g,side,u.uid); }
    function eq(side,u,id){ g.active=side; g.players[side].crystals=99; g.players[side].hand=[id]; const r=Engine.playCard(g,side,0,{kind:'unit',side,uid:u.uid}); if(!r.ok) throw new Error(id+':'+r.error); }
    const gd=dep(0,'great_dragon'); front(0,gd);
    const wh=dep(0,'hybrid_high'); eq(0,wh,'iron_sword'); front(0,wh);
    const cd=dep(0,'cave_dragon');
    const fw=dep(0,'fire_wyvern'); front(0,fw);
    const az=dep(0,'azure_dragon');
    const hm=dep(0,'hybrid_mid'); eq(0,hm,'bow');
    const hs=dep(0,'hybrid_spawn'); eq(0,hs,'shield');
    const ic=dep(1,'ice_dragon'); front(1,ic);
    const dm=dep(1,'demon_dragon'); front(1,dm);
    const ba=dep(1,'basilisk');
    const tb=dep(1,'blue_dragon');
    const ht=dep(1,'hybrid_top'); eq(1,ht,'robe');
    const dc2=dep(1,'cave_dragon');
    // 状态
    tb.frozen=true; ba.burn=true; cd.frozen=true; fw.burn=true;
    // 手牌
    p0.hand=['fire_wyvern','cave_dragon','shield','bow','royal_salute'];
    p0.crystals=8; p0.maxCrystals=10; p1.crystals=7; p1.maxCrystals=10; g.turn=8; g.active=0;
    ui.selection=null; ui.busy=false; ui.aiRunning=false;
    g.log.push({turn:8,text:'—— 第 8 回合 · 你 ——',kind:'turn-self'});
    g.log.push({turn:8,text:'你部署了「威尔士红龙」。',kind:'play-self'});
    g.log.push({turn:8,text:'「冰原龙」冻结了「洞穴龙」。',kind:'buff'});
    g.log.push({turn:8,text:'「火翼龙」攻击「蓝龙」（1 点伤害）。',kind:'play-self'});
    g.log.push({turn:8,text:'「蓝龙」陷入灼烧（火翼龙）。',kind:'debuff'});
    g.log.push({turn:8,text:'你的总部受到 3 点伤害（剩余 14）。',kind:'bad'});
    DBUI.renderAll();
    return {units:p0.front.length+p0.support.length+p1.front.length+p1.support.length, hand:p0.hand.length};
  })()`;
  console.log('SETUP:', await evaluate(setup));
  await sleep(900);
  console.log('LAYOUT:', JSON.stringify(await evaluate(`(() => {    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
    return {
      activeScreens: Array.from(document.querySelectorAll('.screen.active')).map(s=>s.id),
      battleScreens: document.querySelectorAll('#screen-battle').length,
      shells: document.querySelectorAll('.battle-shell').length,
      bars: document.querySelectorAll('.battle-screen .hq-bar').length,
      shell: r(document.querySelector('.battle-shell')),
      enemyBar: r(document.querySelector('.battle-shell .enemy-bar')),
      body: r(document.querySelector('.battle-body')),
      playerBar: r(document.querySelector('.player-bar')),
      log: r(document.querySelector('.log-panel')),
      scrollY: window.scrollY,
      docH: document.documentElement.scrollHeight,
      bodyH: document.body.scrollHeight
    };
  })()`)));
  await shot('03-battle-mid.png');

  // 攻击目标高亮
  await evaluate(`(() => {
    const g = DBUI.ui.game;
    const u = g.players[0].front.find(x => DBUI.Engine.getAttackTargets(g, 0, x.uid).length);
    if (!u) return null;
    document.querySelector('.unit[data-uid="' + u.uid + '"]').click();
    return u.uid;
  })()`);
  await sleep(300);
  await evaluate(`(() => { const b = document.querySelector('#unit-menu [data-act="attack"]'); if (b) b.click(); return true; })()`);
  await sleep(400);
  await shot('11-targeting.png');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await sleep(300);

  // 打开卡牌图鉴、规则、卡组构筑
  await evaluate('DBUI.openCodex()');
  await sleep(500);
  await shot('04-codex.png');
  await evaluate('document.querySelector("#modal-root").classList.remove("open"); document.querySelector("#modal-root").innerHTML=""');
  await evaluate('DBUI.openRules()');
  await sleep(400);
  await shot('05-rules.png');
  await evaluate('document.querySelector("#modal-root").classList.remove("open"); document.querySelector("#modal-root").innerHTML=""');
  await evaluate('DBUI.openDeckBuilder()');
  await sleep(500);
  await shot('06-deckbuild.png');

  console.log('ERRORS:', errors.length ? errors : 'none');
  } finally {
    cleanup();
  }
  await sleep(300);
}

main().catch(err => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
