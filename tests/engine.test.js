/* ==========================================================================
 * 龙裔王座 · 规则引擎测试
 * 运行： node tests/engine.test.js
 * ========================================================================== */
'use strict';

const path = require('path');
const Cards = require(path.join(__dirname, '..', 'js', 'cards.js'));
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const AI = require(path.join(__dirname, '..', 'js', 'ai.js'));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log('  \u2717 ' + name + '\n      ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '值不相等') + `：actual=${actual}, expected=${expected}`);
}
function assertNear(actual, expected, msg) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error((msg || '数值不相等') + `：actual=${actual}, expected=${expected}`);
}

/* ---------------------------- 测试工具 ---------------------------- */

const DECK_ID = 'wyvern';
function fixedDeck(n) {
  const arr = [];
  for (let i = 0; i < (n || 30); i++) arr.push(DECK_ID);
  return arr;
}

function fresh(seed) {
  const state = Engine.createGame({
    playerDeck: fixedDeck(30),
    enemyDeck: fixedDeck(30),
    seed: seed == null ? 12345 : seed,
    playerName: '测试玩家',
    enemyName: '测试对手',
    enemyDeckName: '测试卡组'
  });
  return state;
}

function setActive(state, side) { state.active = side; }

function deploy(state, side, cardId, target) {
  state.active = side;
  state.players[side].crystals = 99;
  state.players[side].hand = [cardId];
  const res = Engine.playCard(state, side, 0, target || null);
  assert(res.ok, `部署 ${cardId} 失败：${res.error}`);
  const units = state.players[side].front.concat(state.players[side].support);
  const found = units.filter(u => u.cardId === cardId);
  assert(found.length, `没有找到刚部署的 ${cardId}`);
  return found[found.length - 1];
}

function lastUnitOf(state, side, cardId) {
  const units = state.players[side].front.concat(state.players[side].support);
  const found = units.filter(u => u.cardId === cardId);
  return found[found.length - 1] || null;
}

function readyAll(state, side) {
  state.players[side].front.concat(state.players[side].support).forEach(u => {
    u.exhausted = false;
    u.frozen = false;
    u.movedThisTurn = false;
  });
}

function toFront(state, side, uid) {
  state.active = side;
  const u = Engine.findUnit(state, side, uid);
  u.exhausted = false;
  u.frozen = false;
  const res = Engine.moveUnit(state, side, uid);
  assert(res.ok, `移动到前线失败：${res.error}`);
  return u;
}

function attack(state, side, uid, target) {
  state.active = side;
  const u = Engine.findUnit(state, side, uid);
  if (u) { u.exhausted = false; u.frozen = false; }
  const res = Engine.attack(state, side, uid, target);
  assert(res.ok, `攻击失败：${res.error}`);
  return res;
}

function hqTarget(side) { return { kind: 'hq', side }; }
function unitTarget(state, side, cardId) {
  const u = lastUnitOf(state, side, cardId);
  assert(u, `找不到单位 ${cardId}`);
  return { kind: 'unit', side, uid: u.uid };
}
function handIds(state, side) { return state.players[side].hand.slice(); }

/* ========================================================================== */
console.log('\n[1] 卡牌数据与卡组');
/* ========================================================================== */

test('39 张卡牌、id 唯一、字段完整', () => {
  assertEqual(Cards.CARDS.length, 39);
  const ids = new Set();
  for (const c of Cards.CARDS) {
    assert(!ids.has(c.id), '重复 id: ' + c.id);
    ids.add(c.id);
    assert(c.name && typeof c.cost === 'number' && typeof c.text === 'string', '字段缺失: ' + c.id);
    assert(['unit', 'equip', 'tactic'].includes(c.type), '类型错误: ' + c.id);
    if (c.type === 'unit') {
      assert(typeof c.atk === 'number' && typeof c.def === 'number', '单位缺少属性: ' + c.id);
      assert(['dragon', 'hybrid'].includes(c.tribe), '单位缺少种族: ' + c.id);
    }
  }
});

test('三套预设卡组均为 30 张且合法', () => {
  for (const p of Cards.PRESET_LIST) {
    assertEqual(p.cards.length, 30, p.name + ' 数量');
    const v = Cards.validateDeck(p.cards);
    assert(v.ok, p.name + ' 校验失败：' + v.errors.join('; '));
  }
});

test('卡组校验：数量、未知卡、超复制上限', () => {
  assert(!Cards.validateDeck([]).ok);
  const tooMany = fixedDeck(30).slice();
  tooMany[0] = 'unknown_card';
  assert(!Cards.validateDeck(tooMany).ok);
  const four = ['wyvern', 'wyvern', 'wyvern', 'wyvern'].concat(Array(26).fill('red_dragon'));
  assert(!Cards.validateDeck(four).ok, '四张同名卡应不合法');
  assert(Cards.validateDeck(Cards.PRESETS.frost.cards).ok);
});

/* ========================================================================== */
console.log('\n[2] 开局与回合');
/* ========================================================================== */

test('开局：20 血、先手方、初始手牌与龙晶', () => {
  const s = fresh();
  assertEqual(s.players[0].hp, 20);
  assertEqual(s.players[1].hp, 20);
  assertEqual(s.active, 0);
  assertEqual(s.turn, 1);
  assertEqual(s.players[0].crystals, 1);
  assertEqual(s.players[0].hand.length, 5);
  assertEqual(s.players[1].hand.length, 4);
  assertEqual(s.players[0].deck.length, 25);
});

test('回合推进：龙晶上限与补满、双方各抽一张', () => {
  const s = fresh();
  const p0hand = s.players[0].hand.length;
  const p1hand = s.players[1].hand.length;
  Engine.endTurn(s); // -> AI turn1
  assertEqual(s.active, 1);
  assertEqual(s.players[1].crystals, 1);
  assertEqual(s.players[1].hand.length, p1hand + 1);
  Engine.endTurn(s); // -> player turn2
  assertEqual(s.active, 0);
  assertEqual(s.turn, 3);
  assertEqual(s.players[0].maxCrystals, 2);
  assertEqual(s.players[0].crystals, 2);
  assertEqual(s.players[0].hand.length, p0hand + 1);
});

test('疲劳：牌库耗尽时总部受伤并递增', () => {
  const s = fresh();
  s.players[0].deck = [];
  s.active = 1;
  Engine.endTurn(s); // player turn2 begins
  assertEqual(s.players[0].fatigue, 1);
  assertEqual(s.players[0].hp, 19);
  s.players[0].deck = [];
  s.active = 1;
  Engine.endTurn(s); // AI turn then player turn3
  Engine.endTurn(s);
  assertEqual(s.players[0].fatigue, 2);
  assertEqual(s.players[0].hp, 17);
});

test('牌库为空时抽牌不会崩溃', () => {
  const s = fresh();
  s.players[1].deck = [];
  Engine.endTurn(s);
  assertEqual(s.players[1].fatigue, 1);
  assertEqual(s.players[1].hp, 19);
});

/* ========================================================================== */
console.log('\n[3] 部署规则');
/* ========================================================================== */

test('部署单位进入支援阵线、消耗龙晶、当回合无法行动', () => {
  const s = fresh();
  const u = deploy(s, 0, 'red_dragon');
  assertEqual(u.line, 'support');
  assertEqual(u.def, 1);
  assert(u.exhausted, '新部署单位应处于疲惫状态');
  assertEqual(s.players[0].crystals, 98);
  assertEqual(s.players[0].support.length, 1);
});

test('0 费卡牌可以部署', () => {
  const s = fresh();
  s.players[0].crystals = 0;
  s.players[0].hand = ['wyvern'];
  s.active = 0;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[0].crystals, 0);
});

test('龙晶不足无法打出', () => {
  const s = fresh();
  s.players[0].crystals = 0;
  s.players[0].hand = ['red_dragon'];
  s.active = 0;
  const check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok);
  assert(check.reason.includes('龙晶'));
});

test('支援阵线最多 5 个单位', () => {
  const s = fresh();
  for (let i = 0; i < 5; i++) deploy(s, 0, 'wyvern');
  assertEqual(s.players[0].support.length, 5);
  s.players[0].hand = ['wyvern'];
  s.active = 0;
  const check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok);
  assert(check.reason.includes('支援阵线'));
});

test('非当前回合玩家不能出牌', () => {
  const s = fresh();
  s.players[1].hand = ['red_dragon'];
  const res = Engine.playCard(s, 1, 0);
  assert(!res.ok);
});

/* ========================================================================== */
console.log('\n[4] 阵线与攻击');
/* ========================================================================== */

test('支援阵线的普通单位不能攻击', () => {
  const s = fresh();
  const u = deploy(s, 0, 'red_dragon');
  readyAll(s, 0);
  assertEqual(Engine.getAttackTargets(s, 0, u.uid).length, 0);
});

test('前线单位可以攻击敌方总部', () => {
  const s = fresh();
  const u = deploy(s, 0, 'red_dragon');
  toFront(s, 0, u.uid);
  attack(s, 0, u.uid, hqTarget(1));
  assertEqual(s.players[1].hp, 18);
});

test('前线单位攻击敌方前线单位并互相造成伤害', () => {
  const s = fresh();
  const mine = deploy(s, 0, 'great_dragon'); // 1/4
  toFront(s, 0, mine.uid);
  const enemy = deploy(s, 1, 'red_dragon'); // 2/1
  toFront(s, 1, enemy.uid);
  attack(s, 0, mine.uid, { kind: 'unit', side: 1, uid: enemy.uid });
  assert(!Engine.findUnit(s, 1, enemy.uid), '敌方单位应被消灭');
  const mineNow = Engine.findUnit(s, 0, mine.uid);
  assert(mineNow, '攻击者应存活');
  assertEqual(mineNow.def, 2, '攻击者受到反击伤害');
});

test('敌方前线存在单位时，不能攻击其支援阵线', () => {
  const s = fresh();
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  const blocker = deploy(s, 1, 'wyvern');
  toFront(s, 1, blocker.uid);
  const hidden = deploy(s, 1, 'blue_dragon');
  setActive(s, 0);
  readyAll(s, 0);
  const targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(!targets.some(t => t.kind === 'hq'), '敌方前线有单位时总部不可攻击');
  assert(!targets.some(t => t.uid === hidden.uid), '不应能攻击敌方支援阵线');
  // 清空敌方前线后，总部与支援阵线暴露
  s.players[1].front = [];
  const targets2 = Engine.getAttackTargets(s, 0, mine.uid);
  assert(targets2.some(t => t.kind === 'hq'), '敌方前线清空后总部可攻击');
  assert(targets2.some(t => t.uid === hidden.uid), '敌方前线清空后应能攻击支援阵线');
});

test('特殊卡牌可直接伤害总部，不受敌方前线单位阻挡', () => {
  const s = fresh();
  const blocker = deploy(s, 1, 'great_dragon');
  toFront(s, 1, blocker.uid);
  s.active = 0; s.players[0].hand = ['quick_victory']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[1].hp, 15, '快速取胜应直接对总部造成5点伤害');
  // 同一场面下，普通单位攻击仍然不能越过前线打总部
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  setActive(s, 0);
  readyAll(s, 0);
  const targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(!targets.some(t => t.kind === 'hq'), '普通攻击仍应被敌方前线阻挡');
});

test('弓箭：支援阵线的装备者可以攻击敌方两线单位，但不能打总部', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_mid');
  const equipTarget = { kind: 'unit', side: 0, uid: hybrid.uid };
  s.active = 0; s.players[0].hand = ['bow']; s.players[0].crystals = 99;
  let res = Engine.playCard(s, 0, 0, equipTarget);
  assert(res.ok, res.error);
  const enemyFront = deploy(s, 1, 'red_dragon');
  toFront(s, 1, enemyFront.uid);
  const enemySupport = deploy(s, 1, 'blue_dragon');
  setActive(s, 0);
  readyAll(s, 0);
  const targets = Engine.getAttackTargets(s, 0, hybrid.uid);
  assert(targets.some(t => t.uid === enemyFront.uid), '应能攻击敌方前线');
  assert(targets.some(t => t.uid === enemySupport.uid), '应能攻击敌方支援阵线');
  assert(!targets.some(t => t.kind === 'hq'), '弓箭不能攻击总部');
});

test('弓箭：支援阵线攻击时，己方前线有单位则不受到反击', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_high'); // 3/3
  s.active = 0; s.players[0].hand = ['bow']; s.players[0].crystals = 99;
  let res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, res.error);
  const ownFront = deploy(s, 0, 'blue_dragon');
  toFront(s, 0, ownFront.uid);
  const enemy = deploy(s, 1, 'blue_dragon');
  toFront(s, 1, enemy.uid);
  setActive(s, 0); readyAll(s, 0);
  hybrid.exhausted = false; hybrid.frozen = false;
  const before = hybrid.def;
  res = attack(s, 0, hybrid.uid, { kind: 'unit', side: 1, uid: enemy.uid });
  assertEqual(hybrid.def, before, '前线有友军掩护时弓箭手不应受到反击');
  assert(res.events.some(e => e.t === 'cover'), '应产生前线掩护事件');
  assert(!s.log.some(l => l.text.includes('反击，对')), '战报不应出现反击伤害');
});

test('弓箭：支援阵线攻击时，己方前线为空仍会受到反击', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_high'); // 3/3
  s.active = 0; s.players[0].hand = ['bow']; s.players[0].crystals = 99;
  let res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, res.error);
  const enemy = deploy(s, 1, 'blue_dragon');
  toFront(s, 1, enemy.uid);
  setActive(s, 0); readyAll(s, 0);
  hybrid.exhausted = false; hybrid.frozen = false;
  res = attack(s, 0, hybrid.uid, { kind: 'unit', side: 1, uid: enemy.uid });
  assertEqual(hybrid.def, 1, '没有前线掩护时应受到 2 点反击');
  assert(s.log.some(l => l.text.includes('反击')), '战报应出现反击');
});

test('单位每回合只能攻击一次', () => {
  const s = fresh();
  const u = deploy(s, 0, 'red_dragon');
  toFront(s, 0, u.uid);
  attack(s, 0, u.uid, hqTarget(1));
  const res = Engine.attack(s, 0, u.uid, hqTarget(1));
  assert(!res.ok);
  assertEqual(s.players[1].hp, 18);
});

test('被冻结的单位无法攻击或移动', () => {
  const s = fresh();
  const u = deploy(s, 0, 'red_dragon');
  toFront(s, 0, u.uid);
  u.frozen = true;
  readyAll(s, 0);
  u.frozen = true;
  assert(!Engine.canAttackWith(s, u));
  assert(!Engine.canMoveUnit(s, u));
});

/* ========================================================================== */
console.log('\n[5] 状态与异能');
/* ========================================================================== */

test('火翼龙：攻击附加灼烧，目标控制者回合开始扣 1 血', () => {
  const s = fresh();
  const target = deploy(s, 1, 'great_dragon'); // 1/4
  const fw = deploy(s, 0, 'fire_wyvern');
  toFront(s, 0, fw.uid);
  attack(s, 0, fw.uid, { kind: 'unit', side: 1, uid: target.uid });
  assert(target.burn, '目标应进入灼烧');
  assertEqual(target.def, 3);
  Engine.endTurn(s); // AI 回合开始（灼烧结算）
  assertEqual(target.def, 2, '灼烧应造成 1 点伤害');
});

test('冰原龙：部署冻结目标，目标回合结束后解冻', () => {
  const s = fresh();
  const target = deploy(s, 1, 'blue_dragon');
  toFront(s, 1, target.uid);
  readyAll(s, 1);
  const ice = deploy(s, 0, 'ice_dragon', { kind: 'unit', side: 1, uid: target.uid });
  assert(target.frozen, '目标应被冻结');
  // 结束玩家回合 -> AI 回合：冻结单位不能行动
  Engine.endTurn(s);
  assert(target.frozen, 'AI 回合内应保持冻结');
  assert(!Engine.canAttackWith(s, target));
  assertEqual(target.exhausted, false, '被冻结单位仍会重置疲惫');
  // AI 结束回合后解冻
  Engine.endTurn(s);
  assert(!target.frozen, 'AI 回合结束后应解冻');
});

test('蛇怪：烟幕未行动时无法被选中，移动后暴露', () => {
  const s = fresh();
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  const basilisk = deploy(s, 1, 'basilisk');
  assert(basilisk.smoke);
  let targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(!targets.some(t => t.uid === basilisk.uid), '烟幕中不应被选中');
  toFront(s, 1, basilisk.uid);
  assert(!basilisk.smoke, '移动后烟幕消失');
  setActive(s, 0);
  readyAll(s, 0);
  targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(targets.some(t => t.uid === basilisk.uid), '移动后应可被选中');
});

test('蛇怪：死亡时对随机目标造成 1 点伤害', () => {
  const s = fresh();
  const basilisk = deploy(s, 1, 'basilisk');
  basilisk.smoke = false;
  toFront(s, 1, basilisk.uid);
  const attacker = deploy(s, 0, 'two_legged_wyvern'); // 3/1
  toFront(s, 0, attacker.uid);
  // 3 攻刚好击杀 2/3 蛇怪，反击 2 点击杀 1 防攻击者
  const hpBefore = s.players[0].hp;
  attack(s, 0, attacker.uid, { kind: 'unit', side: 1, uid: basilisk.uid });
  assert(!Engine.findUnit(s, 1, basilisk.uid), '蛇怪应死亡');
  assertEqual(s.players[0].hp, hpBefore - 1, '随机伤害落到总部');
});

test('法袍：未行动时无法被选中；攻击后暴露；50% 额外伤害可触发', () => {
  const s = fresh();
  const enemyHybrid = deploy(s, 1, 'hybrid_high');
  s.active = 1; s.players[1].crystals = 99; s.players[1].hand = ['robe'];
  let res = Engine.playCard(s, 1, 0, { kind: 'unit', side: 1, uid: enemyHybrid.uid });
  assert(res.ok, res.error);
  // 部署当回合虽然疲惫，但尚未行动，法袍同样隐匿
  assert(Engine.isUntargetable(enemyHybrid), '刚部署装备法袍的单位也应隐匿');
  readyAll(s, 1);
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  let targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(!targets.some(t => t.uid === enemyHybrid.uid), '法袍未行动时无法选中');
  // 行动后暴露
  enemyHybrid.actedThisTurn = true;
  targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(targets.some(t => t.uid === enemyHybrid.uid), '法袍单位行动后应可被选中');

  // 额外伤害：己方混血种装备法袍攻击总部，随机数固定为必定触发
  const myHybrid = deploy(s, 0, 'hybrid_mid'); // 2/2
  s.active = 0; s.players[0].crystals = 99; s.players[0].hand = ['robe'];
  res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: myHybrid.uid });
  assert(res.ok, res.error);
  toFront(s, 0, myHybrid.uid);
  s.random = () => 0.1;
  const hpBefore = s.players[1].hp;
  attack(s, 0, myHybrid.uid, hqTarget(1));
  assertEqual(s.players[1].hp, hpBefore - 3, '2 攻 + 法袍 1 点额外伤害');
});

test('洞穴龙：两只相邻洞穴龙可以互相庇护', () => {
  const s = fresh();
  const caveA = deploy(s, 1, 'cave_dragon');
  const caveB = deploy(s, 1, 'cave_dragon');
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  const targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(Engine.isProtected(s, caveA), '洞穴龙 A 应被 B 庇护');
  assert(Engine.isProtected(s, caveB), '洞穴龙 B 应被 A 庇护');
  assert(!targets.some(t => t.kind === 'unit'), '互保时普通攻击只能指向总部');
  assert(targets.some(t => t.kind === 'hq'), '总部仍可攻击');
});

test('洞穴龙：庇护左右相邻友军，自身被摧毁后失效', () => {
  const s = fresh();
  const cave = deploy(s, 1, 'cave_dragon');
  const neighbor = deploy(s, 1, 'blue_dragon'); // 位于洞穴龙右侧
  assertEqual(s.players[1].support.length, 2);
  const mine = deploy(s, 0, 'great_dragon');
  toFront(s, 0, mine.uid);
  let targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(targets.some(t => t.uid === cave.uid), '洞穴龙本身可被攻击');
  assert(!targets.some(t => t.uid === neighbor.uid), '被庇护单位不可被攻击');

  // 把洞穴龙打残再击杀
  cave.def = 1;
  attack(s, 0, mine.uid, { kind: 'unit', side: 1, uid: cave.uid });
  assert(!Engine.findUnit(s, 1, cave.uid), '洞穴龙应死亡');
  readyAll(s, 0);
  targets = Engine.getAttackTargets(s, 0, mine.uid);
  assert(targets.some(t => t.uid === neighbor.uid), '洞穴龙死后庇护失效');
});

test('双足飞龙：敌方没有 2 费以上卡牌时攻击力 +2', () => {
  const s = fresh();
  const w = deploy(s, 0, 'two_legged_wyvern');
  assertEqual(Engine.unitAtk(s, w), 5);
  deploy(s, 1, 'ice_dragon'); // 3 费
  assertEqual(Engine.unitAtk(s, w), 3);
});

test('威尔士红龙：部署时所有友方单位 +2 防御', () => {
  const s = fresh();
  const a = deploy(s, 0, 'blue_dragon'); // 2/2
  const b = deploy(s, 0, 'welsh_red'); // 4/4
  assertEqual(Engine.unitMaxDef(a), 4);
  assertEqual(a.def, 4);
  assertEqual(Engine.unitMaxDef(b), 6);
  assertEqual(b.def, 6);
});

test('仙灵龙：将友方单位修复至满并 +1/+1', () => {
  const s = fresh();
  const ally = deploy(s, 0, 'blue_dragon'); // 2/2
  ally.def = 1;
  const fairy = deploy(s, 0, 'fairy_dragon', { kind: 'unit', side: 0, uid: ally.uid });
  assertEqual(Engine.unitMaxDef(ally), 3);
  assertEqual(ally.def, 3);
  assertEqual(Engine.unitAtk(s, ally), 3);
  assert(fairy);
});

test('仙灵龙：没有其他友方单位时可以强化自身', () => {
  const s = fresh();
  const fairy = deploy(s, 0, 'fairy_dragon');
  assertEqual(Engine.unitAtk(s, fairy), 3);
  assertEqual(Engine.unitMaxDef(fairy), 6);
  assertEqual(fairy.def, 6);
});

test('魔龙：部署与死亡各对敌方总部造成 2 点伤害', () => {
  const s = fresh();
  deploy(s, 1, 'demon_dragon');
  assertEqual(s.players[0].hp, 18, '部署伤害');
  // 用玩家单位击杀魔龙（1 防）
  const killer = deploy(s, 0, 'great_dragon');
  toFront(s, 0, killer.uid);
  attack(s, 0, killer.uid, unitTarget(s, 1, 'demon_dragon'));
  assertEqual(s.players[0].hp, 16, '死亡伤害');
});

test('青龙：每回合一次恢复友方 1 点防御', () => {
  const s = fresh();
  const azure = deploy(s, 0, 'azure_dragon');
  const ally = deploy(s, 0, 'blue_dragon');
  ally.def = 1;
  readyAll(s, 0);
  let res = Engine.activateUnit(s, 0, azure.uid, { kind: 'unit', side: 0, uid: ally.uid });
  assert(res.ok, res.error);
  assertEqual(ally.def, 2);
  res = Engine.activateUnit(s, 0, azure.uid, { kind: 'unit', side: 0, uid: ally.uid });
  assert(!res.ok, '每回合只能使用一次');
  // 下回合重置
  Engine.endTurn(s);
  Engine.endTurn(s);
  res = Engine.activateUnit(s, 0, azure.uid, { kind: 'unit', side: 0, uid: ally.uid });
  assert(res.ok, '新回合应可再次使用');
});

test('青龙：疗愈不消耗行动，冻结与部署当回合仍可使用', () => {
  const s = fresh();
  const azure = deploy(s, 0, 'azure_dragon');
  const ally = deploy(s, 0, 'blue_dragon');
  ally.def = 1;
  azure.frozen = true;      // 冻结不影响“不消耗行动”的疗愈
  azure.exhausted = true;   // 部署当回合 / 已攻击也可使用
  s.active = 0;
  const res = Engine.activateUnit(s, 0, azure.uid, { kind: 'unit', side: 0, uid: ally.uid });
  assert(res.ok, res.error);
  assertEqual(ally.def, 2);
});

test('回合开始灼烧致胜后不再抽牌', () => {
  const s = fresh();
  const basilisk = deploy(s, 1, 'basilisk');
  basilisk.burn = true;
  basilisk.def = 1;
  s.players[0].hp = 1;
  s.players[0].front = [];
  s.players[0].support = [];
  const p1 = s.players[1];
  const handBefore = p1.hand.length;
  const deckBefore = p1.deck.length;
  s.active = 0;
  Engine.endTurn(s);
  assertEqual(s.winner, 1, '蛇怪遗言应击破玩家总部');
  assertEqual(p1.hand.length, handBefore, '胜负已分后不应抽牌');
  assertEqual(p1.deck.length, deckBefore, '胜负已分后牌库不应变化');
  const gameoverIndex = s.events.findIndex(e => e.t === 'gameover');
  const drawAfter = s.events.slice(gameoverIndex + 1).some(e => e.t === 'draw');
  assert(!drawAfter, 'gameover 之后不应出现抽牌事件');
});

test('北欧白龙：4 费 10/6，无法攻击总部但可攻击单位', () => {
  const s = fresh();
  const white = deploy(s, 0, 'nordic_white_dragon');
  assertEqual(white.cost, 4);
  assertEqual(Engine.unitAtk(s, white), 10);
  assertEqual(Engine.unitMaxDef(white), 6);
  toFront(s, 0, white.uid);
  const enemy = deploy(s, 1, 'blue_dragon');
  toFront(s, 1, enemy.uid);
  setActive(s, 0);
  readyAll(s, 0);
  const targets = Engine.getAttackTargets(s, 0, white.uid);
  assert(!targets.some(t => t.kind === 'hq'), '北欧白龙不能攻击总部');
  assert(targets.some(t => t.uid === enemy.uid), '北欧白龙可以攻击前线单位');
});

test('精灵龙：每部署一个费用≥3的单位获得+1防御，不含自身', () => {
  const s = fresh();
  const elf = deploy(s, 0, 'elf_dragon');
  assertEqual(Engine.unitMaxDef(elf), 3, '精灵龙自身部署不触发成长');
  deploy(s, 0, 'blue_dragon'); // 1 费，不触发
  assertEqual(Engine.unitMaxDef(elf), 3);
  deploy(s, 1, 'ice_dragon'); // 3 费，任何一方部署都触发
  assertEqual(Engine.unitMaxDef(elf), 4);
  assertEqual(elf.def, 4);
  deploy(s, 0, 'nordic_white_dragon'); // 4 费
  assertEqual(Engine.unitMaxDef(elf), 5);
});

/* ========================================================================== */
console.log('\n[6] 装备与战术');
/* ========================================================================== */

test('盾牌、铁剑与三装备槽：混血种最多装备三件', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_mid'); // 2/2
  s.active = 0; s.players[0].crystals = 99; s.players[0].hand = ['shield'];
  let res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, res.error);
  assertEqual(hybrid.def, 3);
  assertEqual(Engine.unitMaxDef(hybrid), 3);
  s.players[0].hand = ['iron_sword'];
  res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, '三装备槽应允许第二件装备');
  assertEqual(Engine.unitAtk(s, hybrid), 3);
  s.players[0].hand = ['bow'];
  res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, '三装备槽应允许第三件装备');
  assertEqual(hybrid.equipment.length, 3);
  s.players[0].hand = ['leather_armor'];
  res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(!res.ok, '第四件装备应被拒绝');
});

test('木剑：下回合开始时攻击力+1，且只生效一次', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_mid'); // 2/2
  s.active = 0; s.players[0].hand = ['wooden_sword']; s.players[0].crystals = 99;
  let res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, res.error);
  assertEqual(Engine.unitAtk(s, hybrid), 2, '装备当回合不立即加攻击');
  Engine.endTurn(s); // 对手回合开始
  Engine.endTurn(s); // 自己下回合开始
  assertEqual(Engine.unitAtk(s, hybrid), 3, '下回合开始应+1攻击');
  Engine.endTurn(s);
  Engine.endTurn(s);
  assertEqual(Engine.unitAtk(s, hybrid), 3, '延迟装备只生效一次');
});

test('皮甲：下回合开始时防御力+1，且只生效一次', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_mid'); // 2/2
  s.active = 0; s.players[0].hand = ['leather_armor']; s.players[0].crystals = 99;
  let res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: hybrid.uid });
  assert(res.ok, res.error);
  assertEqual(Engine.unitMaxDef(hybrid), 2, '装备当回合不立即加防御');
  Engine.endTurn(s);
  Engine.endTurn(s);
  assertEqual(Engine.unitMaxDef(hybrid), 3, '下回合开始应+1防御');
  assertEqual(hybrid.def, 3);
  Engine.endTurn(s);
  Engine.endTurn(s);
  assertEqual(Engine.unitMaxDef(hybrid), 3, '延迟装备只生效一次');
});

test('装备只能给混血种', () => {
  const s = fresh();
  const dragon = deploy(s, 0, 'blue_dragon');
  s.active = 0; s.players[0].hand = ['shield']; s.players[0].crystals = 99;
  const check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok, '没有混血种时装备应不可打出');
  const targets = Engine.getTargets(s, 0, Cards.get('shield'));
  assertEqual(targets.length, 0);
});

test('龙族诏令：指定友方龙族 +1/+1', () => {
  const s = fresh();
  const dragon = deploy(s, 0, 'blue_dragon'); // 2/2
  s.active = 0; s.players[0].hand = ['dragon_decree']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 0, uid: dragon.uid });
  assert(res.ok, res.error);
  assertEqual(Engine.unitAtk(s, dragon), 3);
  assertEqual(Engine.unitMaxDef(dragon), 3);
  assertEqual(dragon.def, 3);
});

test('为了繁衍：所有友方龙族 +2 防御，不作用于混血种', () => {
  const s = fresh();
  const dragon = deploy(s, 0, 'blue_dragon');
  const hybrid = deploy(s, 0, 'hybrid_spawn');
  s.active = 0; s.players[0].hand = ['for_breeding']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(Engine.unitMaxDef(dragon), 4);
  assertEqual(Engine.unitMaxDef(hybrid), 1);
});

test('寒风：只伤害敌方前线单位', () => {
  const s = fresh();
  const front = deploy(s, 1, 'blue_dragon'); // 2/2
  toFront(s, 1, front.uid);
  const support = deploy(s, 1, 'red_dragon'); // 2/1
  s.active = 0; s.players[0].hand = ['cold_wind']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(front.def, 1);
  assertEqual(support.def, 1);
});

test('空中闪击：对敌方龙族 4 点伤害，不能指定混血种', () => {
  const s = fresh();
  const dragon = deploy(s, 1, 'great_dragon'); // 1/4
  const hybrid = deploy(s, 1, 'hybrid_high');
  s.active = 0; s.players[0].hand = ['aerial_strike']; s.players[0].crystals = 99;
  const options = Engine.getCardOptions(s, 0, 0);
  assert(options.playable);
  assert(options.targets.every(t => {
    const u = Engine.findUnit(s, t.side, t.uid);
    return u.tribe === 'dragon';
  }), '只能指定龙族');
  const res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 1, uid: dragon.uid });
  assert(res.ok, res.error);
  assert(!Engine.findUnit(s, 1, dragon.uid), '4 点伤害应击杀 4 防巨龙');
  assert(Engine.findUnit(s, 1, hybrid.uid));
});

test('死亡降临：随机消灭一个敌方单位', () => {
  const s = fresh();
  const a = deploy(s, 1, 'blue_dragon');
  const b = deploy(s, 1, 'red_dragon');
  s.random = () => 0; // 总是选第一个
  s.active = 0; s.players[0].hand = ['death_descends']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  const remaining = s.players[1].front.concat(s.players[1].support);
  assertEqual(remaining.length, 1);
  assert(!remaining.includes(a) || !remaining.includes(b));
});

test('龙骑士：需要同时控制混血种与龙族，满足后全体 +2/+2', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_spawn');
  s.active = 0; s.players[0].hand = ['dragon_knight']; s.players[0].crystals = 99;
  let check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok, '只有混血种时不可打出');
  assert(check.reason.includes('混血种'));
  deploy(s, 0, 'blue_dragon');
  const dragon = lastUnitOf(s, 0, 'blue_dragon');
  s.active = 0; s.players[0].hand = ['dragon_knight']; s.players[0].crystals = 99;
  check = Engine.canPlayCard(s, 0, 0);
  assert(check.ok, check.reason);
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(Engine.unitAtk(s, hybrid), 3);
  assertEqual(Engine.unitMaxDef(hybrid), 3);
  assertEqual(Engine.unitAtk(s, dragon), 4);
  assertEqual(Engine.unitMaxDef(dragon), 4);
});

test('皇家礼炮：需要本局部署过威尔士红龙，造成 5 点伤害', () => {
  const s = fresh();
  const target = deploy(s, 1, 'great_dragon'); // 1/4
  s.active = 0; s.players[0].hand = ['royal_salute']; s.players[0].crystals = 99;
  let check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok, '条件未满足时不可打出');
  assert(check.reason.includes('威尔士红龙'));
  deploy(s, 0, 'welsh_red');
  s.active = 0; s.players[0].hand = ['royal_salute']; s.players[0].crystals = 99;
  check = Engine.canPlayCard(s, 0, 0);
  assert(check.ok, check.reason);
  const res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 1, uid: target.uid });
  assert(res.ok, res.error);
  assert(!Engine.findUnit(s, 1, target.uid), '5 点伤害应击杀巨龙');
});

test('暴雪降临：需要冰原龙，冻结所有敌方单位', () => {
  const s = fresh();
  const a = deploy(s, 1, 'blue_dragon');
  const b = deploy(s, 1, 'red_dragon');
  s.active = 0; s.players[0].hand = ['blizzard']; s.players[0].crystals = 99;
  assert(!Engine.canPlayCard(s, 0, 0).ok);
  deploy(s, 0, 'ice_dragon');
  s.active = 0; s.players[0].hand = ['blizzard']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assert(a.frozen && b.frozen, '所有敌方单位应被冻结');
});

test('龙之笛：移除敌方龙族，10%几率加入你的手牌', () => {
  // 成功：10% 判定通过，卡牌进入施放者手牌
  const s = fresh();
  const dragon = deploy(s, 1, 'great_dragon');
  const deckBefore = s.players[1].deck.length;
  s.active = 0; s.players[0].hand = ['dragon_flute']; s.players[0].crystals = 99;
  s.random = () => 0.05;
  const res = Engine.playCard(s, 0, 0, { kind: 'unit', side: 1, uid: dragon.uid });
  assert(res.ok, res.error);
  assert(!Engine.findUnit(s, 1, dragon.uid), '单位应被移除');
  assertEqual(s.players[1].deck.length, deckBefore, '不应洗回对方卡组');
  assertEqual(s.players[0].hand.length, 1);
  assertEqual(s.players[0].hand[0], 'great_dragon');

  // 失败：移除但不会加入手牌
  const s2 = fresh();
  const dragon2 = deploy(s2, 1, 'great_dragon');
  s2.active = 0; s2.players[0].hand = ['dragon_flute']; s2.players[0].crystals = 99;
  s2.random = () => 0.5;
  const res2 = Engine.playCard(s2, 0, 0, { kind: 'unit', side: 1, uid: dragon2.uid });
  assert(res2.ok, res2.error);
  assert(!Engine.findUnit(s2, 1, dragon2.uid), '单位应被移除');
  assertEqual(s2.players[0].hand.length, 0);
});

test('捷足先登：前线有混血种时抽两张牌', () => {
  const s = fresh();
  const hybrid = deploy(s, 0, 'hybrid_mid');
  s.active = 0; s.players[0].hand = ['head_start']; s.players[0].crystals = 99;
  let check = Engine.canPlayCard(s, 0, 0);
  assert(!check.ok, '混血种不在前线时不可打出');
  assert(check.reason.includes('前线'));
  toFront(s, 0, hybrid.uid);
  s.active = 0; s.players[0].crystals = 99;
  check = Engine.canPlayCard(s, 0, 0);
  assert(check.ok, check.reason);
  const deckBefore = s.players[0].deck.length;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[0].hand.length, 2, '打出 1 张后应抽到 2 张');
  assertEqual(s.players[0].deck.length, deckBefore - 2);
});

test('快速取胜：对敌方总部造成5点伤害，并使敌方所有单位+1/+1', () => {
  const s = fresh();
  const enemy = deploy(s, 1, 'blue_dragon'); // 2/2
  s.active = 0; s.players[0].hand = ['quick_victory']; s.players[0].crystals = 99;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[1].hp, 15);
  assertEqual(Engine.unitAtk(s, enemy), 3);
  assertEqual(Engine.unitMaxDef(enemy), 3);
  assertEqual(enemy.def, 3);
});

test('龙巢维修：总部低于10时恢复8点并检索费用≥3的龙族单位', () => {
  const s = fresh();
  s.players[0].hp = 7;
  s.players[0].deck = ['red_dragon', 'ice_dragon', 'wyvern', 'dragon_decree'];
  s.players[0].hand = ['dragon_nest_repair'];
  s.players[0].crystals = 99;
  s.active = 0;
  const check = Engine.canPlayCard(s, 0, 0);
  assert(check.ok, check.reason);
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[0].hp, 15);
  assertEqual(s.players[0].hand.length, 1);
  assertEqual(s.players[0].hand[0], 'ice_dragon');
  assertEqual(s.players[0].deck.length, 3);

  const s2 = fresh();
  s2.players[0].hp = 10;
  s2.players[0].hand = ['dragon_nest_repair'];
  s2.players[0].crystals = 99;
  s2.active = 0;
  const check2 = Engine.canPlayCard(s2, 0, 0);
  assert(!check2.ok, '总部生命等于10时不能打出');
  assert(check2.reason.includes('低于10'));
});

test('最后一搏：总部降为1，所有友方单位+4/+4', () => {
  const s = fresh();
  const a = deploy(s, 0, 'blue_dragon'); // 2/2
  const b = deploy(s, 0, 'hybrid_mid'); // 2/2
  s.players[0].hp = 15;
  s.players[0].hand = ['last_stand'];
  s.players[0].crystals = 99;
  s.active = 0;
  const res = Engine.playCard(s, 0, 0);
  assert(res.ok, res.error);
  assertEqual(s.players[0].hp, 1);
  assertEqual(Engine.unitAtk(s, a), 6);
  assertEqual(Engine.unitMaxDef(a), 6);
  assertEqual(a.def, 6);
  assertEqual(Engine.unitAtk(s, b), 6);
  assertEqual(Engine.unitMaxDef(b), 6);
});

/* ========================================================================== */
console.log('\n[7] 胜负与 AI');
/* ========================================================================== */

test('总部生命归零即判负', () => {
  const s = fresh();
  s.players[1].hp = 2;
  const u = deploy(s, 0, 'red_dragon');
  toFront(s, 0, u.uid);
  attack(s, 0, u.uid, hqTarget(1));
  assertEqual(s.winner, 0);
  assertEqual(s.players[1].hp, 0);
});

test('投降判定', () => {
  const s = fresh();
  Engine.surrender(s, 0);
  assertEqual(s.winner, 1);
});

test('AI 能完成回合并产生合理动作', () => {
  const s = fresh(777);
  Engine.endTurn(s); // 交给 AI
  let actions = 0;
  while (s.active === 1 && s.winner == null && actions < 60) {
    const action = AI.nextAction(s);
    assert(action, 'AI 应始终给出动作');
    if (action.type === 'end') break;
    const res = AI.applyAction(s, action);
    assert(res.ok, `AI 动作失败：${action.type} ${res.error}`);
    actions++;
  }
  assert(actions > 0, 'AI 应该执行了一些动作');
});

test('AI 自动对局 40 局无异常并可分出胜负', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = Engine.createGame({
      playerDeck: fixedDeck(30),
      enemyDeck: Cards.PRESETS.ember.cards.slice(),
      seed: seed * 7919,
      playerName: 'P0',
      enemyName: 'AI'
    });
    // 玩家侧：给随机卡组（预设），当作只会结束回合的木桩，AI 应能推平
    s.players[0].deck = Cards.PRESETS.hybrid.cards.slice();
    s.players[0].hand = [];
    shuffleLike(s.players[0].deck, seed);
    let guard = 0;
    while (s.winner == null && guard++ < 120) {
      if (s.active === 0) {
        Engine.endTurn(s);
      } else {
        AI.runTurn(s);
      }
    }
    assert(s.winner != null, `seed ${seed} 的 AI 对局未结束`);
  }
});

function shuffleLike(arr, seed) {
  let x = seed >>> 0 || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

/* 随机动作压力测试：覆盖各种卡牌交互 */
test('随机对局 60 局：全卡池随机出牌无异常', () => {
  const allIds = Cards.ALL.map(c => c.id);
  for (let seed = 1; seed <= 60; seed++) {
    const makeDeck = (salt) => {
      let x = (seed * 104729 + salt * 15485863) >>> 0 || 1;
      const rand = () => {
        x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
        return x / 4294967296;
      };
      const deck = [];
      for (let i = 0; i < 30; i++) deck.push(allIds[Math.floor(rand() * allIds.length)]);
      return deck;
    };
    const s = Engine.createGame({
      playerDeck: makeDeck(1), enemyDeck: makeDeck(2), seed: seed * 31337,
      playerName: 'P0', enemyName: 'P1'
    });
    let guard = 0;
    while (s.winner == null && guard++ < 90) {
      if (s.active === 0) {
        randomTurn(s);
        Engine.endTurn(s);
      } else {
        AI.runTurn(s);
      }
    }
    assert(guard < 90, `seed ${seed} 对局未结束（可能死循环）`);
  }
});

function randomTurn(s) {
  for (let step = 0; step < 25 && s.winner == null; step++) {
    const me = s.players[0];
    const options = [];
    for (let i = 0; i < me.hand.length; i++) {
      const opt = Engine.getCardOptions(s, 0, i);
      if (opt && opt.playable) options.push(opt);
    }
    const acts = [];
    for (let i = 0; i < me.hand.length; i++) {
      const opt = Engine.getCardOptions(s, 0, i);
      if (opt && opt.playable) {
        if (opt.targets.length) {
          for (const t of opt.targets) acts.push({ type: 'play', i, target: t });
        } else {
          acts.push({ type: 'play', i, target: null });
        }
      }
    }
    for (const u of me.front.concat(me.support)) {
      const targets = Engine.getAttackTargets(s, 0, u.uid);
      for (const t of targets) acts.push({ type: 'attack', uid: u.uid, target: t });
      if (Engine.canMoveUnit(s, u)) acts.push({ type: 'move', uid: u.uid });
    }
    const azures = Engine.getActivatableUnits(s, 0);
    for (const az of azures) {
      for (const u of me.front.concat(me.support)) {
        acts.push({ type: 'activate', uid: az.uid, target: { kind: 'unit', side: 0, uid: u.uid } });
      }
    }
    if (!acts.length) break;
    const act = acts[Math.floor(s.random() * acts.length)];
    let res;
    if (act.type === 'play') res = Engine.playCard(s, 0, act.i, act.target);
    else if (act.type === 'attack') res = Engine.attack(s, 0, act.uid, act.target);
    else if (act.type === 'move') res = Engine.moveUnit(s, 0, act.uid);
    else res = Engine.activateUnit(s, 0, act.uid, act.target);
    if (!res.ok) break;
    if (act.type === 'play') {
      // 手牌索引变化，重新开始下一轮
      break;
    }
  }
}

/* ========================================================================== */
console.log('\n========================================');
console.log(`通过 ${passed} / ${passed + failed}`);
if (failed) {
  console.log(`失败 ${failed}:`);
  failures.forEach(f => console.log(' - ' + f.name + ' :: ' + (f.err && f.err.message)));
  process.exitCode = 1;
} else {
  console.log('全部测试通过 ✅');
}
