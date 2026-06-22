import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES } from '../src/game-rules.js';

test('CARD_TYPES exposes the 9 card kinds', () => {
  assert.equal(Object.keys(CARD_TYPES).length, 9);
});
