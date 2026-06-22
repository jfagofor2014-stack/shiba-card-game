import { createInitialState, playCard, applyCounter, endTurn, opponent } from './game-rules.js';

export function takeTurn(state, controllers, rng = Math.random) {
  if (state.winner) return state;
  const who = state.turn;
  const { cardId, opts } = controllers[who].main(state, who);
  if (!cardId) return endTurn(state, rng); // no legal move, pass

  let s = playCard(state, who, cardId, opts, rng);

  if (s.phase === 'awaiting_counter') {
    const defender = opponent(s.pending.actor);
    const counterCard = controllers[defender].counter(s, defender);
    s = applyCounter(s, defender, counterCard, rng);
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
