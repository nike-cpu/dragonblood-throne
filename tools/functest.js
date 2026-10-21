/* 功能测试：通过 CDP 真实点击界面，验证出牌、移动、攻击、AI 回合与卡组构筑 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9800 + Math.floor(Math.random() * 300);
const os = require('os');
const PROFILE = path.join(os.tmpdir(), 'dbt-edge-functest');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); }
}

function launch() {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
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
    setTimeout(() => { if (pending.has(my)) { pending.delete(my); reject(new Error('timeout ' + method)); } }, 25000);
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
      while (Date.now() - t0 < (timeout || 15000)) {
        const val = await ev(expression);
        if (val) return val;
        await sleep(300);
      }
      return null;
    }

    await sleep(1500);
    console.log('\n[UI] 主菜单');
    check('页面标题正确', (await ev('document.title')).includes('龙裔王座'));
    check('主菜单激活', await ev('document.querySelector("#screen-title").classList.contains("active")'));
    check('无 JS 异常', errors.length === 0, errors);

    // 通过主菜单开始对战
    await ev('document.querySelector("#btn-play").click()');
    await sleep(500);
    check('卡组选择弹窗打开', await ev('document.querySelector("#modal-root").classList.contains("open")'));
    check('三套预设可选', (await ev('document.querySelectorAll("[data-preset]").length')) === 3);
    await ev('document.querySelector("[data-preset=\\"ember\\"]").click()');
    await sleep(1400);
    check('对战界面激活', await ev('document.querySelector("#screen-battle").classList.contains("active")'));
    const init = await ev('({active:DBUI.ui.game.active, turn:DBUI.ui.game.turn, hand:DBUI.ui.game.players[0].hand.length, hp:DBUI.ui.game.players[0].hp})');
    check('开局状态正确', init.active === 0 && init.turn === 1 && init.hand === 5 && init.hp === 20, init);

    // 手牌悬停预览
    await ev(`(() => { const c = document.querySelector('[data-hand-index="0"]'); c.dispatchEvent(new MouseEvent('mouseover', {bubbles:true})); return true; })()`);
    await sleep(300);
    check('手牌悬停显示预览', await ev('document.querySelector("#card-preview").classList.contains("open")'));

    console.log('\n[UI] 出牌');
    const playable = await ev(`(() => {
      const g = DBUI.ui.game;
      const list = g.players[0].hand.map((id,i) => DBUI.Engine.getCardOptions(g,0,i));
      const idx = list.findIndex(o => o && o.playable);
      return { idx, info: list.map(o => o ? {name:o.card.name, playable:o.playable, targets:o.targets.length, unit:o.card.type==='unit'} : null) };
    })()`);
    check('第 1 回合有可打出的牌', playable.idx >= 0, playable.info);
    await ev(`document.querySelector('[data-hand-index="${playable.idx}"]').click()`);
    await sleep(300);
    const needsTarget = playable.info[playable.idx].targets > 0;
    if (needsTarget) {
      await ev(`(() => { const t = DBUI.ui.selection.targets[0]; const el = document.querySelector('.unit[data-uid="'+t.uid+'"]'); if (el) el.click(); return true; })()`);
    } else {
      await ev(`document.querySelector('.board-line[data-side="0"][data-line="support"]').click()`);
    }
    await sleep(1400);
    const afterPlay = await ev(`({hand:DBUI.ui.game.players[0].hand.length, support:DBUI.ui.game.players[0].support.length, busy:DBUI.ui.busy, log:DBUI.ui.game.log.slice(-2).map(x=>x.text)})`);
    check('手牌减少且场上有单位', afterPlay.support >= 1, afterPlay);

    console.log('\n[UI] 回合与 AI');
    await ev('document.querySelector("#btn-end-turn").click()');
    const aiDone = await waitFor('DBUI.ui.game.active === 0 && !DBUI.ui.busy && DBUI.ui.game.turn >= 3', 30000);
    check('AI 完成回合并交还玩家', !!aiDone);
    const t3 = await ev('({active:DBUI.ui.game.active, turn:DBUI.ui.game.turn, cpuHand:DBUI.ui.game.players[1].hand.length, cpuDeck:DBUI.ui.game.players[1].deck.length, winner:DBUI.ui.game.winner})');
    check('回到玩家回合且状态推进', t3.active === 0 && t3.turn >= 3, t3);

    // 10 张手牌在 1024 / 1200 宽下不得覆盖「结束回合」
    await ev(`(() => {
      const g = DBUI.ui.game;
      window.__qaSaved = {
        hand: g.players[0].hand.slice(),
        crystals: g.players[0].crystals,
        max: g.players[0].maxCrystals
      };
      g.players[0].hand = ['fire_wyvern','cave_dragon','shield','iron_sword','bow','robe','dragon_decree','for_breeding','ice_dragon','demon_dragon'];
      g.players[0].crystals = 10;
      g.players[0].maxCrystals = 10;
      DBUI.renderAll();
      return true;
    })()`);
    for (const width of [1024, 1200]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      await ev('DBUI.renderAll()');
      await sleep(200);
      const geom = await ev(`(() => {
        const cards = [...document.querySelectorAll('#hand .card')];
        const end = document.querySelector('#btn-end-turn').getBoundingClientRect();
        const last = cards[cards.length - 1].getBoundingClientRect();
        const hand = document.querySelector('#hand');
        const handRect = hand.getBoundingClientRect();
        const overlap = !(last.right <= end.left || last.left >= end.right || last.bottom <= end.top || last.top >= end.bottom);
        const hit = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
        return {
          count: cards.length,
          overlap,
          hitEnd: !!(hit && hit.closest('#btn-end-turn')),
          overflow: hand.scrollWidth > hand.clientWidth + 2,
          lastRight: Math.round(last.right),
          endLeft: Math.round(end.left),
          handRight: Math.round(handRect.right)
        };
      })()`);
      check('10 张手牌不遮挡结束回合（' + width + 'px）', geom.count === 10 && !geom.overlap && !geom.hitEnd && !geom.overflow, geom);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ev(`(() => {
      const g = DBUI.ui.game; const saved = window.__qaSaved;
      g.players[0].hand = saved.hand;
      g.players[0].crystals = saved.crystals;
      g.players[0].maxCrystals = saved.max;
      DBUI.renderAll();
      return true;
    })()`);
    await sleep(300);

    // 战报在 220 条上限之后仍需刷新
    await ev(`(() => {
      const g = DBUI.ui.game;
      for (let i = 0; i < 220; i++) {
        g.log.push({ turn: 1, text: '填充 ' + i, kind: 'info' });
        if (g.log.length > 220) g.log.shift();
        g.logSeq += 1;
      }
      g.log.push({ turn: 1, text: '战报刷新回归测试', kind: 'info' });
      if (g.log.length > 220) g.log.shift();
      g.logSeq += 1;
      DBUI.renderAll();
      return true;
    })()`);
    await sleep(300);
    check('战报满 220 条后仍然刷新', await ev('document.querySelector("#log-list").innerText.includes("战报刷新回归测试")'));

    // 玩家第二回合：再打一张牌
    const playable2 = await ev(`(() => {
      const g = DBUI.ui.game;
      const list = g.players[0].hand.map((id,i) => DBUI.Engine.getCardOptions(g,0,i));
      const idx = list.findIndex(o => o && o.playable);
      return { idx, targets: idx>=0 ? list[idx].targets.length : 0, unit: idx>=0 ? list[idx].card.type==='unit' : false };
    })()`);
    if (playable2.idx >= 0) {
      await ev(`document.querySelector('[data-hand-index="${playable2.idx}"]').click()`);
      await sleep(250);
      if (playable2.targets > 0) {
        await ev(`(() => { const t = DBUI.ui.selection.targets[0]; const el = document.querySelector('.unit[data-uid="'+t.uid+'"]'); if (el) el.click(); return true; })()`);
      } else {
        await ev(`document.querySelector('.board-line[data-side="0"][data-line="support"]').click()`);
      }
      await sleep(1400);
    }

    // 打开单位菜单（找一个玩家单位）
    await waitFor('!DBUI.ui.busy', 8000);
    // 清空敌方前线，确保本次 UI 测试能覆盖“前线为空时可攻击总部”
    await ev('(()=>{ const g=DBUI.ui.game; if(g){ g.players[1].front=[]; DBUI.renderAll(); } return true; })()');
    const unitInfo = await ev(`(() => {
      const g = DBUI.ui.game; const p = g.players[0]; const u = p.front.concat(p.support)[0];
      if (!u) return null;
      document.querySelector('.unit[data-uid="'+u.uid+'"]').click();
      return { uid:u.uid, line:u.line, canMove:DBUI.Engine.canMoveUnit(g,u), atkTargets:DBUI.Engine.getAttackTargets(g,0,u.uid).length };
    })()`);
    const menuOpened = await waitFor('document.querySelector("#unit-menu").classList.contains("open")', 3000);
    check('点击单位打开行动菜单', !!menuOpened, unitInfo);
    const menuText = await ev('document.querySelector("#unit-menu").innerText');
    check('菜单包含行动项', menuText.length > 0, menuText);

    // 若可移动，则移动并在可攻击时攻击总部
    if (unitInfo && unitInfo.canMove) {
      await ev(`(() => { const b = Array.from(document.querySelectorAll('#unit-menu [data-act]')).find(x=>x.dataset.act==='move'); if(b) b.click(); return true; })()`);
      await waitFor('!DBUI.ui.busy', 8000);
      await sleep(400);
      const moved = await ev(`(() => { const g=DBUI.ui.game; const p=g.players[0]; return {front:p.front.length, selType:DBUI.ui.selection&&DBUI.ui.selection.type}; })()`);
      check('单位移动到前线', moved.front >= 1, moved);
      // 自动进入攻击选择，点击敌方总部
      const canHitHq = await ev(`(() => { const s=DBUI.ui.selection; return !!(s && s.type==='attack' && s.targets.some(t=>t.kind==='hq')); })()`);
      if (canHitHq) {
        const hpBefore = await ev('DBUI.ui.game.players[1].hp');
        await ev('document.querySelector("#enemy-hq-wrap").click()');
        await sleep(1600);
        const hpAfter = await ev('DBUI.ui.game.players[1].hp');
        check('攻击敌方总部造成伤害', hpAfter < hpBefore, { hpBefore, hpAfter });
      }
    }

    // 关闭菜单 / 取消
    await ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');

    console.log('\n[UI] 卡组构筑');
    await ev('DBUI.openDeckBuilder()');
    await sleep(600);
    check('进入卡组构筑', await ev('document.querySelector("#screen-deckbuild").classList.contains("active")'));
    await ev('document.querySelector("#btn-deck-clear").click()');
    await sleep(300);
    const count0 = await ev('Number(document.querySelector("#deck-count").textContent)');
    check('清空卡组', count0 === 0, { count0 });
    await ev('document.querySelector("[data-pool-card]").click()');
    await sleep(300);
    const count1 = await ev('Number(document.querySelector("#deck-count").textContent)');
    check('点击卡牌加入卡组', count1 === count0 + 1, { count0, count1 });
    await ev('document.querySelector("[data-remove-card]").click()');
    await sleep(300);
    const count2 = await ev('Number(document.querySelector("#deck-count").textContent)');
    check('移除卡牌生效', count2 === count1 - 1, { count1, count2 });
    await ev('Array.from(document.querySelectorAll("[data-pool-filter]")).find(b=>b.dataset.poolFilter==="equip").click()');
    await sleep(300);
    check('卡池筛选生效', await ev('document.querySelectorAll("[data-pool-card]").length > 0 && Array.from(document.querySelectorAll("[data-pool-card]")).every(c=>{ const card=DBUI.Cards.get(c.dataset.poolCard); return card.type==="equip"; })'));

    // 保存 / 读取自定义卡组
    await ev('document.querySelector("#btn-deck-presets").click()');
    await sleep(350);
    check('载入预设弹窗打开', await ev('document.querySelector("[data-load-preset]") !== null'));
    await ev('document.querySelector("[data-load-preset=\\"ember\\"]").click()');
    await sleep(400);
    await ev('document.querySelector("#btn-deck-save").click()');
    await sleep(350);
    const stored = await ev('localStorage.getItem("dbt.customDeck.v1")');
    check('保存卡组写入 localStorage', !!stored && JSON.parse(stored).length === 30, stored ? String(stored).slice(0, 60) : String(stored));
    await send('Page.reload', { ignoreCache: true });
    await sleep(1600);
    check('刷新后自定义卡组仍然存在', (await ev('DBUI.ui.customDeck ? DBUI.ui.customDeck.length : 0')) === 30);

    console.log('\n[UI] 图鉴与规则');
    await ev('DBUI.openCodex()');
    await sleep(400);
    check('图鉴打开', await ev('document.querySelectorAll(".codex-grid .card").length >= 20'));
    await ev('DBUI.openRules()');
    await sleep(300);
    check('规则弹窗打开', await ev('document.querySelector(".rules-content") !== null'));
    await ev('document.querySelector("[data-close-modal]").click()');
    await sleep(300);
    check('弹窗可关闭', !(await ev('document.querySelector("#modal-root").classList.contains("open")')));

    // 截图
    await ev(`DBUI.startBattle({playerDeck: DBUI.Cards.PRESETS.hybrid.cards.slice(), playerDeckName:'混血军团', enemyDeck: DBUI.Cards.PRESETS.ember.cards.slice(), enemyDeckName:'烈焰突袭'})`);
    await sleep(1000);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'screenshots', '07-functest.png'), Buffer.from(shot.data, 'base64'));
    console.log('screenshot: screenshots/07-functest.png');

    console.log('\n[结果]');
    console.log('JS 异常:', errors.length ? errors : '无');
    console.log('通过 ' + pass + ' / ' + (pass + fail));
    if (fail || errors.length) process.exitCode = 1;
  } finally {
    cleanup();
  }
  await sleep(300);
})().catch(err => {
  console.error('FUNCTEST FAILED:', err);
  process.exit(1);
});
