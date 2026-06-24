# 柴犬カードゲーム v4 演出・横画面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 横画面（半強制＋最適化）、しっぽクジ先攻決定、カードバトル演出、派手な勝敗演出、3モードの「もう一回」再戦を追加する。

**Architecture:** 演出は新規 `src/effects.js`（DOM操作のみ、ゲーム状態を持たない純UI）と `style.css` のアニメに集約。`src/game-rules.js` は先攻指定の引数追加のみ。`src/main.js` がフロー（モード選択→しっぽクジ→対戦→バトル演出→勝敗演出→結果→再戦）を統合。

**Tech Stack:** Vanilla JS (ES Modules), CSS @keyframes/@media(orientation), Node `node:test`, Firebase (online rematch)。

## Global Constraints

- 演出は表示層に閉じる。`src/game-rules.js` の判定ロジックは変更しない（唯一の例外: `createInitialState` に先攻指定引数を追加、デフォルト 'host' で既存テスト不変）
- 外部ライブラリ追加なし（CSS/JS自前）。効果音なし
- 既存の59テストは常に緑
- 既存3モード（CPU `onPlayCard/cpuTurn/finishCpuTurn`、パス&プレイ `onPlayCardPass/renderPass/afterActionPass`、オンライン `onPlayCardOnline/renderOnline/afterCounter`）の進行を壊さない
- 横画面の強制は「ベストエフォート（fullscreen + orientation.lock、失敗は握りつぶす）＋縦のとき回転案内オーバーレイ」。iOSでlockが効かなくても破綻しない
- 先攻はしっぽクジでランダム（50/50）。プレイヤー表記は CPU=あなた/CPU、パス&プレイ=プレイヤー1/2、オンライン=あなた/あいて
- カードバトル演出は約0.7秒・タップでスキップ可
- 演出関数は `src/effects.js` にまとめ、`main.js` から呼ぶ

ファイル構成（新規/変更）:
- 新規 `src/effects.js` — requestLandscape, initOrientationGuard, showLottery, playCardBattle, showWinCelebration
- 変更 `index.html` — 回転案内オーバーレイ、しっぽクジ画面、バトル演出レイヤ、紙吹雪コンテナ、結果画面に「もう一回」ボタン
- 変更 `style.css` — 横画面レイアウト、回転案内、各アニメ
- 変更 `src/game-rules.js` — createInitialState 先攻引数
- 変更 `src/main.js` — フロー統合（currentMode 管理、しっぽクジ→対戦、バトル演出フック、勝敗演出、再戦）
- 変更 `src/online.js` — rematch フラグ

---

### Task 1: createInitialState に先攻指定を追加

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Produces: `createInitialState(rng = Math.random, first = 'host')` — `turn` を `first` に設定。デフォルト 'host' で既存挙動不変

- [ ] **Step 1: 失敗するテストを書く**

```javascript
test('createInitialState honors the first-player argument', () => {
  assert.equal(createInitialState(Math.random).turn, 'host');           // default
  assert.equal(createInitialState(Math.random, 'guest').turn, 'guest'); // explicit
  assert.equal(createInitialState(Math.random, 'host').turn, 'host');
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL（2番目で turn が host のまま）

- [ ] **Step 3: 実装** (`src/game-rules.js`)

`createInitialState` のシグネチャと turn 設定を変更:

```javascript
export function createInitialState(rng = Math.random, first = 'host') {
  const deck = shuffle(buildDeck(), rng);
  const hands = { host: deck.splice(0, 5), guest: deck.splice(0, 5) };
  return {
    deck, discard: [],
    hands, field: { host: [], guest: [] },
    scores: { host: 0, guest: 0 },
    turn: first, phase: 'main',
    pending: null, winner: null,
    skipNext: { host: false, guest: false },
    extraActions: 0,
    reveal: { host: false, guest: false },
    log: [],
  };
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `npm test`
Expected: PASS（既存テストも緑）

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: createInitialState accepts first-player argument"
```

---

### Task 2: 横画面の（半）強制 — effects.js 雛形 + 回転案内オーバーレイ

**Files:**
- Create: `src/effects.js`
- Modify: `index.html`（回転案内オーバーレイ要素）
- Modify: `style.css`（オーバーレイ）
- Modify: `src/main.js`（起動時に initOrientationGuard と最初のタップで requestLandscape）

**Interfaces:**
- Produces:
  - `requestLandscape(): void` — `requestFullscreen()` と `screen.orientation.lock('landscape')` をベストエフォートで試行（例外は握りつぶす）
  - `initOrientationGuard(): void` — 縦向きのとき `#orient-overlay` を表示、横向きで隠す。`orientationchange`/`resize` と matchMedia で更新

- [ ] **Step 1: index.html に回転案内オーバーレイを追加**

`<div id="modal-root"></div>` の後に追加:

```html
    <div id="orient-overlay" class="orient-overlay hidden">
      <div class="orient-msg">📱↻<br>横にしてください</div>
    </div>
```

- [ ] **Step 2: src/effects.js を作成**

```javascript
// 純UI演出モジュール（DOM操作のみ、ゲーム状態を持たない）

export function requestLandscape() {
  const el = document.documentElement;
  try { if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

export function initOrientationGuard() {
  const overlay = document.getElementById('orient-overlay');
  const update = () => {
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    overlay.classList.toggle('hidden', !portrait);
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}
```

- [ ] **Step 3: style.css に回転案内のスタイルを追加**

```css
.orient-overlay { position: fixed; inset: 0; background: #3e2723; color: #fff;
  display: flex; align-items: center; justify-content: center; z-index: 100; }
.orient-overlay.hidden { display: none; }
.orient-msg { font-size: 1.6rem; text-align: center; line-height: 1.8; }
```

- [ ] **Step 4: main.js で初期化と初回タップのロック要求**

`src/main.js` の import に effects を追加:

```javascript
import { requestLandscape, initOrientationGuard } from './effects.js';
```

末尾の起動部（`wireMenu(); wireOnline(); wirePass(); showScreen('top');`）を更新:

```javascript
wireMenu();
wireOnline();
wirePass();
initOrientationGuard();
// 最初のユーザー操作で全画面＋横ロックをベストエフォート
document.body.addEventListener('pointerdown', function once() {
  requestLandscape();
  document.body.removeEventListener('pointerdown', once);
}, { once: true });
showScreen('top');
```

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

`preview_resize` で縦（375x812）にすると回転案内が出る、横（812x375）にすると消える、を確認。

- [ ] **Step 6: コミット**

```bash
git add src/effects.js index.html style.css src/main.js
git commit -m "feat: orientation guard overlay and landscape lock best-effort"
```

---

### Task 3: 横画面レイアウト最適化（CSS）

**Files:**
- Modify: `style.css`

**Interfaces:**
- Consumes: 既存DOM（#status, #scoreboard, #opp-field, #my-field, #hand, #log）
- Produces: 横画面（landscape）で縦スクロール無しに収まる対戦レイアウト

- [ ] **Step 1: style.css に横画面レイアウトを追加**

既存の `[data-screen="game"]` 周りに、landscape 向けの調整を追加（既存 portrait 規則の後に置き、landscape時に上書き）:

```css
@media (orientation: landscape) {
  #app { max-width: none; padding: 6px 12px; height: 100vh; }
  [data-screen="game"] { gap: 4px; }
  .status { font-size: .8rem; padding: 4px 8px; }
  #scoreboard { font-size: .95rem; }
  /* fields as thin horizontal strips */
  .field { min-height: 0; gap: 4px; }
  #opp-field, #my-field { max-height: 30vh; overflow: hidden; }
  /* hand: single row using the width */
  .hand { gap: 8px; padding: 4px 0; }
  .card { flex: 0 0 84px; }
  .card.text-card { height: 116px; }
  /* compact log to a thin strip */
  .log { height: 40px; }
}
```

- [ ] **Step 2: ブラウザで確認（コントローラ実施）**

横（例 812x375 / 844x390）でCPU戦の盤面が縦スクロール無しで収まり、手札が横一列で読める大きさになっていることをスクリーンショットで確認。縦に戻すと回転案内が出る（Task 2）。

- [ ] **Step 3: コミット**

```bash
git add style.css
git commit -m "style: landscape-optimized game layout"
```

---

### Task 4: しっぽクジ（先攻決定）画面

**Files:**
- Modify: `index.html`（lottery 画面）
- Modify: `src/effects.js`（showLottery）
- Modify: `style.css`（しっぽアニメ）
- Modify: `src/main.js`（各モード開始でしっぽクジ→先攻決定→対戦）

**Interfaces:**
- Produces:
  - `showLottery(labels, opts, onResult)` — `labels = { host, guest }` 表示名。`opts = { forced }`（'host'|'guest'|null。online で結果を固定したいとき）。「クジを引く」ボタン→しっぽが回り→`forced` があればその役、無ければランダムに勝者(role)を決め、結果表示後 `onResult(winnerRole)` を呼ぶ
- Consumes: showScreen（ui.js）— main.js 側が画面遷移

- [ ] **Step 1: index.html に lottery 画面を追加**

`data-screen="top"` セクションの後に追加:

```html
    <section data-screen="lottery" class="screen hidden">
      <h2 id="lottery-title">先攻を決めよう</h2>
      <div id="lottery-tails" class="lottery-tails">
        <div class="tail" data-side="host">🐕<span class="tail-name"></span></div>
        <div class="tail" data-side="guest">🐕<span class="tail-name"></span></div>
      </div>
      <button id="btn-draw">クジを引く</button>
      <div id="lottery-result" class="lottery-result"></div>
    </section>
```

- [ ] **Step 2: src/effects.js に showLottery を追加**

```javascript
export function showLottery(labels, opts, onResult) {
  const forced = opts && opts.forced;
  const title = document.getElementById('lottery-title');
  const result = document.getElementById('lottery-result');
  const btn = document.getElementById('btn-draw');
  const tails = document.querySelectorAll('#lottery-tails .tail');
  title.textContent = '先攻を決めよう';
  result.textContent = '';
  tails.forEach((t) => {
    t.classList.remove('curl');
    t.querySelector('.tail-name').textContent = labels[t.dataset.side];
  });
  btn.disabled = false;
  btn.onclick = () => {
    btn.disabled = true;
    tails.forEach((t) => t.classList.add('spin'));
    const winner = forced || (Math.random() < 0.5 ? 'host' : 'guest');
    setTimeout(() => {
      tails.forEach((t) => {
        t.classList.remove('spin');
        if (t.dataset.side === winner) t.classList.add('curl');
      });
      result.textContent = `${labels[winner]}の先攻！`;
      setTimeout(() => onResult(winner), 900);
    }, 1100);
  };
}
```

- [ ] **Step 3: style.css にしっぽアニメを追加**

```css
.lottery-tails { display: flex; gap: 40px; font-size: 3rem; }
.lottery-tails .tail { display: flex; flex-direction: column; align-items: center; }
.lottery-tails .tail-name { font-size: 1rem; margin-top: 6px; }
.lottery-tails .tail.spin { animation: tailspin .5s linear infinite; }
.lottery-tails .tail.curl { transform: scale(1.4) rotate(-20deg); transition: transform .3s; }
@keyframes tailspin { from { transform: rotate(-15deg); } 50% { transform: rotate(15deg); } to { transform: rotate(-15deg); } }
.lottery-result { font-size: 1.3rem; font-weight: bold; min-height: 1.6em; margin-top: 10px; color: #c2185b; }
```

- [ ] **Step 4: main.js — 各モード開始でしっぽクジを挟む**

import に showLottery を追加。`currentMode` を持たせる:

```javascript
import { requestLandscape, initOrientationGuard, showLottery } from './effects.js';
let currentMode = null; // 'cpu' | 'pass' | 'online'
```

CPU開始を書き換え（`startCpuGame`）:

```javascript
function startCpuGame() {
  currentMode = 'cpu';
  setLabels('あなた', 'あいて');
  showScreen('lottery');
  showLottery({ host: 'あなた', guest: 'CPU' }, {}, (winner) => {
    state = createInitialState(Math.random, winner);
    showScreen('game');
    refresh();
    if (!state.winner && state.turn === CPU) cpuTurn();
  });
}
```

パス&プレイ開始を書き換え（`startPassGame`）:

```javascript
function startPassGame() {
  currentMode = 'pass';
  setLabels('プレイヤー1', 'プレイヤー2');
  showScreen('lottery');
  showLottery({ host: 'プレイヤー1', guest: 'プレイヤー2' }, {}, (winner) => {
    state = createInitialState(Math.random, winner);
    holder = winner;
    showScreen('game');
    showHandoff(P_LABEL[winner], renderPass);
  });
}
```

（オンラインのしっぽクジは Task 8 で扱う。）

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

CPU戦・パス&プレイで、開始時にしっぽクジ画面が出て「クジを引く」で先攻がランダムに決まり、対戦が始まる（CPUが先攻ならCPUが先に動く／パスは先攻側に受け渡し）ことを確認。複数回引いて host/guest 両方が出ることを確認。

- [ ] **Step 6: コミット**

```bash
git add index.html src/effects.js style.css src/main.js
git commit -m "feat: tail-lottery first-player selection (CPU and pass-and-play)"
```

---

### Task 5: カードバトル演出

**Files:**
- Modify: `index.html`（バトル演出レイヤ）
- Modify: `src/effects.js`（playCardBattle）
- Modify: `style.css`（バトルアニメ）
- Modify: `src/main.js`（各プレイ確定時にバトル演出を挟む）

**Interfaces:**
- Produces:
  - `playCardBattle(cardName, effectText, onDone)` — 中央にカード名＋効果を一瞬大きく表示しフラッシュ、約0.7秒後 `onDone()`。画面タップでスキップ（即 onDone）。多重起動しないようガード
- Consumes: なし

- [ ] **Step 1: index.html にバトル演出レイヤを追加**

回転案内オーバーレイの後に追加:

```html
    <div id="battle-layer" class="battle-layer hidden">
      <div class="battle-card"><div class="battle-name"></div><div class="battle-eff"></div></div>
      <div class="battle-flash"></div>
    </div>
```

- [ ] **Step 2: src/effects.js に playCardBattle を追加**

```javascript
let battleBusy = false;
export function playCardBattle(cardName, effectText, onDone) {
  if (battleBusy) { onDone(); return; }
  battleBusy = true;
  const layer = document.getElementById('battle-layer');
  layer.querySelector('.battle-name').textContent = cardName;
  layer.querySelector('.battle-eff').textContent = effectText || '';
  layer.classList.remove('hidden');
  layer.classList.add('run');
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    layer.classList.add('hidden'); layer.classList.remove('run');
    layer.removeEventListener('pointerdown', finish);
    battleBusy = false;
    onDone();
  };
  layer.addEventListener('pointerdown', finish);
  setTimeout(finish, 700);
}
```

- [ ] **Step 3: style.css にバトルアニメを追加**

```css
.battle-layer { position: fixed; inset: 0; z-index: 80; display: flex;
  align-items: center; justify-content: center; pointer-events: auto; }
.battle-layer.hidden { display: none; }
.battle-card { background: #fff; border-radius: 14px; padding: 18px 26px; text-align: center;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); animation: battlepop .7s ease-out; }
.battle-name { font-size: 1.4rem; font-weight: bold; }
.battle-eff { font-size: 1rem; color: #c2185b; margin-top: 6px; }
.battle-flash { position: absolute; inset: 0; background: radial-gradient(circle, rgba(255,255,255,.85), transparent 60%);
  opacity: 0; animation: flash .7s ease-out; pointer-events: none; }
@keyframes battlepop { 0% { transform: scale(.3); opacity: 0; } 30% { transform: scale(1.15); opacity: 1; }
  70% { transform: scale(1); } 100% { transform: scale(1); opacity: 1; } }
@keyframes flash { 0% { opacity: 0; } 25% { opacity: .9; } 100% { opacity: 0; } }
```

- [ ] **Step 4: main.js — プレイ確定時にバトル演出を挟む**

import に playCardBattle と（既に import 済みの）CARD_TYPES/cardKind/effectTextFor を使う。演出は「カードを出した直後・盤面再描画の前」に挟むのが自然。各モードの「カードを出して状態を進める」関数の冒頭で、出したカードの名前と効果を演出してから処理を続ける。最小侵襲のため、各 onPlayCard 系の先頭で演出→コールバックで本処理、という形にする。CPU戦の人間プレイを例に:

`onPlayCard(cardId)` を演出対応に:

```javascript
function onPlayCard(cardId) {
  if (state.turn !== HUMAN || state.phase !== 'main') return;
  if (!legalPlays(state, HUMAN).includes(cardId)) return;
  const def = CARD_TYPES[cardKind(cardId)];
  playCardBattle(def.name, effectTextFor(cardId), () => resolveHumanPlay(cardId));
}

function resolveHumanPlay(cardId) {
  let opts = {};
  if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
  state = playCard(state, HUMAN, cardId, opts);
  if (state.phase === 'awaiting_counter') {
    const cpuCounter = chooseCounter(state, CPU, difficulty);
    state = applyCounter(state, CPU, cpuCounter);
  }
  if (!state.winner && state.turn === HUMAN && state.extraActions > 0) {
    state = consumeExtraAction(state); refresh(); return;
  }
  if (!state.winner) state = endTurn(state);
  refresh();
  if (!state.winner) cpuTurn();
}
```

同様に、CPUの手（`cpuTurn` 内で chooseMain 後）・パス&プレイ（`onPlayCardPass`）・オンライン（`onPlayCardOnline`）でも、プレイ確定時に `playCardBattle(def.name, effectTextFor(cardId), () => <本処理>)` で包む。CPUの演出は自動進行の中で `playCardBattle` を挟み、onDone で従来処理を続ける。各関数の本処理を上記のように分離して演出から呼ぶ。

注意: 演出はあくまで表示。state 更新ロジックは従来どおり onDone 内で実行する。多重防止は effects 側 `battleBusy` で担保。

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

CPU戦でカードを出すと中央に演出（カード名＋効果＋フラッシュ）が出て約0.7秒で盤面に戻る、タップでスキップできる、CPUの手番でも演出が出る、ゲーム進行が壊れていないことを確認。

- [ ] **Step 6: コミット**

```bash
git add index.html src/effects.js style.css src/main.js
git commit -m "feat: card battle effect on play (all modes)"
```

---

### Task 6: 勝敗の派手な演出（紙吹雪）

**Files:**
- Modify: `index.html`（紙吹雪コンテナ）
- Modify: `src/effects.js`（showWinCelebration）
- Modify: `style.css`（紙吹雪・祝勝アニメ）
- Modify: `src/main.js`（勝利時に showWinCelebration→結果画面）

**Interfaces:**
- Produces:
  - `showWinCelebration(winnerLabel, onDone)` — 紙吹雪を降らせ「{winnerLabel} の勝ち！🎉」を大きく表示し、約1.8秒後 `onDone()`（onDone で結果画面へ）

- [ ] **Step 1: index.html に紙吹雪コンテナを追加**

```html
    <div id="celebrate" class="celebrate hidden">
      <div class="celebrate-text"></div>
      <div class="confetti"></div>
    </div>
```

- [ ] **Step 2: src/effects.js に showWinCelebration を追加**

```javascript
export function showWinCelebration(winnerLabel, onDone) {
  const el = document.getElementById('celebrate');
  const conf = el.querySelector('.confetti');
  el.querySelector('.celebrate-text').textContent = `${winnerLabel} の勝ち！🎉`;
  const colors = ['#f48fb1', '#64b5f6', '#81c784', '#ffb74d', '#fff176'];
  conf.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    conf.appendChild(p);
  }
  el.classList.remove('hidden');
  setTimeout(() => { el.classList.add('hidden'); onDone(); }, 1800);
}
```

- [ ] **Step 3: style.css に祝勝・紙吹雪アニメを追加**

```css
.celebrate { position: fixed; inset: 0; z-index: 90; display: flex;
  align-items: center; justify-content: center; pointer-events: none; }
.celebrate.hidden { display: none; }
.celebrate-text { font-size: 2.2rem; font-weight: bold; color: #c2185b;
  text-shadow: 0 2px 0 #fff; animation: winpop .6s ease-out; z-index: 2; }
@keyframes winpop { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }
.confetti { position: absolute; inset: 0; overflow: hidden; }
.confetti-piece { position: absolute; top: -20px; width: 10px; height: 14px; border-radius: 2px;
  animation: fall 1.8s linear forwards; }
@keyframes fall { to { transform: translateY(110vh) rotate(720deg); } }
```

- [ ] **Step 4: main.js — 勝利時に祝勝演出を挟む**

import に showWinCelebration を追加。各モードで `showResult(...)` を呼んでいる箇所を、先に祝勝演出を挟むよう変更。勝者ラベルは視点に応じて算出。例（CPU `refresh`）:

```javascript
function refresh() {
  renderBoard(state, HUMAN, { onPlayCard });
  if (state.winner) {
    const label = state.winner === HUMAN ? 'あなた' : 'CPU';
    showWinCelebration(label, () => showResult(label));
  }
}
```

パス&プレイ `renderPass` の勝者処理:

```javascript
  if (state.winner) { const l = P_LABEL[state.winner]; showWinCelebration(l, () => showResult(l)); return; }
```

オンライン `renderOnline` の勝者処理:

```javascript
  if (state.winner) { const l = state.winner === myRole ? 'あなた' : '相手'; showWinCelebration(l, () => showResult(l)); return; }
```

（多重呼び出し防止: showWinCelebration は hidden 制御で短時間。renderが連続しても致命的でないが、必要なら effects 側に busy ガードを足してよい。最小実装では現状でよい。）

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

CPU戦を20点まで進め、勝利時に紙吹雪＋「○○の勝ち！🎉」が出てから結果画面に遷移することを確認。

- [ ] **Step 6: コミット**

```bash
git add index.html src/effects.js style.css src/main.js
git commit -m "feat: confetti win celebration"
```

---

### Task 7: 「もう一回」再戦（CPU・パス&プレイ）

**Files:**
- Modify: `index.html`（結果画面に「もう一回」ボタン）
- Modify: `src/main.js`（再戦配線）

**Interfaces:**
- Consumes: `currentMode`, `startCpuGame`, `startPassGame`
- Produces: 結果画面の `#btn-again` が currentMode に応じて再戦（CPU/パスはしっぽクジから再スタート）

- [ ] **Step 1: index.html の結果画面に「もう一回」ボタンを追加**

```html
    <section data-screen="result" class="screen hidden">
      <h2 id="result-text"></h2>
      <button id="btn-again">もう一回 🔁</button>
      <button id="btn-home">トップに戻る</button>
    </section>
```

- [ ] **Step 2: main.js で再戦を配線**

`wireMenu` に追加（btn-home は既存）:

```javascript
  document.getElementById('btn-again').onclick = () => {
    if (currentMode === 'cpu') startCpuGame();
    else if (currentMode === 'pass') startPassGame();
    else if (currentMode === 'online') requestOnlineRematch();
  };
```

（`requestOnlineRematch` は Task 8 で定義。CPU/パスは Task 4 の startCpuGame/startPassGame がしっぽクジから始まるので、押すだけで先攻決定から再戦になる。）

- [ ] **Step 3: ブラウザで確認（コントローラ実施）**

CPU戦・パス&プレイで決着後、結果画面の「もう一回 🔁」でしっぽクジから再戦が始まることを確認。「トップに戻る」も従来どおり動く。

- [ ] **Step 4: コミット**

```bash
git add index.html src/main.js
git commit -m "feat: rematch button for CPU and pass-and-play"
```

---

### Task 8: オンライン再戦の同期 + オンラインのしっぽクジ

**Files:**
- Modify: `src/online.js`（rematch フラグ、再戦時の新state書き込み）
- Modify: `src/main.js`（オンラインのしっぽクジ・rematch フロー）

**Interfaces:**
- Consumes: `subscribe`, `pushState`, `createRoom`, `joinRoom`（online.js）、`showLottery`
- Produces:
  - online.js: `setRematch(code, role)` — `rooms/{code}/rematch/{role} = true` を書く。`resetRematch(code)` — rematch をクリア。`startNewGame(code, state)` — 新 state を書き status を 'playing' に保つ
  - main.js: `requestOnlineRematch()` — 自分の rematch を true にして「相手の返事待ち…」表示。subscribe で両者 true を検知したら（host 側が）新しい対局を生成して push、rematch クリア

設計（オンラインの先攻と再戦）:
- オンラインの初回も**しっぽクジを表示**するが、先攻は部屋の state.turn に従う（演出は `forced` で結果を固定）。host が部屋作成時/開始時に先攻をランダム決定して state に反映、guest はその結果でしっぽクジ演出を見る
- 再戦: 両者が rematch=true → host が `createInitialState(Math.random, <ランダム先攻>)` を書き、rematch クリア。両端末は status playing & 新 state を受け、しっぽクジ（forced=新 state.turn）→対戦

- [ ] **Step 1: online.js に rematch 関連を追加**

```javascript
import { getDatabase, ref, set, get, onValue, child, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
// （既存 import に update があることを確認。なければ追加）

export async function setRematch(code, role) {
  await set(ref(db, `rooms/${code}/rematch/${role}`), true);
}
export async function resetRematch(code) {
  await set(ref(db, `rooms/${code}/rematch`), { host: false, guest: false });
}
export async function startNewGame(code, state) {
  await update(ref(db, `rooms/${code}`), { state, status: 'playing', rematch: { host: false, guest: false } });
}
```

- [ ] **Step 2: main.js — オンライン開始でしっぽクジ（forced）**

`startOnline(subscribe, pushState)` を、最初に playing state を受けた時しっぽクジ（forced=state.turn）を一度だけ挟むよう調整。簡潔化のため、オンラインは「初回に game 画面へ入る前にしっぽクジ（forced）を見せる」フラグ `onlineLotteryShown` を持つ:

```javascript
let onlineLotteryShown = false;
function startOnline(subscribe, pushState) {
  setLabels('あなた', 'あいて');
  currentMode = 'online';
  onlineLotteryShown = false;
  if (unsub) unsub();
  unsub = subscribe(roomCode, (room) => {
    if (room.status === 'playing' && room.state) {
      state = room.state;
      if (!onlineLotteryShown) {
        onlineLotteryShown = true;
        showScreen('lottery');
        showLottery({ host: 'あなた', guest: 'あいて' }, { forced: myRole === state.turn ? myRole : opponent(myRole) }, () => {
          showScreen('game'); renderOnline(pushState);
        });
        return;
      }
      if (document.querySelector('[data-screen="game"]').classList.contains('hidden')
          && document.querySelector('[data-screen="lottery"]').classList.contains('hidden')) {
        showScreen('game');
      }
      renderOnline(pushState);
    }
  });
}
```

注: `forced` は「先攻の役」を渡す必要がある。`state.turn` がそのまま先攻の役なので `forced: state.turn` でよい（演出のしっぽが state.turn 側で巻く）。上の三項は不要なので `{ forced: state.turn }` に簡略化してよい。

- [ ] **Step 3: main.js — requestOnlineRematch と rematch 検知**

```javascript
async function requestOnlineRematch() {
  const { setRematch } = await import('./online.js');
  document.getElementById('result-text').textContent = '相手の返事待ち…';
  await setRematch(roomCode, myRole);
}
```

`renderOnline`（または subscribe コールバック）で rematch 両者 true を検知して再戦開始。subscribe コールバック内、`room.rematch` を見て host が新対局を作る:

```javascript
    if (room.rematch && room.rematch.host && room.rematch.guest) {
      if (myRole === 'host') {
        const first = Math.random() < 0.5 ? 'host' : 'guest';
        const { startNewGame } = await import('./online.js');
        await startNewGame(roomCode, createInitialState(Math.random, first));
      }
      onlineLotteryShown = false; // 次の playing state でしっぽクジを再表示
      return;
    }
```

（subscribe コールバックを async にする。新 state 受信時に onlineLotteryShown=false なのでしっぽクジ（forced）から再開。）

- [ ] **Step 4: 2タブで動作確認（コントローラ実施・Firebase設定があれば）**

Firebase 設定がある場合のみ: 2タブで部屋作成/参加→両方しっぽクジ（同じ先攻結果）→対戦→決着→両方「もう一回」→両者同意で再戦。Firebase 未設定環境では `node --check src/main.js src/online.js` と、オンライン以外（CPU/パス）が壊れていないことを確認し、オンライン実機は利用者の Firebase 環境に委ねる。

- [ ] **Step 5: コミット**

```bash
git add src/online.js src/main.js
git commit -m "feat: online rematch sync and synced tail-lottery"
```

---

### Task 9: 統合最終確認

**Files:**
- Modify: `sw.js`（effects.js をプリキャッシュ資産に追加、VERSION を bump）

**Interfaces:**
- Consumes: なし
- Produces: 新ファイル effects.js を含む更新済み Service Worker

- [ ] **Step 1: sw.js に effects.js を追加し VERSION を上げる**

ASSETS に `'./src/effects.js'` を追加し、`const VERSION = 'v4';` に変更。

- [ ] **Step 2: 全テスト**

Run: `npm test`
Expected: 60 tests pass（Task 1 の1件増、既存59維持）

- [ ] **Step 3: ブラウザ最終確認（コントローラ実施）**

横画面でCPU→しっぽクジ→対戦（バトル演出）→20点→紙吹雪→結果→もう一回→再戦、の一連がスムーズに動く。パス&プレイも同様。縦にすると回転案内。既存機能（カウンター・おかわり・クンクン等）が壊れていない。

- [ ] **Step 4: コミット**

```bash
git add sw.js
git commit -m "chore: cache effects.js, bump SW to v4"
```

---

## 実装順序のまとめ

1. Task 1: 先攻引数（ロジック小変更・TDD）
2. Task 2–3: 横画面の強制と最適化（CSS・ブラウザ確認）
3. Task 4: しっぽクジ（CPU/パス）
4. Task 5: カードバトル演出
5. Task 6: 勝敗演出
6. Task 7–8: 再戦（CPU/パス→オンライン同期）
7. Task 9: SW更新・最終確認

Task 1 のみテスト中心。Task 2–9 はブラウザ実機（コントローラがpreviewで確認）。Task 8 のオンライン実機は Firebase 環境次第で、コードは `node --check`＋CPU/パス無破壊で担保。
</content>
