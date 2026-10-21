/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * cards.js — 卡牌数据、预设卡组与卡组校验（纯数据，可被 Node 直接加载测试）
 * ========================================================================== */
(function (root) {
  'use strict';

  /* 稀有度 */
  const RARITY = {
    common:    { name: '普通', color: '#b9b3a5' },
    rare:      { name: '精良', color: '#63a9ee' },
    epic:      { name: '史诗', color: '#c184f0' },
    legendary: { name: '传说', color: '#f0b64a' }
  };

  /* 定位说明：
   *   unit   单位卡：部署到支援阵线；攻击/移动每回合一次
   *   equip  装备卡：只能装备给拥有装备槽的混血种
   *   tactic 战术卡：立即结算，一次性
   *
   * 目标定义 target：
   *   who  : 'enemy' | 'ally'           目标阵营（以打出者视角）
   *   kind : 'any' | 'dragon' | 'hybrid' | 'equip'  目标类型
   *   required : 没有合法目标时是否仍可打出
   *   prompt   : 给 UI 的目标提示文案
   */
  const CARDS = [
    /* ------------------------------- 0 费 ------------------------------- */
    {
      id: 'wyvern', name: '翼龙', en: 'Wyvern', cost: 0, type: 'unit',
      tribe: 'dragon', atk: 1, def: 1, rarity: 'common', art: 'wyvern', accent: '#8f9bb3',
      text: '无特殊能力。',
      flavor: '龙群中最廉价、也最饥饿的猎手。'
    },
    {
      id: 'hybrid_spawn', name: '人龙混血种', en: 'Dragonkin Spawn', cost: 0, type: 'unit',
      tribe: 'hybrid', atk: 1, def: 1, slots: 3, rarity: 'common', art: 'hybrid1', accent: '#c9a15a',
      text: '装备槽 3：可装备最多三件装备。',
      flavor: '王国的旧誓约把人与龙绑在同一面旗帜之下。'
    },

    /* ------------------------------- 1 费 ------------------------------- */
    {
      id: 'fire_wyvern', name: '火翼龙', en: 'Ember Wyvern', cost: 1, type: 'unit',
      tribe: 'dragon', atk: 1, def: 1, rarity: 'rare', art: 'fireWyvern', accent: '#ff7a3c',
      text: '攻击时使目标灼烧：其控制者的回合开始时，目标受到1点伤害。',
      flavor: '它的吐息会在鳞片上留下永不熄灭的余烬。',
      keywords: ['灼烧']
    },
    {
      id: 'great_dragon', name: '巨龙', en: 'Great Dragon', cost: 1, type: 'unit',
      tribe: 'dragon', atk: 1, def: 4, rarity: 'rare', art: 'greatDragon', accent: '#b08d57',
      text: '无特殊能力。',
      flavor: '古老、迟缓，但它的鳞片比城牆更厚。'
    },
    {
      id: 'red_dragon', name: '红龙', en: 'Red Dragon', cost: 1, type: 'unit',
      tribe: 'dragon', atk: 2, def: 1, rarity: 'common', art: 'dragon', accent: '#e5484d',
      text: '无特殊能力。',
      flavor: '赤色的龙总是先动手，再思考。'
    },
    {
      id: 'green_dragon', name: '绿龙', en: 'Green Dragon', cost: 1, type: 'unit',
      tribe: 'dragon', atk: 1, def: 2, rarity: 'common', art: 'dragon', accent: '#57c785',
      text: '无特殊能力。',
      flavor: '林地之龙，耐性远超它的獠牙。'
    },
    {
      id: 'blue_dragon', name: '蓝龙', en: 'Blue Dragon', cost: 1, type: 'unit',
      tribe: 'dragon', atk: 2, def: 2, rarity: 'common', art: 'dragon', accent: '#5b9dff',
      text: '无特殊能力。',
      flavor: '湖心的蓝龙以风暴为巢。'
    },
    {
      id: 'hybrid_mid', name: '中级人龙混血', en: 'Dragonkin Adept', cost: 1, type: 'unit',
      tribe: 'hybrid', atk: 2, def: 2, slots: 3, rarity: 'rare', art: 'hybrid2', accent: '#c9a15a',
      text: '装备槽 3：可装备最多三件装备。',
      flavor: '一半的血统来自王座，一半来自天空。'
    },

    /* ------------------------------- 2 费 ------------------------------- */
    {
      id: 'two_legged_wyvern', name: '双足飞龙', en: 'Biped Wyvern', cost: 2, type: 'unit',
      tribe: 'dragon', atk: 3, def: 1, rarity: 'rare', art: 'wyvern2', accent: '#d98f4e',
      text: '若敌方场上没有费用≥2的卡牌，此单位攻击力+2。',
      flavor: '它只在猎物虚弱时俯冲。',
      keywords: ['气势']
    },
    {
      id: 'cave_dragon', name: '洞穴龙', en: 'Cavern Dragon', cost: 2, type: 'unit',
      tribe: 'dragon', atk: 2, def: 4, rarity: 'rare', art: 'caveDragon', accent: '#a07a52',
      text: '庇护左右相邻的友方单位：只要洞穴龙存活，这些单位无法被攻击。',
      flavor: '只要它守在洞口，幼崽便无一受损。',
      keywords: ['庇护']
    },
    {
      id: 'basilisk', name: '蛇怪', en: 'Basilisk', cost: 2, type: 'unit',
      tribe: 'dragon', atk: 2, def: 3, rarity: 'rare', art: 'basilisk', accent: '#8fbe5a',
      text: '烟幕：未移动或攻击时无法被选中。死亡时对一个随机敌方单位造成1点伤害；若敌方没有单位，则对敌方总部造成1点伤害。',
      flavor: '你嗅到毒雾时，它早已盯上了你。',
      keywords: ['烟幕', '遗言']
    },
    {
      id: 'hybrid_high', name: '高级人龙混血', en: 'Dragonkin Champion', cost: 2, type: 'unit',
      tribe: 'hybrid', atk: 3, def: 3, slots: 3, rarity: 'rare', art: 'hybrid3', accent: '#c9a15a',
      text: '装备槽 3：可装备最多三件装备。',
      flavor: '他们披着龙鳞打造的甲胄，为两个种族而战。'
    },

    /* ------------------------------- 3 费 ------------------------------- */
    {
      id: 'ice_dragon', name: '冰原龙', en: 'Glacier Dragon', cost: 3, type: 'unit',
      tribe: 'dragon', atk: 4, def: 5, rarity: 'epic', art: 'iceDragon', accent: '#7fe3ff',
      text: '部署：冻结一个敌方单位一回合。',
      flavor: '它的呼吸让整片荒原安静下来。',
      keywords: ['冻结'],
      target: { who: 'enemy', kind: 'any', required: false, prompt: '冻结一个敌方单位' }
    },
    {
      id: 'fairy_dragon', name: '仙灵龙', en: 'Fae Dragon', cost: 3, type: 'unit',
      tribe: 'dragon', atk: 2, def: 5, rarity: 'epic', art: 'fairyDragon', accent: '#e7a6ff',
      text: '部署：将一个友方单位恢复至满防御，并使其获得+1/+1。',
      flavor: '它的鳞粉落在伤口上，伤口便忘记了疼痛。',
      target: { who: 'ally', kind: 'any', required: false, prompt: '修复一个友方单位' }
    },
    {
      id: 'demon_dragon', name: '魔龙', en: 'Demon Dragon', cost: 3, type: 'unit',
      tribe: 'dragon', atk: 6, def: 1, rarity: 'epic', art: 'demonDragon', accent: '#c04bff',
      text: '部署：对敌方总部造成2点伤害。被摧毁时，再次对敌方总部造成2点伤害。',
      flavor: '它从深渊爬出，只为在死前咬穿王座。',
      keywords: ['遗言']
    },
    {
      id: 'welsh_red', name: '威尔士红龙', en: 'Welsh Red Dragon', cost: 3, type: 'unit',
      tribe: 'dragon', atk: 4, def: 4, rarity: 'legendary', art: 'welshDragon', accent: '#ff5a4d',
      text: '部署：所有友方单位获得+2防御力。',
      flavor: '当它展开双翼，王国的旗帜便有了颜色。'
    },
    {
      id: 'azure_dragon', name: '青龙', en: 'Azure Dragon', cost: 3, type: 'unit',
      tribe: 'dragon', atk: 3, def: 5, rarity: 'epic', art: 'azureDragon', accent: '#35d6c3',
      text: '每个回合一次：恢复一个友方单位1点防御力（不消耗行动）。',
      flavor: '东方之龙，司掌潮汐与疗愈。',
      keywords: ['疗愈']
    },
    {
      id: 'hybrid_top', name: '顶级人龙混血', en: 'Dragonkin Highlord', cost: 3, type: 'unit',
      tribe: 'hybrid', atk: 4, def: 4, slots: 3, rarity: 'epic', art: 'hybrid4', accent: '#e5bd6e',
      text: '装备槽 3：可装备最多三件装备。',
      flavor: '王座之上，只有一个血脉能同时号令人与龙。'
    },

    /* ----------------------------- 新卡：4 费 ----------------------------- */
    {
      id: 'nordic_white_dragon', name: '北欧白龙', en: 'Nordic White Dragon', cost: 4, type: 'unit',
      tribe: 'dragon', atk: 10, def: 6, rarity: 'epic', art: 'azureDragon', accent: '#dbe8ff',
      text: '此单位无法攻击总部。',
      flavor: '白龙守望北境，只与战士交锋，不屑于王座。',
      keywords: ['禁攻总部']
    },
    {
      id: 'elf_dragon', name: '精灵龙', en: 'Elven Dragon', cost: 4, type: 'unit',
      tribe: 'dragon', atk: 6, def: 3, rarity: 'epic', art: 'fairyDragon', accent: '#8fe3c8',
      text: '任意一方每部署一个费用≥3的单位，此单位获得+1防御力（不包含自身）。',
      flavor: '它从高阶魔法的余波中汲取鳞片的光泽。',
      keywords: ['成长']
    },
    {
      id: 'head_start', name: '捷足先登', en: 'Head Start', cost: 3, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'wing', accent: '#7fd6a6',
      text: '若你的前线有混血种，抽两张牌。',
      flavor: '混血种在前线撕开缺口，后方的援军便抢先涌入。',
      keywords: ['抽牌'],
      condition: '需要你的前线有混血种',
      conditionKey: 'frontHybrid'
    },
    {
      id: 'quick_victory', name: '快速取胜', en: 'Swift Victory', cost: 3, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'cannon', accent: '#ff9a5e',
      text: '对敌方总部造成5点伤害；然后使敌方所有已部署单位获得+1/+1。',
      flavor: '胜利来得很早，代价也很重。',
      keywords: ['直伤']
    },
    {
      id: 'dragon_nest_repair', name: '龙巢维修', en: 'Dragon Nest Repairs', cost: 4, type: 'tactic',
      rarity: 'epic', art: 'sigil', sigil: 'heart', accent: '#c9a15a',
      text: '若你的总部生命低于10：恢复8点总部生命，并从卡组中检索一张费用≥3的龙族单位卡加入手牌。',
      flavor: '龙巢的每一块砖，都由幼龙与匠人一同修补。',
      keywords: ['修复', '检索'],
      condition: '需要你的总部生命低于10',
      conditionKey: 'lowHq'
    },
    {
      id: 'last_stand', name: '最后一搏', en: 'Last Stand', cost: 4, type: 'tactic',
      rarity: 'epic', art: 'sigil', sigil: 'knight', accent: '#ff5a4d',
      text: '将你的总部生命设为1；使你的所有单位获得+4/+4。',
      flavor: '当退路被烧尽，龙群便只剩下向前。',
      keywords: ['背水一战']
    },

    /* ----------------------------- 装备卡 ----------------------------- */
    {
      id: 'wooden_sword', name: '木剑', en: 'Wooden Sword', cost: 0, type: 'equip',
      rarity: 'common', art: 'sword', accent: '#b98a5a',
      text: '装备：下回合开始时，装备者攻击力+1。',
      flavor: '训练用的木剑，握久了也会长出茧。',
      keywords: ['延迟强化'],
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'leather_armor', name: '皮甲', en: 'Leather Armor', cost: 0, type: 'equip',
      rarity: 'common', art: 'shield', accent: '#9c7b52',
      text: '装备：下回合开始时，装备者防御力+1。',
      flavor: '硬化的兽皮，挡不住龙焰，却挡得住第一口咬。',
      keywords: ['延迟强化'],
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'shield', name: '盾牌', en: 'Shield', cost: 1, type: 'equip',
      rarity: 'common', art: 'shield', accent: '#b9c2d0',
      text: '装备：+1防御力。',
      flavor: '龙鳞与橡木，铁匠铺里最诚实的两样东西。',
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'iron_sword', name: '铁剑', en: 'Iron Sword', cost: 1, type: 'equip',
      rarity: 'common', art: 'sword', accent: '#c8ccd6',
      text: '装备：+1攻击力。',
      flavor: '重剑无锋，但砍得动龙鳞。',
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'bow', name: '弓箭', en: 'Longbow', cost: 2, type: 'equip',
      rarity: 'rare', art: 'bow', accent: '#c9a15a',
      text: '装备：装备者在支援阵线也可攻击敌方前线和支援阵线的单位。',
      flavor: '射程之内，人人平等。',
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'robe', name: '法袍', en: 'Arcane Robe', cost: 2, type: 'equip',
      rarity: 'rare', art: 'robe', accent: '#8f7be8',
      text: '装备：未行动时无法被选中；攻击时有50%几率造成额外1点伤害。',
      flavor: '看不见的术士，才最令人恐惧。',
      keywords: ['隐匿'],
      target: { who: 'ally', kind: 'equip', required: true, prompt: '装备给一个拥有装备槽的友方混血种' }
    },
    {
      id: 'dragon_flute', name: '龙之笛', en: 'Dragon Flute', cost: 3, type: 'tactic',
      rarity: 'epic', art: 'flute', accent: '#e0c07a',
      text: '一次性：移除一个敌方龙族单位。有10%几率将其加入你的手牌。',
      flavor: '笛声响起，龙便想起故乡，转身离去。',
      target: { who: 'enemy', kind: 'dragon', required: true, prompt: '移除一个敌方龙族单位' }
    },

    /* ----------------------------- 战术卡 ----------------------------- */
    {
      id: 'dragon_decree', name: '龙族诏令', en: 'Dragon Decree', cost: 1, type: 'tactic',
      rarity: 'common', art: 'sigil', sigil: 'dragon', accent: '#d8b36a',
      text: '使一个友方龙族单位获得+1/+1。',
      flavor: '一纸诏令，足以让龙群俯首。',
      target: { who: 'ally', kind: 'dragon', required: true, prompt: '选择一个友方龙族单位' }
    },
    {
      id: 'for_breeding', name: '为了繁衍', en: 'For the Brood', cost: 2, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'heart', accent: '#e58aa5',
      text: '所有友方龙族单位获得+2防御力。',
      flavor: '龙群不在乎王座，只在乎巢中的蛋。'
    },
    {
      id: 'cold_wind', name: '寒风', en: 'Cold Wind', cost: 2, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'snow', accent: '#9fe8ff',
      text: '对所有敌方前线单位造成1点伤害。',
      flavor: '北境的风不只是冷，它会割开铠甲。'
    },
    {
      id: 'aerial_strike', name: '空中闪击', en: 'Aerial Strike', cost: 2, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'wing', accent: '#8fb8ff',
      text: '对一个敌方龙族单位造成4点伤害。',
      flavor: '从云层之上俯冲，龙鳞也来不及合拢。',
      target: { who: 'enemy', kind: 'dragon', required: true, prompt: '选择一个敌方龙族单位' }
    },
    {
      id: 'death_descends', name: '死亡降临', en: 'Death Descends', cost: 3, type: 'tactic',
      rarity: 'epic', art: 'sigil', sigil: 'skull', accent: '#b6a7c9',
      text: '随机消灭一个敌方单位。',
      flavor: '命运从不挑选，它只是随手一指。'
    },
    {
      id: 'dragon_knight', name: '龙骑士', en: 'Dragon Knight', cost: 3, type: 'tactic',
      rarity: 'epic', art: 'sigil', sigil: 'knight', accent: '#d8b36a',
      text: '若你同时控制混血种和龙族，所有友方单位获得+2/+2。',
      flavor: '当血脉与誓言同乘一骑，战场便只剩一种结局。',
      condition: '需要同时控制混血种与龙族',
      conditionKey: 'knight'
    },
    {
      id: 'royal_salute', name: '皇家礼炮', en: 'Royal Salute', cost: 3, type: 'tactic',
      rarity: 'rare', art: 'sigil', sigil: 'cannon', accent: '#ffb45e',
      text: '若本局你部署过威尔士红龙，对一个敌方单位造成5点伤害。',
      flavor: '礼炮齐鸣，既是致敬，也是处决。',
      target: { who: 'enemy', kind: 'any', required: true, prompt: '选择一个敌方单位' },
      condition: '需要本局部署过威尔士红龙',
      conditionKey: 'welsh'
    },
    {
      id: 'blizzard', name: '暴雪降临', en: 'Blizzard', cost: 3, type: 'tactic',
      rarity: 'epic', art: 'sigil', sigil: 'blizzard', accent: '#a9e6ff',
      text: '若本局你部署过冰原龙，冻结所有敌方单位至其下个回合结束。',
      flavor: '冬天不是季节，是龙的怒火。',
      condition: '需要本局部署过冰原龙',
      conditionKey: 'ice'
    }
  ];

  const byId = {};
  CARDS.forEach(c => { byId[c.id] = c; });
  const ALL = CARDS.slice();
  const ALL_IDS = ALL.map(c => c.id);

  function get(id) { return byId[id] || null; }
  function isUnit(cardOrId) {
    const c = typeof cardOrId === 'string' ? get(cardOrId) : cardOrId;
    return !!c && c.type === 'unit';
  }
  function isDragon(cardOrId) {
    const c = typeof cardOrId === 'string' ? get(cardOrId) : cardOrId;
    return !!c && c.tribe === 'dragon';
  }
  function isHybrid(cardOrId) {
    const c = typeof cardOrId === 'string' ? get(cardOrId) : cardOrId;
    return !!c && c.tribe === 'hybrid';
  }
  function hasSlot(cardOrId) {
    const c = typeof cardOrId === 'string' ? get(cardOrId) : cardOrId;
    return !!c && c.type === 'unit' && c.slots > 0;
  }

  /* 按费用排序（同费用按单位→装备→战术，再按名称） */
  const TYPE_ORDER = { unit: 0, equip: 1, tactic: 2 };
  function cmpCard(a, b) {
    if (a.cost !== b.cost) return a.cost - b.cost;
    if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  }
  const SORTED = ALL.slice().sort(cmpCard);

  /* --------------------------- 预设卡组 --------------------------- */
  const PRESETS = {
    ember: {
      id: 'ember', name: '烈焰突袭', en: 'EMBER ASSAULT', accent: '#ff6b3d',
      desc: '以低费龙群抢占地盘，用灼烧与冲锋直接压垮总部。',
      style: '速攻',
      cards: [
        'fire_wyvern', 'fire_wyvern', 'fire_wyvern',
        'red_dragon', 'red_dragon', 'red_dragon',
        'blue_dragon', 'blue_dragon',
        'wyvern', 'wyvern', 'wyvern',
        'two_legged_wyvern', 'two_legged_wyvern', 'two_legged_wyvern',
        'demon_dragon', 'demon_dragon', 'demon_dragon',
        'welsh_red', 'welsh_red',
        'hybrid_spawn', 'hybrid_spawn',
        'iron_sword', 'iron_sword',
        'dragon_decree', 'dragon_decree',
        'cold_wind', 'cold_wind',
        'royal_salute', 'royal_salute',
        'dragon_knight'
      ]
    },
    frost: {
      id: 'frost', name: '霜寒壁垒', en: 'FROST BULWARK', accent: '#7fe3ff',
      desc: '以洞穴龙与巨兽筑起高墙，冻结并慢慢碾碎对手。',
      style: '控制',
      cards: [
        'blue_dragon', 'blue_dragon', 'blue_dragon',
        'green_dragon', 'green_dragon', 'green_dragon',
        'great_dragon', 'great_dragon', 'great_dragon',
        'cave_dragon', 'cave_dragon', 'cave_dragon',
        'ice_dragon', 'ice_dragon', 'ice_dragon',
        'fairy_dragon', 'fairy_dragon',
        'azure_dragon', 'azure_dragon',
        'basilisk', 'basilisk',
        'shield', 'shield',
        'robe', 'robe',
        'blizzard', 'blizzard',
        'for_breeding', 'for_breeding',
        'aerial_strike'
      ]
    },
    hybrid: {
      id: 'hybrid', name: '混血军团', en: 'HYBRID LEGION', accent: '#e5bd6e',
      desc: '以人龙混血种的装备槽滚起雪球，龙骑士与礼炮终结战局。',
      style: '中速',
      cards: [
        'hybrid_spawn', 'hybrid_spawn', 'hybrid_spawn',
        'hybrid_mid', 'hybrid_mid', 'hybrid_mid',
        'hybrid_high', 'hybrid_high', 'hybrid_high',
        'hybrid_top', 'hybrid_top',
        'wyvern', 'wyvern',
        'two_legged_wyvern', 'two_legged_wyvern', 'two_legged_wyvern',
        'cave_dragon', 'cave_dragon',
        'iron_sword', 'iron_sword', 'iron_sword',
        'shield', 'shield',
        'bow', 'bow',
        'dragon_knight', 'dragon_knight',
        'royal_salute', 'royal_salute',
        'welsh_red'
      ]
    }
  };

  const PRESET_LIST = [PRESETS.ember, PRESETS.frost, PRESETS.hybrid];

  function deckCount(cards) { return (cards || []).length; }

  function countCopies(cards) {
    const m = {};
    (cards || []).forEach(id => { m[id] = (m[id] || 0) + 1; });
    return m;
  }

  const DECK_SIZE = 30;
  const MAX_COPIES = 3;

  function validateDeck(cards) {
    const errors = [];
    if (!Array.isArray(cards)) return { ok: false, errors: ['卡组数据不存在。'] };
    if (cards.length !== DECK_SIZE) errors.push(`卡组必须正好 ${DECK_SIZE} 张（当前 ${cards.length} 张）。`);
    const copies = countCopies(cards);
    Object.keys(copies).forEach(id => {
      if (!byId[id]) errors.push(`未知卡牌：${id}`);
      else if (copies[id] > MAX_COPIES) errors.push(`「${byId[id].name}」最多放入 ${MAX_COPIES} 张。`);
    });
    return { ok: errors.length === 0, errors };
  }

  function deckCostCurve(cards) {
    const curve = [0, 0, 0, 0, 0];
    (cards || []).forEach(id => {
      const c = byId[id];
      if (c) curve[Math.min(c.cost, 4)] += 1;
    });
    return curve;
  }

  function deckTribeCounts(cards) {
    let dragon = 0, hybrid = 0, equip = 0, tactic = 0;
    (cards || []).forEach(id => {
      const c = byId[id];
      if (!c) return;
      if (c.type === 'unit' && c.tribe === 'dragon') dragon++;
      else if (c.type === 'unit' && c.tribe === 'hybrid') hybrid++;
      else if (c.type === 'equip') equip++;
      else if (c.type === 'tactic') tactic++;
    });
    return { dragon, hybrid, equip, tactic };
  }

  root.DBCards = {
    RARITY, CARDS, ALL, SORTED, byId, get, isUnit, isDragon, isHybrid, hasSlot,
    cmpCard, PRESETS, PRESET_LIST, PRESET_IDS: Object.keys(PRESETS),
    DECK_SIZE, MAX_COPIES, deckCount, countCopies, validateDeck,
    deckCostCurve, deckTribeCounts
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.DBCards;
