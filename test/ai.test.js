import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMain, chooseCounter } from '../src/ai.js';
import { createInitialState, playCard } from '../src/game-rules.js';

test('chooseMain returns a legal card for current player', () => {
  const s = createInitialState();
  const { cardId } = chooseMain(s, 'host', 'normal', () => 0);
  assert.ok(s.hands.host.includes(cardId));
});

test('normal AI prefers higher scoring card', () => {
  const s = createInitialState();
  s.hands.host = ['hikoki_1', 'hesoten_1', 'sukima_1'];
  const { cardId } = chooseMain(s, 'host', 'normal', () => 0);
  assert.equal(cardId, 'hesoten_1'); // 3 pts beats 2 pts
});

test('chooseCounter returns kyohi card id when normal AI decides to block big score', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hesoten_1'; // 3 point attack
  s.hands.guest = ['kyohi_1', 'hikoki_4'];
  s = playCard(s, 'host', 'hesoten_1');
  const choice = chooseCounter(s, 'guest', 'normal', () => 0);
  assert.equal(choice, 'kyohi_1');
});

test('chooseCounter returns null when no counter in hand', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  s.hands.guest = ['hikoki_4', 'drill_3'];
  s = playCard(s, 'host', 'hikoki_1');
  assert.equal(chooseCounter(s, 'guest', 'normal', () => 0), null);
});
