/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * engine.js — 纯逻辑规则引擎（不依赖 DOM，可在 Node 中直接测试）
 *
 * 公共 API 见文件末尾 root.DBEngine
 * ========================================================================== */
(function (root) {
  'use strict';

  const Cards = root.DBCards;
  if (!Cards) throw new Error('engine.js 需要先加载 cards.js');

  const RULES = {
    HQ_HP: 20,
    START_HAND: 4,
    HAND_LIMIT: 10,
    MAX_CRYSTALS: 10,
    ROW_LIMIT: 5,
    BURN_DAMAGE: 1,
    DECK_SIZE: 30
  };

  const SIDE_NAMES = ['你', '对手'];

  /* ============================ 基础工具 ============================ */

  function otherSide(side) { return side === 0 ? 1 : 0; }

  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function random() {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function emit(state, ev) { state.events.push(ev); }

  function addLog(state, text, kind) {
    state.log.push({ turn: state.turn, text, kind: kind || 'info' });
    if (state.log.length > 220) state.log.shift();
    state.logSeq = (state.logSeq || 0) + 1;
  }

  function currentPlayer(state) { return state.players[state.active]; }

  function allUnits(state, side) {
    const p = state.players[side];
    return p.front.concat(p.support);
  }

  function findUnit(state, side, uid) {
    const p = state.players[side];
    for (const row of [p.front, p.support]) {
      for (const u of row) if (u.uid === uid) return u;
    }
    return null;
  }

  function findUnitAnywhere(state, uid) {
    return findUnit(state, 0, uid) || findUnit(state, 1, uid);
  }

  function rowOf(state, unit) {
    const p = state.players[unit.side];
    return unit.line === 'front' ? p.front : p.support;
  }

  function randomOf(state, arr) {
    if (!arr.length) return null;
    return arr[Math.floor(state.random() * arr.length)];
  }

  /* ============================ 单位属性 ============================ */

  function unitMaxDef(unit) {
    return Math.max(0, unit.baseDef + unit.bonusDef);
  }

  function unitAtk(state, unit) {
    let atk = unit.baseAtk + unit.bonusAtk;
    if (unit.cardId === 'two_legged_wyvern') {
      const opp = state.players[otherSide(unit.side)];
      const hasBig = opp.front.concat(opp.support).some(u => u.cost >= 2);
      if (!hasBig) atk += 2;
    }
    return Math.max(0, atk);
  }

  function hasBow(unit) { return unit.equipment.indexOf('bow') >= 0; }
  function hasRobe(unit) { return unit.equipment.indexOf('robe') >= 0; }

  function isUntargetable(unit) {
    if (unit.smoke) return true; // 蛇怪：未移动或攻击
    if (hasRobe(unit) && !unit.actedThisTurn) return true; // 法袍：尚未行动或攻击
    return false;
  }

  function isProtected(state, unit) {
    const row = rowOf(state, unit);
    const i = row.indexOf(unit);
    if (i < 0) return false;
    if (i > 0 && row[i - 1].cardId === 'cave_dragon') return true;
    if (i < row.length - 1 && row[i + 1].cardId === 'cave_dragon') return true;
    return false;
  }

  function canBeAttacked(state, unit) {
    return !isUntargetable(unit) && !isProtected(state, unit);
  }

  function canAttackWith(state, unit) {
    if (!unit || state.winner != null) return false;
    if (unit.side !== state.active) return false;
    if (unit.frozen || unit.exhausted) return false;
    if (unit.line === 'front') return true;
    return hasBow(unit);
  }

  function canMoveUnit(state, unit) {
    if (!unit || state.winner != null) return false;
    if (unit.side !== state.active) return false;
    if (unit.line !== 'support' || unit.frozen || unit.exhausted) return false;
    return state.players[unit.side].front.length < RULES.ROW_LIMIT;
  }

  /* ============================ 状态效果 ============================ */

  function damageUnit(state, unit, amount, source) {
    if (!unit || amount <= 0) return 0;
    const before = unit.def;
    unit.def = Math.max(0, unit.def - amount);
    const real = before - unit.def;
    emit(state, { t: 'damage', side: unit.side, uid: unit.uid, amount: real, def: unit.def, source: source || null });
    return real;
  }

  function healUnit(state, unit, amount) {
    const max = unitMaxDef(unit);
    const before = unit.def;
    unit.def = Math.min(max, unit.def + amount);
    const real = unit.def - before;
    if (real > 0) {
      emit(state, { t: 'heal', side: unit.side, uid: unit.uid, amount: real, def: unit.def });
    }
    return real;
  }

  function buffUnit(state, unit, atk, def, reason) {
    if (atk) unit.bonusAtk += atk;
    if (def) {
      unit.bonusDef += def;
      unit.def += def;
    }
    emit(state, {
      t: 'buff', side: unit.side, uid: unit.uid, atk: atk || 0, def: def || 0,
      atkNow: unitAtk(state, unit), defNow: unitMaxDef(unit), reason: reason || ''
    });
  }

  function freezeUnit(state, unit, reason) {
    if (!unit) return;
    unit.frozen = true;
    emit(state, { t: 'freeze', side: unit.side, uid: unit.uid, reason: reason || '' });
  }

  function applyBurn(state, unit, sourceName) {
    if (!unit) return;
    unit.burn = true;
    emit(state, { t: 'burnApplied', side: unit.side, uid: unit.uid });
    addLog(state, `「${unit.name}」陷入灼烧（${sourceName || '火焰'}）。`, 'debuff');
  }

  function damageHQ(state, side, amount, source) {
    if (state.winner != null || amount <= 0) return 0;
    const p = state.players[side];
    p.hp = Math.max(0, p.hp - amount);
    p.stats.damageTaken += amount;
    emit(state, { t: 'hqDamage', side, amount, hp: p.hp, source: source || null });
    addLog(state, `${p.name}的总部受到 ${amount} 点伤害（剩余 ${p.hp}）。`, side === 0 ? 'bad' : 'good');
    checkWinner(state);
    return amount;
  }

  function healHQ(state, side, amount) {
    if (state.winner != null || amount <= 0) return 0;
    const p = state.players[side];
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const real = p.hp - before;
    if (real > 0) {
      emit(state, { t: 'hqHeal', side, amount: real, hp: p.hp });
      addLog(state, `${p.name}的总部恢复了 ${real} 点生命（当前 ${p.hp}）。`, side === 0 ? 'good' : 'bad');
    }
    return real;
  }

  function checkWinner(state) {
    if (state.winner != null) return;
    const p0 = state.players[0], p1 = state.players[1];
    if (p0.hp <= 0 && p1.hp <= 0) {
      state.winner = state.active === 0 ? 1 : 0;
      state.winReason = '双方总部同时崩塌';
    } else if (p0.hp <= 0) {
      state.winner = 1; state.winReason = '你的总部被摧毁';
    } else if (p1.hp <= 0) {
      state.winner = 0; state.winReason = '敌方总部被摧毁';
    }
    if (state.winner != null) {
      emit(state, { t: 'gameover', winner: state.winner, reason: state.winReason });
      addLog(state, state.winner === 0 ? '★ 胜利！敌方总部已被摧毁。' : '✖ 失败……你的总部已被摧毁。', state.winner === 0 ? 'good' : 'bad');
    }
  }

  /* ============================ 死亡结算 ============================ */

  function processDeaths(state) {
    let guard = 0;
    while (guard++ < 24) {
      const dead = [];
      for (let side = 0; side < 2; side++) {
        const p = state.players[side];
        for (const line of ['front', 'support']) {
          for (const u of p[line]) {
            if (u.def <= 0) dead.push({ side, line, unit: u });
          }
        }
      }
      if (!dead.length) break;

      for (const d of dead) {
        const row = state.players[d.side][d.line];
        const idx = row.indexOf(d.unit);
        if (idx >= 0) row.splice(idx, 1);
        state.players[d.side].graveyard.push(d.unit.cardId);
        state.players[d.side].stats.unitsLost += 1;
        state.players[otherSide(d.side)].stats.unitsKilled += 1;
        emit(state, { t: 'death', side: d.side, uid: d.unit.uid, cardId: d.unit.cardId });
        addLog(state, `「${d.unit.name}」被摧毁。`, 'death');
      }

      for (const d of dead) triggerDeath(state, d.unit);
    }
  }

  function triggerDeath(state, unit) {
    if (state.winner != null) return;
    const enemy = otherSide(unit.side);
    if (unit.cardId === 'demon_dragon') {
      addLog(state, '魔龙的尸骸炸裂，对敌方总部造成 2 点伤害。', 'trigger');
      damageHQ(state, enemy, 2, unit.name);
      return;
    }
    if (unit.cardId === 'basilisk') {
      const enemyUnits = allUnits(state, enemy);
      if (enemyUnits.length) {
        const victim = randomOf(state, enemyUnits);
        addLog(state, `蛇怪的毒血溅向「${victim.name}」，造成 1 点伤害。`, 'trigger');
        damageUnit(state, victim, 1, '蛇怪');
      } else {
        addLog(state, '蛇怪的毒血溅向敌方总部，造成 1 点伤害。', 'trigger');
        damageHQ(state, enemy, 1, '蛇怪');
      }
    }
  }

  function destroyUnit(state, unit, reason) {
    if (!unit) return;
    unit.def = 0;
    addLog(state, `「${unit.name}」被${reason || '消灭'}。`, 'death');
  }

  function removeUnitFromBoard(state, unit) {
    const row = rowOf(state, unit);
    const idx = row.indexOf(unit);
    if (idx < 0) return false;
    row.splice(idx, 1);
    emit(state, { t: 'exile', side: unit.side, uid: unit.uid, cardId: unit.cardId });
    addLog(state, `「${unit.name}」被移除出战场。`, 'trigger');
    return true;
  }

  /* ============================ 抽牌 / 回合 ============================ */

  function drawCard(state, side, opts) {
    const p = state.players[side];
    const silent = opts && opts.silent;
    if (!p.deck.length) {
      p.fatigue += 1;
      addLog(state, `${p.name}的卡组已空，总部受到 ${p.fatigue} 点疲劳伤害。`, 'debuff');
      emit(state, { t: 'fatigue', side, amount: p.fatigue });
      damageHQ(state, side, p.fatigue, '疲劳');
      return null;
    }
    const cardId = p.deck.shift();
    if (p.hand.length >= RULES.HAND_LIMIT) {
      addLog(state, `${p.name}的手牌已满，${side === 0 ? '「' + Cards.get(cardId).name + '」' : '一张牌'}被烧毁。`, 'debuff');
      emit(state, { t: 'overdraw', side, cardId });
      return null;
    }
    p.hand.push(cardId);
    emit(state, { t: 'draw', side, cardId });
    if (!silent) {
      if (side === 0) addLog(state, `你抽到了「${Cards.get(cardId).name}」。`, 'draw');
      else addLog(state, `${p.name}抽了一张牌。`, 'draw');
    }
    return cardId;
  }

  function applyDelayedEquipBuffs(state, side) {
    for (const u of allUnits(state, side)) {
      if (!u.pendingEquipBuffs || !u.pendingEquipBuffs.length) continue;
      let atk = 0, def = 0;
      for (const b of u.pendingEquipBuffs) {
        atk += b.atk || 0;
        def += b.def || 0;
      }
      u.pendingEquipBuffs = [];
      if (atk || def) {
        buffUnit(state, u, atk, def, '装备');
        const parts = [];
        if (atk) parts.push('+' + atk + ' 攻击力');
        if (def) parts.push('+' + def + ' 防御力');
        addLog(state, `「${u.name}」的装备在回合开始时生效：${parts.join('、')}。`, 'buff');
      }
    }
  }

  function beginTurn(state) {
    state.turn += 1;
    const side = state.active;
    const p = state.players[side];
    p.turnsTaken += 1;
    p.maxCrystals = Math.min(RULES.MAX_CRYSTALS, p.turnsTaken);
    p.crystals = p.maxCrystals;

    for (const u of allUnits(state, side)) {
      u.exhausted = false;
      u.movedThisTurn = false;
      u.actedThisTurn = false;
      u.azureUsed = false;
    }

    emit(state, { t: 'turn', side, turn: state.turn });
    addLog(state, `—— 第 ${Math.ceil(state.turn / 2)} 回合 · ${p.name} ——`, side === 0 ? 'turn-self' : 'turn-enemy');
    if (p.maxCrystals >= RULES.MAX_CRYSTALS) addLog(state, `${p.name}的龙晶已达到上限 ${RULES.MAX_CRYSTALS}。`, 'info');

    // 木剑 / 皮甲等“下回合开始”的装备效果
    applyDelayedEquipBuffs(state, side);

    // 灼烧：在其控制者回合开始时结算
    for (const u of allUnits(state, side)) {
      if (u.burn) {
        addLog(state, `「${u.name}」受到灼烧伤害。`, 'debuff');
        damageUnit(state, u, RULES.BURN_DAMAGE, '灼烧');
      }
    }
    processDeaths(state);
    // 灼烧或遗言已经决出胜负时，不再继续抽牌
    if (state.winner != null) return;

    // 抽牌
    drawCard(state, side);

    // 检查疲劳致死
    checkWinner(state);
  }

  /* ============================ 目标检索 ============================ */

  function getPlayerTargetUnits(state, side) {
    const p = state.players[side];
    return p.front.concat(p.support);
  }

  function validTargetList(state, side, card) {
    const spec = card.target;
    if (!spec) return [];
    const targetSide = spec.who === 'enemy' ? otherSide(side) : side;
    const p = state.players[targetSide];
    let units = p.front.concat(p.support);
    if (spec.who === 'enemy') units = units.filter(u => !isUntargetable(u));
    if (spec.kind === 'dragon') units = units.filter(u => u.tribe === 'dragon');
    if (spec.kind === 'hybrid') units = units.filter(u => u.tribe === 'hybrid');
    if (spec.kind === 'equip') {
      units = units.filter(u => u.tribe === 'hybrid' && (u.slots || 0) > u.equipment.length);
    }
    return units.map(u => ({ kind: 'unit', side: targetSide, uid: u.uid, line: u.line }));
  }

  function isValidTarget(state, side, card, target) {
    if (!card.target) return target == null;
    const list = validTargetList(state, side, card);
    if (!target) return !card.target.required;
    return list.some(t => t.kind === target.kind && t.uid === target.uid && t.side === target.side);
  }

  /* ============================ 条件 / 可打出性 ============================ */

  function boardTribes(p) {
    const units = p.front.concat(p.support);
    return {
      dragon: units.some(u => u.tribe === 'dragon'),
      hybrid: units.some(u => u.tribe === 'hybrid')
    };
  }

  function checkCondition(state, side, card) {
    const p = state.players[side];
    if (!card.conditionKey) return { ok: true };
    if (card.conditionKey === 'knight') {
      const t = boardTribes(p);
      return t.dragon && t.hybrid
        ? { ok: true }
        : { ok: false, reason: '需要同时控制混血种和龙族' };
    }
    if (card.conditionKey === 'welsh') {
      return p.deployed.welsh ? { ok: true } : { ok: false, reason: '需要本局部署过威尔士红龙' };
    }
    if (card.conditionKey === 'ice') {
      return p.deployed.ice ? { ok: true } : { ok: false, reason: '需要本局部署过冰原龙' };
    }
    if (card.conditionKey === 'frontHybrid') {
      return p.front.some(u => u.tribe === 'hybrid')
        ? { ok: true }
        : { ok: false, reason: '需要你的前线有混血种' };
    }
    if (card.conditionKey === 'lowHq') {
      return p.hp < 10 ? { ok: true } : { ok: false, reason: '需要总部生命低于10' };
    }
    return { ok: true };
  }

  function canPlayCard(state, side, handIndex) {
    if (state.winner != null) return { ok: false, reason: '对局已结束' };
    if (state.active !== side) return { ok: false, reason: '现在不是你的回合' };
    const p = state.players[side];
    const id = p.hand[handIndex];
    if (id == null) return { ok: false, reason: '没有这张牌' };
    const card = Cards.get(id);
    if (!card) return { ok: false, reason: '未知卡牌' };
    if (p.crystals < card.cost) return { ok: false, reason: `龙晶不足（需要 ${card.cost}）` };
    if (card.type === 'unit') {
      if (p.support.length >= RULES.ROW_LIMIT) return { ok: false, reason: '支援阵线已满' };
    } else if (card.type === 'equip') {
      const targets = validTargetList(state, side, card);
      if (!targets.length) return { ok: false, reason: '没有可装备的混血种' };
    }
    const cond = checkCondition(state, side, card);
    if (!cond.ok) return cond;
    if (card.type === 'tactic') {
      if (card.id === 'death_descends' && !allUnits(state, otherSide(side)).length) {
        return { ok: false, reason: '敌方没有单位' };
      }
    }
    if (card.target && card.target.required) {
      const targets = validTargetList(state, side, card);
      if (!targets.length) return { ok: false, reason: '没有合法目标' };
    }
    return { ok: true, card };
  }

  function getCardOptions(state, side, handIndex) {
    const p = state.players[side];
    const id = p.hand[handIndex];
    if (id == null) return null;
    const card = Cards.get(id);
    const play = canPlayCard(state, side, handIndex);
    return {
      card,
      index: handIndex,
      playable: play.ok,
      reason: play.reason || '',
      targetSpec: card.target || null,
      targets: play.ok && card.target ? validTargetList(state, side, card) : []
    };
  }

  /* ============================ 部署与异能 ============================ */

  function makeUnit(state, card, side) {
    return {
      uid: 'u' + (state.uid++),
      cardId: card.id,
      name: card.name,
      en: card.en,
      tribe: card.tribe,
      cost: card.cost,
      art: card.art,
      accent: card.accent,
      rarity: card.rarity,
      baseAtk: card.atk || 0,
      baseDef: card.def || 0,
      bonusAtk: 0,
      bonusDef: 0,
      def: card.def || 0,
      slots: card.slots || 0,
      equipment: [],
      pendingEquipBuffs: [],
      side,
      line: 'support',
      exhausted: true,
      movedThisTurn: false,
      actedThisTurn: false,
      ignoreFrontlineHq: !!(card.ignoreFrontlineHq),
      frozen: false,
      burn: false,
      smoke: false,
      azureUsed: false
    };
  }

  function triggerElfDragonGrowth(state, deployedUnit, card) {
    if (!card || card.type !== 'unit' || card.cost < 3) return;
    for (let side = 0; side < 2; side++) {
      for (const u of allUnits(state, side)) {
        if (u.cardId === 'elf_dragon' && u !== deployedUnit) {
          buffUnit(state, u, 0, 1, '精灵龙');
          addLog(state, '「精灵龙」感知到高阶单位的部署，防御力+1。', 'buff');
        }
      }
    }
  }

  function applyDeployEffect(state, side, unit, target, card) {
    const enemy = otherSide(side);
    switch (card.id) {
      case 'basilisk':
        unit.smoke = true;
        addLog(state, '蛇怪潜入烟幕，未行动前无法被选中。', 'buff');
        break;
      case 'demon_dragon':
        addLog(state, '魔龙降临，深渊之火灼烧敌方总部。', 'trigger');
        damageHQ(state, enemy, 2, '魔龙');
        break;
      case 'welsh_red': {
        const allies = allUnits(state, side);
        for (const u of allies) buffUnit(state, u, 0, 2, '威尔士红龙');
        addLog(state, '威尔士红龙展开双翼，所有友方单位防御力 +2。', 'buff');
        break;
      }
      case 'ice_dragon':
        if (target) {
          const t = findUnit(state, target.side != null ? target.side : enemy, target.uid);
          if (t) {
            freezeUnit(state, t, '冰原龙');
            addLog(state, `冰原龙冻结了「${t.name}」。`, 'buff');
          }
        }
        break;
      case 'fairy_dragon': {
        const t = target
          ? findUnit(state, target.side != null ? target.side : side, target.uid)
          : unit;
        if (t) {
          t.bonusDef += 1;
          t.def = unitMaxDef(t);
          t.bonusAtk += 1;
          emit(state, { t: 'buff', side: t.side, uid: t.uid, atk: 1, def: 1, atkNow: unitAtk(state, t), defNow: unitMaxDef(t), reason: '仙灵龙' });
          addLog(state, `仙灵龙修复了「${t.name}」，其获得 +1/+1。`, 'buff');
        }
        break;
      }
      default:
        break;
    }
  }

  function applyEquip(state, side, unit, card) {
    unit.equipment.push(card.id);
    if (card.id === 'shield') {
      unit.bonusDef += 1; unit.def += 1;
    } else if (card.id === 'iron_sword') {
      unit.bonusAtk += 1;
    } else if (card.id === 'wooden_sword') {
      unit.pendingEquipBuffs.push({ atk: 1, source: '木剑' });
    } else if (card.id === 'leather_armor') {
      unit.pendingEquipBuffs.push({ def: 1, source: '皮甲' });
    }
    emit(state, {
      t: 'equip', side, uid: unit.uid, cardId: card.id,
      atkNow: unitAtk(state, unit), defNow: unitMaxDef(unit)
    });
    addLog(state, `「${unit.name}」装备了「${card.name}」。`, 'buff');
    if (card.id === 'wooden_sword' || card.id === 'leather_armor') {
      addLog(state, '装备效果将在你的下个回合开始时生效。', 'info');
    }
  }

  function resolveTactic(state, side, card, target) {
    const enemy = otherSide(side);
    const p = state.players[side];
    const enemyP = state.players[enemy];
    switch (card.id) {
      case 'dragon_decree': {
        const t = target && findUnit(state, side, target.uid);
        if (t) {
          buffUnit(state, t, 1, 1, '龙族诏令');
          addLog(state, `龙族诏令强化了「${t.name}」（+1/+1）。`, 'buff');
        }
        break;
      }
      case 'for_breeding': {
        const dragons = allUnits(state, side).filter(u => u.tribe === 'dragon');
        for (const u of dragons) buffUnit(state, u, 0, 2, '为了繁衍');
        addLog(state, `为了繁衍：${dragons.length} 个友方龙族单位防御力 +2。`, 'buff');
        break;
      }
      case 'cold_wind': {
        const targets = enemyP.front.slice();
        for (const u of targets) damageUnit(state, u, 1, '寒风');
        addLog(state, `寒风吹过，对 ${targets.length} 个敌方前线单位造成 1 点伤害。`, 'trigger');
        break;
      }
      case 'aerial_strike': {
        const t = target && findUnit(state, enemy, target.uid);
        if (t) {
          addLog(state, `空中闪击命中「${t.name}」，造成 4 点伤害。`, 'trigger');
          damageUnit(state, t, 4, '空中闪击');
        }
        break;
      }
      case 'death_descends': {
        const units = allUnits(state, enemy);
        if (units.length) {
          const victim = randomOf(state, units);
          addLog(state, `死亡降临：随机消灭了「${victim.name}」。`, 'trigger');
          destroyUnit(state, victim, '死亡降临');
        }
        break;
      }
      case 'dragon_knight': {
        for (const u of allUnits(state, side)) buffUnit(state, u, 2, 2, '龙骑士');
        addLog(state, '龙骑士的号角响起，所有友方单位获得 +2/+2。', 'buff');
        break;
      }
      case 'royal_salute': {
        const t = target && findUnit(state, enemy, target.uid);
        if (t) {
          addLog(state, `皇家礼炮轰击「${t.name}」，造成 5 点伤害。`, 'trigger');
          damageUnit(state, t, 5, '皇家礼炮');
        }
        break;
      }
      case 'blizzard': {
        const units = allUnits(state, enemy);
        for (const u of units) freezeUnit(state, u, '暴雪降临');
        addLog(state, `暴雪降临，冻结了 ${units.length} 个敌方单位。`, 'trigger');
        break;
      }
      case 'dragon_flute': {
        const t = target && findUnit(state, enemy, target.uid);
        if (t) {
          const stolenId = t.cardId;
          removeUnitFromBoard(state, t);
          addLog(state, '龙之笛的笛声将敌方龙族逐出战场。', 'trigger');
          if (state.random() < 0.1) {
            if (p.hand.length >= RULES.HAND_LIMIT) {
              addLog(state, `笛声引来「${Cards.get(stolenId).name}」，但你的手牌已满，它消散在风中。`, 'debuff');
            } else {
              p.hand.push(stolenId);
              emit(state, { t: 'draw', side, cardId: stolenId });
              addLog(state, `奇迹发生了：龙之笛将「${Cards.get(stolenId).name}」引向你的手牌！`, 'good');
            }
          }
        }
        break;
      }
      case 'head_start': {
        addLog(state, '捷足先登：前线的混血种撕开缺口，援军抢先抵达。', 'trigger');
        drawCard(state, side);
        if (state.winner == null) drawCard(state, side);
        break;
      }
      case 'quick_victory': {
        addLog(state, '快速取胜：敌方总部受到 5 点伤害，但敌方全体单位获得 +1/+1。', 'trigger');
        damageHQ(state, enemy, 5, '快速取胜');
        if (state.winner == null) {
          const units = allUnits(state, enemy);
          for (const u of units) buffUnit(state, u, 1, 1, '快速取胜');
          addLog(state, `快速取胜的代价：${units.length} 个敌方单位获得 +1/+1。`, 'debuff');
        }
        break;
      }
      case 'dragon_nest_repair': {
        healHQ(state, side, 8);
        let foundIndex = -1;
        for (let i = 0; i < p.deck.length; i++) {
          const c = Cards.get(p.deck[i]);
          if (c && c.type === 'unit' && c.tribe === 'dragon' && c.cost >= 3) { foundIndex = i; break; }
        }
        if (foundIndex >= 0) {
          const cardId = p.deck.splice(foundIndex, 1)[0];
          shuffleInPlace(p.deck, state.random);
          if (p.hand.length >= RULES.HAND_LIMIT) {
            addLog(state, `龙巢维修找到「${Cards.get(cardId).name}」，但手牌已满，卡牌被烧毁。`, 'debuff');
            emit(state, { t: 'overdraw', side, cardId });
          } else {
            p.hand.push(cardId);
            emit(state, { t: 'draw', side, cardId });
            addLog(state, `龙巢维修从卡组中找到了「${Cards.get(cardId).name}」。`, 'draw');
          }
        } else {
          addLog(state, '龙巢维修：卡组中没有费用≥3的龙族单位卡。', 'info');
        }
        break;
      }
      case 'last_stand': {
        const lost = Math.max(0, p.hp - 1);
        p.hp = 1;
        if (lost > 0) p.stats.damageTaken += lost;
        emit(state, { t: 'hqSet', side, hp: 1 });
        addLog(state, '最后一搏：你的总部生命被压到 1 点。', 'bad');
        for (const u of allUnits(state, side)) buffUnit(state, u, 4, 4, '最后一搏');
        addLog(state, '你的所有单位获得 +4/+4。', 'buff');
        break;
      }
      default:
        break;
    }
  }

  /* ============================ 公开动作 ============================ */

  function playCard(state, side, handIndex, target) {
    state.events = [];
    const check = canPlayCard(state, side, handIndex);
    if (!check.ok) return { ok: false, error: check.reason, events: state.events };
    const p = state.players[side];
    const card = check.card;
    if (!isValidTarget(state, side, card, target)) {
      const spec = card.target;
      if (spec && spec.required) return { ok: false, error: '需要选择一个合法目标', events: state.events };
      if (target) return { ok: false, error: '目标不合法', events: state.events };
    }

    p.crystals -= card.cost;
    p.hand.splice(handIndex, 1);
    p.stats.cardsPlayed += 1;

    if (card.type === 'unit') {
      const unit = makeUnit(state, card, side);
      p.support.push(unit);
      if (card.id === 'welsh_red') p.deployed.welsh = true;
      if (card.id === 'ice_dragon') p.deployed.ice = true;
      emit(state, { t: 'deploy', side, uid: unit.uid, cardId: card.id });
      addLog(state, `${p.name}部署了「${card.name}」。`, side === 0 ? 'play-self' : 'play-enemy');
      applyDeployEffect(state, side, unit, target, card);
      triggerElfDragonGrowth(state, unit, card);
    } else if (card.type === 'equip') {
      const unit = findUnit(state, side, target.uid);
      if (!unit) return { ok: false, error: '装备目标不存在', events: state.events };
      applyEquip(state, side, unit, card);
    } else {
      addLog(state, `${p.name}使用了「${card.name}」。`, side === 0 ? 'play-self' : 'play-enemy');
      emit(state, { t: 'tactic', side, cardId: card.id });
      resolveTactic(state, side, card, target);
    }

    processDeaths(state);
    checkWinner(state);
    return { ok: true, events: state.events };
  }

  function moveUnit(state, side, uid) {
    state.events = [];
    if (state.winner != null) return { ok: false, error: '对局已结束', events: state.events };
    const unit = findUnit(state, side, uid);
    if (!unit) return { ok: false, error: '单位不存在', events: state.events };
    if (!canMoveUnit(state, unit)) {
      let reason = '无法移动';
      if (unit.line !== 'support') reason = '该单位已经在前线';
      else if (unit.frozen) reason = '单位被冻结';
      else if (unit.exhausted) reason = '单位本回合已经行动';
      else reason = '前线已满';
      return { ok: false, error: reason, events: state.events };
    }
    const p = state.players[side];
    p.support.splice(p.support.indexOf(unit), 1);
    unit.line = 'front';
    unit.movedThisTurn = true;
    unit.actedThisTurn = true;
    unit.smoke = false;
    p.front.push(unit);
    emit(state, { t: 'move', side, uid, line: 'front' });
    addLog(state, `「${unit.name}」移动到前线。`, side === 0 ? 'play-self' : 'play-enemy');
    return { ok: true, events: state.events };
  }

  function isValidAttackTarget(state, attacker, target) {
    if (!target) return false;
    const list = getAttackTargets(state, attacker.side, attacker.uid);
    return list.some(t => t.kind === target.kind && t.uid === target.uid && t.side === target.side);
  }

  function getAttackTargets(state, side, uid) {
    const unit = findUnit(state, side, uid);
    if (!unit || !canAttackWith(state, unit)) return [];
    const enemy = otherSide(side);
    const enemyP = state.players[enemy];
    const out = [];
    if (unit.line === 'front') {
      for (const u of enemyP.front) {
        if (canBeAttacked(state, u)) out.push({ kind: 'unit', side: enemy, uid: u.uid, line: 'front' });
      }
      if (enemyP.front.length === 0) {
        for (const u of enemyP.support) {
          if (canBeAttacked(state, u)) out.push({ kind: 'unit', side: enemy, uid: u.uid, line: 'support' });
        }
      }
      // 对方前线有单位时，普通单位不能越过前线攻击总部
      if ((enemyP.front.length === 0 || unit.ignoreFrontlineHq) && unit.cardId !== 'nordic_white_dragon') {
        out.push({ kind: 'hq', side: enemy });
      }
    } else if (hasBow(unit)) {
      for (const u of enemyP.front) {
        if (canBeAttacked(state, u)) out.push({ kind: 'unit', side: enemy, uid: u.uid, line: 'front' });
      }
      for (const u of enemyP.support) {
        if (canBeAttacked(state, u)) out.push({ kind: 'unit', side: enemy, uid: u.uid, line: 'support' });
      }
    }
    return out;
  }

  function attack(state, side, uid, target) {
    state.events = [];
    if (state.winner != null) return { ok: false, error: '对局已结束', events: state.events };
    const unit = findUnit(state, side, uid);
    if (!unit) return { ok: false, error: '单位不存在', events: state.events };
    if (!canAttackWith(state, unit)) {
      let reason = '该单位无法攻击';
      if (unit.frozen) reason = '单位被冻结';
      else if (unit.exhausted) reason = '单位本回合已经行动';
      else if (unit.line === 'support') reason = '支援阵线的单位无法攻击（除非装备弓箭）';
      return { ok: false, error: reason, events: state.events };
    }
    if (!isValidAttackTarget(state, unit, target)) {
      return { ok: false, error: '目标不合法', events: state.events };
    }

    let dmg = unitAtk(state, unit);
    let robeProc = false;
    if (hasRobe(unit) && state.random() < 0.5) {
      dmg += 1;
      robeProc = true;
      addLog(state, '法袍的奥术涌动，额外造成 1 点伤害。', 'trigger');
    }

    unit.exhausted = true;
    unit.smoke = false;
    unit.movedThisTurn = true;
    unit.actedThisTurn = true;
    const enemy = otherSide(side);
    const targetUnit = target.kind === 'unit' ? findUnit(state, target.side != null ? target.side : enemy, target.uid) : null;
    emit(state, {
      t: 'attack', side, uid, targetKind: target.kind,
      targetUid: target.kind === 'unit' ? target.uid : null,
      targetSide: enemy, damage: dmg
    });

    if (target.kind === 'hq') {
      addLog(state, `「${unit.name}」攻击${state.players[enemy].name}总部，造成 ${dmg} 点伤害。`, side === 0 ? 'play-self' : 'play-enemy');
      damageHQ(state, enemy, dmg, unit.name);
    } else if (targetUnit) {
      const retaliation = unitAtk(state, targetUnit);
      addLog(state, `「${unit.name}」攻击「${targetUnit.name}」（${dmg} 点伤害）。`, side === 0 ? 'play-self' : 'play-enemy');
      damageUnit(state, targetUnit, dmg, unit.name);
      if (unit.cardId === 'fire_wyvern' && targetUnit.def > 0) {
        applyBurn(state, targetUnit, '火翼龙');
      }
      if (retaliation > 0) {
        addLog(state, `「${targetUnit.name}」反击，对「${unit.name}」造成 ${retaliation} 点伤害。`, 'info');
        damageUnit(state, unit, retaliation, targetUnit.name);
      }
    }

    processDeaths(state);
    checkWinner(state);
    return { ok: true, events: state.events };
  }

  function getActivatableUnits(state, side) {
    return allUnits(state, side).filter(u => u.cardId === 'azure_dragon' && !u.azureUsed);
  }

  function activateUnit(state, side, uid, target) {
    state.events = [];
    if (state.winner != null) return { ok: false, error: '对局已结束', events: state.events };
    if (state.active !== side) return { ok: false, error: '现在不是你的回合', events: state.events };
    const unit = findUnit(state, side, uid);
    if (!unit || unit.cardId !== 'azure_dragon') return { ok: false, error: '该单位没有可发动的能力', events: state.events };
    if (unit.azureUsed) return { ok: false, error: '本回合已经使用过', events: state.events };
    if (!target) return { ok: false, error: '需要选择友方目标', events: state.events };
    const t = findUnit(state, side, target.uid);
    if (!t) return { ok: false, error: '目标不合法', events: state.events };
    unit.azureUsed = true;
    const healed = healUnit(state, t, 1);
    emit(state, { t: 'activate', side, uid, targetUid: t.uid });
    if (healed > 0) addLog(state, `青龙为「${t.name}」恢复 ${healed} 点防御力。`, 'buff');
    else addLog(state, `青龙的疗愈落在「${t.name}」身上，但其防御力已满。`, 'info');
    return { ok: true, events: state.events };
  }

  function endTurn(state) {
    state.events = [];
    if (state.winner != null) return { ok: false, error: '对局已结束', events: state.events };
    const side = state.active;
    // 冻结持续到该单位控制者的回合结束
    for (const u of allUnits(state, side)) {
      if (u.frozen) {
        u.frozen = false;
        emit(state, { t: 'thaw', side: u.side, uid: u.uid });
        addLog(state, `「${u.name}」的冰霜消融。`, 'info');
      }
    }
    addLog(state, `${state.players[side].name}结束了回合。`, 'info');
    state.active = otherSide(side);
    beginTurn(state);
    return { ok: true, events: state.events };
  }

  function surrender(state, side) {
    state.events = [];
    if (state.winner != null) return { ok: true, events: state.events };
    state.winner = otherSide(side);
    state.winReason = `${state.players[side].name}投降`;
    emit(state, { t: 'gameover', winner: state.winner, reason: state.winReason });
    addLog(state, `${state.players[side].name}投降了。`, 'bad');
    return { ok: true, events: state.events };
  }

  /* ============================ 新局 ============================ */

  function makePlayer(side, deck, name) {
    return {
      side,
      name: name || SIDE_NAMES[side],
      hp: RULES.HQ_HP,
      maxHp: RULES.HQ_HP,
      deck: deck.slice(),
      hand: [],
      support: [],
      front: [],
      graveyard: [],
      crystals: 1,
      maxCrystals: 1,
      turnsTaken: 0,
      fatigue: 0,
      deployed: { welsh: false, ice: false },
      stats: { cardsPlayed: 0, unitsLost: 0, unitsKilled: 0, damageTaken: 0 }
    };
  }

  function createGame(opts) {
    opts = opts || {};
    const seed = (opts.seed == null ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : opts.seed) >>> 0;
    const state = {
      seed,
      random: makeRng(seed || 1),
      turn: 0,
      active: 0,
      winner: null,
      winReason: null,
      events: [],
      log: [],
      logSeq: 0,
      uid: 1,
      players: [
        makePlayer(0, opts.playerDeck || [], opts.playerName || '你'),
        makePlayer(1, opts.enemyDeck || [], opts.enemyName || '对手')
      ]
    };

    shuffleInPlace(state.players[0].deck, state.random);
    shuffleInPlace(state.players[1].deck, state.random);

    addLog(state, '⚔ 战斗开始：双方总部各有 20 点生命，击破敌方总部即可获胜。', 'system');
    addLog(state, `你先手，对手使用「${opts.enemyDeckName || '未知卡组'}」。`, 'system');

    for (let i = 0; i < RULES.START_HAND; i++) {
      drawCard(state, 0, { silent: true });
      drawCard(state, 1, { silent: true });
    }

    beginTurn(state);
    state.events = [];
    return state;
  }

  /* ============================ 导出 ============================ */
  root.DBEngine = {
    RULES,
    createGame,
    playCard,
    moveUnit,
    attack,
    activateUnit,
    endTurn,
    surrender,
    canPlayCard,
    getCardOptions,
    getAttackTargets,
    getActivatableUnits,
    getTargets: validTargetList,
    canMoveUnit,
    canAttackWith,
    checkCondition,
    unitAtk,
    unitMaxDef,
    isUntargetable,
    isProtected,
    canBeAttacked,
    hasBow,
    hasRobe,
    findUnit,
    allUnits,
    otherSide
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.DBEngine;
