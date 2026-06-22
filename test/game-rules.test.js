import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, buildDeck, shuffle, cardKind, createInitialState, drawCards, addScore, opponent } from '../src/game-rules.js';

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

test('drawCards moves n cards from deck to hand without mutating input', () => {
  const s = createInitialState();
  const before = s.deck.length;
  const next = drawCards(s, 'host', 2);
  assert.equal(next.hands.host.length, 7);
  assert.equal(next.deck.length, before - 2);
  assert.equal(s.hands.host.length, 5); // original untouched
});

test('drawCards reshuffles discard when deck is empty', () => {
  const s = createInitialState();
  s.discard = s.deck.splice(0); // move all deck to discard, deck now empty
  const next = drawCards(s, 'host', 1);
  assert.equal(next.hands.host.length, 6);
  assert.equal(next.discard.length, 0);
});

test('opponent flips side', () => {
  assert.equal(opponent('host'), 'guest');
  assert.equal(opponent('guest'), 'host');
});

test('addScore sets winner at 20 points', () => {
  const s = createInitialState();
  s.scores.host = 18;
  const next = addScore(s, 'host', 3);
  assert.equal(next.scores.host, 21);
  assert.equal(next.winner, 'host');
  assert.equal(next.phase, 'finished');
});

test('addScore below 20 keeps playing', () => {
  const next = addScore(createInitialState(), 'host', 2);
  assert.equal(next.winner, null);
  assert.equal(next.phase, 'main');
});
