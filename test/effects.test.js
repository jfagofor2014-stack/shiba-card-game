import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCombos } from '../src/effects.js';

test('引き直しコンボ: dassou before kuidame', () => {
  assert.deepEqual(detectCombos(['dassou', 'kuidame']), ['引き直しコンボ']);
  // kuidame before dassou does NOT trigger 引き直し
  assert.ok(!detectCombos(['kuidame', 'dassou']).includes('引き直しコンボ'));
});

test('のぞき見コンボ: kunkun before nusumi/yakimochi/itazura', () => {
  assert.ok(detectCombos(['kunkun', 'nusumi']).includes('のぞき見コンボ'));
  assert.ok(detectCombos(['kunkun', 'itazura']).includes('のぞき見コンボ'));
  assert.ok(!detectCombos(['nusumi', 'kunkun']).includes('のぞき見コンボ'));
});

test('いじわるコンボ: both nusumi and yakimochi', () => {
  assert.ok(detectCombos(['nusumi', 'yakimochi']).includes('いじわるコンボ'));
  assert.ok(detectCombos(['yakimochi', 'hikoki', 'nusumi']).includes('いじわるコンボ'));
});

test('甘えんぼコンボ: 2+ amae cards', () => {
  assert.ok(detectCombos(['hikoki', 'hesoten']).includes('甘えんぼコンボ'));
  assert.ok(detectCombos(['kuidame', 'hikoki']).includes('甘えんぼコンボ'));
  assert.ok(!detectCombos(['hikoki', 'nusumi']).includes('甘えんぼコンボ'));
});

test('ノンストップコンボ: 3+ cards in a turn', () => {
  assert.ok(detectCombos(['hikoki', 'nusumi', 'kunkun']).includes('ノンストップコンボ'));
  assert.ok(!detectCombos(['hikoki', 'nusumi']).includes('ノンストップコンボ'));
});

test('single card triggers no combo', () => {
  assert.deepEqual(detectCombos(['hikoki']), []);
});
