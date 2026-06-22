import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playOutGame } from '../src/engine.js';
import { chooseMain, chooseCounter } from '../src/ai.js';

function aiController(difficulty, rng) {
  return {
    main: (state, who) => chooseMain(state, who, difficulty, rng),
    counter: (state, defender) => chooseCounter(state, defender, difficulty, rng),
  };
}

test('CPU vs CPU game completes with a winner', () => {
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const final = playOutGame(
    { host: aiController('normal', rng), guest: aiController('normal', rng) },
    rng
  );
  assert.ok(final.winner === 'host' || final.winner === 'guest');
  assert.ok(final.scores[final.winner] >= 20);
});

test('multiple seeds all complete without throwing', () => {
  for (let base = 1; base <= 20; base++) {
    let seed = base * 7919;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const final = playOutGame(
      { host: aiController('easy', rng), guest: aiController('normal', rng) },
      rng
    );
    assert.ok(final.winner, `seed ${base} produced no winner`);
  }
});
