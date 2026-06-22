import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, buildDeck, shuffle, cardKind, createInitialState } from '../src/game-rules.js';

test('CARD_TYPES exposes the 9 card kinds', () => {
  assert.equal(Object.keys(CARD_TYPES).length, 9);
});

test('buildDeck has exactly 40 cards', () => {
  assert.equal(buildDeck().length, 40);
});

test('buildDeck has correct per-kind counts', () => {
  const deck = buildDeck();
  const count = (k) => deck.filter((id) => cardKind(id) === k).length;
  assert.equal(count('hikoki'), 6);
  assert.equal(count('hesoten'), 4);
  assert.equal(count('kangeki'), 2);
});

test('shuffle is deterministic with a seeded rng and non-destructive', () => {
  const deck = buildDeck();
  let seed = 0.5;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; };
  const shuffled = shuffle(deck, rng);
  assert.equal(shuffled.length, 40);
  assert.equal(deck.length, 40); // original untouched
  assert.notDeepEqual(shuffled, deck);
});

test('createInitialState deals 5 cards to each player', () => {
  const s = createInitialState();
  assert.equal(s.hands.host.length, 5);
  assert.equal(s.hands.guest.length, 5);
  assert.equal(s.deck.length, 30);
  assert.equal(s.scores.host, 0);
  assert.equal(s.turn, 'host');
  assert.equal(s.phase, 'main');
  assert.equal(s.winner, null);
});
