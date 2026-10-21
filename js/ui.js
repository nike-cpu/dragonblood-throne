/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * ui.js — 界面、交互、动画与电脑对手调度
 * ========================================================================== */
(function (root) {
  'use strict';

  const Cards = root.DBCards;
  const Engine = root.DBEngine;
  const AI = root.DBAI;
  const Art = root.DBArt;
  const Audio = root.DBAudio;

  const STORAGE = {
    settings: 'dbt.settings.v1',
    deck: 'dbt.customDeck.v1',
    record: 'dbt.record.v1'
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const FAST = (() => {
    try { return new URLSearchParams(window.location.search).get('fast') === '1'; } catch (e) { return false; }
  })();

  const ui = {
    screen: 'title',
    game: null,
    battleDecks: null,
    selection: null,
    busy: false,
    aiRunning: false,
    resultShown: false,
    rects: {},
    hqRects: {},
    record: { wins: 0, losses: 0 },
    settings: { sfx: true },
    customDeck: null,
    deckEditing: [],
    poolFilter: 'all',
    codexFilter: 'all',
    modalLocked: false,
    menuUid: null,
    logSeq: 0,
    aiWatchdog: null,
    previewIndex: null
  };

  const TYPE_LABEL = {
    unit: '单位', equip: '装备', tactic: '战术'
  };

  /* ============================ 基础工具 ============================ */

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function sfx(name) {
    try { Audio.play(name); } catch (e) { /* 忽略 */ }
  }
  function toast(msg, type) {
    const host = $('#toast-root');
    if (!host) return;
    const d = document.createElement('div');
    d.className = 'toast ' + (type || '');
    d.textContent = msg;
    host.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .3s'; }, 2100);
    setTimeout(() => d.remove(), 2500);
  }

  /* ============================ 界面切换 ============================ */

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    ui.screen = name;
    if (name !== 'battle') closeModal();
  }

  function openModal(inner, opts) {
    opts = opts || {};
    const rootEl = $('#modal-root');
    rootEl.innerHTML =
      '<div class="modal-overlay" data-modal-overlay></div>' +
      '<div class="modal-panel ' + (opts.panelClass || '') + '" role="dialog" aria-modal="true">' +
      (opts.noClose ? '' : '<button class="modal-close" data-close-modal aria-label="关闭">×</button>') +
      inner + '</div>';
    rootEl.classList.add('open');
    ui.modalLocked = !!opts.locked;
    $$('[data-close-modal]', rootEl).forEach(b => b.addEventListener('click', () => closeModal()));
    const overlay = $('[data-modal-overlay]', rootEl);
    if (overlay) overlay.addEventListener('click', () => { if (!opts.locked) closeModal(); });
    return $('.modal-panel', rootEl);
  }

  function closeModal() {
    const rootEl = $('#modal-root');
    if (!rootEl) return;
    rootEl.classList.remove('open');
    rootEl.innerHTML = '';
    ui.modalLocked = false;
  }

  function showTurnFlash(text, enemy) {
    const el = $('#turn-flash');
    el.innerHTML = '<div class="tf-inner">' + esc(text) + '</div>';
    el.classList.remove('show', 'enemy');
    if (enemy) el.classList.add('enemy');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1200);
  }

  /* ============================ 卡牌渲染 ============================ */

  function cardKeywords(card) {
    if (!card.keywords || !card.keywords.length) return '';
    return '<div class="card-keywords">' + card.keywords.map(k => '<span class="kw">' + esc(k) + '</span>').join('') + '</div>';
  }

  function cardInner(card, compact) {
    const typeLabel = card.type === 'unit'
      ? (card.tribe === 'dragon' ? '龙族单位' : card.tribe === 'hybrid' ? '混血单位' : '单位')
      : card.type === 'equip' ? '装备 · 混血种专用' : '战术';
    const stats = card.type === 'unit'
      ? '<span class="card-stat atk">' + Art.icon('sword') + card.atk + '</span>' +
        '<span class="card-stat def">' + Art.icon('shield') + card.def + '</span>'
      : '<span class="card-slot-mark">' + (card.type === 'equip' ? '装备槽装备' : '一次性战术') + '</span><span></span>';
    return '' +
      '<div class="card-art">' + Art.cardArt(card) +
        '<div class="cost-gem">' + card.cost + '</div>' +
        '<div class="rarity-gem"></div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-name-row"><span class="card-name">' + esc(card.name) + '</span>' +
          '<span class="card-sub">' + esc(card.en || '') + '</span></div>' +
        '<div class="card-type">' + typeLabel + (card.slots ? ' · 装备槽' : '') + '</div>' +
        '<div class="card-text">' + esc(card.text) + '</div>' +
        cardKeywords(card) +
        (card.condition ? '<div class="card-type" style="opacity:.72">条件：' + esc(card.condition) + '</div>' : '') +
        '<div class="card-stats-row">' + stats + '</div>' +
      '</div>';
  }

  function cardHtml(card, opts) {
    opts = opts || {};
    const cls = ['card', 'rarity-' + (card.rarity || 'common'), opts.cls || ''].filter(Boolean).join(' ');
    return '<div class="' + cls + '" style="--accent:' + card.accent + '" ' + (opts.attrs || '') + '>' +
      cardInner(card) + (opts.badge || '') + '</div>';
  }

  /* ============================ 主菜单 ============================ */

  function buildTitle() {
    const art = $('#title-art');
    if (art) art.innerHTML = Art.logoDragon();
    seedEmbers();
    renderRecord();
  }

  function seedEmbers() {
    const wrap = $('#title-embers');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      const size = 1 + Math.random() * 2.6;
      s.style.left = (Math.random() * 100) + '%';
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.animationDuration = (9 + Math.random() * 12) + 's';
      s.style.animationDelay = (-Math.random() * 18) + 's';
      wrap.appendChild(s);
    }
  }

  function renderRecord() {
    const el = $('#title-record');
    if (!el) return;
    const r = ui.record;
    el.textContent = (r.wins + r.losses) > 0 ? ('战绩 ' + r.wins + ' 胜 · ' + r.losses + ' 负') : '尚未对战';
  }

  function updateSoundButton() {
    const btn = $('#btn-sound');
    if (!btn) return;
    btn.textContent = '音效：' + (ui.settings.sfx ? '开' : '关');
  }

  /* ============================ 选卡组 ============================ */

  function defaultEnemyPreset(playerPresetName) {
    const options = Cards.PRESET_LIST.filter(p => p.name !== playerPresetName);
    const list = options.length ? options : Cards.PRESET_LIST;
    return list[Math.floor(Math.random() * list.length)];
  }

  function openDeckSelect() {
    const customValid = ui.customDeck && Cards.validateDeck(ui.customDeck).ok;
    const items = Cards.PRESET_LIST.map(p => {
      const counts = Cards.deckTribeCounts(p.cards);
      return `<button class="deck-choice" data-preset="${p.id}" style="--dc-accent:${p.accent}">
        <div class="dc-emblem">${esc(p.name[0])}</div>
        <div class="dc-main">
          <div class="dc-name">${esc(p.name)}<em>${esc(p.en)}</em></div>
          <div class="dc-desc">${esc(p.desc)}</div>
          <div class="dc-tags">
            <span class="dc-tag">${esc(p.style)}</span>
            <span class="dc-tag">龙 ${counts.dragon}</span>
            <span class="dc-tag">混血 ${counts.hybrid}</span>
            <span class="dc-tag">装备/战术 ${counts.equip + counts.tactic}</span>
          </div>
        </div>
        <div class="dc-go">选择 →</div>
      </button>`;
    }).join('');

    const customBlock = customValid
      ? `<button class="deck-choice" data-custom-deck="1" style="--dc-accent:#d8b36a">
          <div class="dc-emblem">自</div>
          <div class="dc-main">
            <div class="dc-name">自定义卡组<em>CUSTOM DECK</em></div>
            <div class="dc-desc">你保存的 30 张卡组。对手将随机选择一套预设卡组。</div>
            <div class="dc-tags"><span class="dc-tag">已保存</span><span class="dc-tag">30 张</span></div>
          </div>
          <div class="dc-go">选择 →</div>
        </button>`
      : `<div class="deck-choice locked" style="--dc-accent:#7a7263">
          <div class="dc-emblem">自</div>
          <div class="dc-main">
            <div class="dc-name">自定义卡组<em>CUSTOM DECK</em></div>
            <div class="dc-desc">还没有保存的自定义卡组，先去「卡组构筑」创建一套吧。</div>
          </div>
          <div class="dc-go">未保存</div>
        </div>`;

    const panel = openModal(
      '<h2 class="modal-title">选择卡组</h2>' +
      '<p class="modal-sub">—— 龙裔王座 · 一对一对战 ——<br>对手会从三套预设卡组中随机应战。你的总部与对手一样，各有 20 点生命。</p>' +
      '<div class="deck-choice-list">' + items + '</div>' +
      '<div style="margin-top:12px"></div>' +
      '<div class="deck-choice-list">' + customBlock + '</div>' +
      '<p class="dc-custom-note">提示：三套预设各有不同的节奏与胜利方式，建议先试「烈焰突袭」。</p>',
      { panelClass: 'deck-select-panel' }
    );

    $$('[data-preset]', panel).forEach(btn => btn.addEventListener('click', () => {
      const preset = Cards.PRESETS[btn.dataset.preset];
      if (!preset) return;
      sfx('click');
      closeModal();
      const enemy = defaultEnemyPreset(preset.name);
      startBattle({
        playerDeck: preset.cards.slice(),
        playerDeckName: preset.name,
        enemyDeck: enemy.cards.slice(),
        enemyDeckName: enemy.name
      });
    }));
    const customBtn = $('[data-custom-deck]', panel);
    if (customBtn) {
      customBtn.addEventListener('click', () => {
        const v = Cards.validateDeck(ui.customDeck);
        if (!v.ok) { toast(v.errors[0] || '卡组不合法', 'error'); return; }
        sfx('click');
        closeModal();
        const e = defaultEnemyPreset('自定义卡组');
        startBattle({
          playerDeck: ui.customDeck.slice(),
          playerDeckName: '自定义卡组',
          enemyDeck: e.cards.slice(),
          enemyDeckName: e.name
        });
      });
    }
  }

  /* ============================ 开始 / 重开 / 结束 ============================ */

  function startBattle(cfg) {
    closeModal();
    const enemyDeck = cfg.enemyDeck && cfg.enemyDeck.length ? cfg.enemyDeck.slice() : defaultEnemyPreset(cfg.playerDeckName).cards.slice();
    const enemyName = cfg.enemyDeckName || '预设卡组';
    ui.battleDecks = {
      playerDeck: cfg.playerDeck.slice(),
      playerDeckName: cfg.playerDeckName || '自定义卡组',
      enemyDeck: enemyDeck.slice(),
      enemyDeckName: enemyName
    };

    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    ui.game = Engine.createGame({
      playerDeck: cfg.playerDeck.slice(),
      enemyDeck: enemyDeck,
      seed,
      playerName: '你',
      enemyName: enemyName + ' · AI',
      enemyDeckName: enemyName
    });
    ui.selection = null;
    ui.busy = false;
    ui.aiRunning = false;
    ui.resultShown = false;
    ui.rects = {};
    ui.hqRects = {};
    ui.logSeq = 0;
    if (ui.aiWatchdog) { clearTimeout(ui.aiWatchdog); ui.aiWatchdog = null; }
    hideUnitMenu();
    hideHint();
    hideCardPreview();

    $('#enemy-emblem').innerHTML = Art.hqCrest(1);
    $('#player-emblem').innerHTML = Art.hqCrest(0);
    $('#enemy-name').textContent = enemyName + ' · AI';
    $('#enemy-deck-name').textContent = enemyDeck.length + ' 张';
    $('#player-deck-name').textContent = ui.battleDecks.playerDeckName;
    $('#log-panel').classList.remove('open');
    showScreen('battle');
    renderAll();
    showTurnFlash('你的回合', false);
    sfx('turn');
    if (window.innerWidth <= 1450) $('#log-panel').classList.remove('open');
  }

  function rematch() {
    closeModal();
    if (!ui.battleDecks) { returnToTitle(); return; }
    startBattle({
      playerDeck: ui.battleDecks.playerDeck.slice(),
      playerDeckName: ui.battleDecks.playerDeckName,
      enemyDeck: ui.battleDecks.enemyDeck.slice(),
      enemyDeckName: ui.battleDecks.enemyDeckName
    });
  }

  function returnToTitle() {
    closeModal();
    hideUnitMenu();
    hideHint();
    hideCardPreview();
    clearAIWatchdog();
    ui.game = null;
    ui.battleDecks = null;
    ui.selection = null;
    ui.busy = false;
    ui.aiRunning = false;
    ui.resultShown = false;
    showScreen('title');
    renderRecord();
    seedEmbers();
  }

  /* ============================ 对战渲染 ============================ */

  function enemySideUnits(side) {
    const p = ui.game.players[side];
    return { front: p.front, support: p.support };
  }

  function unitStatusIcons(unit) {
    let out = '';
    if (unit.frozen) out += '<span class="status-ico snow" title="冻结：无法行动">❄</span>';
    if (unit.burn) out += '<span class="status-ico burn" title="灼烧：回合开始受到 1 点伤害">火</span>';
    if (unit.smoke) out += '<span class="status-ico smoke" title="烟幕：未行动时无法被选中">烟</span>';
    if (Engine.isProtected(ui.game, unit)) out += '<span class="status-ico shield" title="被洞穴龙庇护：无法被攻击">庇</span>';
    if (Engine.hasRobe(unit) && !unit.actedThisTurn) out += '<span class="status-ico robe" title="法袍：未行动或攻击时无法被选中">隐</span>';
    if (unit.cardId === 'azure_dragon' && !unit.azureUsed) out += '<span class="status-ico azure" title="可疗愈友方一次">愈</span>';
    return out ? '<div class="unit-status">' + out + '</div>' : '';
  }

  function unitHtml(unit, side) {
    const g = ui.game;
    const card = Cards.get(unit.cardId);
    const atk = Engine.unitAtk(g, unit);
    const maxDef = Engine.unitMaxDef(unit);
    const targetSet = (ui.selection && ui.selection.targets) || [];
    const isValidTarget = targetSet.some(t => t.kind === 'unit' && t.uid === unit.uid && t.side === side);
    const canFreeHeal = unit.cardId === 'azure_dragon' && !unit.azureUsed;
    const selectable = side === 0 && !ui.busy && g.active === 0 && g.winner == null &&
      (!unit.frozen || canFreeHeal) && (!unit.exhausted || canFreeHeal || Engine.canMoveUnit(g, unit));
    const classes = [
      'unit',
      unit.exhausted ? 'exhausted' : 'ready',
      unit.frozen ? 'frozen' : '',
      selectable ? 'selectable' : '',
      isValidTarget ? 'valid-target' : '',
      Engine.isProtected(g, unit) ? 'unit-protected' : ''
    ].filter(Boolean).join(' ');
    const buffedAtk = atk !== unit.baseAtk;
    const buffedDef = maxDef !== unit.baseDef;
    const equipPips = unit.equipment.length
      ? '<div class="unit-equip-pips">' + unit.equipment.map(() => '<i class="equip-pip"></i>').join('') + '</div>'
      : '';
    return `<div class="${classes}" data-uid="${unit.uid}" data-side="${side}" role="button" aria-label="${esc(card.name)}">
      <div class="unit-art">${Art.cardArt(card, { compact: true })}${unitStatusIcons(unit)}${equipPips}</div>
      <div class="unit-name">${esc(card.name)}</div>
      <div class="unit-stats">
        <span class="u-atk ${buffedAtk ? 'buffed' : ''}">${atk}</span>
        <span class="u-def ${buffedDef ? 'buffed' : ''}">${unit.def}${maxDef !== unit.def ? '<em style="font-style:normal;font-size:9px;color:#6e7b86">/' + maxDef + '</em>' : ''}</span>
      </div>
      ${!unit.exhausted && !unit.frozen && side === 0 ? '<span class="unit-ready-dot"></span>' : ''}
    </div>`;
  }

  function renderRow(side, line) {
    const units = ui.game.players[side][line];
    const rowId = (side === 1 ? 'enemy' : 'player') + '-' + line;
    const row = $('#row-' + rowId);
    if (!row) return;
    let html = '';
    for (let i = 0; i < Engine.RULES.ROW_LIMIT; i++) {
      const u = units[i];
      html += '<div class="board-slot ' + (u ? 'filled' : '') + '">' + (u ? unitHtml(u, side) : '') + '</div>';
    }
    row.innerHTML = html;
  }

  function renderBoard() {
    if (!ui.game) return;
    renderRow(1, 'support');
    renderRow(1, 'front');
    renderRow(0, 'front');
    renderRow(0, 'support');

    const hqTarget = !!(ui.selection && ui.selection.targets &&
      ui.selection.targets.some(t => t.kind === 'hq'));
    const enemyHq = $('#enemy-hq-wrap');
    if (enemyHq) enemyHq.classList.toggle('targetable', hqTarget);

    const deployZone = !!(ui.selection && ui.selection.type === 'play' &&
      ui.selection.card.type === 'unit' && !ui.selection.needsTarget);
    const supportLine = $('.board-line[data-side="0"][data-line="support"]');
    if (supportLine) supportLine.classList.toggle('deploy-zone', deployZone);
  }

  function cardPlayState(index) {
    const g = ui.game;
    if (!g) return { playable: false, reason: '' };
    const opt = Engine.getCardOptions(g, 0, index);
    if (!opt) return { playable: false, reason: '' };
    let playable = opt.playable && g.active === 0 && !ui.busy && g.winner == null;
    return { playable, reason: opt.reason || '', opt };
  }

  function handCardHtml(id, index) {
    const card = Cards.get(id);
    const p = ui.game.players[0];
    const state = cardPlayState(index);
    const warn = p.crystals < card.cost;
    const selected = ui.selection && ui.selection.type === 'play' && ui.selection.handIndex === index;
    const cls = [
      state.playable ? 'playable' : 'disabled',
      warn ? 'card-cost-warn' : '',
      selected ? 'selected' : ''
    ].filter(Boolean).join(' ');
    return cardHtml(card, { cls, attrs: 'data-hand-index="' + index + '" tabindex="0"' });
  }

  function layoutHand() {
    const hand = $('#hand');
    if (!hand || !ui.game) return;
    const zone = hand.parentElement;
    if (!zone) return;
    const n = ui.game.players[0].hand.length;
    if (!n) {
      hand.style.removeProperty('--hand-w');
      hand.style.removeProperty('--hand-overlap');
      return;
    }
    const avail = Math.max(180, zone.clientWidth - 8);
    const baseW = 118;
    let w = baseW;
    let overlap = 32;
    const span = (width, ov) => n * width - (n - 1) * ov;
    if (span(w, overlap) > avail) {
      const maxOv = Math.round(w * 0.58);
      overlap = Math.min(maxOv, Math.ceil((n * w - avail) / Math.max(1, n - 1)));
      if (span(w, overlap) > avail) {
        w = Math.max(74, Math.floor(avail / (n - 0.58 * (n - 1))));
        overlap = Math.min(Math.round(w * 0.58), Math.max(0, Math.ceil((n * w - avail) / Math.max(1, n - 1))));
      }
      let guard = 0;
      while (span(w, overlap) > avail && w > 74 && guard++ < 24) {
        w -= 2;
        overlap = Math.min(overlap, Math.round(w * 0.6));
      }
    }
    hand.style.setProperty('--hand-w', Math.round(w) + 'px');
    hand.style.setProperty('--hand-overlap', Math.max(0, Math.round(overlap)) + 'px');
  }

  function renderHand() {
    if (!ui.game) return;
    hideCardPreview();
    const hand = $('#hand');
    const p = ui.game.players[0];
    hand.dataset.count = String(p.hand.length);
    hand.innerHTML = p.hand.map((id, i) => handCardHtml(id, i)).join('');
    layoutHand();
    const hint = $('#hand-hint');
    if (hint) {
      if (ui.busy) hint.textContent = ui.game.active === 1 ? '对手正在行动…' : '结算中…';
      else if (ui.game.winner != null) hint.textContent = '对局结束';
      else if (ui.game.active === 1) hint.textContent = '对手的回合…';
      else hint.textContent = '点击手牌以打出 · Esc 取消选择';
    }
  }

  function renderHUD() {
    if (!ui.game) return;
    const g = ui.game, p = g.players[0], e = g.players[1];

    const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    setText('#enemy-hp', e.hp);
    setText('#player-hp', p.hp);
    const enemyFill = $('#enemy-hp-fill');
    const playerFill = $('#player-hp-fill');
    if (enemyFill) enemyFill.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
    if (playerFill) playerFill.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    setText('#enemy-hand', e.hand.length);
    setText('#enemy-deck', e.deck.length);
    setText('#enemy-crystals', e.crystals);
    setText('#player-deck', p.deck.length);
    setText('#player-hand', p.hand.length);

    const cur = $('#crystal-cur'), max = $('#crystal-max');
    if (cur) cur.textContent = p.crystals;
    if (max) max.textContent = p.maxCrystals;

    const dots = $('#crystal-dots');
    if (dots) {
      if (dots.childElementCount !== Engine.RULES.MAX_CRYSTALS) {
        dots.innerHTML = new Array(Engine.RULES.MAX_CRYSTALS).fill(0)
          .map(() => '<i class="crystal-dot"></i>').join('');
      }
      $$('.crystal-dot', dots).forEach((d, i) => d.classList.toggle('on', i < p.crystals));
    }

    setText('#turn-number', '第 ' + Math.ceil(g.turn / 2) + ' 回合');
    const owner = $('#turn-owner');
    if (owner) {
      owner.textContent = g.active === 0 ? '你的回合' : '对手回合';
      const ti = $('#turn-indicator');
      if (ti) ti.classList.toggle('enemy', g.active === 1);
    }
    const endBtn = $('#btn-end-turn');
    if (endBtn) {
      const canEnd = g.active === 0 && !ui.busy && g.winner == null && !ui.aiRunning;
      endBtn.disabled = !canEnd;
      endBtn.classList.toggle('waiting', g.active === 1 && !ui.aiRunning);
      const span = endBtn.querySelector('span');
      if (span) span.textContent = g.active === 0 ? '结束回合' : '对手回合';
    }
  }

  function renderLog() {
    const list = $('#log-list');
    if (!list || !ui.game) return;
    const seq = ui.game.logSeq || 0;
    if (seq === ui.logSeq) return;
    ui.logSeq = seq;
    list.innerHTML = ui.game.log.map(entry =>
      '<div class="log-entry ' + (entry.kind || 'info') + '">' + esc(entry.text) + '</div>'
    ).join('');
    list.scrollTop = list.scrollHeight;
  }

  function captureRects() {
    const map = {};
    $$('#board .unit').forEach(el => {
      map[el.dataset.uid] = el.getBoundingClientRect();
    });
    ui.rects = map;
    ui.hqRects = {};
    const ph = $('#player-hq-wrap'), eh = $('#enemy-hq-wrap');
    if (ph) ui.hqRects[0] = ph.getBoundingClientRect();
    if (eh) ui.hqRects[1] = eh.getBoundingClientRect();
  }

  function snapshotRects() {
    return {
      rects: Object.assign({}, ui.rects),
      hqRects: Object.assign({}, ui.hqRects)
    };
  }

  function renderAll() {
    if (!ui.game) return;
    renderBoard();
    renderHand();
    renderHUD();
    renderLog();
    updateHint();
    captureRects();
  }

  /* ============================ 提示与选择 ============================ */

  function hideHint() {
    const bar = $('#hint-bar');
    if (bar) bar.classList.remove('show');
  }

  function updateHint() {
    const bar = $('#hint-bar');
    if (!bar) return;
    if (!ui.selection) { bar.classList.remove('show'); return; }
    let text = '';
    const sel = ui.selection;
    if (sel.type === 'play') {
      const card = sel.card;
      if (card.target && sel.targets.length) text = card.target.prompt || '选择一个目标';
      else if (card.type === 'unit') text = '点击你的支援阵线，部署「' + card.name + '」';
      else text = '再次点击手牌，打出「' + card.name + '」';
    } else if (sel.type === 'attack') {
      const hqOpen = sel.targets.some(t => t.kind === 'hq');
      text = hqOpen
        ? '选择攻击目标 · 总部或高亮单位'
        : '选择攻击目标 · 清空敌方前线后可打总部';
    } else if (sel.type === 'heal') {
      text = '选择要疗愈的友方单位';
    }
    bar.innerHTML = esc(text) +
      (sel.type === 'play' && sel.card.target && sel.card.target.required === false && sel.targets.length
        ? '<button class="hint-skip" data-hint-skip>跳过目标</button>'
        : '') +
      (sel.type === 'attack' ? '<button class="hint-skip" data-hint-skip-attack>不攻击</button>' : '') +
      '<span class="hint-key">Esc 取消</span>';
    bar.classList.add('show');
  }

  function clearSelection() {
    if (!ui.selection) return;
    ui.selection = null;
    hideHint();
    hideUnitMenu();
    hideCardPreview();
    renderAll();
  }

  function hideUnitMenu() {
    const menu = $('#unit-menu');
    if (!menu) return;
    menu.classList.remove('open');
    menu.innerHTML = '';
    ui.menuUid = null;
  }

  /* ---------- 手牌悬停预览 ---------- */

  function hideCardPreview() {
    const p = $('#card-preview');
    if (p) p.classList.remove('open');
    ui.previewIndex = null;
  }

  function showCardPreview(index, cardEl) {
    if (!ui.game || ui.busy) return;
    const p = $('#card-preview');
    if (!p) return;
    if (ui.previewIndex === index && p.classList.contains('open')) return;
    const id = ui.game.players[0].hand[index];
    const card = Cards.get(id);
    if (!card) return;
    p.innerHTML = cardHtml(card, { cls: 'preview-card' });
    p.classList.add('open');
    ui.previewIndex = index;
    const r = cardEl.getBoundingClientRect();
    const w = 240;
    const h = p.offsetHeight || 328;
    let left = Math.round(r.left + r.width / 2 - w / 2);
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
    let top = Math.round(r.top - h - 14);
    if (top < 10) top = Math.round(r.bottom + 14);
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  /* ============================ 单位菜单 ============================ */

  function openUnitMenu(uid, side) {
    if (!ui.game) return;
    side = side == null ? 0 : side;
    const u = Engine.findUnit(ui.game, side, uid);
    if (!u) return;
    const card = Cards.get(u.cardId);
    const menu = $('#unit-menu');
    const isMine = side === 0 && ui.game.active === 0 && !ui.busy && ui.game.winner == null;
    const actions = [];
    if (isMine) {
      if (Engine.getAttackTargets(ui.game, 0, uid).length) actions.push({ act: 'attack', label: '攻击' });
      if (Engine.canMoveUnit(ui.game, u)) actions.push({ act: 'move', label: '移动到前线' });
      if (u.cardId === 'azure_dragon' && !u.azureUsed) actions.push({ act: 'heal', label: '疗愈友方（每回合一次）' });
    }
    const statuses = [];
    if (u.frozen) statuses.push('冻结');
    if (u.burn) statuses.push('灼烧');
    if (u.smoke) statuses.push('烟幕');
    if (Engine.isProtected(ui.game, u)) statuses.push('庇护');
    if (u.equipment.length) statuses.push('装备：' + u.equipment.map(id => Cards.get(id).name).join('、'));
    const stat = Engine.unitAtk(ui.game, u) + ' 攻 / ' + u.def + ' 防（上限 ' + Engine.unitMaxDef(u) + '）';
    let html = '<div class="menu-caption" style="color:#e5cf9c;font-size:12px">' + esc(card.name) + ' · ' + stat + '</div>';
    if (statuses.length) html += '<div class="menu-caption">' + esc(statuses.join(' / ')) + '</div>';
    html += '<div class="menu-caption" style="white-space:normal;line-height:1.4">' + esc(card.text) + '</div>';
    if (actions.length) {
      html += '<div class="menu-sep"></div>';
      html += actions.map(a => '<button class="menu-item" data-act="' + a.act + '">' + a.label + '</button>').join('');
    } else if (isMine) {
      html += '<div class="menu-item" style="color:#6f6757;cursor:default">本回合无法行动</div>';
    }
    html += '<div class="menu-sep"></div><button class="menu-item" data-act="close">关闭</button>';
    menu.innerHTML = html;
    menu.dataset.uid = uid;
    menu.dataset.side = side;
    menu.classList.add('open');
    ui.menuUid = uid;
    positionMenu(uid);
  }

  function positionMenu(uid) {
    const menu = $('#unit-menu');
    const el = document.querySelector('.unit[data-uid="' + uid + '"]');
    if (!menu || !el) return;
    const r = el.getBoundingClientRect();
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 120;
    let left = r.left + r.width / 2 - mw / 2;
    left = Math.max(10, Math.min(window.innerWidth - mw - 10, left));
    let top = r.top - mh - 10;
    if (top < 8) top = Math.min(window.innerHeight - mh - 8, r.bottom + 10);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function onUnitMenuClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const menu = $('#unit-menu');
    const act = btn.dataset.act;
    const uid = menu.dataset.uid;
    const side = Number(menu.dataset.side);
    hideUnitMenu();
    if (side !== 0) return;
    if (act === 'attack') selectAttack(uid);
    else if (act === 'move') doMove(uid);
    else if (act === 'heal') selectHeal(uid);
  }

  /* ============================ 选择动作 ============================ */

  function selectAttack(uid) {
    if (!ui.game || ui.busy) return;
    const targets = Engine.getAttackTargets(ui.game, 0, uid);
    if (!targets.length) { toast('该单位无法攻击', 'error'); return; }
    ui.selection = { type: 'attack', uid, targets };
    sfx('select');
    renderAll();
  }

  function selectHeal(uid) {
    if (!ui.game || ui.busy) return;
    const azure = Engine.findUnit(ui.game, 0, uid);
    if (!azure || azure.cardId !== 'azure_dragon' || azure.azureUsed) { toast('青龙本回合已使用过疗愈', 'error'); return; }
    const targets = Engine.allUnits(ui.game, 0).map(u => ({ kind: 'unit', side: 0, uid: u.uid }));
    if (!targets.length) { toast('没有可疗愈的目标', 'error'); return; }
    ui.selection = { type: 'heal', healerUid: uid, targets };
    sfx('select');
    renderAll();
  }

  function selectCard(index) {
    if (!ui.game || ui.busy || ui.game.active !== 0 || ui.game.winner != null) return;
    const p = ui.game.players[0];
    const card = Cards.get(p.hand[index]);
    if (!card) return;
    const opt = Engine.getCardOptions(ui.game, 0, index);
    if (!opt.playable) {
      sfx('error');
      toast(opt.reason || '无法打出这张牌', 'error');
      return;
    }
    const sel = ui.selection;
    if (sel && sel.type === 'play' && sel.handIndex === index) {
      if (sel.needsTarget) {
        clearSelection();
      } else {
        playSelected(null);
      }
      return;
    }
    const hasTargets = !!(card.target && opt.targets.length);
    ui.selection = {
      type: 'play',
      handIndex: index,
      card,
      targets: hasTargets ? opt.targets : [],
      needsTarget: hasTargets
    };
    sfx('select');
    renderAll();
  }

  function playSelected(target) {
    const sel = ui.selection;
    if (!sel || sel.type !== 'play') return;
    runAction(() => Engine.playCard(ui.game, 0, sel.handIndex, target || null));
  }

  function deploySelected() {
    const sel = ui.selection;
    if (!sel || sel.type !== 'play' || sel.card.type !== 'unit' || sel.needsTarget) return;
    playSelected(null);
  }

  function doMove(uid) {
    runAction(() => Engine.moveUnit(ui.game, 0, uid), () => {
      const u = Engine.findUnit(ui.game, 0, uid);
      if (u && Engine.getAttackTargets(ui.game, 0, uid).length) {
        toast('已移动到前线，可选择攻击或不攻击', 'good');
        selectAttack(uid);
      } else {
        toast('已移动到前线', 'info');
      }
    }, { windup: { uid, type: 'move' } });
  }

  function healSelected(target) {
    const sel = ui.selection;
    if (!sel || sel.type !== 'heal') return;
    runAction(() => Engine.activateUnit(ui.game, 0, sel.healerUid, target));
  }

  function executeAttack(uid, target) {
    runAction(() => Engine.attack(ui.game, 0, uid, target), null, { windup: { uid, type: 'attack' } });
  }

  function runAction(fn, after, opts) {
    if (!ui.game || ui.busy || ui.game.winner != null) return;
    opts = opts || {};
    const gameRef = ui.game;
    const execute = () => {
      if (!ui.game || ui.game !== gameRef || ui.game.winner != null) {
        ui.busy = false;
        renderAll();
        return;
      }
      const snap = snapshotRects();
      const res = fn();
      if (!res || !res.ok) {
        ui.busy = false;
        sfx('error');
        toast((res && res.error) || '无法执行该动作', 'error');
        renderAll();
        return;
      }
      ui.busy = true;
      ui.selection = null;
      hideHint();
      hideUnitMenu();
      hideCardPreview();
      renderAll();
      playEvents(res.events, snap, () => {
        ui.busy = false;
        renderAll();
        if (after) after();
        checkGameOver();
      });
    };
    if (opts.windup) {
      ui.busy = true;
      ui.selection = null;
      hideHint();
      hideUnitMenu();
      hideCardPreview();
      renderAll();
      windup(opts.windup.uid, opts.windup.type || 'attack', execute);
    } else {
      execute();
    }
  }

  /* ============================ 点击处理 ============================ */

  function onHandClick(index) {
    if (!ui.game || ui.busy) return;
    if (ui.game.active !== 0 || ui.game.winner != null) { toast('现在不是你的回合', 'error'); return; }
    selectCard(index);
  }

  function onUnitClick(side, uid) {
    if (!ui.game || ui.busy) return;
    const sel = ui.selection;
    if (sel) {
      if (sel.type === 'play') {
        if (sel.needsTarget && sel.targets.some(t => t.kind === 'unit' && t.uid === uid && t.side === side)) {
          playSelected({ kind: 'unit', side, uid });
        } else if (!sel.needsTarget) {
          toast(sel.card.type === 'unit' ? '请点击你的支援阵线部署' : '请再次点击手牌打出', 'info');
        } else {
          sfx('error');
          toast(sel.card.target && sel.card.target.prompt ? sel.card.target.prompt : '目标不合法', 'error');
        }
        return;
      }
      if (sel.type === 'attack') {
        const t = sel.targets.find(x => x.kind === 'unit' && x.uid === uid && x.side === side);
        if (t) { executeAttack(sel.uid, { kind: 'unit', side, uid }); }
        else { sfx('error'); toast('无法攻击该目标', 'error'); }
        return;
      }
      if (sel.type === 'heal') {
        if (side === 0 && sel.targets.some(x => x.uid === uid)) {
          healSelected({ kind: 'unit', side: 0, uid });
        } else { sfx('error'); toast('请选择友方单位', 'error'); }
        return;
      }
    }
    if (side === 0) {
      if (ui.game.active !== 0 || ui.game.winner != null) { openUnitMenu(uid, side); return; }
      openUnitMenu(uid, side);
    } else {
      openUnitMenu(uid, side);
    }
  }

  function onEnemyHqClick(e) {
    if (e && e.target.closest('button')) return;
    if (!ui.game || ui.busy) return;
    const sel = ui.selection;
    if (!sel) { toast('先点击己方单位，选择「攻击」', 'info'); return; }
    if (sel.type !== 'attack') { toast('当前选择无法攻击总部', 'info'); return; }
    const t = sel.targets.find(x => x.kind === 'hq');
    if (!t) {
      sfx('error');
      const unit = Engine.findUnit(ui.game, 0, sel.uid);
      if (unit && unit.cardId === 'nordic_white_dragon') toast('北欧白龙无法攻击总部', 'error');
      else if (ui.game.players[1].front.length > 0) toast('敌方前线有单位，清空后才能攻击总部', 'error');
      else toast('该单位无法攻击总部（只有前线单位可以）', 'error');
      return;
    }
    executeAttack(sel.uid, { kind: 'hq', side: 1 });
  }

  function onBoardClick(e) {
    if (!ui.game || ui.busy) return;
    const unitEl = e.target.closest('.unit');
    if (unitEl) {
      e.stopPropagation();
      onUnitClick(Number(unitEl.dataset.side), unitEl.dataset.uid);
      return;
    }
    const line = e.target.closest('.board-line');
    if (line) {
      const side = Number(line.dataset.side);
      const lineName = line.dataset.line;
      if (ui.selection && ui.selection.type === 'play' && !ui.selection.needsTarget) {
        if (side === 0 && lineName === 'support') { deploySelected(); return; }
        if (ui.selection.card.type === 'unit') { toast('单位只能部署到支援阵线', 'info'); return; }
      }
      if (!ui.selection && side === 0 && lineName === 'support') {
        // 空点不响应
      }
    }
  }

  function onDocumentClick(e) {
    const menu = $('#unit-menu');
    if (menu && menu.classList.contains('open') && !e.target.closest('#unit-menu')) {
      hideUnitMenu();
    }
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    if ($('#unit-menu') && $('#unit-menu').classList.contains('open')) { hideUnitMenu(); return; }
    if ($('#modal-root') && $('#modal-root').classList.contains('open')) {
      if (!ui.modalLocked) closeModal();
      return;
    }
    if (ui.selection) { clearSelection(); }
  }

  /* ============================ 战场特效 ============================ */

  function currentUnitRect(uid) {
    const el = document.querySelector('.unit[data-uid="' + uid + '"]');
    return el ? el.getBoundingClientRect() : null;
  }

  function floatTextAt(rect, text, cls) {
    if (!rect) return;
    const layer = $('#fx-layer');
    const d = document.createElement('div');
    d.className = 'float-text ' + (cls || '');
    d.textContent = text;
    d.style.left = (rect.left + rect.width / 2) + 'px';
    d.style.top = (rect.top + rect.height / 3) + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  function floatAt(uid, text, cls, snap) {
    const rect = (snap && snap.rects && snap.rects[uid]) || currentUnitRect(uid);
    if (rect) floatTextAt(rect, text, cls);
  }

  function spawnGhost(rect, char) {
    if (!rect) return;
    const layer = $('#fx-layer');
    const d = document.createElement('div');
    d.className = 'death-ghost';
    d.textContent = char || '☠';
    d.style.left = (rect.left + rect.width / 2) + 'px';
    d.style.top = (rect.top + rect.height / 2) + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  function spawnImpact(rect) {
    if (!rect) return;
    const layer = $('#fx-layer');
    const d = document.createElement('div');
    d.className = 'impact';
    d.style.left = (rect.left + rect.width / 2) + 'px';
    d.style.top = (rect.top + rect.height / 2) + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 500);
  }

  function shakeEl(el) {
    if (!el || !el.animate) return;
    el.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' }
    ], { duration: 260, easing: 'ease-out' });
  }

  function lunge(uid, targetRect, snap) {
    const el = document.querySelector('.unit[data-uid="' + uid + '"]');
    const from = (snap && snap.rects && snap.rects[uid]) || (el && el.getBoundingClientRect());
    if (!el || !from || !targetRect || !el.animate) return;
    const dx = (targetRect.left + targetRect.width / 2) - (from.left + from.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (from.top + from.height / 2);
    el.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: 'translate(' + (dx * 0.42) + 'px,' + (dy * 0.42) + 'px) scale(1.06)', offset: 0.45 },
      { transform: 'translate(0,0) scale(1)' }
    ], { duration: 340, easing: 'ease-in-out' });
  }

  /** 尘土/风沙粒子 */
  function spawnDust(rect, color, count) {
    if (!rect) return;
    const layer = $('#fx-layer');
    if (!layer) return;
    const n = count || 10;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      d.className = 'fx-dust';
      const size = 3 + Math.random() * 8;
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.left = (rect.left + rect.width * (0.25 + Math.random() * 0.5)) + 'px';
      d.style.top = (rect.top + rect.height * (0.55 + Math.random() * 0.35)) + 'px';
      d.style.background = color || 'rgba(205, 178, 128, .55)';
      layer.appendChild(d);
      const dx = (Math.random() - 0.5) * 76;
      const dy = -12 - Math.random() * 42;
      const anim = d.animate([
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0.85 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(1.6)', opacity: 0 }
      ], { duration: 480 + Math.random() * 420, easing: 'cubic-bezier(.2,.7,.4,1)' });
      anim.onfinish = () => d.remove();
    }
  }

  function spawnWindRing(rect, color) {
    if (!rect || !$('#fx-layer')) return;
    const layer = $('#fx-layer');
    const d = document.createElement('i');
    d.className = 'fx-ring';
    d.style.left = (rect.left + rect.width / 2) + 'px';
    d.style.top = (rect.top + rect.height * 0.72) + 'px';
    d.style.borderColor = color || 'rgba(255, 210, 140, .65)';
    layer.appendChild(d);
    const anim = d.animate([
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0.9 },
      { transform: 'translate(-50%, -50%) scale(2.2)', opacity: 0 }
    ], { duration: 620, easing: 'ease-out' });
    anim.onfinish = () => d.remove();
  }

  function spawnSlash(rect) {
    if (!rect || !$('#fx-layer')) return;
    const layer = $('#fx-layer');
    for (let i = 0; i < 2; i++) {
      const d = document.createElement('i');
      d.className = 'fx-slash';
      d.style.left = (rect.left + rect.width / 2) + 'px';
      d.style.top = (rect.top + rect.height / 2) + 'px';
      d.style.transform = 'translate(-50%, -50%) rotate(' + (i ? -50 : 35) + 'deg)';
      layer.appendChild(d);
      const anim = d.animate([
        { transform: d.style.transform + ' scale(.5)', opacity: 0.95 },
        { transform: d.style.transform + ' scale(1.35)', opacity: 0 }
      ], { duration: 380 + i * 90, easing: 'cubic-bezier(.2,.8,.3,1)' });
      anim.onfinish = () => d.remove();
    }
  }

  /** 攻击/移动前的约 1 秒前摇（约 520–640ms，随后接命中/位移动画） */
  function windup(uid, kind, done) {
    const el = document.querySelector('.unit[data-uid="' + uid + '"]');
    const finish = () => { try { done(); } catch (err) { console.warn(err); } };
    if (!el || !el.animate) { finish(); return; }
    const duration = FAST ? 20 : (kind === 'move' ? 520 : 640);
    const rect = el.getBoundingClientRect();
    el.classList.add('windup');
    sfx('windup');
    spawnWindRing(rect, kind === 'attack' ? 'rgba(255, 190, 110, .7)' : 'rgba(155, 220, 255, .6)');
    spawnDust(rect, kind === 'attack' ? 'rgba(255, 185, 120, .5)' : 'rgba(180, 205, 210, .45)', 6);
    el.animate([
      { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
      { transform: 'translateY(2px) scale(.96)', filter: 'brightness(1.45)', offset: 0.55 },
      { transform: 'translateY(-2px) scale(1.07)', filter: 'brightness(1.18)' }
    ], { duration, easing: 'ease-in-out' });
    setTimeout(() => {
      el.classList.remove('windup');
      finish();
    }, duration);
  }

  const ANIM_EVENTS = {
    attack: 1, damage: 1, hqDamage: 1, hqHeal: 1, hqSet: 1, death: 1, deploy: 1, move: 1, freeze: 1, heal: 1,
    buff: 1, equip: 1, exile: 1, burnApplied: 1, fatigue: 1, tactic: 1, turn: 1, cover: 1,
    gameover: 1, draw: 1, overdraw: 1, thaw: 1, activate: 1
  };

  function playEvents(events, snap, done) {
    const list = (events || []).filter(e => ANIM_EVENTS[e.t]);
    let i = 0;
    function next() {
      if (i >= list.length) { if (done) done(); return; }
      const ev = list[i++];
      let delay = 150;
      try { delay = animateEvent(ev, snap) || delay; } catch (err) { /* 动画失败不阻断游戏 */ }
      setTimeout(next, FAST ? 10 : delay);
    }
    next();
  }

  function animateEvent(ev, snap) {
    switch (ev.t) {
      case 'attack': {
        sfx('attack');
        const targetRect = ev.targetKind === 'hq'
          ? (snap.hqRects[ev.targetSide] || ui.hqRects[ev.targetSide])
          : (snap.rects[ev.targetUid] || currentUnitRect(ev.targetUid));
        lunge(ev.uid, targetRect, snap);
        if (targetRect) {
          spawnImpact(targetRect);
          spawnSlash(targetRect);
          spawnDust(targetRect, 'rgba(255, 190, 130, .55)', 7);
        }
        const shell = document.querySelector('.battle-shell');
        if (shell && shell.animate) {
          shell.animate([
            { transform: 'translate(0,0)' },
            { transform: 'translate(2px,-1px)' },
            { transform: 'translate(-2px,1px)' },
            { transform: 'translate(0,0)' }
          ], { duration: 190, easing: 'ease-out' });
        }
        return 340;
      }
      case 'damage': {
        sfx('damage');
        const r = snap.rects[ev.uid] || currentUnitRect(ev.uid);
        floatTextAt(r, '-' + ev.amount, '');
        const el = document.querySelector('.unit[data-uid="' + ev.uid + '"]');
        shakeEl(el);
        return 180;
      }
      case 'cover': {
        sfx('buff');
        floatAt(ev.uid, '前线掩护', 'buff', snap);
        return 220;
      }
      case 'hqDamage': {
        sfx('damage');
        const r = snap.hqRects[ev.side] || ui.hqRects[ev.side];
        floatTextAt(r, '-' + ev.amount, '');
        shakeEl($(ev.side === 0 ? '#player-hq-wrap' : '#enemy-hq-wrap'));
        return 220;
      }
      case 'hqHeal': {
        sfx('heal');
        const r = snap.hqRects[ev.side] || ui.hqRects[ev.side];
        floatTextAt(r, '+' + ev.amount, 'heal');
        return 220;
      }
      case 'hqSet': {
        sfx('freeze');
        const r = snap.hqRects[ev.side] || ui.hqRects[ev.side];
        floatTextAt(r, String(ev.hp), 'debuff');
        return 200;
      }
      case 'death': {
        sfx('death');
        spawnGhost(snap.rects[ev.uid], '☠');
        spawnDust(snap.rects[ev.uid], 'rgba(160, 120, 100, .4)', 8);
        return 260;
      }
      case 'deploy': {
        sfx('deploy');
        const el = document.querySelector('.unit[data-uid="' + ev.uid + '"]');
        if (el && el.animate) {
          el.animate([
            { transform: 'scale(.55) translateY(14px)', opacity: 0.2, filter: 'brightness(2)' },
            { transform: 'scale(1.04) translateY(0)', opacity: 1, filter: 'brightness(1.2)', offset: 0.7 },
            { transform: 'scale(1) translateY(0)', opacity: 1, filter: 'brightness(1)' }
          ], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
        }
        const rect = currentUnitRect(ev.uid);
        const card = ev.cardId ? Cards.get(ev.cardId) : null;
        const color = (card && card.accent) || 'rgba(205,178,128,.5)';
        if (rect) {
          spawnDust(rect, color, 14);
          spawnWindRing(rect, color);
        }
        return 320;
      }
      case 'move': {
        sfx('windup');
        const el = document.querySelector('.unit[data-uid="' + ev.uid + '"]');
        const oldRect = snap.rects[ev.uid];
        const curRect = currentUnitRect(ev.uid);
        if (el && oldRect && curRect && el.animate) {
          const dx = oldRect.left - curRect.left;
          const dy = oldRect.top - curRect.top;
          el.animate([
            { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 0.55 },
            { transform: 'translate(0,0)', opacity: 1 }
          ], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });
        }
        if (curRect) {
          spawnDust(curRect, 'rgba(190, 195, 175, .5)', 12);
          spawnWindRing(curRect, 'rgba(150, 215, 255, .5)');
        }
        if (oldRect) spawnDust(oldRect, 'rgba(180, 170, 150, .4)', 6);
        return 400;
      }
      case 'freeze':
        sfx('freeze');
        floatAt(ev.uid, '冻结', 'debuff', snap);
        return 190;
      case 'heal':
        sfx('heal');
        floatAt(ev.uid, '+' + ev.amount, 'heal', snap);
        return 180;
      case 'activate':
        sfx('heal');
        return 160;
      case 'buff':
        sfx('buff');
        floatAt(ev.uid, '+' + (ev.atk || 0) + '/+' + (ev.def || 0), 'buff', snap);
        return 180;
      case 'equip':
        sfx('equip');
        floatAt(ev.uid, '装备', 'buff', snap);
        return 170;
      case 'exile':
        sfx('freeze');
        floatAt(ev.uid, '移除', 'debuff', snap);
        return 230;
      case 'burnApplied':
        sfx('burn');
        floatAt(ev.uid, '灼烧', 'debuff', snap);
        return 170;
      case 'fatigue':
        sfx('damage');
        return 180;
      case 'tactic':
        sfx('select');
        return 100;
      case 'turn':
        sfx('turn');
        if (ev.side === 0) showTurnFlash('你的回合', false);
        else showTurnFlash('对手回合', true);
        return 180;
      case 'gameover':
        sfx(ev.winner === 0 ? 'win' : 'lose');
        return 260;
      case 'draw':
        sfx('draw');
        return 60;
      case 'overdraw':
        sfx('error');
        return 100;
      case 'thaw':
        return 50;
      default:
        return 120;
    }
  }

  /* ============================ 电脑回合 ============================ */

  function clearAIWatchdog() {
    if (ui.aiWatchdog) { clearTimeout(ui.aiWatchdog); ui.aiWatchdog = null; }
  }

  function armAIWatchdog() {
    clearAIWatchdog();
    ui.aiWatchdog = setTimeout(() => {
      if (ui.aiRunning && ui.game && ui.game.active === 1 && ui.game.winner == null) {
        aiFailSafe(new Error('AI 回合超时'));
      }
    }, 25000);
  }

  function aiFailSafe(err) {
    if (err) console.warn('AI 回合异常，已安全结束回合', err);
    clearAIWatchdog();
    const g = ui.game;
    ui.aiRunning = false;
    ui.busy = false;
    ui.selection = null;
    hideHint();
    hideUnitMenu();
    if (g && g.winner == null && g.active === 1) {
      try { Engine.endTurn(g); } catch (e) { console.warn(e); }
    }
    renderAll();
    checkGameOver();
  }

  function runAI() {
    if (!ui.game || ui.game.winner != null || ui.game.active !== 1 || ui.aiRunning) return;
    ui.busy = true;
    ui.aiRunning = true;
    ui.selection = null;
    hideHint();
    hideUnitMenu();
    renderAll();
    armAIWatchdog();
    setTimeout(() => {
      try { aiStep(); } catch (err) { aiFailSafe(err); }
    }, FAST ? 20 : 620);
  }

  function aiStep() {
    try { aiStepInner(); } catch (err) { aiFailSafe(err); }
  }

  function aiStepInner() {
    armAIWatchdog();
    const g = ui.game;
    if (!g || g.winner != null) { finishAI(); return; }
    if (g.active !== 1) { finishAI(); return; }

    let action = null;
    try { action = AI.nextAction(g); } catch (err) { console.warn('AI 决策异常', err); }

    if (!action || action.type === 'end') {
      const snap = snapshotRects();
      let res = null;
      let endError = null;
      try { res = Engine.endTurn(g); } catch (err) { endError = err; console.warn(err); }
      renderAll();
      if (endError) { aiFailSafe(endError); return; }
      playEvents(res ? res.events : [], snap, () => {
        try { finishAI(); } catch (err) { aiFailSafe(err); }
      });
      return;
    }

    const perform = () => {
      if (!ui.game || ui.game !== g || g.winner != null) { finishAI(); return; }
      const snap = snapshotRects();
      let res = null;
      try { res = AI.applyAction(g, action); } catch (err) { console.warn('AI 执行异常', err); }
      if (!res || !res.ok) {
        console.warn('AI 动作失败', action, res && res.error);
        finishAI(true);
        return;
      }
      renderAll();
      playEvents(res.events, snap, () => {
        try {
          if (ui.game && ui.game.winner == null) setTimeout(aiStep, FAST ? 10 : 300);
          else finishAI();
        } catch (err) { aiFailSafe(err); }
      });
    };
    if (action.type === 'attack' || action.type === 'move') {
      windup(action.uid, action.type === 'move' ? 'move' : 'attack', perform);
      return;
    }
    perform();
  }

  function finishAI(forceEnd) {
    clearAIWatchdog();
    const g = ui.game;
    ui.aiRunning = false;
    // 兜底：无论从哪条路径进入，只要仍停在 AI 回合且未分胜负，就强制交还玩家
    if (g && g.winner == null && g.active === 1) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { Engine.endTurn(g); } catch (err) { console.warn(err); }
        if (g.active !== 1 || g.winner != null) break;
      }
    }
    ui.busy = false;
    renderAll();
    checkGameOver();
  }

  function endPlayerTurn() {
    if (!ui.game || ui.busy || ui.game.active !== 0 || ui.game.winner != null) return;
    runAction(() => Engine.endTurn(ui.game), () => {
      if (ui.game && ui.game.active === 1 && ui.game.winner == null) runAI();
    });
  }

  /* ============================ 胜负结算 ============================ */

  function checkGameOver() {
    const g = ui.game;
    if (!g || g.winner == null || ui.resultShown) return;
    ui.resultShown = true;
    ui.busy = false;
    ui.aiRunning = false;
    hideHint();
    hideUnitMenu();
    hideCardPreview();
    setTimeout(() => {
      if (ui.game !== g) return;
      showResult(g);
    }, FAST ? 40 : 700);
  }

  function showResult(g) {
    const win = g.winner === 0;
    if (win) ui.record.wins += 1; else ui.record.losses += 1;
    saveJSON(STORAGE.record, ui.record);
    renderRecord();
    sfx(win ? 'win' : 'lose');
    const p = g.players[0], e = g.players[1];
    const dmg = Math.max(0, 20 - e.hp);
    const alive = Engine.allUnits(g, 0).length;
    const turns = Math.ceil(g.turn / 2);
    const panel = openModal(
      '<p class="result-kicker">' + (win ? 'VICTORY' : 'DEFEAT') + '</p>' +
      '<h2 class="result-title ' + (win ? 'win' : 'lose') + '">' + (win ? '胜 利' : '败 北') + '</h2>' +
      '<p class="result-reason">' + esc(g.winReason || (win ? '敌方总部已被摧毁' : '你的总部已被摧毁')) + '</p>' +
      '<div class="result-stats">' +
        '<div class="rs-item"><b>' + turns + '</b><span>回合数</span></div>' +
        '<div class="rs-item"><b>' + dmg + '</b><span>对总部伤害</span></div>' +
        '<div class="rs-item"><b>' + alive + '</b><span>存活单位</span></div>' +
      '</div>' +
      '<div class="result-actions">' +
        '<button class="small-btn primary" data-result="rematch">再战一局</button>' +
        '<button class="small-btn" data-result="title">返回主菜单</button>' +
      '</div>' +
      '<p class="result-record">当前战绩：' + esc(String(ui.record.wins)) + ' 胜 · ' + esc(String(ui.record.losses)) + ' 负</p>',
      { panelClass: 'result-panel', locked: true, noClose: true }
    );
    const rematchBtn = $('[data-result="rematch"]', panel);
    if (rematchBtn) rematchBtn.addEventListener('click', () => { sfx('click'); rematch(); });
    const titleBtn = $('[data-result="title"]', panel);
    if (titleBtn) titleBtn.addEventListener('click', () => { sfx('click'); returnToTitle(); });
  }

  function openConcedeConfirm() {
    if (!ui.game || ui.game.winner != null) return;
    const panel = openModal(
      '<h2 class="modal-title">投降</h2>' +
      '<p class="modal-sub">你确定要放弃这场战斗吗？本局将记为失败。</p>' +
      '<div class="modal-actions">' +
        '<button class="small-btn" data-close-modal>继续战斗</button>' +
        '<button class="small-btn primary" data-confirm-concede>确认投降</button>' +
      '</div>'
    );
    const btn = $('[data-confirm-concede]', panel);
    if (btn) btn.addEventListener('click', () => {
      closeModal();
      if (!ui.game || ui.game.winner != null) return;
      const snap = snapshotRects();
      const res = Engine.surrender(ui.game, 0);
      clearAIWatchdog();
      ui.busy = false;
      ui.aiRunning = false;
      ui.selection = null;
      hideHint();
      hideUnitMenu();
      hideCardPreview();
      renderAll();
      playEvents(res.events, snap, () => {
        ui.busy = false;
        renderAll();
        checkGameOver();
      });
    });
  }

  /* ============================ 图鉴 ============================ */

  function openCodex() {
    const panel = openModal(
      '<h2 class="modal-title">卡牌图鉴</h2>' +
      '<p class="modal-sub">全卡池 ' + Cards.CARDS.length + ' 张 · 点击上方筛选查看不同类别。单位卡可部署到支援阵线，混血种可以装备武器与防具。</p>' +
      '<div class="codex-filters" id="codex-filters"></div>' +
      '<div class="codex-grid" id="codex-grid"></div>',
      { panelClass: 'codex-panel' }
    );
    const filters = [
      { id: 'all', label: '全部 ' + Cards.CARDS.length },
      { id: 'unit', label: '单位' },
      { id: 'dragon', label: '龙族' },
      { id: 'hybrid', label: '混血种' },
      { id: 'equip', label: '装备' },
      { id: 'tactic', label: '战术' },
      { id: 'cost0', label: '0 费' },
      { id: 'cost1', label: '1 费' },
      { id: 'cost2', label: '2 费' },
      { id: 'cost3', label: '3 费' },
      { id: 'cost4', label: '4 费' }
    ];
    const filterHost = $('#codex-filters', panel);
    const grid = $('#codex-grid', panel);
    function render() {
      filterHost.innerHTML = filters.map(f =>
        '<button class="filter-btn ' + (ui.codexFilter === f.id ? 'active' : '') + '" data-codex-filter="' + f.id + '">' + f.label + '</button>'
      ).join('');
      const list = Cards.SORTED.filter(c => {
        const f = ui.codexFilter;
        if (f === 'all') return true;
        if (f === 'unit') return c.type === 'unit';
        if (f === 'dragon') return c.tribe === 'dragon';
        if (f === 'hybrid') return c.tribe === 'hybrid';
        if (f === 'equip') return c.type === 'equip';
        if (f === 'tactic') return c.type === 'tactic';
        if (f.indexOf('cost') === 0) return c.cost === Number(f.slice(4));
        return true;
      });
      grid.innerHTML = list.map(c => cardHtml(c)).join('');
    }
    render();
    filterHost.addEventListener('click', e => {
      const btn = e.target.closest('[data-codex-filter]');
      if (!btn) return;
      ui.codexFilter = btn.dataset.codexFilter;
      sfx('click');
      render();
    });
  }

  /* ============================ 规则 ============================ */

  function openRules() {
    const panel = openModal(
      '<h2 class="modal-title">规则说明</h2>' +
      '<p class="modal-sub">龙裔王座 · 中世纪龙族卡牌对战</p>' +
      '<div class="rules-content">' +
        '<h3>胜利条件</h3>' +
        '<p>双方总部各有 <b>20 点生命</b>。先将敌方总部生命降为 0 的一方获胜；牌库耗尽后每次抽牌会受到递增的疲劳伤害。</p>' +
        '<h3>回合与龙晶</h3>' +
        '<ul>' +
          '<li>双方轮流行动。你的第 1 回合拥有 1 颗龙晶，之后每回合上限 +1，最多 <b>10 颗</b>。</li>' +
          '<li>每回合开始时，龙晶补满，所有己方单位恢复行动，并抽 1 张牌（手牌上限 10）。</li>' +
          '<li>新部署的单位进入<b>支援阵线</b>，当回合处于疲惫状态，无法行动。</li>' +
        '</ul>' +
        '<h3>阵线与攻击</h3>' +
        '<ul>' +
          '<li><b>前线单位</b>可以攻击敌方前线单位；只有敌方前线没有单位时，才能攻击敌方总部与支援阵线。特殊技能/卡牌（如魔龙、快速取胜）可以直接对总部造成伤害，不受前线阻挡。</li>' +
          '<li><b>支援阵线</b>单位通常无法攻击，但装备「弓箭」后可以攻击敌方两线的单位（不能攻击总部）；若己方前线有单位，支援阵线的弓箭手攻击时不受反击。</li>' +
          '<li>只有位于<b>前线</b>的单位才能攻击总部；敌方前线存在单位时，普通攻击不能越过前线，也无法选中其支援阵线。特殊技能/卡牌可以直接伤害总部。</li>' +
          '<li>单位可以每回合从支援阵线移动到前线（移动不消耗攻击），之后仍可继续攻击；也可以点击提示条上的「不攻击」结束行动。攻击后单位进入疲惫；移动本身不会使单位疲惫。</li>' +
          '<li>战斗伤害同时结算：攻击者对目标造成攻击力伤害，目标也会对攻击者造成其攻击力的反击伤害；装备弓箭的支援阵线单位在己方前线有单位时不受反击。</li>' +
        '</ul>' +
        '<h3>状态与关键词</h3>' +
        '<div class="rules-grid">' +
          '<p><b>灼烧</b>：其控制者回合开始时受到 1 点伤害；持续到单位被摧毁，重复施加不叠加，只作用于单位。</p>' +
          '<p><b>冻结</b>：无法移动或攻击，直到其控制者的回合结束；被冻结单位仍可反击，青龙的免费疗愈不受影响。</p>' +
          '<p><b>烟幕</b>：未移动或攻击时无法被选中。</p>' +
          '<p><b>庇护</b>：相邻的洞穴龙使该单位无法被攻击。</p>' +
          '<p><b>装备槽</b>：每个人龙混血种拥有 3 个装备槽，可装备最多三件装备；0 费木剑/皮甲会在你的下个回合开始时生效。</p>' +
          '<p><b>疲劳</b>：牌库为空时抽牌，总部受到递增伤害。</p>' +
        '</div>' +
        '<h3>卡牌类型</h3>' +
        '<ul>' +
          '<li><b>单位</b>：部署后占据支援阵线，可移动与攻击。许多单位拥有部署、亡语或光环能力。</li>' +
          '<li><b>装备</b>：只能装备给拥有装备槽的混血种。装备会随单位一起被摧毁。</li>' +
          '<li><b>战术</b>：立即生效的一次性卡牌；条件战术在条件未满足时不能打出。</li>' +
        '</ul>' +
        '<h3>界面操作</h3>' +
        '<ul>' +
          '<li>点击手牌 → 点击高亮目标 / 你的支援阵线，即可打出。</li>' +
          '<li>冰原龙 / 仙灵龙的部署目标可以跳过：选择目标时点击提示条上的「跳过目标」。</li>' +
          '<li>点击己方单位 → 在弹出菜单中选择「攻击 / 移动到前线 / 疗愈」。</li>' +
          '<li>点击敌方单位可查看其详细能力；点击「结束回合」交给对手。</li>' +
          '<li>按 <b>Esc</b> 取消当前选择或关闭弹窗。</li>' +
        '</ul>' +
      '</div>',
      { panelClass: 'rules-panel' }
    );
    return panel;
  }

  /* ============================ 卡组构筑 ============================ */

  function openDeckBuilder() {
    if (ui.customDeck && Cards.validateDeck(ui.customDeck).ok) {
      ui.deckEditing = ui.customDeck.slice();
    } else {
      ui.deckEditing = Cards.PRESETS.hybrid.cards.slice();
    }
    ui.poolFilter = 'all';
    showScreen('deckbuild');
    renderDeckBuilder();
  }

  function deckCounts() {
    return Cards.countCopies(ui.deckEditing);
  }

  function renderDeckBuilder() {
    const counts = deckCounts();
    const poolFilters = [
      { id: 'all', label: '全部' },
      { id: 'dragon', label: '龙族' },
      { id: 'hybrid', label: '混血种' },
      { id: 'equip', label: '装备' },
      { id: 'tactic', label: '战术' }
    ];
    $('#deck-filters').innerHTML = poolFilters.map(f =>
      '<button class="filter-btn ' + (ui.poolFilter === f.id ? 'active' : '') + '" data-pool-filter="' + f.id + '">' + f.label + '</button>'
    ).join('') +
      '<span style="margin-left:auto;font-size:10px;color:#756c5c">点击添加 · 右键移除</span>';

    const list = Cards.SORTED.filter(c => {
      if (ui.poolFilter === 'all') return true;
      if (ui.poolFilter === 'dragon') return c.tribe === 'dragon';
      if (ui.poolFilter === 'hybrid') return c.tribe === 'hybrid';
      if (ui.poolFilter === 'equip') return c.type === 'equip';
      if (ui.poolFilter === 'tactic') return c.type === 'tactic';
      return true;
    });
    $('#deck-pool').innerHTML = list.map(c => {
      const n = counts[c.id] || 0;
      const badge = n ? '<span class="pool-count ' + (n >= Cards.MAX_COPIES ? 'full' : '') + '">×' + n + '</span>' : '';
      return cardHtml(c, { attrs: 'data-pool-card="' + c.id + '"', badge });
    }).join('');

    const total = ui.deckEditing.length;
    $('#deck-count').textContent = total;
    const countsByTribe = Cards.deckTribeCounts(ui.deckEditing);
    $('#deck-side-info').innerHTML =
      '龙族 ' + countsByTribe.dragon + ' · 混血 ' + countsByTribe.hybrid + '<br>' +
      '装备 ' + countsByTribe.equip + ' · 战术 ' + countsByTribe.tactic;

    const curve = Cards.deckCostCurve(ui.deckEditing);
    const maxCurve = Math.max(1, ...curve);
    $('#deck-curve').innerHTML = curve.map((n, i) =>
      '<div class="curve-col"><div class="curve-bar" style="height:' + Math.round((n / maxCurve) * 42 + (n ? 3 : 0)) + 'px"></div><span class="curve-label">' + i + '费</span></div>'
    ).join('') + '<div class="curve-col" style="flex:1.4"><span class="curve-label" style="font-size:10px">费用曲线</span></div>';

    const byCost = {};
    Object.keys(counts).forEach(id => {
      const c = Cards.get(id);
      if (!c) return;
      (byCost[c.cost] = byCost[c.cost] || []).push({ card: c, n: counts[id] });
    });
    let deckHtml = '';
    Object.keys(byCost).sort((a, b) => Number(a) - Number(b)).forEach(cost => {
      deckHtml += '<div class="deck-group-title">' + cost + ' 费</div>';
      byCost[cost].sort((a, b) => Cards.cmpCard(a.card, b.card)).forEach(row => {
        deckHtml += `<div class="deck-row">
          <span class="dr-cost">${row.card.cost}</span>
          <span class="dr-name">${esc(row.card.name)}</span>
          <span class="dr-count">×${row.n}</span>
          <button class="dr-btn" data-remove-card="${row.card.id}" title="移除一张">−</button>
          <button class="dr-btn" data-add-card="${row.card.id}" title="添加一张">+</button>
        </div>`;
      });
    });
    if (!deckHtml) deckHtml = '<div style="color:#7b7262;font-size:11px;padding:12px 4px;text-align:center">卡组还是空的。<br>从左侧选择卡牌加入吧。</div>';
    $('#deck-list').innerHTML = deckHtml;

    const v = Cards.validateDeck(ui.deckEditing);
    const msg = $('#deck-msg');
    if (total === Cards.DECK_SIZE && v.ok) {
      msg.textContent = '卡组已就绪，可以开始对战。';
      msg.className = 'deck-msg';
    } else if (total > Cards.DECK_SIZE) {
      msg.textContent = '卡组已超出 30 张，请移除多余的卡牌。';
      msg.className = 'deck-msg error';
    } else if (!v.ok && total === Cards.DECK_SIZE) {
      msg.textContent = v.errors[0] || '';
      msg.className = 'deck-msg error';
    } else {
      msg.textContent = '还需要 ' + (Cards.DECK_SIZE - total) + ' 张卡牌。';
      msg.className = 'deck-msg';
    }
  }

  function addDeckCard(id) {
    const n = ui.deckEditing.filter(x => x === id).length;
    if (n >= Cards.MAX_COPIES) { toast('「' + Cards.get(id).name + '」最多放入 3 张', 'error'); return; }
    if (ui.deckEditing.length >= Cards.DECK_SIZE) { toast('卡组已满 30 张，请先移除一张', 'error'); return; }
    ui.deckEditing.push(id);
    sfx('click');
    renderDeckBuilder();
  }

  function removeDeckCard(id) {
    const idx = ui.deckEditing.lastIndexOf(id);
    if (idx < 0) return;
    ui.deckEditing.splice(idx, 1);
    sfx('click');
    renderDeckBuilder();
  }

  function saveCustomDeck(showToast) {
    const v = Cards.validateDeck(ui.deckEditing);
    if (!v.ok) {
      const msg = $('#deck-msg');
      if (msg) { msg.textContent = v.errors[0] || '卡组不合法'; msg.className = 'deck-msg error'; }
      toast(v.errors[0] || '卡组不合法', 'error');
      return false;
    }
    ui.customDeck = ui.deckEditing.slice();
    saveJSON(STORAGE.deck, ui.customDeck);
    if (showToast) toast('卡组已保存', 'good');
    sfx('click');
    return true;
  }

  function openPresetPicker() {
    const panel = openModal(
      '<h2 class="modal-title">载入预设卡组</h2>' +
      '<p class="modal-sub">载入后仍可自由修改；当前卡组会被替换。</p>' +
      '<div class="deck-choice-list">' +
        Cards.PRESET_LIST.map(p => `
          <button class="deck-choice" data-load-preset="${p.id}" style="--dc-accent:${p.accent}">
            <div class="dc-emblem">${p.name[0]}</div>
            <div class="dc-main">
              <div class="dc-name">${esc(p.name)}<em>${esc(p.en)}</em></div>
              <div class="dc-desc">${esc(p.desc)}</div>
            </div>
            <div class="dc-go">载入 →</div>
          </button>`).join('') +
      '</div>'
    );
    $$('[data-load-preset]', panel).forEach(btn => btn.addEventListener('click', () => {
      const p = Cards.PRESETS[btn.dataset.loadPreset];
      if (!p) return;
      ui.deckEditing = p.cards.slice();
      closeModal();
      renderDeckBuilder();
      toast('已载入「' + p.name + '」', 'good');
    }));
  }

  function startWithCustomDeck() {
    if (!saveCustomDeck(true)) return;
    const enemy = defaultEnemyPreset('自定义卡组');
    startBattle({
      playerDeck: ui.customDeck.slice(),
      playerDeckName: '自定义卡组',
      enemyDeck: enemy.cards.slice(),
      enemyDeckName: enemy.name
    });
  }

  /* ============================ 事件绑定 ============================ */

  function bindEvents() {
    $('#btn-play').addEventListener('click', () => { sfx('click'); openDeckSelect(); });
    $('#btn-deckbuild').addEventListener('click', () => { sfx('click'); openDeckBuilder(); });
    $('#btn-codex').addEventListener('click', () => { sfx('click'); openCodex(); });
    $('#btn-rules').addEventListener('click', () => { sfx('click'); openRules(); });
    $('#btn-sound').addEventListener('click', () => {
      ui.settings.sfx = !ui.settings.sfx;
      Audio.setEnabled(ui.settings.sfx);
      saveJSON(STORAGE.settings, ui.settings);
      updateSoundButton();
      if (ui.settings.sfx) sfx('select');
    });

    $('#btn-battle-rules').addEventListener('click', () => { sfx('click'); openRules(); });
    $('#btn-concede').addEventListener('click', () => { sfx('click'); openConcedeConfirm(); });
    $('#btn-concede-bottom').addEventListener('click', () => { sfx('click'); openConcedeConfirm(); });
    $('#btn-log-toggle').addEventListener('click', () => { sfx('click'); $('#log-panel').classList.toggle('open'); });
    $('#btn-log-close').addEventListener('click', () => { sfx('click'); $('#log-panel').classList.remove('open'); });
    $('#btn-end-turn').addEventListener('click', () => { sfx('click'); endPlayerTurn(); });

    $('#hand').addEventListener('click', e => {
      const card = e.target.closest('[data-hand-index]');
      if (card) onHandClick(Number(card.dataset.handIndex));
    });
    $('#hand').addEventListener('mouseover', e => {
      const card = e.target.closest('[data-hand-index]');
      if (card) showCardPreview(Number(card.dataset.handIndex), card);
    });
    $('#hand').addEventListener('mouseout', e => {
      const card = e.target.closest('[data-hand-index]');
      if (!card) return;
      const to = e.relatedTarget;
      if (to && to.closest && (to.closest('#card-preview') || to.closest('[data-hand-index]') === card)) return;
      hideCardPreview();
    });

    $('#board').addEventListener('click', onBoardClick);
    $('#enemy-hq-wrap').addEventListener('click', onEnemyHqClick);
    $('#unit-menu').addEventListener('click', onUnitMenuClick);
    $('#hint-bar').addEventListener('click', e => {
      if (e.target.closest('[data-hint-skip-attack]')) {
        if (ui.selection && ui.selection.type === 'attack') {
          clearSelection();
          toast('已跳过攻击，单位留在前线；再次点击单位仍可攻击', 'info');
        }
        return;
      }
      if (!e.target.closest('[data-hint-skip]')) return;
      if (ui.selection && ui.selection.type === 'play' && ui.selection.card.target && ui.selection.card.target.required === false) {
        playSelected(null);
      }
    });

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);

    $('#modal-root').addEventListener('click', e => {
      if (e.target.closest('[data-close-modal]')) closeModal();
    });

    $('#btn-deck-back').addEventListener('click', () => { sfx('click'); showScreen('title'); renderRecord(); });
    $('#btn-deck-clear').addEventListener('click', () => {
      if (!ui.deckEditing.length) return;
      ui.deckEditing = [];
      sfx('click');
      renderDeckBuilder();
    });
    $('#btn-deck-presets').addEventListener('click', () => { sfx('click'); openPresetPicker(); });
    $('#btn-deck-save').addEventListener('click', () => saveCustomDeck(true));
    $('#btn-deck-fight').addEventListener('click', () => { sfx('click'); startWithCustomDeck(); });

    $('#deck-filters').addEventListener('click', e => {
      const btn = e.target.closest('[data-pool-filter]');
      if (!btn) return;
      ui.poolFilter = btn.dataset.poolFilter;
      sfx('click');
      renderDeckBuilder();
    });
    $('#deck-pool').addEventListener('click', e => {
      const card = e.target.closest('[data-pool-card]');
      if (card) addDeckCard(card.dataset.poolCard);
    });
    $('#deck-pool').addEventListener('contextmenu', e => {
      const card = e.target.closest('[data-pool-card]');
      if (!card) return;
      e.preventDefault();
      removeDeckCard(card.dataset.poolCard);
    });
    $('#deck-list').addEventListener('click', e => {
      const add = e.target.closest('[data-add-card]');
      const remove = e.target.closest('[data-remove-card]');
      if (add) addDeckCard(add.dataset.addCard);
      else if (remove) removeDeckCard(remove.dataset.removeCard);
    });

    window.addEventListener('resize', () => {
      hideUnitMenu();
      if (ui.game) layoutHand();
      if (ui.screen === 'battle') captureRects();
    });
  }

  /* ============================ 初始化 ============================ */

  function init() {
    ui.settings = Object.assign({ sfx: true }, loadJSON(STORAGE.settings, {}));
    Audio.setEnabled(!!ui.settings.sfx);
    ui.record = (function (stored) {
      const w = Number(stored && stored.wins);
      const l = Number(stored && stored.losses);
      return {
        wins: Number.isFinite(w) ? Math.max(0, Math.floor(w)) : 0,
        losses: Number.isFinite(l) ? Math.max(0, Math.floor(l)) : 0
      };
    })(loadJSON(STORAGE.record, {}));
    const savedDeck = loadJSON(STORAGE.deck, null);
    if (Array.isArray(savedDeck) && Cards.validateDeck(savedDeck).ok) ui.customDeck = savedDeck.slice();
    buildTitle();
    updateSoundButton();
    bindEvents();
    showScreen('title');
    handleDemoParam();
  }

  /* 调试 / 截图入口：?demo=battle 可直接进入对战 */
  function handleDemoParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const demo = params.get('demo');
      if (!demo) return;
      if (demo === 'battle') {
        const p = Cards.PRESETS[params.get('player')] || Cards.PRESETS.ember;
        const e = Cards.PRESETS[params.get('enemy')] || Cards.PRESETS.frost;
        setTimeout(() => startBattle({
          playerDeck: p.cards.slice(),
          playerDeckName: p.name,
          enemyDeck: e.cards.slice(),
          enemyDeckName: e.name
        }), 100);
      } else if (demo === 'deckbuild') {
        setTimeout(openDeckBuilder, 100);
      } else if (demo === 'codex') {
        setTimeout(openCodex, 100);
      } else if (demo === 'hand10') {
        setTimeout(() => {
          startBattle({
            playerDeck: Cards.PRESETS.hybrid.cards.slice(),
            playerDeckName: '混血军团',
            enemyDeck: Cards.PRESETS.ember.cards.slice(),
            enemyDeckName: '烈焰突袭'
          });
          setTimeout(() => {
            if (!ui.game) return;
            const p = ui.game.players[0];
            p.hand = ['fire_wyvern', 'cave_dragon', 'shield', 'bow', 'royal_salute', 'iron_sword', 'for_breeding', 'ice_dragon', 'demon_dragon', 'welsh_red'];
            p.crystals = 10; p.maxCrystals = 10; ui.game.turn = 9;
            renderAll();
          }, 250);
        }, 100);
      }
    } catch (err) { console.warn(err); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  root.DBUI = {
    ui, startBattle, checkGameOver, renderAll, openCodex, openRules, openDeckBuilder,
    openDeckSelect, startWithCustomDeck, rematch, returnToTitle,
    Engine, Cards, AI, Art, toast
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
