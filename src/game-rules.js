export const CARD_TYPES = {
  hikoki:   { name: 'ヒコーキ耳',       category: 'amae',      count: 6, emoji: '🐕', color: 'pink' },
  hesoten:  { name: 'へそ天',           category: 'amae',      count: 4, emoji: '🐶', color: 'pink' },
  kyohi:    { name: '拒否柴（不動柴）', category: 'kyohi',     count: 6, emoji: '🛑', color: 'blue' },
  kyomu:    { name: '虚無顔',           category: 'kyohi',     count: 4, emoji: '😶', color: 'blue' },
  shibakyori:{ name: '柴距離',          category: 'mypace',    count: 6, emoji: '↔️', color: 'green' },
  sukima:   { name: '隙間にすっぽり',   category: 'mypace',    count: 4, emoji: '📦', color: 'green' },
  drill:    { name: '柴ドリル',         category: 'wild',      count: 4, emoji: '🌀', color: 'orange' },
  zoomies:  { name: 'ズーミーズ（柴走り）', category: 'wild',  count: 4, emoji: '💨', color: 'orange' },
  kangeki:  { name: '無限換毛期',       category: 'wild',      count: 2, emoji: '🌾', color: 'orange' },
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
    return s;
  }

  discardFromHand(s, who, cardId);

  switch (kind) {
    case 'hikoki':
      s = addScore(s, who, 2);
      break;
    case 'hesoten':
      s = addScore(s, who, 3);
      s = drawCards(s, who, 1, rng);
      break;
    case 'shibakyori':
      s = addScore(s, who, 1);
      if (!hasSukima(s, opp) && s.hands[opp].length > 0) {
        const j = Math.floor(rng() * s.hands[opp].length);
        const removed = s.hands[opp].splice(j, 1)[0];
        s.discard.push(removed);
      }
      break;
    case 'drill': {
      const toDiscard = opts.drillDiscard || [];
      for (const id of toDiscard) discardFromHand(s, who, id);
      s = drawCards(s, who, toDiscard.length + 1, rng);
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
        } else {
          s.forceEndTurn = true;
        }
      }
      break;
    }
    case 'kangeki':
      if (!hasSukima(s, opp)) s.skipNext[opp] = true;
      break;
    default:
      break;
  }
  return s;
}

const SCORE_CARDS = new Set(['hikoki', 'hesoten', 'shibakyori', 'zoomies']);

export function needsCounter(cardId) {
  const kind = cardKind(cardId);
  if (SCORE_CARDS.has(kind)) return 'score';
  if (kind === 'kangeki') return 'sabotage';
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
