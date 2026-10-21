/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * ai.js — 电脑对手：启发式出牌与战斗决策（纯逻辑）
 * ========================================================================== */
(function (root) {
  'use strict';

  const Engine = root.DBEngine;
  const Cards = root.DBCards;
  if (!Engine || !Cards) throw new Error('ai.js 需要先加载 cards.js 与 engine.js');

  const AI_SIDE = 1;

  /* ============================ 估值 ============================ */

  function unitValue(state, u) {
    let v = Engine.unitAtk(state, u) * 2 + u.def + u.cost * 1.4 + u.equipment.length * 1.6;
    if (u.cardId === 'cave_dragon') v += 3 + u.def * 0.5;
    if (u.cardId === 'basilisk' && u.smoke) v += 2.5;
    if (u.cardId === 'demon_dragon') v += 2;
    if (u.cardId === 'welsh_red') v += 2;
    if (u.cardId === 'azure_dragon') v += 2;
    return v;
  }

  function threatOf(state, u) {
    let v = Engine.unitAtk(state, u) * 2 + u.def + u.cost * 1.2;
    if (u.cardId === 'cave_dragon') v += 3;
    if (u.cardId === 'welsh_red' || u.cardId === 'azure_dragon' || u.cardId === 'fairy_dragon') v += 1.5;
    if (u.cardId === 'demon_dragon') v += 2;
    return v;
  }

  function enemyOf(state) { return state.players[Engine.otherSide(AI_SIDE)]; }
  function meOf(state) { return state.players[AI_SIDE]; }

  function missingHp(state, u) { return Engine.unitMaxDef(u) - u.def; }

  /* ============================ 目标打法 ============================ */

  function targetValueForCard(state, card, unit) {
    const enemy = enemyOf(state);
    switch (card.id) {
      case 'ice_dragon':
        return threatOf(state, unit) * 0.9 + (unit.exhausted ? 0.5 : 0);
      case 'fairy_dragon': {
        const missing = missingHp(state, unit);
        return missing * 1.0 + unitValue(state, unit) * 0.25 + 2;
      }
      case 'shield': return 2 + (Engine.unitAtk(state, unit) >= 3 ? 1 : 0) - (unit.def >= 4 ? 0.5 : 0);
      case 'iron_sword': return 1.6 + Engine.unitAtk(state, unit) * 0.4;
      case 'wooden_sword': return 1.2 + Engine.unitAtk(state, unit) * 0.25;
      case 'leather_armor': return 1.4 + (unit.def < 4 ? 0.6 : 0);
      case 'bow': return unit.line === 'support' ? 3.4 + Engine.unitAtk(state, unit) * 0.4 : 1.2;
      case 'robe': return 2.4 + Engine.unitAtk(state, unit) * 0.45;
      case 'dragon_decree': return 2.0 + Engine.unitAtk(state, unit) * 0.6 + unit.def * 0.3;
      case 'aerial_strike': return (unit.def <= 4 ? threatOf(state, unit) + 4 : 4 + unit.def * 0.2);
      case 'dragon_flute': return threatOf(state, unit) * 0.9 + (unit.def >= 4 ? 2 : 0);
      case 'royal_salute': return (unit.def <= 5 ? threatOf(state, unit) + 5 : 6);
      default: return threatOf(state, unit);
    }
  }

  function chooseTarget(state, options) {
    const card = options.card;
    const list = options.targets || [];
    if (!list.length) return null;
    let best = null, bestScore = -Infinity;
    for (const t of list) {
      const u = Engine.findUnit(state, t.side, t.uid);
      if (!u) continue;
      const s = targetValueForCard(state, card, u);
      if (s > bestScore) { bestScore = s; best = t; }
    }
    return best;
  }

  /* ============================ 出牌评分 ============================ */

  function scoreCard(state, card, target) {
    const me = meOf(state);
    const enemy = enemyOf(state);
    const myUnits = me.front.concat(me.support);
    const enemyUnits = enemy.front.concat(enemy.support);
    const targetUnit = target ? Engine.findUnit(state, target.side, target.uid) : null;

    switch (card.id) {
      /* -------------------- 单位 -------------------- */
      case 'wyvern': return 3;
      case 'hybrid_spawn': return 3.2;
      case 'fire_wyvern': return 4;
      case 'great_dragon': return 4.5 + (enemy.front.length ? 1 : 0);
      case 'red_dragon': return 4;
      case 'green_dragon': return 3.8;
      case 'blue_dragon': return 4.8;
      case 'hybrid_mid': return 5;
      case 'two_legged_wyvern': {
        const oppHasBig = enemyUnits.some(u => u.cost >= 2);
        return 4.2 + (oppHasBig ? 0 : 2.5);
      }
      case 'cave_dragon': {
        const allies = myUnits.length;
        return 4.5 + Math.min(2.5, allies * 0.7) + (myUnits.length >= 2 ? 1.5 : 0);
      }
      case 'basilisk': return 6;
      case 'hybrid_high': return 6.2;
      case 'ice_dragon': {
        let bonus = 4;
        if (targetUnit) bonus += threatOf(state, targetUnit) * 0.8;
        return 7 + bonus;
      }
      case 'fairy_dragon': {
        let bonus = 1;
        if (targetUnit) bonus += missingHp(state, targetUnit) * 1.1 + 3;
        return 6.5 + bonus;
      }
      case 'demon_dragon': {
        let face = 4;
        if (enemy.hp <= 4) face += 8;
        return 7.5 + face;
      }
      case 'welsh_red': return 8.5 + Math.min(4, myUnits.length * 0.8);
      case 'azure_dragon': return 7;
      case 'hybrid_top': return 7.5;
      case 'nordic_white_dragon': return 13;
      case 'elf_dragon': return 9.5;

      /* -------------------- 装备 -------------------- */
      case 'shield': return 2.2 + (targetUnit ? 0.8 : 0);
      case 'iron_sword': return 2.2 + (targetUnit ? Engine.unitAtk(state, targetUnit) * 0.15 : 0);
      case 'bow': return targetUnit && targetUnit.line === 'support' ? 4.4 : 1.5;
      case 'robe': return 3.2;

      /* -------------------- 战术 -------------------- */
      case 'dragon_decree': return targetUnit ? 3.2 : 0;
      case 'for_breeding': {
        const dragons = myUnits.filter(u => u.tribe === 'dragon').length;
        return dragons >= 2 ? 2.2 + dragons * 1.1 : 0.6;
      }
      case 'cold_wind': {
        if (!enemy.front.length) return 0.4;
        let s = 0;
        for (const u of enemy.front) {
          if (u.def <= 1) s += threatOf(state, u) * 0.9 + 2;
          else s += 0.8;
        }
        return s;
      }
      case 'aerial_strike': {
        if (!targetUnit) return 0;
        let s = 4 + Math.min(4, targetUnit.def);
        if (targetUnit.def <= 4) s += threatOf(state, targetUnit) * 0.8;
        return s;
      }
      case 'death_descends': {
        if (!enemyUnits.length) return 0;
        const maxThreat = Math.max.apply(null, enemyUnits.map(u => threatOf(state, u)));
        return 7 + maxThreat * 0.35;
      }
      case 'dragon_knight': {
        const hasH = myUnits.some(u => u.tribe === 'hybrid');
        const hasD = myUnits.some(u => u.tribe === 'dragon');
        if (!hasH || !hasD) return 0;
        return 5 + Math.min(8, myUnits.length * 1.4);
      }
      case 'royal_salute': {
        if (!targetUnit) return 0;
        let s = 6 + Math.min(5, targetUnit.def) * 0.8;
        if (targetUnit.def <= 5) s += threatOf(state, targetUnit) * 0.5;
        return s;
      }
      case 'blizzard': {
        if (!enemyUnits.length) return 0;
        return 4 + enemyUnits.filter(u => !u.frozen).length * 1.4;
      }
      case 'dragon_flute': return targetUnit ? 6 + threatOf(state, targetUnit) * 0.5 : 0;
      case 'head_start': return 7;
      case 'quick_victory': return enemy.hp <= 5 ? 20 : 6.5;
      case 'dragon_nest_repair': return 10;
      case 'last_stand': return 0.5;
      default: return 1;
    }
  }

  function choosePlay(state) {
    const me = meOf(state);
    let best = null;
    for (let i = 0; i < me.hand.length; i++) {
      const options = Engine.getCardOptions(state, AI_SIDE, i);
      if (!options || !options.playable) continue;
      const card = options.card;
      let target = null;
      if (card.target) {
        target = chooseTarget(state, options);
        if (card.target.required && !target) continue;
      }
      let score = scoreCard(state, card, target);
      if (card.type === 'unit') {
        // 支援阵线快满时，优先把最后的位置给大哥
        if (me.support.length >= Engine.RULES.ROW_LIMIT - 1 && card.cost >= 3) score += 2;
      }
      if (card.type === 'tactic' || card.type === 'equip') {
        if (score < 1.2) continue;
      }
      if (!best || score > best.score) {
        best = { type: 'play', handIndex: i, target, score, card };
      }
    }
    return best;
  }

  /* ============================ 战斗 ============================ */

  function scoreHqAttack(state, unit) {
    const enemy = enemyOf(state);
    const atk = Engine.unitAtk(state, unit);
    const robe = Engine.hasRobe(unit) ? 0.5 : 0;
    const dmg = atk + robe;
    if (dmg >= enemy.hp) return 10000;
    let s = dmg * 1.35;
    if (enemy.front.length === 0) s += 1.2;
    return s;
  }

  function scoreUnitAttack(state, unit, targetUnit) {
    const atk = Engine.unitAtk(state, unit) + (Engine.hasRobe(unit) ? 0.5 : 0);
    const kills = atk >= targetUnit.def;
    const retaliation = Engine.unitAtk(state, targetUnit);
    const iDie = retaliation >= unit.def;

    let s = 0;
    if (kills) {
      s += threatOf(state, targetUnit) + 3.4;
      if (targetUnit.cardId === 'cave_dragon') s += 2.5;
      if (targetUnit.cardId === 'azure_dragon' || targetUnit.cardId === 'welsh_red') s += 1.5;
    } else {
      s += Math.min(atk, targetUnit.def) * 0.9;
    }
    if (iDie) s -= unitValue(state, unit) * 0.9;
    if (!iDie && kills) s += 2.2;
    if (targetUnit.def <= 1) s += 0.8;
    return s;
  }

  function attackCandidates(state) {
    const me = meOf(state);
    const enemy = enemyOf(state);
    const out = [];
    const frontReady = me.front.filter(u => !u.exhausted && !u.frozen);
    for (const u of frontReady) {
      const targets = Engine.getAttackTargets(state, AI_SIDE, u.uid);
      for (const t of targets) {
        let s;
        if (t.kind === 'hq') s = scoreHqAttack(state, u);
        else {
          const tu = Engine.findUnit(state, t.side, t.uid);
          if (!tu) continue;
          s = scoreUnitAttack(state, u, tu);
        }
        out.push({ type: 'attack', uid: u.uid, target: t, score: s });
      }
    }
    // 弓箭手在支援阵线直接攻击
    const supportReady = me.support.filter(u => !u.exhausted && !u.frozen && Engine.hasBow(u));
    for (const u of supportReady) {
      const targets = Engine.getAttackTargets(state, AI_SIDE, u.uid);
      for (const t of targets) {
        const tu = Engine.findUnit(state, t.side, t.uid);
        if (!tu) continue;
        out.push({ type: 'attack', uid: u.uid, target: t, score: scoreUnitAttack(state, u, tu) - 0.3 });
      }
    }

    // 移动到前线后攻击
    const movers = me.support.filter(u => !u.exhausted && !u.frozen && !Engine.hasBow(u) && Engine.canMoveUnit(state, u));
    for (const u of movers) {
      let bestScore = -Infinity, bestTarget = null;
      // 敌方前线可攻击目标
      for (const t of enemy.front) {
        if (!Engine.canBeAttacked(state, t)) continue;
        const s = scoreUnitAttack(state, u, t);
        if (s > bestScore) { bestScore = s; bestTarget = { kind: 'unit', side: Engine.otherSide(AI_SIDE), uid: t.uid, line: 'front' }; }
      }
      // 敌方前线为空时可以攻击支援阵线
      if (enemy.front.length === 0) {
        for (const t of enemy.support) {
          if (!Engine.canBeAttacked(state, t)) continue;
          const s = scoreUnitAttack(state, u, t);
          if (s > bestScore) { bestScore = s; bestTarget = { kind: 'unit', side: Engine.otherSide(AI_SIDE), uid: t.uid, line: 'support' }; }
        }
      }
      const hqScore = scoreHqAttack(state, u);
      if (hqScore > bestScore) { bestScore = hqScore; bestTarget = { kind: 'hq', side: Engine.otherSide(AI_SIDE) }; }

      if (bestTarget) {
        let s = bestScore - 1.0; // 移动风险 / 让支援阵线变薄
        if (u.cardId === 'cave_dragon') s -= 2.5;
        if (u.cardId === 'basilisk' && u.smoke) s -= 1.5;
        if (enemy.front.length > me.front.length + 1) s -= 1.2;
        s -= 0.4;
        out.push({
          type: 'move', uid: u.uid, target: null, score: s,
          note: 'moveAndAttack', plannedTarget: bestTarget
        });
      }
    }
    return out;
  }

  function chooseCombat(state) {
    const me = meOf(state);
    const candidates = attackCandidates(state);

    // 青龙疗愈
    const azures = Engine.getActivatableUnits(state, AI_SIDE);
    const myUnits = me.front.concat(me.support);
    for (const az of azures) {
      let best = null, bestHeal = 0;
      for (const u of myUnits) {
        const miss = missingHp(state, u);
        if (miss > bestHeal) { bestHeal = miss; best = u; }
      }
      if (best && bestHeal >= 1) {
        candidates.push({
          type: 'activate', uid: az.uid, target: { kind: 'unit', side: AI_SIDE, uid: best.uid },
          score: bestHeal * 0.5 + (bestHeal >= 3 ? 1 : 0)
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best.score < 1.4) return null;
    return best;
  }

  /* ============================ 对外接口 ============================ */

  function ensureMemory(state) {
    if (!state.aiMemory || state.aiMemory.turn !== state.turn || state.aiMemory.side !== state.active) {
      state.aiMemory = { turn: state.turn, side: state.active, phase: 'play', steps: 0 };
    }
    return state.aiMemory;
  }

  function nextAction(state) {
    if (!state || state.winner != null || state.active !== AI_SIDE) return null;
    const memory = ensureMemory(state);
    if (memory.steps > 40) return { type: 'end' };
    memory.steps += 1;

    if (memory.phase === 'play') {
      const play = choosePlay(state);
      if (play) {
        return { type: 'play', handIndex: play.handIndex, target: play.target };
      }
      memory.phase = 'combat';
    }

    if (memory.phase === 'combat') {
      const combat = chooseCombat(state);
      if (combat) {
        if (combat.type === 'move') {
          return { type: 'move', uid: combat.uid, plannedTarget: combat.plannedTarget };
        }
        return { type: combat.type, uid: combat.uid, target: combat.target };
      }
      memory.phase = 'done';
    }
    return { type: 'end' };
  }

  function applyAction(state, action) {
    if (!action) return { ok: false, error: '空动作' };
    switch (action.type) {
      case 'play': return Engine.playCard(state, AI_SIDE, action.handIndex, action.target);
      case 'move': return Engine.moveUnit(state, AI_SIDE, action.uid);
      case 'attack': return Engine.attack(state, AI_SIDE, action.uid, action.target);
      case 'activate': return Engine.activateUnit(state, AI_SIDE, action.uid, action.target);
      case 'end': return Engine.endTurn(state);
      default: return { ok: false, error: '未知动作' };
    }
  }

  /** 在测试/模拟中一次性跑完 AI 回合，返回动作数量 */
  function runTurn(state, guardLimit) {
    let n = 0;
    const limit = guardLimit || 80;
    while (state.active === AI_SIDE && state.winner == null && n < limit) {
      const action = nextAction(state);
      if (!action || action.type === 'end') {
        Engine.endTurn(state);
        n++;
        break;
      }
      const res = applyAction(state, action);
      n++;
      if (!res.ok) {
        // 兜底：避免死循环
        Engine.endTurn(state);
        break;
      }
    }
    return n;
  }

  root.DBAI = {
    SIDE: AI_SIDE,
    nextAction,
    applyAction,
    runTurn,
    chooseTarget,
    scoreCard,
    unitValue,
    threatOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.DBAI;
