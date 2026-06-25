# 柴犬カードゲーム v5 ターンタイマー＆コンボ演出 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 人間の手番に10秒タイマー（0秒で手札ランダム自動プレイ）と、おかわり連鎖中の組み合わせに対するコンボ演出を追加する。

**Architecture:** 表示層（`src/effects.js` ＋ CSS ＋ `main.js` のフロー）に閉じる。コンボ判定は純関数 `detectCombos` として `effects.js` に置き単体テスト。タイマーは `effects.js` の `startTurnTimer/stopTurnTimer`。ゲーム判定ロジック（`game-rules.js`）は変更しない。

**Tech Stack:** Vanilla JS (ES Modules), CSS, Node `node:test`。

## Global Constraints

- ゲーム判定ロジック（`game-rules.js`）は変更しない。表示/フローのみ
- タイマーは**人間の手番のみ**（CPU `refresh` で turn===HUMAN、パス `renderPass` で turn===holder、オンライン `renderOnline` で turn===myRole、いずれも `phase==='main' && !winner`）。CPUの手番・カウンター確認は対象外
- タイマー10秒、残り3秒で点滅、0秒で `legalPlays` からランダムな合法手を1枚、通常プレイと同じ経路（バトル演出付き）で自動プレイ。ドリル自動時は `drillDiscard: []`
- おかわりで追加行動になったら都度10秒リセット（人間手番の再描画で再アーム）
- コンボは**見た目のみ**（効果は変えない）。おかわり連鎖で1ターンに複数枚出したとき成立。同一ターン中、同じコンボは1回だけ表示
- コンボ5種：引き直し(dassou→kuidame) / のぞき見(kunkun→nusumi|yakimochi|itazura) / いじわる(nusumi & yakimochi) / 甘えんぼ(amae[hikoki|hesoten|kuidame]を2枚以上) / ノンストップ(同一ターン3枚以上)
- 既存60テストは維持。既存のCPU/パス/オンライン進行・v4演出を壊さない

ファイル構成:
- `src/effects.js` — detectCombos（純関数）, showCombo, startTurnTimer, stopTurnTimer 追加
- `index.html` — #turn-timer, #combo-layer 追加
- `style.css` — タイマー/点滅/コンボのアニメ
- `src/main.js` — turnPlays追跡・recordPlay（4プレイ点）・タイマーのアーム/停止・autoPlayRandom
- `sw.js` — VERSION bump（v5）

---

### Task 1: コンボ判定の純関数 detectCombos

**Files:**
- Modify: `src/effects.js`（detectCombos を追加・エクスポート）
- Test: `test/effects.test.js`（新規）

**Interfaces:**
- Produces: `detectCombos(plays: string[]): string[]` — その順序で出した kind 列に対し、成立するコンボ名の配列を返す（順序は表に準拠）

- [ ] **Step 1: 失敗するテストを書く** (`test/effects.test.js` 新規)

```javascript
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
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/effects.test.js`
Expected: FAIL（detectCombos 未定義）

- [ ] **Step 3: detectCombos を実装** (`src/effects.js` の先頭付近に追加)

```javascript
const AMAE_KINDS = new Set(['hikoki', 'hesoten', 'kuidame']);

// plays: kinds played this turn, in order. Returns combo names that hold.
export function detectCombos(plays) {
  const set = new Set(plays);
  const combos = [];
  const di = plays.indexOf('dassou');
  const ki = plays.indexOf('kuidame');
  if (di !== -1 && ki !== -1 && di < ki) combos.push('引き直しコンボ');
  const kn = plays.indexOf('kunkun');
  if (kn !== -1 && plays.slice(kn + 1).some((k) => ['nusumi', 'yakimochi', 'itazura'].includes(k))) {
    combos.push('のぞき見コンボ');
  }
  if (set.has('nusumi') && set.has('yakimochi')) combos.push('いじわるコンボ');
  if (plays.filter((k) => AMAE_KINDS.has(k)).length >= 2) combos.push('甘えんぼコンボ');
  if (plays.length >= 3) combos.push('ノンストップコンボ');
  return combos;
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS（既存60＋新規6）

- [ ] **Step 5: コミット**

```bash
git add src/effects.js test/effects.test.js
git commit -m "feat: detectCombos pure function for combo detection"
```

---

### Task 2: コンボ演出表示と main.js のターン内記録

**Files:**
- Modify: `index.html`（#combo-layer）
- Modify: `src/effects.js`（showCombo）
- Modify: `style.css`（コンボアニメ）
- Modify: `src/main.js`（turnPlays 追跡・recordPlay・4プレイ点で呼ぶ）

**Interfaces:**
- Consumes: `detectCombos`, `cardKind`（game-rules）
- Produces:
  - `showCombo(name)`（effects.js）— 「{name}！」を約0.8秒、非ブロッキングで表示（自動で消える）
  - main.js 内 `recordPlay(actor, cardId)` — ターン内に出した kind を記録し、新規成立コンボを `showCombo` 表示。actor が前回と変われば記録をリセット

- [ ] **Step 1: index.html に combo 表示要素を追加**

`#battle-layer` の後に追加:

```html
    <div id="combo-layer" class="combo-layer hidden"><div class="combo-text"></div></div>
```

- [ ] **Step 2: effects.js に showCombo を追加**

```javascript
let comboTimer = null;
export function showCombo(name) {
  const layer = document.getElementById('combo-layer');
  layer.querySelector('.combo-text').textContent = `${name}！`;
  layer.classList.remove('hidden');
  layer.classList.remove('run');
  // restart animation
  void layer.offsetWidth;
  layer.classList.add('run');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => layer.classList.add('hidden'), 800);
}
```

- [ ] **Step 3: style.css にコンボアニメを追加**

```css
.combo-layer { position: fixed; top: 18%; left: 0; right: 0; z-index: 85;
  display: flex; justify-content: center; pointer-events: none; }
.combo-layer.hidden { display: none; }
.combo-text { font-size: 1.8rem; font-weight: bold; color: #fff;
  background: linear-gradient(90deg, #f48fb1, #ffb74d); padding: 8px 22px; border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0,0,0,.3); }
.combo-layer.run .combo-text { animation: comboin .5s ease-out; }
@keyframes comboin { 0% { transform: scale(.4) rotate(-6deg); opacity: 0; }
  60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
```

- [ ] **Step 4: main.js に recordPlay を追加し、4プレイ点で呼ぶ**

import に `detectCombos`, `showCombo` を追加（effects.js の既存 import 行へ）。module 変数と関数を追加:

```javascript
let turnPlays = [];
let comboActor = null;
const comboShown = new Set();

function recordPlay(actor, cardId) {
  if (actor !== comboActor) { turnPlays = []; comboShown.clear(); comboActor = actor; }
  turnPlays.push(cardKind(cardId));
  for (const c of detectCombos(turnPlays)) {
    if (!comboShown.has(c)) { comboShown.add(c); showCombo(c); }
  }
}
```

各プレイ点で、`state = playCard(...)` の直後に `recordPlay(<actor>, cardId)` を呼ぶ:
- CPU人間 `resolveHumanPlay(cardId)`：`state = playCard(state, HUMAN, cardId, opts);` の直後に `recordPlay(HUMAN, cardId);`
- CPU自身 `cpuTurn` の onDone：`state = playCard(state, CPU, cardId, opts);` の直後に `recordPlay(CPU, cardId);`
- パス `onPlayCardPass` の onDone：`state = playCard(state, holder, cardId, opts);` の直後に `recordPlay(holder, cardId);`
- オンライン `onPlayCardOnline` の onDone：`state = playCard(state, myRole, cardId, opts);` の直後に `recordPlay(myRole, cardId);`

（actor が変わると自動でリセットするので、endTurn 箇所の変更は不要。）

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

CPU戦で「おかわり」を引いて連続プレイし、コンボ条件を満たすと「○○コンボ！」が表示される。1枚しか出さないターンではコンボが出ない。

- [ ] **Step 6: コミット**

```bash
git add index.html src/effects.js style.css src/main.js
git commit -m "feat: combo effect display during okawari chains"
```

---

### Task 3: タイマーUI（effects.js startTurnTimer/stopTurnTimer）

**Files:**
- Modify: `index.html`（#turn-timer）
- Modify: `src/effects.js`（startTurnTimer/stopTurnTimer）
- Modify: `style.css`（タイマーバー・点滅）

**Interfaces:**
- Produces:
  - `startTurnTimer(seconds, onTimeout)`（effects.js）— カウントダウン開始。毎秒UIを更新、残り3秒で点滅、0で `stopTurnTimer()` し `onTimeout()` を1回呼ぶ。既存タイマーがあれば破棄してから開始
  - `stopTurnTimer()` — interval破棄＆タイマーUIを隠す

- [ ] **Step 1: index.html に timer 要素を追加**

game画面の `#status` の直後に追加:

```html
      <div id="turn-timer" class="turn-timer hidden"><div class="timer-bar"></div><span class="timer-num"></span></div>
```

- [ ] **Step 2: effects.js に timer 関数を追加**

```javascript
let turnTimerId = null;
export function stopTurnTimer() {
  if (turnTimerId) { clearInterval(turnTimerId); turnTimerId = null; }
  const el = document.getElementById('turn-timer');
  if (el) el.classList.add('hidden');
}
export function startTurnTimer(seconds, onTimeout) {
  stopTurnTimer();
  const el = document.getElementById('turn-timer');
  const bar = el.querySelector('.timer-bar');
  const num = el.querySelector('.timer-num');
  let remaining = seconds;
  const render = () => {
    el.classList.remove('hidden');
    num.textContent = remaining;
    bar.style.width = `${(remaining / seconds) * 100}%`;
    el.classList.toggle('warn', remaining <= 3);
  };
  render();
  turnTimerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stopTurnTimer();
      onTimeout();
      return;
    }
    render();
  }, 1000);
}
```

- [ ] **Step 3: style.css に timer スタイルを追加**

```css
.turn-timer { width: 100%; display: flex; align-items: center; gap: 8px; }
.turn-timer.hidden { display: none; }
.turn-timer .timer-bar { height: 8px; background: #81c784; border-radius: 4px; flex: 1;
  transition: width 1s linear; }
.turn-timer .timer-num { font-weight: bold; min-width: 1.4em; text-align: right; }
.turn-timer.warn .timer-bar { background: #e53935; }
.turn-timer.warn .timer-num { color: #e53935; animation: blink .5s steps(2) infinite; }
@keyframes blink { 50% { opacity: .3; } }
```

- [ ] **Step 4: 構文確認**

Run: `node --check src/effects.js`
Expected: パス。`npm test` も 66/66（Task1の6追加後）緑のまま。

- [ ] **Step 5: コミット**

```bash
git add index.html src/effects.js style.css
git commit -m "feat: turn timer UI and start/stop helpers"
```

---

### Task 4: タイマーの3モード配線と時間切れ自動プレイ

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `startTurnTimer`, `stopTurnTimer`（effects.js）, `legalPlays`（game-rules）
- Produces: 人間手番でタイマー起動、プレイ/非手番で停止、0秒で `autoPlayRandom()`

- [ ] **Step 1: import とヘルパーを追加** (`src/main.js`)

effects.js の import 行に `startTurnTimer, stopTurnTimer` を追加。module 変数とヘルパー:

```javascript
let onlinePushState = null; // startOnline で設定

function armTimer() { startTurnTimer(10, autoPlayRandom); }

function autoPlayRandom() {
  const role = currentMode === 'pass' ? holder : (currentMode === 'online' ? myRole : HUMAN);
  if (!state || state.winner || state.turn !== role || state.phase !== 'main') return;
  const plays = legalPlays(state, role);
  if (!plays.length) return;
  const cardId = plays[Math.floor(Math.random() * plays.length)];
  if (currentMode === 'cpu') onPlayCard(cardId);
  else if (currentMode === 'pass') onPlayCardPass(cardId);
  else if (currentMode === 'online') onPlayCardOnline(cardId, onlinePushState);
}
```

- [ ] **Step 2: 各モードの人間手番描画でタイマーをアーム/停止**

CPU `refresh`：

```javascript
function refresh() {
  renderBoard(state, HUMAN, { onPlayCard });
  if (state.winner) {
    stopTurnTimer();
    const label = state.winner === HUMAN ? 'あなた' : 'CPU';
    showWinCelebration(label, () => showResult(label));
    return;
  }
  if (state.turn === HUMAN && state.phase === 'main') armTimer();
  else stopTurnTimer();
}
```

パス `renderPass`：勝者処理の後、関数末尾で手番判定してアーム/停止。renderPass の最後（カウンタープロンプト分岐の後）に:

```javascript
  if (state.turn === holder && state.phase === 'main' && !state.winner) armTimer();
  else stopTurnTimer();
```

オンライン `renderOnline`：同様に、winner/awaiting_counter 分岐を通らない通常描画の最後に:

```javascript
  if (state.turn === myRole && state.phase === 'main' && !state.winner) armTimer();
  else stopTurnTimer();
```

- [ ] **Step 3: プレイ確定時にタイマーを止める**

各プレイ点の冒頭（バリデーション通過後、`playCardBattle` の前）で `stopTurnTimer()`:
- `onPlayCard(cardId)`：legalPlays チェックの後、`playCardBattle(...)` の前に `stopTurnTimer();`
- `onPlayCardPass(cardId)`：同上
- `onPlayCardOnline(cardId, pushState)`：同上。さらに `startOnline` で `onlinePushState = pushState;` を設定

- [ ] **Step 4: startOnline で onlinePushState を設定**

`startOnline(subscribe, pushState)` の冒頭で `onlinePushState = pushState;` を追加。

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

CPU戦：人間手番で10秒バーが減り、残り3秒で赤点滅、0秒で手札からランダムに1枚自動プレイされてバトル演出が出る。カードを手動で出すとタイマーが消える。おかわりで追加行動になると再び10秒。CPUの手番ではタイマーが出ない。

- [ ] **Step 6: コミット**

```bash
git add src/main.js
git commit -m "feat: 10s turn timer with auto-random-play across modes"
```

---

### Task 5: SWバージョン更新と最終確認

**Files:**
- Modify: `sw.js`（VERSION を v5 に）

**Interfaces:**
- Consumes: なし
- Produces: 更新反映用に SW バージョンを上げる

- [ ] **Step 1: sw.js の VERSION を 'v5' に変更**

`const VERSION = 'v4';` → `const VERSION = 'v5';`（ASSETS は変更なし＝新規ファイルは test/effects.test.js のみでアプリ資産ではない）

- [ ] **Step 2: 全テスト**

Run: `npm test`
Expected: 66 pass（既存60＋Task1の6）

- [ ] **Step 3: ブラウザ最終確認（コントローラ実施）**

CPU戦：タイマー（10秒・点滅・0秒自動プレイ・おかわりでリセット）、おかわり連鎖でコンボ演出、既存のしっぽクジ/バトル演出/紙吹雪/横画面が壊れていない。パス&プレイでもタイマーが手番側に出る。

- [ ] **Step 4: コミット**

```bash
git add sw.js
git commit -m "chore: bump SW to v5"
```

---

## 実装順序のまとめ

1. Task 1: detectCombos（純関数・TDD）
2. Task 2: コンボ演出＋記録配線（ブラウザ確認）
3. Task 3: タイマーUI（effects）
4. Task 4: タイマー配線＋時間切れ自動プレイ（ブラウザ確認）
5. Task 5: SW更新・最終確認

Task 1 はテスト中心、Task 2–5 はブラウザ実機（コントローラがpreviewで確認）。各タスク独立検証可能。
</content>
