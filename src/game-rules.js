let LABELS = { host: 'あなた', guest: 'あいて' };
export function setLabels(hostLabel, guestLabel) {
  LABELS = { host: hostLabel, guest: guestLabel };
}
function label(role) { return LABELS[role]; }

export const CARD_TYPES = {
  hikoki:    { name: 'ヒコーキ耳',       category: 'amae',      count: 6, emoji: '🐕', color: 'pink' },
  hesoten:   { name: 'へそ天',           category: 'amae',      count: 5, emoji: '🐶', color: 'pink' },
  kyohi:     { name: '拒否柴（不動柴）', category: 'kyohi',     count: 3, emoji: '🛑', color: 'blue' },
  kyomu:     { name: '虚無顔',           category: 'kyohi',     count: 2, emoji: '😶', color: 'blue' },
  shibakyori: { name: '柴距離',          category: 'mypace',    count: 5, emoji: '↔️', color: 'green' },
  sukima:    { name: '隙間にすっぽり',   category: 'mypace',    count: 3, emoji: '📦', color: 'green' },
  drill:     { name: '柴ドリル',         category: 'wild',      count: 3, emoji: '🌀', color: 'orange' },
  zoomies:   { name: '柴走り',           category: 'wild',      count: 4, emoji: '💨', color: 'orange' },
  kangeki:   { name: '無限換毛期',       category: 'wild',      count: 3, emoji: '🌾', color: 'orange' },
  nusumi:    { name: '盗み食い',         category: 'wild',      count: 3, emoji: '🍖', color: 'orange' },
  yakimochi: { name: 'ヤキモチ',         category: 'wild',      count: 2, emoji: '😤', color: 'orange' },
  itazura:   { name: 'イタズラ',         category: 'mypace',    count: 2, emoji: '😈', color: 'green' },
  dassou:    { name: '脱走',             category: 'wild',      count: 2, emoji: '🏃', color: 'orange' },
  kunkun:    { name: 'クンクン',         category: 'mypace',    count: 2, emoji: '👃', color: 'green' },
  kokan:     { name: '物々交換',         category: 'mypace',    count: 2, emoji: '🔄', color: 'green' },
  kuidame:   { name: '食いだめ',         category: 'amae',      count: 3, emoji: '🍚', color: 'pink' },
  okawari:   { name: 'おかわり',         category: 'amae',      count: 2, emoji: '♻️', color: 'pink' },
};

export function cardKind(cardId) {
  return cardId.slice(0, cardId.lastIndexOf('_'));
}

export function buildDeck() {
  const deck = [];
  for (const [kind, def] of Object.entries(CARD_TYPES)) {
    for (let i = 1; i <= def.count; i++) deck.push(`${kind}_${i}`);
  }
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createInitialState(rng = Math.random) {
  const deck = shuffle(buildDeck(), rng);
  const hands = { host: deck.splice(0, 5), guest: deck.splice(0, 5) };
  return {
    deck, discard: [],
    hands, field: { host: [], guest: [] },
    scores: { host: 0, guest: 0 },
    turn: 'host', phase: 'main',
    pending: null, winner: null,
    skipNext: { host: false, guest: false },
    extraActions: 0,
    reveal: { host: false, guest: false },
    log: [],
  };
}

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function drawCards(state, who, n, rng = Math.random) {
  const s = clone(state);
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) break;
      s.deck = shuffle(s.discard, rng);
      s.discard = [];
    }
    s.hands[who].push(s.deck.shift());
  }
  return s;
}

export function opponent(who) {
  return who === 'host' ? 'guest' : 'host';
}

function discardFromHand(s, who, cardId) {
  const idx = s.hands[who].indexOf(cardId);
  if (idx !== -1) {
    s.hands[who].splice(idx, 1);
    s.discard.push(cardId);
  }
}

function hasSukima(s, who) {
  return s.field[who].some((id) => cardKind(id) === 'sukima');
}

export function resolveEffect(state, who, cardId, opts = {}, rng = Math.random) {
  let s = clone(state);
  const kind = cardKind(cardId);
  const opp = opponent(who);

  if (kind === 'sukima') {
    const idx = s.hands[who].indexOf(cardId);
    if (idx !== -1) s.hands[who].splice(idx, 1);
    s.field[who].push(cardId);
    s.log.push(`${label(who)}は「${CARD_TYPES[kind].name}」を場に出した`);
    return s;
  }

  discardFromHand(s, who, cardId);

  switch (kind) {
    case 'hikoki':
      s = addScore(s, who, 2);
      s.log.push(`${label(who)}は「${CARD_TYPES.hikoki.name}」でスキを2こ獲得`);
      break;
    case 'hesoten':
      s = addScore(s, who, 3);
      s = drawCards(s, who, 1, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.hesoten.name}」でスキを3こ獲得し1枚引いた`);
      break;
    case 'shibakyori': {
      const oppHandBefore = s.hands[opp].length;
      s = addScore(s, who, 1);
      let shibaLine = `${label(who)}は「${CARD_TYPES.shibakyori.name}」でスキを1こ獲得`;
      if (!hasSukima(s, opp) && s.hands[opp].length > 0) {
        const j = Math.floor(rng() * s.hands[opp].length);
        const removed = s.hands[opp].splice(j, 1)[0];
        s.discard.push(removed);
        shibaLine += 'し、相手の手札を1枚捨てさせた';
      }
      s.log.push(shibaLine);
      break;
    }
    case 'drill': {
      const toDiscard = opts.drillDiscard || [];
      for (const id of toDiscard) discardFromHand(s, who, id);
      s = drawCards(s, who, toDiscard.length + 1, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.drill.name}」で手札を${toDiscard.length}枚捨て${toDiscard.length + 1}枚引いた`);
      break;
    }
    case 'zoomies': {
      if (s.deck.length === 0 && s.discard.length > 0) {
        s.deck = shuffle(s.discard, rng);
        s.discard = [];
      }
      const top = s.deck.shift();
      if (top) {
        s.discard.push(top);
        if (CARD_TYPES[cardKind(top)].category === 'amae') {
          s = addScore(s, who, 5);
          s.log.push(`${label(who)}は「${CARD_TYPES.zoomies.name}」でスキを5こ獲得！`);
        } else {
          s.forceEndTurn = true;
          s.log.push(`${label(who)}は「${CARD_TYPES.zoomies.name}」に失敗しターン終了`);
        }
      }
      break;
    }
    case 'kangeki':
      if (!hasSukima(s, opp)) {
        s.skipNext[opp] = true;
        s.log.push(`${label(who)}は「${CARD_TYPES.kangeki.name}」で相手を1回休みにした`);
      } else {
        s.log.push(`${label(who)}の「${CARD_TYPES.kangeki.name}」は隙間にすっぽりで無効化された`);
      }
      break;
    case 'nusumi':
      s = addScore(s, who, 1);
      if (!hasSukima(s, opp)) {
        s.scores[opp] = Math.max(0, s.scores[opp] - 1);
      }
      s.log.push(`${label(who)}は「${CARD_TYPES.nusumi.name}」で相手のスキを1奪った`);
      break;
    case 'yakimochi':
      if (!hasSukima(s, opp)) {
        s.scores[opp] = Math.max(0, s.scores[opp] - 2);
        s.log.push(`${label(who)}は「${CARD_TYPES.yakimochi.name}」で相手のスキを2減らした`);
      } else {
        s.log.push(`${label(who)}の「${CARD_TYPES.yakimochi.name}」は隙間にすっぽりで無効化された`);
      }
      break;
    case 'kuidame': {
      const gain = Math.min(4, s.hands[who].length);
      s = addScore(s, who, gain);
      s.log.push(`${label(who)}は「${CARD_TYPES.kuidame.name}」でスキを${gain}こ獲得`);
      break;
    }
    case 'itazura':
      if (!hasSukima(s, opp)) {
        let n = 0;
        while (n < 2 && s.hands[opp].length > 0) {
          const j = Math.floor(rng() * s.hands[opp].length);
          s.discard.push(s.hands[opp].splice(j, 1)[0]);
          n++;
        }
        s.log.push(`${label(who)}は「${CARD_TYPES.itazura.name}」で相手の手札を${n}枚捨てさせた`);
      } else {
        s.log.push(`${label(who)}の「${CARD_TYPES.itazura.name}」は隙間にすっぽりで無効化された`);
      }
      break;
    case 'dassou': {
      while (s.hands[who].length > 0) s.discard.push(s.hands[who].pop());
      s = drawCards(s, who, 5, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.dassou.name}」で手札を引き直した`);
      break;
    }
    case 'kokan':
      if (!hasSukima(s, opp) && s.hands[who].length > 0 && s.hands[opp].length > 0) {
        const i = Math.floor(rng() * s.hands[who].length);
        const j = Math.floor(rng() * s.hands[opp].length);
        const mine = s.hands[who].splice(i, 1)[0];
        const theirs = s.hands[opp].splice(j, 1)[0];
        s.hands[who].push(theirs);
        s.hands[opp].push(mine);
        s.log.push(`${label(who)}は「${CARD_TYPES.kokan.name}」で手札を1枚交換した`);
      } else {
        s.log.push(`${label(who)}は「${CARD_TYPES.kokan.name}」を出したが交換できなかった`);
      }
      break;
    case 'kunkun':
      s.reveal[who] = true;
      s = drawCards(s, who, 1, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.kunkun.name}」で相手の手札をのぞき見した`);
      break;
    default:
      break;
  }
  return s;
}

const SCORE_CARDS = new Set(['hikoki', 'hesoten', 'shibakyori', 'zoomies', 'nusumi', 'kuidame']);
const SABOTAGE_CARDS = new Set(['kangeki', 'yakimochi', 'itazura']);

export function needsCounter(cardId) {
  const kind = cardKind(cardId);
  if (SCORE_CARDS.has(kind)) return 'score';
  if (SABOTAGE_CARDS.has(kind)) return 'sabotage';
  return null;
}

export function playCard(state, who, cardId, opts = {}, rng = Math.random) {
  const attackType = needsCounter(cardId);
  if (attackType) {
    const s = clone(state);
    s.phase = 'awaiting_counter';
    s.pending = { actor: who, cardId, attackType, opts };
    return s;
  }
  return resolveEffect(state, who, cardId, opts, rng);
}

export function applyCounter(state, defender, counterCardId, rng = Math.random) {
  let s = clone(state);
  const { actor, cardId, opts } = s.pending;
  if (counterCardId) {
    discardFromHand(s, actor, cardId);
    discardFromHand(s, defender, counterCardId);
    s.pending = null;
    s.phase = 'main';
    const counterName = CARD_TYPES[cardKind(counterCardId)].name;
    s.log.push(`${label(defender)}は「${counterName}」で${label(actor)}の効果を無効化した`);
    return s;
  }
  s.pending = null;
  s.phase = 'main';
  s = resolveEffect(s, actor, cardId, opts, rng);
  return s;
}

export function endTurn(state, rng = Math.random) {
  let s = clone(state);
  const who = s.turn;
  s.field[who] = s.field[who].filter((id) => {
    if (cardKind(id) === 'sukima') { s.discard.push(id); return false; }
    return true;
  });
  const need = 5 - s.hands[who].length;
  if (need > 0) s = drawCards(s, who, need, rng);
  s.forceEndTurn = false;
  let nextTurn = opponent(who);
  if (s.skipNext[nextTurn]) {
    s.skipNext[nextTurn] = false;
    s.log.push(`${label(nextTurn)}は1回休み`);
    nextTurn = who;
  }
  s.turn = nextTurn;
  return s;
}

export function addScore(state, who, points) {
  const s = clone(state);
  s.scores[who] += points;
  if (s.scores[who] >= 20) {
    s.winner = who;
    s.phase = 'finished';
  }
  return s;
}

export function legalPlays(state, who) {
  if (state.winner) return [];
  if (state.phase === 'main') {
    return state.turn === who ? state.hands[who].slice() : [];
  }
  if (state.phase === 'awaiting_counter') {
    if (who === state.pending.actor) return [];
    const wantKind = state.pending.attackType === 'score' ? 'kyohi' : 'kyomu';
    return state.hands[who].filter((id) => cardKind(id) === wantKind);
  }
  return [];
}
