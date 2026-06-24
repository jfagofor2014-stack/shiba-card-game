import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, buildDeck, shuffle, cardKind, createInitialState, drawCards, addScore, opponent, resolveEffect, needsCounter, playCard, applyCounter, endTurn, legalPlays, setLabels, consumeExtraAction } from '../src/game-rules.js';

function handWith(state, who, cardId) {
  const s = JSON.parse(JSON.stringify(state));
  // Remove any randomly-dealt copy of cardId first so placing it at index 0
  // cannot create a duplicate (which would make discardFromHand leave one behind).
  s.hands[who] = s.hands[who].filter((id) => id !== cardId);
  s.hands[who][0] = cardId;
  return s;
}

test('CARD_TYPES exposes the 17 card kinds', () => {
  assert.equal(Object.keys(CARD_TYPES).length, 17);
});

test('buildDeck has exactly 52 cards', () => {
  assert.equal(buildDeck().length, 52);
});

test('buildDeck has correct per-kind counts', () => {
  const deck = buildDeck();
  const count = (k) => deck.filter((id) => cardKind(id) === k).length;
  assert.equal(count('hikoki'), 6);
  assert.equal(count('hesoten'), 5);
  assert.equal(count('kyohi'), 3);
  assert.equal(count('kyomu'), 2);
  assert.equal(count('kangeki'), 3);
});

test('deck has exactly 52 cards after expansion', () => {
  assert.equal(buildDeck().length, 52);
});

test('new card kinds exist with correct counts', () => {
  const deck = buildDeck();
  const count = (k) => deck.filter((id) => cardKind(id) === k).length;
  assert.equal(count('nusumi'), 3);
  assert.equal(count('yakimochi'), 2);
  assert.equal(count('itazura'), 2);
  assert.equal(count('dassou'), 2);
  assert.equal(count('kunkun'), 2);
  assert.equal(count('kokan'), 2);
  assert.equal(count('kuidame'), 3);
  assert.equal(count('okawari'), 2);
});

test('createInitialState includes extraActions and reveal', () => {
  const s = createInitialState();
  assert.equal(s.extraActions, 0);
  assert.deepEqual(s.reveal, { host: false, guest: false });
});

test('shuffle is deterministic with a seeded rng and non-destructive', () => {
  const deck = buildDeck();
  let seed = 0.5;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; };
  const shuffled = shuffle(deck, rng);
  assert.equal(shuffled.length, 52);
  assert.equal(deck.length, 52); // original untouched
  assert.notDeepEqual(shuffled, deck);
});

test('createInitialState deals 5 cards to each player', () => {
  const s = createInitialState();
  assert.equal(s.hands.host.length, 5);
  assert.equal(s.hands.guest.length, 5);
  assert.equal(s.deck.length, 42);
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
  // Control the deck so the redraw is deterministic and cannot pull a drill copy.
  s.deck = ['kunkun_1', 'kunkun_2', 'okawari_1', 'okawari_2', 'kokan_1', 'kokan_2'];
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

test('needsCounter classifies expansion cards', () => {
  assert.equal(needsCounter('nusumi_1'), 'score');
  assert.equal(needsCounter('kuidame_1'), 'score');
  assert.equal(needsCounter('yakimochi_1'), 'sabotage');
  assert.equal(needsCounter('itazura_1'), 'sabotage');
  assert.equal(needsCounter('dassou_1'), null);
  assert.equal(needsCounter('kunkun_1'), null);
  assert.equal(needsCounter('kokan_1'), null);
  assert.equal(needsCounter('okawari_1'), null);
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

test('legalPlays on own main turn returns full hand', () => {
  const s = createInitialState();
  assert.equal(legalPlays(s, 'host').length, 5);
  assert.deepEqual(legalPlays(s, 'guest'), []);
});

test('legalPlays during awaiting_counter returns only valid counters for defender', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  s.hands.guest = ['kyohi_1', 'kyomu_1', 'hikoki_4', 'drill_3', 'sukima_3'];
  s = playCard(s, 'host', 'hikoki_1'); // score attack
  assert.deepEqual(legalPlays(s, 'guest'), ['kyohi_1']);
  assert.deepEqual(legalPlays(s, 'host'), []);
});

// --- Battle log tests ---

test('resolveEffect hikoki appends a log entry containing ヒコーキ耳', () => {
  const s = handWith(createInitialState(), 'host', 'hikoki_1');
  const before = s.log.length;
  const next = resolveEffect(s, 'host', 'hikoki_1');
  assert.equal(next.log.length, before + 1);
  assert.ok(next.log[next.log.length - 1].includes('ヒコーキ耳'));
});

test('applyCounter nullify path appends a log entry containing 無効化', () => {
  let s = createInitialState();
  s.hands.host[0] = 'hikoki_1';
  s.hands.guest[0] = 'kyohi_1';
  s = playCard(s, 'host', 'hikoki_1');
  const before = s.log.length;
  s = applyCounter(s, 'guest', 'kyohi_1');
  assert.ok(s.log.length > before);
  assert.ok(s.log.some((line) => line.includes('無効化')));
});

test('setLabels changes the player names used in log lines', () => {
  setLabels('プレイヤー1', 'プレイヤー2');
  const s = handWith(createInitialState(), 'host', 'hikoki_1');
  const next = resolveEffect(s, 'host', 'hikoki_1');
  assert.ok(next.log[next.log.length - 1].includes('プレイヤー1'));
  assert.ok(next.log[next.log.length - 1].includes('スキ'));
  setLabels('あなた', 'あいて'); // reset for other tests
});

test('nusumi steals 1 (self +1, opp -1)', () => {
  const s = handWith(createInitialState(), 'host', 'nusumi_1');
  s.scores.guest = 5;
  const next = resolveEffect(s, 'host', 'nusumi_1');
  assert.equal(next.scores.host, 1);
  assert.equal(next.scores.guest, 4);
});

test('nusumi opp reduction clamps at 0 and is blocked by opp sukima (self +1 still applies)', () => {
  const s = handWith(createInitialState(), 'host', 'nusumi_1');
  s.scores.guest = 0;
  const a = resolveEffect(s, 'host', 'nusumi_1');
  assert.equal(a.scores.guest, 0); // clamped
  assert.equal(a.scores.host, 1);
  const s2 = handWith(createInitialState(), 'host', 'nusumi_1');
  s2.scores.guest = 5; s2.field.guest.push('sukima_1');
  const b = resolveEffect(s2, 'host', 'nusumi_1');
  assert.equal(b.scores.guest, 5); // protected
  assert.equal(b.scores.host, 1);  // self still gains
});

test('yakimochi reduces opp by 2, clamps, blocked by sukima', () => {
  const s = handWith(createInitialState(), 'host', 'yakimochi_1');
  s.scores.guest = 5;
  assert.equal(resolveEffect(s, 'host', 'yakimochi_1').scores.guest, 3);
  const s0 = handWith(createInitialState(), 'host', 'yakimochi_1');
  s0.scores.guest = 1;
  assert.equal(resolveEffect(s0, 'host', 'yakimochi_1').scores.guest, 0);
  const sk = handWith(createInitialState(), 'host', 'yakimochi_1');
  sk.scores.guest = 5; sk.field.guest.push('sukima_1');
  assert.equal(resolveEffect(sk, 'host', 'yakimochi_1').scores.guest, 5);
});

test('kuidame scores hand size after playing, max 4', () => {
  const s = createInitialState();
  s.hands.host = ['kuidame_1', 'hikoki_2', 'hikoki_3']; // after play: 2 cards left
  const next = resolveEffect(s, 'host', 'kuidame_1');
  assert.equal(next.scores.host, 2);
  const big = createInitialState();
  big.hands.host = ['kuidame_1', 'hikoki_2', 'hikoki_3', 'hikoki_4', 'hikoki_5', 'hikoki_6']; // 5 left -> capped 4
  assert.equal(resolveEffect(big, 'host', 'kuidame_1').scores.host, 4);
});

test('itazura discards up to 2 random opponent cards, blocked by sukima', () => {
  const s = createInitialState();
  s.hands.host = ['itazura_1'];
  s.hands.guest = ['hikoki_2', 'hikoki_3', 'hikoki_4'];
  const next = resolveEffect(s, 'host', 'itazura_1', {}, () => 0);
  assert.equal(next.hands.guest.length, 1);
  const sk = createInitialState();
  sk.hands.host = ['itazura_1']; sk.hands.guest = ['hikoki_2', 'hikoki_3'];
  sk.field.guest.push('sukima_1');
  assert.equal(resolveEffect(sk, 'host', 'itazura_1', {}, () => 0).hands.guest.length, 2);
});

test('dassou discards whole hand and draws 5', () => {
  const s = createInitialState();
  s.hands.host = ['dassou_1', 'hikoki_2', 'hikoki_3'];
  // Control the deck so the redraw is deterministic and cannot pull the other
  // dassou copy (or dassou_1 if the random deal left it in the deck).
  s.deck = ['kunkun_1', 'kunkun_2', 'okawari_1', 'okawari_2', 'kokan_1', 'kokan_2'];
  const next = resolveEffect(s, 'host', 'dassou_1');
  assert.equal(next.hands.host.length, 5);
  assert.ok(!next.hands.host.includes('dassou_1'));
});

test('kokan swaps one random card each way and sets nothing when a hand is empty', () => {
  const s = createInitialState();
  s.hands.host = ['kokan_1', 'hikoki_2'];
  s.hands.guest = ['hesoten_2'];
  const next = resolveEffect(s, 'host', 'kokan_1', {}, () => 0);
  assert.equal(next.hands.host.length, 1); // played kokan(-1), gave 1, received 1 => 1
  assert.equal(next.hands.guest.length, 1);
  assert.ok(next.hands.host.includes('hesoten_2'));
});

test('kunkun sets reveal flag and draws 1', () => {
  const s = createInitialState();
  s.hands.host = ['kunkun_1'];
  const before = s.hands.host.length;
  const next = resolveEffect(s, 'host', 'kunkun_1');
  assert.equal(next.reveal.host, true);
  assert.equal(next.hands.host.length, before); // -1 played +1 drawn
});

test('endTurn consuming a skip appends a log entry containing 1回休み', () => {
  let s = createInitialState();
  s.skipNext.guest = true;
  const before = s.log.length;
  s = endTurn(s);
  assert.ok(s.log.length > before);
  assert.ok(s.log.some((line) => line.includes('1回休み')));
});

test('okawari increments extraActions', () => {
  const s = handWith(createInitialState(), 'host', 'okawari_1');
  const next = resolveEffect(s, 'host', 'okawari_1');
  assert.equal(next.extraActions, 1);
});

test('consumeExtraAction decrements, not below 0', () => {
  const s = createInitialState();
  s.extraActions = 2;
  assert.equal(consumeExtraAction(s).extraActions, 1);
  const z = createInitialState();
  assert.equal(consumeExtraAction(z).extraActions, 0);
});

test('endTurn clears reveal for the player whose turn begins', () => {
  let s = createInitialState(); // turn host
  s.reveal.host = true;
  s = endTurn(s); // host ends -> guest turn; host reveal persists through guest turn
  assert.equal(s.reveal.host, true);
  s = endTurn(s); // guest ends -> host turn begins -> clear host reveal
  assert.equal(s.reveal.host, false);
});
