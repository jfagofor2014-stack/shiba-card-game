import { legalPlays, cardKind, opponent } from './game-rules.js';

const SCORE_VALUE = { hesoten: 3, hikoki: 2, zoomies: 2, shibakyori: 1 };

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function chooseMain(state, who, difficulty, rng = Math.random) {
  const plays = legalPlays(state, who);
  if (plays.length === 0) return { cardId: null, opts: {} };

  if (difficulty === 'easy') {
    const cardId = pickRandom(plays, rng);
    return { cardId, opts: {} };
  }

  // normal
  const oppScore = state.scores[opponent(who)];
  const byKind = (k) => plays.find((id) => cardKind(id) === k);

  if (oppScore >= 17) {
    const sabotage = byKind('kangeki') || byKind('shibakyori');
    if (sabotage) return { cardId: sabotage, opts: {} };
  }
  const sorted = plays
    .filter((id) => SCORE_VALUE[cardKind(id)] !== undefined)
    .sort((a, b) => SCORE_VALUE[cardKind(b)] - SCORE_VALUE[cardKind(a)]);
  if (sorted.length > 0) return { cardId: sorted[0], opts: {} };

  // fall back to any card; if drill, discard non-amae/non-kyohi up to 2
  const cardId = plays[0];
  let opts = {};
  if (cardKind(cardId) === 'drill') {
    const junk = state.hands[who]
      .filter((id) => id !== cardId && !['hikoki', 'hesoten', 'kyohi', 'kyomu'].includes(cardKind(id)))
      .slice(0, 2);
    opts = { drillDiscard: junk };
  }
  return { cardId, opts };
}

export function chooseCounter(state, defender, difficulty, rng = Math.random) {
  const counters = legalPlays(state, defender);
  if (counters.length === 0) return null;

  if (difficulty === 'easy') {
    return rng() < 0.5 ? counters[0] : null;
  }

  // normal
  const { attackType, cardId } = state.pending;
  if (attackType === 'sabotage') return counters[0]; // always block sabotage
  const attackValue = SCORE_VALUE[cardKind(cardId)] || 0;
  const oppScore = state.scores[state.pending.actor];
  if (attackValue >= 3 || oppScore >= 17) return counters[0];
  return null;
}
