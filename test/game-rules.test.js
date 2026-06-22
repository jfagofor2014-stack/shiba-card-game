import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, buildDeck, shuffle, cardKind, createInitialState, drawCards, addScore, opponent, resolveEffect, needsCounter, playCard, applyCounter, endTurn } from '../src/game-rules.js';

function handWith(state, who, cardId) {
  const s = JSON.parse(JSON.stringify(state));
  s.hands[who][0] = cardId;
  return s;
}

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

test('hikoki gives 2 points and discards the card', () => {
  const s = handWith(createInitialState(), 'host', 'hikoki_1');
  const next = resolveEffect(s, 'host', 'hikoki_1');
  assert.equal(next.scores.host, 2);
  assert.ok(next.discard.includes('hikoki_1'));
  assert.ok(!next.hands.host.includes('hikoki_1'));
});

test('hesoten gives 3 points and draws a card', () => {
  const s = handWith(createInitialState(), 'host', 'hesoten_1');
  const before = s.hands.host.length;
  const next = resolveEffect(s, 'host', 'hesoten_1');
  assert.equal(next.scores.host, 3);
  // -1 played card +1 drawn = same hand size
  assert.equal(next.hands.host.length, before);
});

test('shibakyori gives 1 point and discards a random opponent card', () => {
  const s = handWith(createInitialState(), 'host', 'shibakyori_1');
  const next = resolveEffect(s, 'host', 'shibakyori_1', {}, () => 0);
  assert.equal(next.scores.host, 1);
  assert.equal(next.hands.guest.length, 4);
});

test('sukima goes to own field and persists', () => {
  const s = handWith(createInitialState(), 'host', 'sukima_1');
  const next = resolveEffect(s, 'host', 'sukima_1');
  assert.ok(next.field.host.includes('sukima_1'));
});

test('kangeki sets opponent skipNext', () => {
  const s = handWith(createInitialState(), 'host', 'kangeki_1');
  const next = resolveEffect(s, 'host', 'kangeki_1');
  assert.equal(next.skipNext.guest, true);
});

test('kangeki is nullified when opponent has sukima on field', () => {
  const s = handWith(createInitialState(), 'host', 'kangeki_1');
  s.field.guest.push('sukima_2');
  const next = resolveEffect(s, 'host', 'kangeki_1');
  assert.equal(next.skipNext.guest, false);
});

test('zoomies on amae top gives 5 points', () => {
  const s = handWith(createInitialState(), 'host', 'zoomies_1');
  s.deck.unshift('hikoki_2'); // amae on top
  const next = resolveEffect(s, 'host', 'zoomies_1');
  assert.equal(next.scores.host, 5);
});

test('zoomies on non-amae top forces end of turn', () => {
  const s = handWith(createInitialState(), 'host', 'zoomies_1');
  s.deck.unshift('drill_2'); // non-amae on top
  const next = resolveEffect(s, 'host', 'zoomies_1');
  assert.equal(next.scores.host, 0);
  assert.equal(next.forceEndTurn, true);
});

test('shibakyori scores but does not destroy hand when opponent has sukima', () => {
  const s = handWith(createInitialState(), 'host', 'shibakyori_1');
  s.field.guest.push('sukima_2');
  const before = s.hands.guest.length;
  const next = resolveEffect(s, 'host', 'shibakyori_1', {}, () => 0);
  assert.equal(next.scores.host, 1);
  assert.equal(next.hands.guest.length, before); // unchanged
});

test('drill discards chosen cards and draws discarded+1', () => {
  const s = createInitialState();
  s.hands.host = ['drill_1', 'hikoki_3', 'hesoten_2'];
  const next = resolveEffect(s, 'host', 'drill_1', { drillDiscard: ['hikoki_3', 'hesoten_2'] });
  // played drill (1) + discarded 2 removed = started 3, drew 2+1=3 => hand 3
  assert.equal(next.hands.host.length, 3);
  assert.ok(!next.hands.host.includes('drill_1'));
});

test('needsCounter classifies cards', () => {
  assert.equal(needsCounter('hikoki_1'), 'score');
  assert.equal(needsCounter('zoomies_1'), 'score');
  assert.equal(needsCounter('kangeki_1'), 'sabotage');
  assert.equal(needsCounter('sukima_1'), null);
  assert.equal(needsCounter('drill_1'), null);
});

test('playCard on score card enters awaiting_counter without applying', () => {
  const s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  const next = playCard(s, 'host', 'hikoki_1');
  assert.equal(next.phase, 'awaiting_counter');
  assert.equal(next.pending.cardId, 'hikoki_1');
  assert.equal(next.scores.host, 0); // not yet applied
});

test('playCard on non-counter card applies immediately', () => {
  const s = createInitialState();
  s.hands.host[0] = 'sukima_1';
  const next = playCard(s, 'host', 'sukima_1');
  assert.equal(next.phase, 'main');
  assert.ok(next.field.host.includes('sukima_1'));
});

test('applyCounter with kyohi nullifies the score', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  s.hands.guest[0] = 'kyohi_1';
  s = playCard(s, 'host', 'hikoki_1');
  s = applyCounter(s, 'guest', 'kyohi_1');
  assert.equal(s.scores.host, 0);
  assert.ok(s.discard.includes('kyohi_1'));
  assert.ok(s.discard.includes('hikoki_1'));
  assert.equal(s.phase, 'main');
});

test('applyCounter with null applies the original effect', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  s = playCard(s, 'host', 'hikoki_1');
  s = applyCounter(s, 'guest', null);
  assert.equal(s.scores.host, 2);
  assert.equal(s.phase, 'main');
});

test('endTurn refills to 5 and swaps turn', () => {
  let s = createInitialState();
  s.hands.host = ['hikoki_2', 'hikoki_3']; // 2 cards
  s = endTurn(s);
  assert.equal(s.hands.host.length, 5);
  assert.equal(s.turn, 'guest');
});

test('endTurn consumes skipNext by skipping that player', () => {
  let s = createInitialState();
  s.skipNext.guest = true;
  s = endTurn(s); // host -> would be guest, but guest skips -> back to host
  assert.equal(s.turn, 'host');
  assert.equal(s.skipNext.guest, false);
});

test('endTurn discards own sukima from field', () => {
  let s = createInitialState();
  s.field.host.push('sukima_1');
  s = endTurn(s);
  assert.ok(!s.field.host.includes('sukima_1'));
  assert.ok(s.discard.includes('sukima_1'));
});
