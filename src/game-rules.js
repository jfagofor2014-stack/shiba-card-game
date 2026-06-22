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

export function addScore(state, who, points) {
  const s = clone(state);
  s.scores[who] += points;
  if (s.scores[who] >= 20) {
    s.winner = who;
    s.phase = 'finished';
  }
  return s;
}
