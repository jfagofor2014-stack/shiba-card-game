# 柴犬カードゲーム v2 改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の柴犬カードゲームに、遊び方ガイド・1台パス&プレイモード・「スキ」表記・バランス調整・スマホ向けレイアウト改善・手順の見やすさ改善を加える。

**Architecture:** 純粋ロジック（`src/game-rules.js`）への変更はカード枚数と表示ラベル機構のみ。表示文字列は `src/ui.js` に集約。パス&プレイは `src/main.js` に第3の制御フローとして追加。ガイドは静的画面。バランスはCPU対CPUシミュレーションで実測して確定。

**Tech Stack:** Vanilla JS (ES Modules), HTML/CSS, Node 組み込み `node:test`, 既存の `src/engine.js` `playOutGame` を使ったシミュレーション。

## Global Constraints

- 得点の表示単位は「スキ」（例: 「スキ+2」「スキを2こ獲得」「先にスキを20こ集めたら勝ち」）。内部変数名 `scores` 等は変更しない
- カード総数は **40枚** を維持
- 勝利ライン20（バランス調整で変更する場合は `addScore` 内の閾値と全表示を揃える）
- `src/game-rules.js` のゲーム判定ロジック（効果・カウンター・ターン進行）の仕組みは変えない。変えてよいのは CARD_TYPES の count と表示ラベル機構のみ
- カテゴリ色: amae=ピンク / kyohi=ブルー / mypace=グリーン / wild=オレンジ
- 既存のCPU戦・オンライン戦のフローを壊さない（`onPlayCard`/`cpuTurn`/`finishCpuTurn`/`renderOnline` 系）
- 既存テストは常に緑を保つ（`npm test`）
- パス&プレイは手札隠し（受け渡し画面）を挟む。受け渡しは「操作プレイヤーが切り替わるたび」

---

### Task 1: ゲームバランス調整（シミュレーション実測 + カード枚数変更）

**Files:**
- Create: `scripts/balance-sim.mjs`
- Modify: `src/game-rules.js`（CARD_TYPES の count）
- Test: `test/game-rules.test.js`（枚数アサーションの更新）

**Interfaces:**
- Consumes: `playOutGame`（`src/engine.js`）, `chooseMain`/`chooseCounter`（`src/ai.js`）, `buildDeck`/`cardKind`（`src/game-rules.js`）
- Produces: 新しい CARD_TYPES count（出発点。最終値はコントローラがsim結果で確定）

出発点の構成（合計40）:

| kind | 現行count | 新count |
| --- | --- | --- |
| hikoki | 6 | 8 |
| hesoten | 4 | 6 |
| kyohi | 6 | 3 |
| kyomu | 4 | 2 |
| shibakyori | 6 | 6 |
| sukima | 4 | 4 |
| drill | 4 | 4 |
| zoomies | 4 | 4 |
| kangeki | 2 | 3 |

- [ ] **Step 1: シミュレーションスクリプトを作成** (`scripts/balance-sim.mjs`)

```javascript
// CPU対CPUを多数回回してバランス統計を出す計測ツール（アプリ本体からは未参照）
// 使い方: node scripts/balance-sim.mjs [games]
import { playOutGame } from '../src/engine.js';
import { chooseMain, chooseCounter } from '../src/ai.js';

function aiController(difficulty, rng) {
  return {
    main: (state, who) => chooseMain(state, who, difficulty, rng),
    counter: (state, defender) => chooseCounter(state, defender, difficulty, rng),
  };
}

const games = Number(process.argv[2] || 500);
let decisive = 0, loserScoreSum = 0, hostWins = 0;
const MAX_TURNS = 200;

for (let g = 0; g < games; g++) {
  let seed = (g + 1) * 2654435761 % 2147483647;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const final = playOutGame(
    { host: aiController('normal', rng), guest: aiController('normal', rng) },
    rng, MAX_TURNS,
  );
  if (final.winner) {
    decisive++;
    hostWins += final.winner === 'host' ? 1 : 0;
    const loser = final.winner === 'host' ? 'guest' : 'host';
    loserScoreSum += final.scores[loser];
  }
}

console.log(`games=${games}`);
console.log(`decisive(20点決着)=${(100 * decisive / games).toFixed(1)}%`);
console.log(`平均 敗者スコア=${(loserScoreSum / Math.max(decisive, 1)).toFixed(1)}`);
console.log(`先攻(host)勝率=${(100 * hostWins / Math.max(decisive, 1)).toFixed(1)}%`);
```

- [ ] **Step 2: 出発点を適用前に現行構成で計測**

Run: `node scripts/balance-sim.mjs 500`
Expected: 現行（拒否柴6/虚無顔4）の統計が出る。決着率や敗者スコアを記録（比較用）。

- [ ] **Step 3: CARD_TYPES の count を出発点に変更** (`src/game-rules.js` 4-12行目)

```javascript
export const CARD_TYPES = {
  hikoki:   { name: 'ヒコーキ耳',       category: 'amae',      count: 8, emoji: '🐕', color: 'pink' },
  hesoten:  { name: 'へそ天',           category: 'amae',      count: 6, emoji: '🐶', color: 'pink' },
  kyohi:    { name: '拒否柴（不動柴）', category: 'kyohi',     count: 3, emoji: '🛑', color: 'blue' },
  kyomu:    { name: '虚無顔',           category: 'kyohi',     count: 2, emoji: '😶', color: 'blue' },
  shibakyori:{ name: '柴距離',          category: 'mypace',    count: 6, emoji: '↔️', color: 'green' },
  sukima:   { name: '隙間にすっぽり',   category: 'mypace',    count: 4, emoji: '📦', color: 'green' },
  drill:    { name: '柴ドリル',         category: 'wild',      count: 4, emoji: '🌀', color: 'orange' },
  zoomies:  { name: 'ズーミーズ（柴走り）', category: 'wild',  count: 4, emoji: '💨', color: 'orange' },
  kangeki:  { name: '無限換毛期',       category: 'wild',      count: 3, emoji: '🌾', color: 'orange' },
};
```

- [ ] **Step 4: 枚数テストを新構成に更新** (`test/game-rules.test.js`)

既存の「buildDeck has correct per-kind counts」テストを探し、新しい枚数に更新する:

```javascript
test('buildDeck has correct per-kind counts', () => {
  const deck = buildDeck();
  const count = (k) => deck.filter((id) => cardKind(id) === k).length;
  assert.equal(count('hikoki'), 8);
  assert.equal(count('hesoten'), 6);
  assert.equal(count('kyohi'), 3);
  assert.equal(count('kyomu'), 2);
  assert.equal(count('kangeki'), 3);
});
```

`buildDeck has exactly 40 cards` テストはそのまま（合計は40のまま）。

- [ ] **Step 5: テスト実行で緑を確認**

Run: `npm test`
Expected: 全テストPASS（合計40維持、新枚数アサーション通過）

- [ ] **Step 6: 新構成で再計測しレポート**

Run: `node scripts/balance-sim.mjs 500`
Expected: 統計を出力。**この出力を報告書に必ず貼ること**（決着率・平均敗者スコア・先攻勝率）。コントローラがこの数値で最終確定する。

- [ ] **Step 7: コミット**

```bash
git add scripts/balance-sim.mjs src/game-rules.js test/game-rules.test.js
git commit -m "balance: reduce counters, add scoring cards, add sim harness"
```

**注**: 最終のcount調整が必要な場合はコントローラが別途指示する。実装者は出発点を適用し統計を報告するところまで行う。

---

### Task 2: 「スキ」表記と表示ラベル機構

**Files:**
- Modify: `src/game-rules.js`（`label` を設定可能化、ログ文の「点」→「スキ」）
- Modify: `src/ui.js`（EFFECT_TEXT、scoreboard 文言）
- Test: `test/game-rules.test.js`（setLabels と スキ文言のテスト追加）

**Interfaces:**
- Consumes: なし
- Produces:
  - `setLabels(hostLabel: string, guestLabel: string): void` — `src/game-rules.js` がエクスポート。以後のログ生成で使うプレイヤー表示名を設定。デフォルトは host='あなた', guest='あいて'
  - ログ文・効果文の得点表現が「スキを○こ獲得」「スキ+○」になる

- [ ] **Step 1: setLabels のテストを書く** (`test/game-rules.test.js` に追記)

```javascript
import { setLabels } from '../src/game-rules.js';

test('setLabels changes the player names used in log lines', () => {
  setLabels('プレイヤー1', 'プレイヤー2');
  const s = handWith(createInitialState(), 'host', 'hikoki_1');
  const next = resolveEffect(s, 'host', 'hikoki_1');
  assert.ok(next.log[next.log.length - 1].includes('プレイヤー1'));
  assert.ok(next.log[next.log.length - 1].includes('スキ'));
  setLabels('あなた', 'あいて'); // reset for other tests
});
```

（`handWith` は既存のテストヘルパー。ファイル内で定義済み。）

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL（`setLabels` 未定義、または「スキ」を含まない）

- [ ] **Step 3: `label` を設定可能化** (`src/game-rules.js` 1行目を置換)

```javascript
let LABELS = { host: 'あなた', guest: 'あいて' };
export function setLabels(hostLabel, guestLabel) {
  LABELS = { host: hostLabel, guest: guestLabel };
}
function label(role) { return LABELS[role]; }
```

- [ ] **Step 4: ログ文の「点」を「スキ」に変更** (`src/game-rules.js` の resolveEffect 内ログ文)

各ログ push の文言を以下に変更（効果ロジックは変えない、文字列のみ）:

- hikoki: `` `${label(who)}は「${CARD_TYPES.hikoki.name}」でスキを2こ獲得` ``
- hesoten: `` `${label(who)}は「${CARD_TYPES.hesoten.name}」でスキを3こ獲得し1枚引いた` ``
- shibakyori: 基本文 `` let shibaLine = `${label(who)}は「${CARD_TYPES.shibakyori.name}」でスキを1こ獲得`; `` （後続の `'し、相手の手札を1枚捨てさせた'` 連結はそのまま）
- zoomies 成功: `` `${label(who)}は「${CARD_TYPES.zoomies.name}」でスキを5こ獲得！` ``
- zoomies 失敗・drill・kangeki・sukima・applyCounter無効化・endTurn 1回休み: 得点に触れない文言はそのまま（変更不要）

- [ ] **Step 5: ui.js の効果テキストとスコアボードを変更** (`src/ui.js`)

EFFECT_TEXT を置換:

```javascript
const EFFECT_TEXT = {
  hikoki: 'スキ+2', hesoten: 'スキ+3 & 1枚引く', kyohi: '相手の得点を無効化',
  kyomu: '妨害を無効化', shibakyori: 'スキ+1 & 相手手札1枚捨て',
  sukima: '次の自分の番まで効果を受けない', drill: '捨てた枚数+1引く',
  zoomies: '甘えならスキ+5 / 外れで終了', kangeki: '相手1回休み',
};
```

scoreboard 行を置換（renderBoard 内）:

```javascript
  document.getElementById('scoreboard').textContent =
    `あなた スキ${state.scores[viewer]} - スキ${state.scores[opp]} あいて`;
```

- [ ] **Step 6: テスト実行で緑を確認**

Run: `npm test`
Expected: 全テストPASS（setLabels テスト含む。既存テストがログ文の「○点獲得」を文字列照合していないこと、もし照合していれば「スキを○こ獲得」に更新）

- [ ] **Step 7: コミット**

```bash
git add src/game-rules.js src/ui.js test/game-rules.test.js
git commit -m "feat: スキ terminology and configurable player labels"
```

---

### Task 3: ステータスバー（手番表示・直前の出来事・手数番号・カウンター文脈）

**Files:**
- Modify: `index.html`（game画面に `#status` を追加）
- Modify: `src/ui.js`（renderBoard にステータス描画、ログ手数番号、showCounterPrompt の文脈強化）

**Interfaces:**
- Consumes: state（viewer 視点）
- Produces:
  - `renderBoard` がステータスバー（手番＋直前の出来事）を描画し、ログに手数番号を付与
  - `showCounterPrompt(actorLabel, cardName, effectText, onYes, onNo)` — 引数が増える（誰が・何を・効果）

- [ ] **Step 1: index.html の game画面に status 要素を追加** (`index.html`)

`<section data-screen="game">` の先頭（`#scoreboard` の前）に追加:

```html
      <div id="status" class="status"></div>
```

- [ ] **Step 2: renderBoard にステータスと手数番号を実装** (`src/ui.js` renderBoard)

scoreboard 設定の直後に追加し、log 描画を手数番号付きに置換:

```javascript
  // status bar: turn indicator (viewer-relative) + latest event
  const status = document.getElementById('status');
  if (state.winner) {
    status.textContent = '';
    status.className = 'status';
  } else {
    const myTurn = state.turn === viewer;
    const last = state.log.length ? state.log[state.log.length - 1] : '';
    status.textContent = (myTurn ? '🐕 あなたの番です' : '⏳ あいての番…') + (last ? `　／　${last}` : '');
    status.className = 'status ' + (myTurn ? 'my-turn' : 'opp-turn');
  }
```

log 描画（renderBoard 末尾）を手数番号付きに置換:

```javascript
  const log = document.getElementById('log');
  const total = state.log.length;
  const shown = state.log.slice(-6);
  const startNo = total - shown.length + 1;
  log.innerHTML = shown.map((l, i) => `<div>${startNo + i}. ${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;
```

- [ ] **Step 3: showCounterPrompt に文脈を追加** (`src/ui.js`)

```javascript
export function showCounterPrompt(actorLabel, cardName, effectText, onYes, onNo) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal"><div class="box">
      <p>${actorLabel}が <strong>${cardName}</strong> を出しました<br>（${effectText}）<br>無効化しますか?</p>
      <button id="cnt-yes">はい</button>
      <button id="cnt-no">いいえ</button>
    </div></div>`;
  document.getElementById('cnt-yes').onclick = () => { root.innerHTML = ''; onYes(); };
  document.getElementById('cnt-no').onclick = () => { root.innerHTML = ''; onNo(); };
}
```

- [ ] **Step 4: showCounterPrompt の呼び出し元を更新** (`src/main.js`)

EFFECT_TEXT は ui.js 内なので、main.js では効果文を持たない。`showCounterPrompt` に渡す effectText は ui.js がカード種別から引けるよう、ui.js に小ヘルパーを足してエクスポートし main.js から使う。`src/ui.js` に追加:

```javascript
export function effectTextFor(cardId) {
  return EFFECT_TEXT[cardKind(cardId)];
}
```

`src/main.js` の import に `effectTextFor` を追加し、CPU戦の showCounterPrompt 呼び出し（cpuTurn 内）を更新:

```javascript
      const def = CARD_TYPES[cardKind(state.pending.cardId)];
      showCounterPrompt(
        'あいて', def.name, effectTextFor(state.pending.cardId),
        () => { state = applyCounter(state, HUMAN, humanCounters[0]); finishCpuTurn(); },
        () => { state = applyCounter(state, HUMAN, null); finishCpuTurn(); },
      );
```

オンライン戦の showCounterPrompt 呼び出し（renderOnline 内）も更新:

```javascript
      const def = CARD_TYPES[cardKind(state.pending.cardId)];
      showCounterPrompt(
        'あいて', def.name, effectTextFor(state.pending.cardId),
        async () => { state = applyCounter(state, myRole, counters[0]); await afterCounter(pushState); resolvingCounter = false; },
        async () => { state = applyCounter(state, myRole, null); await afterCounter(pushState); resolvingCounter = false; },
      );
```

`import { showScreen, renderBoard, showCounterPrompt, showResult, effectTextFor } from './ui.js';` に更新。

- [ ] **Step 5: ブラウザで確認（コントローラ実施）**

ローカルサーバ起動 → CPU戦で、上部に手番表示と直前の出来事が出る／ログに手数番号が付く／カウンター確認に「あいてが◯◯を出しました（効果）」と文脈が出る、を目視。

- [ ] **Step 6: コミット**

```bash
git add index.html src/ui.js src/main.js
git commit -m "feat: status bar, numbered log, contextual counter prompt"
```

---

### Task 4: レイアウト改善（スマホ縦1画面・カード拡大・ログ縮小）

**Files:**
- Modify: `style.css`

**Interfaces:**
- Consumes: 既存のDOM構造（#status, #scoreboard, #opp-field, #my-field, #hand, #log）
- Produces: スマホ縦1画面に収まるレイアウト

- [ ] **Step 1: style.css をスマホ縦1画面向けに調整** (`style.css`)

以下の方針で既存ルールを置換・追加（既存の色変数 `--amae` 等は維持）:
- `#app` をビューポート高に収め、要素を縦に詰める（`min-height: 100vh; display:flex; flex-direction:column;` のgameレイアウトはJSではなくCSSで）
- `.card` を拡大（flex-basis を 84px→約 96px、height 120px→約 140px、font-size 0.7rem→0.8rem）
- `.field` の min-height を縮小（60px→44px）
- `#log` を小さく（height 100px→64px、font-size 0.7rem）
- `.status` を追加（目立つ手番バー）

具体CSS（該当箇所を置換、無い場合は追記）:

```css
.status { width: 100%; padding: 8px 10px; border-radius: 10px; font-weight: bold;
  font-size: .95rem; text-align: center; }
.status.my-turn { background: #ffe0ec; color: #c2185b; }
.status.opp-turn { background: #e3f2fd; color: #1565c0; }

[data-screen="game"] { gap: 8px; justify-content: flex-start; padding-top: 8px; }

#scoreboard { width: 100%; display: flex; justify-content: space-around;
  font-size: 1.1rem; font-weight: bold; }

.field { width: 100%; min-height: 44px; display: flex; gap: 6px; flex-wrap: wrap; }

.hand { width: 100%; display: flex; gap: 6px; overflow-x: auto; padding: 6px 0; }
.card { flex: 0 0 96px; height: 140px; border-radius: 10px; padding: 6px;
  background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.2); display: flex; flex-direction: column;
  font-size: .8rem; border-top: 6px solid #ccc; }
.card .emoji { font-size: 1.9rem; text-align: center; }
.card .name { font-weight: bold; font-size: .82rem; }
.card .effect { font-size: .72rem; }

.log { width: 100%; height: 64px; overflow-y: auto; font-size: .72rem;
  background: #fff; border-radius: 8px; padding: 6px; }
```

（`.card.amae`/`.kyohi`/`.mypace`/`.wild` の border-top-color ルールは既存のまま維持すること。）

- [ ] **Step 2: ブラウザで確認（コントローラ実施）**

`preview_resize` でスマホ幅（例 390x844）にして、CPU戦の盤面が縦スクロール無しで1画面に収まる／カードが読める大きさ／ログが小さくまとまっている、をスクリーンショットで確認。

- [ ] **Step 3: コミット**

```bash
git add style.css
git commit -m "style: phone-first one-screen layout, bigger cards, compact log"
```

---

### Task 5: 遊び方ガイド画面

**Files:**
- Modify: `index.html`（トップにボタン、guide画面を追加）
- Modify: `src/main.js`（ボタン配線）
- Modify: `style.css`（ガイドの体裁、最小限）

**Interfaces:**
- Consumes: 既存 `showScreen`
- Produces: `data-screen="guide"` 画面と「📖 遊び方」ボタン

- [ ] **Step 1: index.html にボタンとガイド画面を追加** (`index.html`)

トップ画面 `data-screen="top"` のボタン群に追加（既存ボタンの下）:

```html
      <button id="btn-guide">📖 遊び方</button>
```

新しい画面セクションを `data-screen="top"` の直後に追加:

```html
    <section data-screen="guide" class="screen hidden">
      <h2>遊び方</h2>
      <div class="guide">
        <p><strong>目的：</strong>先に <strong>スキを20こ</strong> 集めたら勝ち。</p>
        <p><strong>カードの色：</strong></p>
        <ul>
          <li>🩷 甘え … スキを得る（ヒコーキ耳・へそ天）</li>
          <li>💙 拒否 … 割り込んで防御（拒否柴・虚無顔）</li>
          <li>💚 マイペース … 妨害（柴距離・隙間にすっぽり）</li>
          <li>🧡 野生 … 一発逆転（柴ドリル・ズーミーズ・無限換毛期）</li>
        </ul>
        <p><strong>割り込み：</strong>相手が得点や妨害をしてきたとき、拒否柴／虚無顔を持っていれば「無効化しますか？」が出て、止められます。</p>
        <p><strong>進め方：</strong>手札から1枚タップ → 効果が発動 → 手札が5枚になるまで補充 → 相手の番。これを繰り返します。</p>
      </div>
      <button class="back">戻る</button>
    </section>
```

- [ ] **Step 2: main.js でボタンを配線** (`src/main.js` wireMenu 内)

`wireMenu` に追加:

```javascript
  document.getElementById('btn-guide').onclick = () => showScreen('guide');
```

（`.back` ボタンは既存の wireMenu で `showScreen('top')` に配線済みなので追加不要。）

- [ ] **Step 3: style.css にガイドの体裁を追加** (`style.css`)

```css
.guide { width: 100%; max-width: 420px; text-align: left; font-size: .9rem; line-height: 1.6; }
.guide ul { padding-left: 1.2em; }
```

- [ ] **Step 4: ブラウザで確認（コントローラ実施）**

トップ →「📖 遊び方」→ ガイドが読める → 「戻る」でトップ、を目視。

- [ ] **Step 5: コミット**

```bash
git add index.html src/main.js style.css
git commit -m "feat: how-to-play guide screen"
```

---

### Task 6: 1台パス&プレイモード（手札隠し受け渡し）

**Files:**
- Modify: `index.html`（トップにボタン、受け渡しオーバーレイ要素）
- Modify: `src/ui.js`（`showHandoff` 追加）
- Modify: `src/main.js`（パス&プレイ制御フロー）
- Modify: `style.css`（受け渡し画面の体裁）

**Interfaces:**
- Consumes: `createInitialState`, `playCard`, `applyCounter`, `endTurn`, `legalPlays`, `CARD_TYPES`, `cardKind`, `setLabels`（game-rules）、`showScreen`, `renderBoard`, `showCounterPrompt`, `showResult`, `effectTextFor`（ui）
- Produces:
  - `showHandoff(playerLabel: string, onReady: () => void): void`（ui.js）— 全画面の目隠し受け渡し画面
  - パス&プレイ制御（main.js）。プレイヤー1=host, プレイヤー2=guest。両方人間操作

設計（受け渡しの判断）:
- 「いま端末を持っているプレイヤー（holder）」と「次に操作すべきプレイヤー（actor）」が異なるときだけ受け渡し画面を出す
- 操作すべきプレイヤー = 通常は `state.turn`。割り込み待ち（awaiting_counter）のときは防御側 `opponent(pending.actor)`

- [ ] **Step 1: index.html にボタンと受け渡し要素を追加** (`index.html`)

トップのボタン群に追加:

```html
      <button id="btn-pass">👥 2人で対戦（1台）</button>
```

`#modal-root` の隣に受け渡しオーバーレイ用ルートを追加（既存 modal-root とは別）:

```html
    <div id="handoff-root"></div>
```

- [ ] **Step 2: ui.js に showHandoff を追加** (`src/ui.js`)

```javascript
export function showHandoff(playerLabel, onReady) {
  const root = document.getElementById('handoff-root');
  root.innerHTML = `
    <div class="handoff"><div class="handoff-box">
      <p>📱 ${playerLabel} に渡してください</p>
      <button id="handoff-ready">準備ができたらタップ</button>
    </div></div>`;
  document.getElementById('handoff-ready').onclick = () => { root.innerHTML = ''; onReady(); };
}
```

- [ ] **Step 3: main.js にパス&プレイ制御を追加** (`src/main.js`)

import に `setLabels` と `showHandoff` を追加:
```javascript
import { showScreen, renderBoard, showCounterPrompt, showResult, effectTextFor, showHandoff } from './ui.js';
import {
  createInitialState, playCard, applyCounter, endTurn,
  legalPlays, CARD_TYPES, cardKind, opponent, setLabels,
} from './game-rules.js';
```

パス&プレイの状態と関数を追加（CPU/オンラインの関数群と並べて定義）:

```javascript
const P_LABEL = { host: 'プレイヤー1', guest: 'プレイヤー2' };
let holder = null; // パス&プレイで今端末を持っている role

function wirePass() {
  document.getElementById('btn-pass').onclick = startPassGame;
}

function startPassGame() {
  setLabels('プレイヤー1', 'プレイヤー2');
  state = createInitialState();
  holder = 'host';
  showScreen('game');
  // 最初はプレイヤー1に渡す
  showHandoff(P_LABEL.host, renderPass);
}

// いま操作すべき role を返す（割り込み中は防御側、通常は手番側）
function pendingActorPass() {
  if (state.phase === 'awaiting_counter' && state.pending) return opponent(state.pending.actor);
  return state.turn;
}

function renderPass() {
  renderBoard(state, holder, { onPlayCard: onPlayCardPass });
  if (state.winner) { showResult(P_LABEL[state.winner]); return; }

  // 防御側が割り込み判断する必要があるか
  if (state.phase === 'awaiting_counter' && state.pending) {
    const defender = opponent(state.pending.actor);
    if (defender === holder) {
      const counters = legalPlays(state, defender);
      if (counters.length > 0) {
        const def = CARD_TYPES[cardKind(state.pending.cardId)];
        showCounterPrompt(
          P_LABEL[state.pending.actor], def.name, effectTextFor(state.pending.cardId),
          () => { state = applyCounter(state, defender, counters[0]); afterActionPass(); },
          () => { state = applyCounter(state, defender, null); afterActionPass(); },
        );
      } else {
        state = applyCounter(state, defender, null);
        afterActionPass();
      }
    }
  }
}

function onPlayCardPass(cardId) {
  if (state.turn !== holder || state.phase !== 'main') return;
  if (!legalPlays(state, holder).includes(cardId)) return;
  let opts = {};
  if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
  state = playCard(state, holder, cardId, opts);
  afterActionPass();
}

// 行動後の遷移: 操作すべきプレイヤーが holder と違えば受け渡し、同じなら描画
function afterActionPass() {
  if (state.winner) { renderPass(); return; }
  // awaiting_counter でなければ（＝効果が確定したら）ターンを進める前に判定
  if (state.phase === 'main') {
    // 直前が通常プレイの確定なら endTurn 済みではない。手番側が holder のままなら endTurn する
    // playCard が awaiting_counter を作らなかった場合 phase==='main' のまま turn は変わっていない
    if (state.turn === holder) {
      state = endTurn(state);
    }
  }
  const actor = pendingActorPass();
  if (state.winner) { renderPass(); return; }
  if (actor !== holder) {
    holder = actor;
    showHandoff(P_LABEL[actor], renderPass);
  } else {
    renderPass();
  }
}
```

`afterActionPass` のロジック補足:
- 通常カード（非カウンター）をプレイ → `playCard` で phase='main' のまま turn 不変 → `state.turn === holder` が真なので endTurn → turn が相手へ（または1回休みで自分へ）。その後 actor を判定して受け渡し
- カウンター必要カードをプレイ → `playCard` で phase='awaiting_counter' → `state.turn === holder` だが phase が main でないので endTurn しない → actor=防御側。防御側≠holder なら受け渡し → renderPass で防御側が判断 → `applyCounter` 後 phase='main'・turn は元の攻撃側のまま → afterActionPass 再呼び：`state.turn === holder`? holder は今防御側なので攻撃側≠holder → endTurn しない…**問題**。

修正: カウンター解決後は「攻撃側のターンを終わらせる」必要がある。`applyCounter` 後は phase='main' で turn は攻撃側のまま。afterActionPass の endTurn 条件 `state.turn === holder` は防御側が holder なので偽になり endTurn されない。これを正すため、endTurn条件を「phase==='main' かつ pendingが無く、かつ直前に行動が完了した手番側のターンが残っているとき」に一般化する。実装をシンプルにするため、**endTurn 判定を「phase==='main' && state.turn のプレイヤーの行動が完了している」= 常に手番側基準で行う**よう、afterActionPass を次の確定版に置き換える:

```javascript
function afterActionPass() {
  // 勝敗確定なら表示して終了
  if (state.winner) { renderPass(); return; }

  // 割り込み待ちなら、防御側に操作を渡す（必要なら受け渡し画面）
  if (state.phase === 'awaiting_counter') {
    const actor = opponent(state.pending.actor); // 防御側
    if (actor !== holder) { holder = actor; showHandoff(P_LABEL[actor], renderPass); }
    else { renderPass(); }
    return;
  }

  // ここに来たら phase==='main'：手番側の行動が確定済み。手番側のターンを終える
  state = endTurn(state);
  if (state.winner) { renderPass(); return; }
  const next = state.turn; // 次に行動するプレイヤー
  if (next !== holder) { holder = next; showHandoff(P_LABEL[next], renderPass); }
  else { renderPass(); }
}
```

この確定版では:
- 通常カード: playCard→phase main→afterAction: endTurn→次手番へ受け渡し。OK
- カウンター必要カード: playCard→awaiting_counter→afterAction: 防御側へ受け渡し→renderPass で防御側判断→applyCounter→**afterActionPass を呼ぶ**→phase main→endTurn（攻撃側のターンを終える。endTurn は `s.turn`（攻撃側）基準で動くので正しく攻撃側を終え、次の手番へ）→受け渡し。OK
- 1回休み: endTurn 内で turn が元プレイヤーに戻る → next===holder なら受け渡し無しで連続。OK

renderPass 内の applyCounter 呼び出し後は `afterActionPass()` を呼ぶこと（上記 Step3 の renderPass の counter コールバックは `afterActionPass()` を呼ぶ形になっている）。

- [ ] **Step 4: wirePass を起動時に呼ぶ** (`src/main.js` 末尾)

```javascript
wireMenu();
wireOnline();
wirePass();
showScreen('top');
```

- [ ] **Step 5: style.css に受け渡し画面の体裁を追加** (`style.css`)

```css
.handoff { position: fixed; inset: 0; background: #3e2723; color: #fff;
  display: flex; align-items: center; justify-content: center; z-index: 50; }
.handoff-box { text-align: center; padding: 24px; }
.handoff-box p { font-size: 1.3rem; margin-bottom: 20px; }
.handoff-box button { font-size: 1.1rem; }
```

- [ ] **Step 6: ブラウザで確認（コントローラ実施）**

トップ →「👥 2人で対戦（1台）」→ 受け渡し画面 → タップで盤面 → プレイヤー1がカードを出す → ターン交代で受け渡し画面が出て手札が隠れる → プレイヤー2の盤面 → 得点カードに対し相手が拒否柴を持つ場合に受け渡し＋カウンター確認が出る、を目視。CPU戦・オンライン戦が壊れていないことも確認。

- [ ] **Step 7: コミット**

```bash
git add index.html src/ui.js src/main.js style.css
git commit -m "feat: local pass-and-play mode with hand-hiding handoff"
```

---

### Task 7: モード切替時のラベルリセットと最終確認

**Files:**
- Modify: `src/main.js`（CPU/オンライン開始時に setLabels を既定へ）

**Interfaces:**
- Consumes: `setLabels`
- Produces: モード間でラベルが混ざらない保証

パス&プレイは `setLabels('プレイヤー1','プレイヤー2')` を設定する。CPU/オンラインに戻ったときに既定（あなた/あいて）へ戻さないと、前のモードのラベルが残る。

- [ ] **Step 1: CPU開始時にラベルを既定へ** (`src/main.js` startCpuGame 冒頭)

```javascript
function startCpuGame() {
  setLabels('あなた', 'あいて');
  state = createInitialState();
  showScreen('game');
  refresh();
}
```

- [ ] **Step 2: オンライン開始時にラベルを既定へ** (`src/main.js` startOnline 冒頭、subscribe 登録前)

```javascript
function startOnline(subscribe, pushState) {
  setLabels('あなた', 'あいて');
  if (unsub) unsub();
  ...
```

- [ ] **Step 3: 全テストとブラウザ最終確認（コントローラ実施）**

Run: `npm test`（全緑）
ブラウザ: パス&プレイ→トップ→CPU戦の順に遊び、ログのラベルが「プレイヤー1/2」→「あなた/あいて」に正しく切り替わることを確認。

- [ ] **Step 4: コミット**

```bash
git add src/main.js
git commit -m "fix: reset player labels when entering CPU/online modes"
```

---

## 実装順序のまとめ

1. Task 1（バランス）・Task 2（スキ＋ラベル機構）: ロジック/文字列の土台。テスト駆動
2. Task 3（ステータスバー）・Task 4（レイアウト）: 全モード共通のUI改善。ブラウザ確認
3. Task 5（遊び方ガイド）: 静的画面
4. Task 6（パス&プレイ）: 新モード。最も複雑。showHandoff と setLabels に依存
5. Task 7（ラベルリセット）: モード間の後始末と最終確認

Task 1–2 はテストで、Task 3–7 はブラウザ実機（コントローラがpreviewで確認）。各タスクは独立して検証可能。
</content>
