/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * art.js — 纯 SVG 程序化美术：符文卡面、徽记、图标（无外部素材）
 * ========================================================================== */
(function (root) {
  'use strict';

  const GLYPHS = {
    wyvern: '翼',
    hybrid_spawn: '裔',
    fire_wyvern: '炎',
    great_dragon: '巨',
    red_dragon: '赤',
    green_dragon: '翠',
    blue_dragon: '苍',
    hybrid_mid: '契',
    two_legged_wyvern: '飞',
    cave_dragon: '岩',
    basilisk: '蛇',
    hybrid_high: '武',
    ice_dragon: '冰',
    fairy_dragon: '仙',
    demon_dragon: '魔',
    welsh_red: '威',
    azure_dragon: '青',
    hybrid_top: '尊',
    nordic_white_dragon: '白',
    elf_dragon: '灵',
    head_start: '捷',
    quick_victory: '胜',
    dragon_nest_repair: '巢',
    last_stand: '搏',
    wooden_sword: '木',
    leather_armor: '皮',
    shield: '盾',
    iron_sword: '剑',
    bow: '弓',
    robe: '袍',
    dragon_flute: '笛',
    dragon_decree: '令',
    for_breeding: '育',
    cold_wind: '风',
    aerial_strike: '袭',
    death_descends: '死',
    dragon_knight: '骑',
    royal_salute: '炮',
    blizzard: '雪'
  };

  const SIGIL_GLYPHS = {
    dragon: '龙', heart: '育', snow: '雪', wing: '袭',
    skull: '死', knight: '骑', cannon: '炮', blizzard: '雪'
  };

  let uidCounter = 0;
  function nextId(prefix) { return (prefix || 'x') + (++uidCounter); }

  function hexToRgb(hex) {
    let h = String(hex || '#c9a24a').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }
  function mix(hex, target, t) {
    const a = hexToRgb(hex), b = hexToRgb(target);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
  }

  function safeGlyph(card) {
    return (card && (card.glyph || GLYPHS[card.id] || (card.sigil && SIGIL_GLYPHS[card.sigil]))) || '龙';
  }

  function ticks(cx, cy, r1, r2, count, color, opacity) {
    let out = '';
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count - Math.PI / 2;
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy + Math.sin(a) * r1;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2;
      out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"/>`;
    }
    return out;
  }

  function wingMarkup(accent, opacity) {
    return `<g fill="${accent}" opacity="${opacity || 0.34}">
      <path d="M60 62 C46 49 34 34 24 16 C36 36 44 50 46 64 C36 57 25 55 14 60 C27 68 41 73 53 71 Z"/>
      <path d="M100 62 C114 49 126 34 136 16 C124 36 116 50 114 64 C124 57 135 55 146 60 C133 68 119 73 107 71 Z"/>
      <path d="M66 58 C58 44 52 30 50 14 C60 30 66 44 70 58 Z" opacity=".7"/>
      <path d="M94 58 C102 44 108 30 110 14 C100 30 94 44 90 58 Z" opacity=".7"/>
    </g>`;
  }

  function crossedBlades(accent, opacity) {
    return `<g stroke="${accent}" stroke-opacity="${opacity || 0.3}" stroke-width="3" stroke-linecap="round">
      <path d="M48 82 L112 18"/><path d="M112 82 L48 18"/>
      <path d="M44 72 L56 84" stroke-width="5"/><path d="M116 72 L104 84" stroke-width="5"/>
    </g>`;
  }

  function weaponMarkup(card, accent) {
    const type = card.id;
    const o = 0.3;
    switch (type) {
      case 'shield':
        return `<path d="M80 16 L116 26 L116 50 C116 70 100 82 80 90 C60 82 44 70 44 50 L44 26 Z" fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="3"/>`;
      case 'iron_sword':
        return `<g stroke="${accent}" stroke-opacity="0.32" stroke-width="3" stroke-linecap="round"><path d="M55 88 L105 20"/><path d="M62 70 L86 72"/><path d="M48 80 L58 91"/></g>`;
      case 'bow':
        return `<g fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="3"><path d="M52 18 C84 34 84 66 52 84"/><path d="M52 18 L52 84" stroke-opacity="0.18"/><path d="M76 38 L76 64" stroke-opacity="0.3"/></g>`;
      case 'robe':
        return `<path d="M80 16 C92 34 100 60 108 86 L52 86 C60 60 68 34 80 16 Z" fill="none" stroke="${accent}" stroke-opacity="0.3" stroke-width="3"/><path d="M80 22 L80 84" stroke="${accent}" stroke-opacity="0.15" stroke-width="2"/>`;
      case 'dragon_flute':
        return `<g stroke="${accent}" stroke-opacity="0.32" stroke-width="3" stroke-linecap="round"><path d="M44 70 L106 30"/><circle cx="118" cy="24" r="9" fill="none"/><circle cx="56" cy="64" r="4"/><circle cx="70" cy="56" r="4"/></g>`;
      default:
        return '';
    }
  }

  function spellMarkup(card, accent, ringId) {
    const kind = card.sigil || 'dragon';
    const o = 0.3;
    switch (kind) {
      case 'snow':
        return `<g stroke="${accent}" stroke-opacity="${o}" stroke-width="2.4" stroke-linecap="round">
          <path d="M80 22 L80 78"/><path d="M58 34 L102 66"/><path d="M102 34 L58 66"/>
          <path d="M80 22 l-7 8 M80 22 l7 8 M80 78 l-7 -8 M80 78 l7 -8"/>
        </g>`;
      case 'heart':
        return `<path d="M80 82 C44 58 48 30 66 30 C76 30 80 40 80 40 C80 40 84 30 94 30 C112 30 116 58 80 82 Z" fill="none" stroke="${accent}" stroke-opacity="${o}" stroke-width="3"/>`;
      case 'skull':
        return `<g fill="none" stroke="${accent}" stroke-opacity="${o}" stroke-width="3">
          <path d="M80 18 C62 18 50 32 50 48 C50 60 58 68 64 72 L64 84 L96 84 L96 72 C102 68 110 60 110 48 C110 32 98 18 80 18 Z"/>
          <circle cx="68" cy="48" r="5" fill="${accent}" fill-opacity="${o}"/><circle cx="92" cy="48" r="5" fill="${accent}" fill-opacity="${o}"/>
          <path d="M74 66 L74 76 M86 66 L86 76"/>
        </g>`;
      case 'knight':
        return `<g fill="none" stroke="${accent}" stroke-opacity="${o}" stroke-width="3">
          <path d="M80 16 L104 30 L104 60 C104 74 92 84 80 90 C68 84 56 74 56 60 L56 30 Z"/>
          <path d="M66 46 L94 46 L90 56 L70 56 Z" fill="${accent}" fill-opacity="0.22"/>
        </g>`;
      case 'cannon':
        return `<g fill="none" stroke="${accent}" stroke-opacity="${o}" stroke-width="3">
          <path d="M44 66 L96 34"/><circle cx="104" cy="30" r="5"/>
          <path d="M58 76 L76 50 M70 84 L88 58" stroke-opacity="0.2"/>
        </g>`;
      case 'wing':
        return `<g fill="${accent}" opacity="${o}">
          <path d="M76 70 C56 52 44 32 42 16 C56 38 66 52 78 62 Z"/>
          <path d="M84 70 C104 52 116 32 118 16 C104 38 94 52 82 62 Z"/>
        </g>`;
      default:
        return `<g stroke="${accent}" stroke-opacity="${o}" stroke-width="2.5" fill="none">
          <path d="M80 18 C60 30 56 50 70 64 C78 72 78 84 80 88 C82 84 82 72 90 64 C104 50 100 30 80 18 Z"/>
          <path d="M80 26 L80 78" stroke-opacity="0.18"/>
        </g>`;
    }
  }

  /**
   * 卡面美术。
   * @param {object} card 卡牌数据
   * @param {object} opts {compact:boolean} 棋盘小卡使用
   */
  function cardArt(card, opts) {
    if (!card) return '';
    opts = opts || {};
    const accent = card.accent || '#c9a24a';
    const dark = mix(accent, '#05070d', 0.62);
    const mid = mix(accent, '#0b0d14', 0.22);
    const glyph = safeGlyph(card);
    const id = nextId('art');
    const compact = !!opts.compact;
    const isUnit = card.type === 'unit';
    const isDragon = card.tribe === 'dragon';
    const isHybrid = card.tribe === 'hybrid';
    const scaleSize = compact ? 20 : 26;

    const ring = `<circle cx="80" cy="52" r="36" fill="none" stroke="${accent}" stroke-opacity="0.26" stroke-width="1"/>
      <circle cx="80" cy="52" r="41" fill="none" stroke="${accent}" stroke-opacity="0.1" stroke-width="1" stroke-dasharray="2 6"/>
      ${ticks(80, 52, 36, 41, 12, accent, 0.3)}`;

    let centerDecoration = '';
    if (isDragon) centerDecoration = wingMarkup(accent, compact ? 0.26 : 0.3);
    else if (isHybrid) centerDecoration = crossedBlades(accent, 0.24);
    else if (card.type === 'equip' || card.id === 'dragon_flute') centerDecoration = weaponMarkup(card, accent);
    else centerDecoration = spellMarkup(card, accent);

    const glyphSize = compact ? 46 : 50;
    const glyphY = compact ? 68 : 70;

    const motes = compact ? '' : `
      <g fill="${accent}" opacity="0.6">
        <circle cx="24" cy="30" r="1.5"/><circle cx="136" cy="26" r="1.2"/>
        <circle cx="20" cy="72" r="1"/><circle cx="140" cy="70" r="1.4"/>
        <circle cx="118" cy="14" r="0.9"/><circle cx="40" cy="88" r="1"/>
      </g>`;

    return `<svg class="card-art-svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="${id}bg" cx="50%" cy="46%" r="72%">
          <stop offset="0%" stop-color="${mid}" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="${dark}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#070910"/>
        </radialGradient>
        <linearGradient id="${id}gly" x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stop-color="#fff3d4"/>
          <stop offset="38%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="${mix(accent, '#3b1c08', 0.55)}"/>
        </linearGradient>
        <pattern id="${id}sc" width="${scaleSize}" height="${scaleSize * 0.62}" patternUnits="userSpaceOnUse">
          <path d="M0 ${scaleSize * 0.62} A ${scaleSize / 2} ${scaleSize / 2} 0 0 1 ${scaleSize} ${scaleSize * 0.62}"
                fill="none" stroke="${accent}" stroke-opacity="0.09" stroke-width="1"/>
          <path d="M${-scaleSize / 2} ${scaleSize * 0.31} A ${scaleSize / 2} ${scaleSize / 2} 0 0 1 ${scaleSize / 2} ${scaleSize * 0.31}"
                fill="none" stroke="${accent}" stroke-opacity="0.07" stroke-width="1"/>
          <path d="M${scaleSize / 2} ${scaleSize * 0.31} A ${scaleSize / 2} ${scaleSize / 2} 0 0 1 ${scaleSize * 1.5} ${scaleSize * 0.31}"
                fill="none" stroke="${accent}" stroke-opacity="0.07" stroke-width="1"/>
        </pattern>
        <filter id="${id}glow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${accent}" flood-opacity="0.55"/>
        </filter>
      </defs>
      <rect width="160" height="100" fill="#080a11"/>
      <rect width="160" height="100" fill="url(#${id}bg)"/>
      <rect width="160" height="100" fill="url(#${id}sc)"/>
      <path d="M0 100 L160 0 L160 100 Z" fill="${accent}" opacity="0.045"/>
      ${centerDecoration}
      ${ring}
      ${motes}
      <text x="80" y="${glyphY}" text-anchor="middle" font-size="${glyphSize}"
            font-family="'KaiTi','STKaiti','Kaiti SC','SimSun',serif" font-weight="bold"
            fill="url(#${id}gly)" filter="url(#${id}glow)"
            stroke="#1b0d06" stroke-opacity="0.45" stroke-width="1.2" paint-order="stroke">${glyph}</text>
      <path d="M8 8 L8 18 M8 8 L18 8" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4"/>
      <path d="M152 8 L152 18 M152 8 L142 8" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4"/>
      <path d="M8 92 L8 82 M8 92 L18 92" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4"/>
      <path d="M152 92 L152 82 M152 92 L142 92" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4"/>
    </svg>`;
  }

  /* --------------------------- 图标 --------------------------- */

  const ICONS = {
    crystal: '<path d="M12 2 L18 9 L12 22 L6 9 Z" fill="currentColor"/><path d="M6 9 L18 9" stroke="rgba(0,0,0,.35)" stroke-width="1.4"/>',
    sword: '<path d="M14.5 3 L17 5.5 L8 20 L5 21 L4.5 18.5 Z" fill="currentColor"/><path d="M3 18 L6 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    shield: '<path d="M12 2 L20 5 V11 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11 V5 Z" fill="currentColor"/>',
    heart: '<path d="M12 21 C4 15 2 10 4.5 6.5 C7 3.3 11.5 4.8 12 8 C12.5 4.8 17 3.3 19.5 6.5 C22 10 20 15 12 21 Z" fill="currentColor"/>',
    snow: '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M12 2 V22"/><path d="M3.5 7 L20.5 17"/><path d="M20.5 7 L3.5 17"/><path d="M12 2 l-3 3 M12 2 l3 3 M12 22 l-3 -3 M12 22 l3 -3"/></g>',
    flame: '<path d="M12 22 C5 18 6 12 9 9 C9 12 11 13 11 13 C10 8 13 4 16 2 C15 7 20 9 19 15 C18 19 15 22 12 22 Z" fill="currentColor"/>',
    skull: '<path d="M12 2 C7 2 4 5.5 4 9.5 C4 12 5.5 13.5 7 14.5 V18 H17 V14.5 C18.5 13.5 20 12 20 9.5 C20 5.5 17 2 12 2 Z" fill="currentColor"/><circle cx="9" cy="10" r="1.3" fill="#0a0d14"/><circle cx="15" cy="10" r="1.3" fill="#0a0d14"/>',
    crown: '<path d="M3 8 L7 12 L12 4 L17 12 L21 8 L19 19 H5 Z" fill="currentColor"/>',
    wing: '<path d="M2 14 C6 4 14 2 22 4 C16 7 12 11 9 18 Z" fill="currentColor"/>',
    scroll: '<path d="M5 4 H19 V18 C19 20 17 21 15 20 L5 20 Z" fill="currentColor"/><path d="M8 8 H16 M8 11 H16 M8 14 H13" stroke="#0a0d14" stroke-width="1.2"/>',
    close: '<path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    chevron: '<path d="M9 5 L16 12 L9 19" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    back: '<path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    sound: '<path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor"/><path d="M16 8 C18 10 18 14 16 16" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    mute: '<path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor"/><path d="M16 9 L21 15 M21 9 L16 15" stroke="currentColor" stroke-width="1.8"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11 V17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/>'
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.crystal;
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
  }

  /* --------------------------- 徽记 / 标题 --------------------------- */

  function hqCrest(side) {
    const accent = side === 1 ? '#c8553d' : '#d8b36a';
    return `<svg class="hq-crest-svg" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="hq${side}" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="${rgba(accent, 0.5)}"/>
          <stop offset="100%" stop-color="#0a0d13"/>
        </radialGradient>
        <linearGradient id="hqg${side}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff0cb"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${mix(accent, '#2a1208', 0.6)}"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#hq${side})" stroke="${accent}" stroke-opacity=".5"/>
      <circle cx="60" cy="60" r="49" fill="none" stroke="${accent}" stroke-opacity=".22" stroke-dasharray="2 5"/>
      <path d="M60 24 L88 34 V60 C88 78 75 92 60 99 C45 92 32 78 32 60 V34 Z" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="1.5"/>
      <text x="60" y="76" text-anchor="middle" font-size="46" font-family="'KaiTi','STKaiti','Kaiti SC','SimSun',serif" font-weight="bold" fill="url(#hqg${side})">龙</text>
    </svg>`;
  }

  function logoDragon() {
    return `<svg viewBox="0 0 260 150" class="logo-svg" aria-hidden="true">
      <defs>
        <linearGradient id="lgold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff6dc"/><stop offset=".45" stop-color="#e8c377"/><stop offset="1" stop-color="#8a5c22"/>
        </linearGradient>
        <radialGradient id="lglow" cx="50%" cy="55%" r="55%">
          <stop offset="0" stop-color="#d8893f" stop-opacity=".4"/><stop offset="1" stop-color="#d8893f" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="130" cy="78" r="70" fill="url(#lglow)"/>
      <g transform="translate(50 16)">${wingMarkup('#c9a24a', 0.4)}</g>
      <circle cx="130" cy="78" r="56" fill="none" stroke="#c9a24a" stroke-opacity=".3"/>
      <circle cx="130" cy="78" r="62" fill="none" stroke="#c9a24a" stroke-opacity=".12" stroke-dasharray="2 7"/>
      ${ticks(130, 78, 56, 62, 16, '#c9a24a', 0.28)}
      <text x="130" y="103" text-anchor="middle" font-size="78" font-family="'KaiTi','STKaiti','Kaiti SC','SimSun',serif" font-weight="bold"
        fill="url(#lgold)" stroke="#2a1408" stroke-width="2" paint-order="stroke">龙</text>
    </svg>`;
  }

  root.DBArt = {
    GLYPHS,
    cardArt,
    icon,
    hqCrest,
    logoDragon,
    mix,
    rgba
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.DBArt;
