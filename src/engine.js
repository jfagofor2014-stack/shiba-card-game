import { createInitialState, playCard, applyCounter, endTurn, opponent, consumeExtraAction } from './game-rules.js';

export function takeTurn(state, controllers, rng = Math.random) {
  if (state.winner) return state;
  const who = state.turn;
  let s = state;

  // The active player may take extra actions (おかわり) before the turn ends.
  while (true) {
    const { cardId, opts } = controllers[who].main(s, who);
    if (!cardId) break; // no legal move -> pass
    s = playCard(s, who, cardId, opts, rng);
    if (s.phase === 'awaiting_counter') {
      const defender = opponent(s.pending.actor);
      const counterCard = controllers[defender].counter(s, defender);
      s = applyCounter(s, defender, counterCard, rng);
    }
    if (s.winner) return s;
    if (s.extraActions > 0 && s.turn === who && !s.forceEndTurn) {
      s = consumeExtraAction(s);
      continue; // same player plays again, no endTurn
    }
    break;
  }
  if (s.winner) return s;
  return endTurn(s, rng);
}

export function playOutGame(controllers, rng = Math.random, maxTurns = 200) {
  let s = createInitialState(rng);
  let turns = 0;
  while (!s.winner && turns < maxTurns) {
    s = takeTurn(s, controllers, rng);
    turns++;
  }
  return s;
}
