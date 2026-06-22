# 柴犬カードゲーム 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 柴犬テーマの2人用カードゲームを、CPU対戦（1端末）とオンライン対戦（Firebase同期・2端末）の両方でスマホからプレイできるWebアプリとして実装する。

**Architecture:** 純粋なゲームロジック（`game-rules.js`）を中心に置き、AI（`ai.js`）・UI（`ui.js`）・オンライン同期（`online.js`）をその周りに載せる。ロジックは副作用を持たず、状態オブジェクトを受け取って新しい状態を返す関数群とし、単体テストで網羅する。フロントはVanilla JS、ホスティングはGitHub Pages、PWA対応。

**Tech Stack:** Vanilla JavaScript (ES Modules), HTML/CSS, Firebase Realtime Database (compat or modular SDK via CDN), Node.js + 組み込み `node:test` (ロジック単体テスト), GitHub Pages, PWA (manifest + service worker)。

## Global Constraints

- 勝利条件: 満足度を先に **20ポイント** 到達で即勝利
- プレイ人数: オンライン2人 / CPU1人
- カード総数: **全40枚**（内訳は仕様書セクション3の通り厳守）
- カテゴリ色: 甘え=ピンク / 拒否=ブルー / マイペース=グリーン / 野生=オレンジ
- 手札は常に5枚まで補充（ターン終了時）
- ゲームロジック（`game-rules.js`）は通信・DOM・乱数源以外の副作用を持たない。乱数は引数で渡せるようにしテスト可能にする
- 状態変更は「手番側の端末が書き込む」。割り込み時のみ相手端末が `pending` 応答を書き込む
- 初版スコープ外: 手札暗号化 / 3人以上 / アカウント登録・戦績保存 / AIイラスト（差し込み口のみ用意）
- カード見た目は絵文字＋色（後でイラスト差し込み可能な構造）
- テストはロジック層をTDDで網羅、AIは「CPU vs CPU 完走」テストで検証、UI/オンラインは実機確認

---

### Task 1: プロジェクト雛形とテスト基盤

**Files:**
- Create: `package.json`
- Create: `src/game-rules.js`
- Create: `test/game-rules.test.js`
- Create: `.gitignore`

**Interfaces:**
- Consumes: なし
- Produces: `package.json` の `npm test` が `node --test` を実行する。`src/game-rules.js` はES Moduleとしてエクスポート可能な空モジュール。

- [ ] **Step 1: `.gitignore` を作成**

```
node_modules/
.DS_Store
```

- [ ] **Step 2: `package.json` を作成**

```json
{
  "name": "shiba-card-game",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: 失敗するテストを書く** (`test/game-rules.test.js`)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES } from '../src/game-rules.js';

test('CARD_TYPES exposes the 9 card kinds', () => {
  assert.equal(Object.keys(CARD_TYPES).length, 9);
});
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`CARD_TYPES` が未定義 / モジュールが空）

- [ ] **Step 5: 最小実装** (`src/game-rules.js`)

```javascript
export const CARD_TYPES = {
  hikoki:   { name: 'ヒコーキ耳',       category: 'amae',      count: 6, emoji: '🐕', color: 'pink' },
  hesoten:  { name: 'へそ天',           category: 'amae',      count: 4, emoji: '🐶', color: 'pink' },
  kyohi:    { name: '拒否柴（不動柴）', category: 'kyohi',     count: 6, emoji: '🛑', color: 'blue' },
  kyomu:    { name: '虚無顔',           category: 'kyohi',     count: 4, emoji: '😶', color: 'blue' },
  shibakyori:{ name: '柴距離',          category: 'mypace',    count: 6, emoji: '↔️', color: 'green' },
  sukima:   { name: '隙間にすっぽり',   category: 'mypace',    count: 4, emoji: '📦', color: 'green' },
  drill:    { name: '柴ドリル',         category: 'wild',      count: 4, emoji: '🌀', color: 'orange' },
  zoomies:  { name: 'ズーミーズ（柴走り）', category: 'wild',  count: 4, emoji: '💨', color: 'orange' },
  kangeki:  { name: '無限換毛期',       category: 'wild',      count: 2, emoji: '🌾', color: 'orange' },
};
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add .gitignore package.json src/game-rules.js test/game-rules.test.js
git commit -m "chore: scaffold project and card type table"
```

---

### Task 2: 山札生成とシャッフル

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `CARD_TYPES`
- Produces:
  - `buildDeck(): string[]` — 全40枚のカードID配列（例 `hikoki_1`…`kangeki_2`）を順不同で返す
  - `shuffle(arr: string[], rng: () => number): string[]` — `rng`（0以上1未満）で並べ替えた新配列を返す（元配列は破壊しない）
  - `cardKind(cardId: string): string` — `'hikoki_3'` → `'hikoki'`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { buildDeck, shuffle, cardKind } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL（関数未定義）

- [ ] **Step 3: 実装を追記** (`src/game-rules.js`)

```javascript
export function cardKind(cardId) {
  return cardId.slice(0, cardId.lastIndexOf('_'));
}

export function buildDeck() {
  const deck = [];
  for (const [kind, def] of Object.entries(CARD_TYPES)) {
    for (let i = 1; i <= def.count; i++) deck.push(`${kind}_${i}`);
  }
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: deck build and seeded shuffle"
```

---

### Task 3: 初期状態の生成

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `buildDeck`, `shuffle`
- Produces:
  - `createInitialState(rng?: () => number): State` — 以下の形を返す
    ```
    State = {
      deck: string[], discard: string[],
      hands: { host: string[], guest: string[] },   // 各5枚
      field: { host: string[], guest: string[] },    // 空配列
      scores: { host: 0, guest: 0 },
      turn: 'host', phase: 'main',
      pending: null, winner: null,
      skipNext: { host: false, guest: false },        // 1回休みフラグ
      log: string[],
    }
    ```

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { createInitialState } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL（関数未定義）

- [ ] **Step 3: 実装を追記**

```javascript
export function createInitialState(rng = Math.random) {
  const deck = shuffle(buildDeck(), rng);
  const hands = { host: deck.splice(0, 5), guest: deck.splice(0, 5) };
  return {
    deck, discard: [],
    hands, field: { host: [], guest: [] },
    scores: { host: 0, guest: 0 },
    turn: 'host', phase: 'main',
    pending: null, winner: null,
    skipNext: { host: false, guest: false },
    log: [],
  };
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: initial game state"
```

---

### Task 4: 山札ドローと再生成ヘルパー

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `shuffle`
- Produces:
  - `drawCards(state: State, who: 'host'|'guest', n: number, rng?): State` — `who`の手札に最大n枚加えた**新state**を返す。山札が足りなければ捨て札をシャッフルして山札に補充してから引く。両方尽きたら引けるだけ引く。元stateは破壊しない（ディープコピーして返す）。

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { drawCards } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追記**

```javascript
function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function drawCards(state, who, n, rng = Math.random) {
  const s = clone(state);
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) break;
      s.deck = shuffle(s.discard, rng);
      s.discard = [];
    }
    s.hands[who].push(s.deck.shift());
  }
  return s;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: drawCards with discard reshuffle"
```

---

### Task 5: 得点加算と勝敗判定

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: State
- Produces:
  - `addScore(state, who, points): State` — `who`の得点に加算し、20点以上なら `winner=who`・`phase='finished'` をセットした新stateを返す
  - `opponent(who): 'host'|'guest'`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { addScore, opponent } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追記**

```javascript
export function opponent(who) {
  return who === 'host' ? 'guest' : 'host';
}

export function addScore(state, who, points) {
  const s = clone(state);
  s.scores[who] += points;
  if (s.scores[who] >= 20) {
    s.winner = who;
    s.phase = 'finished';
  }
  return s;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: scoring and win detection"
```

---

### Task 6: カードプレイの中核 — 即時効果（甘え・マイペース・野生のうち割り込み不要分）

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `drawCards`, `addScore`, `opponent`, `cardKind`, `CARD_TYPES`
- Produces:
  - `resolveEffect(state, who, cardId, opts?, rng?): State` — カードの効果を**確定実行**した新stateを返す（割り込みの可否判定はしない＝呼び出し側で済んでいる前提）。`隙間にすっぽり` による無効化はここで考慮する。`opts` は `{ drillDiscard?: string[] }`（柴ドリルで捨てる手札ID）など効果別の追加情報。手札からcardIdを除き捨て札へ送る処理もここで行う。
  - 効果内訳:
    - hikoki: +2点
    - hesoten: +3点して1枚ドロー
    - shibakyori: +1点し、相手手札からランダム1枚捨て（相手がsukima場出し中なら手札破壊のみ無効、得点は入る）
    - sukima: 自分のfieldに追加（持続）
    - drill: `opts.drillDiscard` の枚数を捨て、捨てた枚数+1枚ドロー
    - zoomies: 山札トップをめくり、甘えカテゴリなら+5点、違えば即ターン終了フラグ（`s.forceEndTurn=true`）
    - kangeki: 相手の `skipNext` を true（相手がsukima中なら無効）
    - 拒否柴/虚無顔: ここでは呼ばれない（カウンター専用）

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { resolveEffect } from '../src/game-rules.js';

function handWith(state, who, cardId) {
  const s = JSON.parse(JSON.stringify(state));
  s.hands[who][0] = cardId;
  return s;
}

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

test('drill discards chosen cards and draws discarded+1', () => {
  const s = createInitialState();
  s.hands.host = ['drill_1', 'hikoki_3', 'hesoten_2'];
  const next = resolveEffect(s, 'host', 'drill_1', { drillDiscard: ['hikoki_3', 'hesoten_2'] });
  // played drill (1) + discarded 2 removed = started 3, drew 2+1=3 => hand 3
  assert.equal(next.hands.host.length, 3);
  assert.ok(!next.hands.host.includes('drill_1'));
});
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追記**

```javascript
function discardFromHand(s, who, cardId) {
  const idx = s.hands[who].indexOf(cardId);
  if (idx !== -1) s.hands[who].splice(idx, 1);
  s.discard.push(cardId);
}

function hasSukima(s, who) {
  return s.field[who].some((id) => cardKind(id) === 'sukima');
}

export function resolveEffect(state, who, cardId, opts = {}, rng = Math.random) {
  let s = clone(state);
  const kind = cardKind(cardId);
  const opp = opponent(who);

  if (kind === 'sukima') {
    // remove from hand, place on field (do not discard)
    const idx = s.hands[who].indexOf(cardId);
    if (idx !== -1) s.hands[who].splice(idx, 1);
    s.field[who].push(cardId);
    return s;
  }

  discardFromHand(s, who, cardId);

  switch (kind) {
    case 'hikoki':
      s = addScore(s, who, 2);
      break;
    case 'hesoten':
      s = addScore(s, who, 3);
      s = drawCards(s, who, 1, rng);
      break;
    case 'shibakyori':
      s = addScore(s, who, 1);
      if (!hasSukima(s, opp) && s.hands[opp].length > 0) {
        const j = Math.floor(rng() * s.hands[opp].length);
        const removed = s.hands[opp].splice(j, 1)[0];
        s.discard.push(removed);
      }
      break;
    case 'drill': {
      const toDiscard = opts.drillDiscard || [];
      for (const id of toDiscard) discardFromHand(s, who, id);
      s = drawCards(s, who, toDiscard.length + 1, rng);
      break;
    }
    case 'zoomies': {
      if (s.deck.length === 0 && s.discard.length > 0) {
        s.deck = shuffle(s.discard, rng);
        s.discard = [];
      }
      const top = s.deck.shift();
      if (top) {
        s.discard.push(top);
        if (CARD_TYPES[cardKind(top)].category === 'amae') {
          s = addScore(s, who, 5);
        } else {
          s.forceEndTurn = true;
        }
      }
      break;
    }
    case 'kangeki':
      if (!hasSukima(s, opp)) s.skipNext[opp] = true;
      break;
    default:
      break;
  }
  return s;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: resolveEffect for immediate card effects"
```

---

### Task 7: 割り込み判定とターン進行（playCard / applyCounter / endTurn）

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `resolveEffect`, `drawCards`, `opponent`, `cardKind`
- Produces:
  - `needsCounter(cardId): 'score'|'sabotage'|null` — 得点系（hikoki/hesoten/shibakyori/zoomies）は `'score'`、妨害系（kangeki / shibakyoriの手札破壊部分）は `'sabotage'`。判定は: 得点を含むものは `'score'`、kangekiは `'sabotage'`、shibakyoriは両方の性質を持つため `'score'`（拒否柴で止められる＝得点無効）として扱い、手札破壊は虚無顔対象外とする。sukima/drill/拒否柴/虚無顔は `null`
  - `canCounter(state, defender, attackType): boolean` — defenderの手札に有効なカウンター（score→拒否柴 kyohi、sabotage→虚無顔 kyomu）があり、かつ攻撃側fieldにsukimaが無い…ではなく、防御側が自分の手札で割り込めるか。sukima中の防御側は元々効果を受けないのでカウンター不要（`resolveEffect`側で無効化済み）
  - `playCard(state, who, cardId, opts?, rng?): State` — 割り込みが必要なカードは `phase='awaiting_counter'`・`pending={ actor, cardId, attackType, opts }` をセットして返す（効果未適用）。割り込み不要なカードは即 `resolveEffect` まで適用して返す
  - `applyCounter(state, defender, counterCardId|null, rng?): State` — `pending` に対する応答。counterCardId指定時は元効果を無効化しカウンターを捨て札へ。null時は `resolveEffect` で元効果を適用。どちらも `phase='main'`・`pending=null` に戻す
  - `endTurn(state, rng?): State` — sukimaを手番側fieldから捨て、手番側を5枚まで補充し、`forceEndTurn`をクリアし、手番交代。交代先が `skipNext` ならそのフラグを消してさらにもう一度交代（1回休み消化）

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { needsCounter, playCard, applyCounter, endTurn } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追記**

```javascript
const SCORE_CARDS = new Set(['hikoki', 'hesoten', 'shibakyori', 'zoomies']);

export function needsCounter(cardId) {
  const kind = cardKind(cardId);
  if (SCORE_CARDS.has(kind)) return 'score';
  if (kind === 'kangeki') return 'sabotage';
  return null;
}

export function playCard(state, who, cardId, opts = {}, rng = Math.random) {
  const attackType = needsCounter(cardId);
  if (attackType) {
    const s = clone(state);
    s.phase = 'awaiting_counter';
    s.pending = { actor: who, cardId, attackType, opts };
    return s;
  }
  return resolveEffect(state, who, cardId, opts, rng);
}

export function applyCounter(state, defender, counterCardId, rng = Math.random) {
  let s = clone(state);
  const { actor, cardId, opts } = s.pending;
  if (counterCardId) {
    // nullify: move the played card and counter to discard
    discardFromHand(s, actor, cardId);
    discardFromHand(s, defender, counterCardId);
    s.pending = null;
    s.phase = 'main';
    return s;
  }
  s.pending = null;
  s.phase = 'main';
  s = resolveEffect(s, actor, cardId, opts, rng);
  return s;
}

export function endTurn(state, rng = Math.random) {
  let s = clone(state);
  const who = s.turn;
  // discard own sukima
  s.field[who] = s.field[who].filter((id) => {
    if (cardKind(id) === 'sukima') { s.discard.push(id); return false; }
    return true;
  });
  // refill to 5
  const need = 5 - s.hands[who].length;
  if (need > 0) s = drawCards(s, who, need, rng);
  s.forceEndTurn = false;
  // swap turn, honoring skipNext
  let nextТurn = opponent(who);
  if (s.skipNext[nextТurn]) {
    s.skipNext[nextТurn] = false;
    nextТurn = who; // skip them, back to current player
  }
  s.turn = nextТurn;
  return s;
}
```

Note: 上記の変数名 `nextТurn` は誤字。`nextTurn` に統一すること（下記が正しい実装）:

```javascript
export function endTurn(state, rng = Math.random) {
  let s = clone(state);
  const who = s.turn;
  s.field[who] = s.field[who].filter((id) => {
    if (cardKind(id) === 'sukima') { s.discard.push(id); return false; }
    return true;
  });
  const need = 5 - s.hands[who].length;
  if (need > 0) s = drawCards(s, who, need, rng);
  s.forceEndTurn = false;
  let nextTurn = opponent(who);
  if (s.skipNext[nextTurn]) {
    s.skipNext[nextTurn] = false;
    nextTurn = who;
  }
  s.turn = nextTurn;
  return s;
}
```

`discardFromHand` は Task 6 で定義済みのモジュール内ヘルパーを再利用する。

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: counter resolution and turn progression"
```

---

### Task 8: 合法手の列挙

**Files:**
- Modify: `src/game-rules.js`
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: State, `cardKind`
- Produces:
  - `legalPlays(state, who): string[]` — `who`がいま手札から出せるカードID一覧。`phase==='main'` かつ `turn===who` のときは手札全部（drillは0枚捨ても合法）。`phase==='awaiting_counter'` のときは、`who`が `pending.actor` の相手で、保有する有効カウンター（score→kyohi, sabotage→kyomu）があればそのカードIDのみ返す。それ以外は空配列

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { legalPlays } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追記**

```javascript
export function legalPlays(state, who) {
  if (state.winner) return [];
  if (state.phase === 'main') {
    return state.turn === who ? state.hands[who].slice() : [];
  }
  if (state.phase === 'awaiting_counter') {
    if (who === state.pending.actor) return [];
    const wantKind = state.pending.attackType === 'score' ? 'kyohi' : 'kyomu';
    return state.hands[who].filter((id) => cardKind(id) === wantKind);
  }
  return [];
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: legalPlays enumeration"
```

---

### Task 9: AI思考（やさしい / ふつう）

**Files:**
- Create: `src/ai.js`
- Test: `test/ai.test.js`

**Interfaces:**
- Consumes: `legalPlays`, `cardKind`, `CARD_TYPES`, `needsCounter`, State
- Produces:
  - `chooseMain(state, who, difficulty, rng?): { cardId, opts }` — 手番時の選択。やさしい=合法手からランダム。ふつう=優先度（相手が17点以上なら妨害kangeki/shibakyori優先、なければ得点の高い順 hesoten>hikoki>zoomies>shibakyori、無ければその他）。drillを選んだ場合 `opts.drillDiscard` は「甘え・拒否以外」を最大2枚など簡単なルールで決める（やさしいは空配列）
  - `chooseCounter(state, defender, difficulty, rng?): string|null` — カウンターするか。やさしい=50%でカウンター（rng<0.5）。ふつう=得点攻撃が3点以上 or 相手が17点以上なら拒否柴を使う、妨害は虚無顔があれば常に使う。使わない場合null

- [ ] **Step 1: 失敗するテストを書く** (`test/ai.test.js`)

```javascript
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
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装** (`src/ai.js`)

```javascript
import { legalPlays, cardKind, opponent } from './game-rules.js';

const SCORE_VALUE = { hesoten: 3, hikoki: 2, zoomies: 2, shibakyori: 1 };

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function chooseMain(state, who, difficulty, rng = Math.random) {
  const plays = legalPlays(state, who);
  if (plays.length === 0) return { cardId: null, opts: {} };

  if (difficulty === 'easy') {
    const cardId = pickRandom(plays, rng);
    return { cardId, opts: {} };
  }

  // normal
  const oppScore = state.scores[opponent(who)];
  const byKind = (k) => plays.find((id) => cardKind(id) === k);

  if (oppScore >= 17) {
    const sabotage = byKind('kangeki') || byKind('shibakyori');
    if (sabotage) return { cardId: sabotage, opts: {} };
  }
  const sorted = plays
    .filter((id) => SCORE_VALUE[cardKind(id)] !== undefined)
    .sort((a, b) => SCORE_VALUE[cardKind(b)] - SCORE_VALUE[cardKind(a)]);
  if (sorted.length > 0) return { cardId: sorted[0], opts: {} };

  // fall back to any card; if drill, discard non-amae/non-kyohi up to 2
  const cardId = plays[0];
  let opts = {};
  if (cardKind(cardId) === 'drill') {
    const junk = state.hands[who]
      .filter((id) => id !== cardId && !['hikoki', 'hesoten', 'kyohi', 'kyomu'].includes(cardKind(id)))
      .slice(0, 2);
    opts = { drillDiscard: junk };
  }
  return { cardId, opts };
}

export function chooseCounter(state, defender, difficulty, rng = Math.random) {
  const counters = legalPlays(state, defender);
  if (counters.length === 0) return null;

  if (difficulty === 'easy') {
    return rng() < 0.5 ? counters[0] : null;
  }

  // normal
  const { attackType, cardId } = state.pending;
  if (attackType === 'sabotage') return counters[0]; // always block sabotage
  const attackValue = SCORE_VALUE[cardKind(cardId)] || 0;
  const oppScore = state.scores[state.pending.actor];
  if (attackValue >= 3 || oppScore >= 17) return counters[0];
  return null;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ai.js test/ai.test.js
git commit -m "feat: easy and normal AI strategies"
```

---

### Task 10: ゲーム進行ドライバ（CPU vs CPU 完走テスト）

**Files:**
- Create: `src/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: すべての `game-rules.js` 関数、`ai.js`
- Produces:
  - `takeTurn(state, controllers, rng?): State` — 現手番プレイヤーに対し、`controllers[turn]`（`{ main(state,who), counter(state,defender) }`）に手を選ばせ、playCard → 相手のcounter判断（awaiting_counterなら相手controllerのcounterを呼ぶ）→ applyCounter →（forceEndTurnでなければそのまま）→ endTurn まで1手番を進めた新stateを返す。勝者が出たら即返す
  - `playOutGame(controllers, rng?, maxTurns=200): State` — winnerが出るかmaxTurnsまでtakeTurnを繰り返す

- [ ] **Step 1: 失敗するテストを書く** (`test/engine.test.js`)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playOutGame } from '../src/engine.js';
import { chooseMain, chooseCounter } from '../src/ai.js';

function aiController(difficulty, rng) {
  return {
    main: (state, who) => chooseMain(state, who, difficulty, rng),
    counter: (state, defender) => chooseCounter(state, defender, difficulty, rng),
  };
}

test('CPU vs CPU game completes with a winner', () => {
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const final = playOutGame(
    { host: aiController('normal', rng), guest: aiController('normal', rng) },
    rng
  );
  assert.ok(final.winner === 'host' || final.winner === 'guest');
  assert.ok(final.scores[final.winner] >= 20);
});

test('multiple seeds all complete without throwing', () => {
  for (let base = 1; base <= 20; base++) {
    let seed = base * 7919;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const final = playOutGame(
      { host: aiController('easy', rng), guest: aiController('normal', rng) },
      rng
    );
    assert.ok(final.winner, `seed ${base} produced no winner`);
  }
});
```

- [ ] **Step 2: テスト実行で失敗確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装** (`src/engine.js`)

```javascript
import { createInitialState, playCard, applyCounter, endTurn, opponent } from './game-rules.js';

export function takeTurn(state, controllers, rng = Math.random) {
  if (state.winner) return state;
  const who = state.turn;
  const { cardId, opts } = controllers[who].main(state, who);
  if (!cardId) return endTurn(state, rng); // no legal move, pass

  let s = playCard(state, who, cardId, opts, rng);

  if (s.phase === 'awaiting_counter') {
    const defender = opponent(s.pending.actor);
    const counterCard = controllers[defender].counter(s, defender);
    s = applyCounter(s, defender, counterCard, rng);
  }
  if (s.winner) return s;
  return endTurn(s, rng);
}

export function playOutGame(controllers, rng = Math.random, maxTurns = 200) {
  let s = createInitialState(rng);
  let turns = 0;
  while (!s.winner && turns < maxTurns) {
    s = takeTurn(s, controllers, rng);
    turns++;
  }
  return s;
}
```

- [ ] **Step 4: テスト実行で成功確認**

Run: `npm test`
Expected: PASS（全シード完走・勝者あり）

- [ ] **Step 5: コミット**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: game engine driver and CPU vs CPU completion tests"
```

---

### Task 11: HTML骨格・スタイル・カード描画

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `src/ui.js`

**Interfaces:**
- Consumes: `CARD_TYPES`, `cardKind`, State
- Produces:
  - `index.html` — トップ/モード選択/対戦/結果を切り替える単一ページ（`<div data-screen="...">`をdisplay切替）。`src/main.js` をmodule読み込み
  - `style.css` — カテゴリ色（pink/blue/green/orange）、カード枠（角丸・影）、スマホ縦画面前提のレイアウト、得点表示、ログ欄
  - `src/ui.js` の関数:
    - `renderCard(cardId): HTMLElement` — 絵文字＋カード名＋効果短文を持つカードDOM（後でimg差し込み用に `.card-art` 空要素を含める）
    - `showScreen(name)` — 画面切替
    - `renderBoard(state, viewer, handlers)` — 盤面（自分の手札・得点・場・ログ）を描画。`handlers.onPlayCard(cardId)` を手札クリックに紐付け
    - `showCounterPrompt(cardName, onYes, onNo)` — 「○○が出されました！無効化しますか？[はい/いいえ]」モーダル
    - `showResult(winnerLabel)` — 結果画面

このタスクはDOM生成中心のため自動テストは省略し、Task 14 の実機確認でカバーする。最低限、ブラウザで `index.html` を開いてトップ画面が表示されることを目視確認する。

- [ ] **Step 1: `index.html` を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>至高の柴犬ライフ</title>
  <link rel="stylesheet" href="style.css" />
  <link rel="manifest" href="manifest.json" />
</head>
<body>
  <div id="app">
    <section data-screen="top" class="screen">
      <h1>🐕 至高の柴犬ライフ</h1>
      <button id="btn-cpu">CPUと対戦</button>
      <button id="btn-online">オンライン対戦</button>
    </section>
    <section data-screen="difficulty" class="screen hidden">
      <h2>難易度を選択</h2>
      <button data-diff="easy">やさしい</button>
      <button data-diff="normal">ふつう</button>
      <button class="back">戻る</button>
    </section>
    <section data-screen="online" class="screen hidden">
      <h2>オンライン対戦</h2>
      <button id="btn-create">部屋を作る</button>
      <div>
        <input id="join-code" inputmode="numeric" maxlength="4" placeholder="4桁コード" />
        <button id="btn-join">参加する</button>
      </div>
      <p id="online-status"></p>
      <button class="back">戻る</button>
    </section>
    <section data-screen="game" class="screen hidden">
      <div id="scoreboard"></div>
      <div id="opp-field" class="field"></div>
      <div id="my-field" class="field"></div>
      <div id="hand" class="hand"></div>
      <div id="log" class="log"></div>
    </section>
    <section data-screen="result" class="screen hidden">
      <h2 id="result-text"></h2>
      <button id="btn-home">トップに戻る</button>
    </section>
    <div id="modal-root"></div>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` を作成**

```css
:root {
  --amae: #f48fb1; --kyohi: #64b5f6; --mypace: #81c784; --wild: #ffb74d;
  --bg: #fff8f0; --ink: #3e2723;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
#app { max-width: 480px; margin: 0 auto; padding: 16px; min-height: 100vh; }
.screen { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.screen.hidden { display: none; }
h1 { font-size: 1.6rem; text-align: center; }
button { font-size: 1.1rem; padding: 12px 20px; border: none; border-radius: 12px;
  background: var(--mypace); color: #fff; min-width: 200px; }
button:active { transform: scale(0.97); }
input { font-size: 1.3rem; padding: 10px; width: 140px; text-align: center; border-radius: 8px; border: 2px solid #ccc; }
#scoreboard { width: 100%; display: flex; justify-content: space-around; font-size: 1.2rem; font-weight: bold; }
.field { width: 100%; min-height: 60px; display: flex; gap: 6px; flex-wrap: wrap; }
.hand { width: 100%; display: flex; gap: 6px; overflow-x: auto; padding: 8px 0; }
.card { flex: 0 0 84px; height: 120px; border-radius: 10px; padding: 6px;
  background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.2); display: flex; flex-direction: column;
  font-size: .7rem; border-top: 6px solid #ccc; }
.card.amae { border-top-color: var(--amae); }
.card.kyohi { border-top-color: var(--kyohi); }
.card.mypace { border-top-color: var(--mypace); }
.card.wild { border-top-color: var(--wild); }
.card .emoji { font-size: 1.6rem; text-align: center; }
.card .name { font-weight: bold; }
.card-art:empty { display: none; }
.log { width: 100%; height: 100px; overflow-y: auto; font-size: .8rem; background: #fff; border-radius: 8px; padding: 8px; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }
.modal .box { background: #fff; padding: 20px; border-radius: 14px; text-align: center; max-width: 320px; }
.modal .box button { margin: 8px; }
.hidden { display: none; }
```

- [ ] **Step 3: `src/ui.js` を作成**

```javascript
import { CARD_TYPES, cardKind } from './game-rules.js';

const EFFECT_TEXT = {
  hikoki: '+2点', hesoten: '+3点 & 1枚引く', kyohi: '相手の得点を無効化',
  kyomu: '妨害を無効化', shibakyori: '+1点 & 相手手札1枚捨て',
  sukima: '次の自分の番まで効果を受けない', drill: '捨てた枚数+1引く',
  zoomies: '甘えなら+5点/外れで終了', kangeki: '相手1回休み',
};

export function renderCard(cardId) {
  const kind = cardKind(cardId);
  const def = CARD_TYPES[kind];
  const el = document.createElement('div');
  el.className = `card ${def.category}`;
  el.dataset.cardId = cardId;
  el.innerHTML = `
    <div class="card-art"></div>
    <div class="emoji">${def.emoji}</div>
    <div class="name">${def.name}</div>
    <div class="effect">${EFFECT_TEXT[kind]}</div>`;
  return el;
}

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.toggle('hidden', s.dataset.screen !== name);
  });
}

export function renderBoard(state, viewer, handlers) {
  const opp = viewer === 'host' ? 'guest' : 'host';
  document.getElementById('scoreboard').textContent =
    `あなた ${state.scores[viewer]} - ${state.scores[opp]} 相手`;

  const fieldMine = document.getElementById('my-field');
  const fieldOpp = document.getElementById('opp-field');
  fieldMine.innerHTML = ''; fieldOpp.innerHTML = '';
  state.field[viewer].forEach((id) => fieldMine.appendChild(renderCard(id)));
  state.field[opp].forEach((id) => fieldOpp.appendChild(renderCard(id)));

  const hand = document.getElementById('hand');
  hand.innerHTML = '';
  state.hands[viewer].forEach((id) => {
    const c = renderCard(id);
    c.addEventListener('click', () => handlers.onPlayCard(id));
    hand.appendChild(c);
  });

  const log = document.getElementById('log');
  log.innerHTML = state.log.slice(-8).map((l) => `<div>${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

export function showCounterPrompt(cardName, onYes, onNo) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal"><div class="box">
      <p><strong>${cardName}</strong> が出されました！<br>無効化しますか?</p>
      <button id="cnt-yes">はい</button>
      <button id="cnt-no">いいえ</button>
    </div></div>`;
  document.getElementById('cnt-yes').onclick = () => { root.innerHTML = ''; onYes(); };
  document.getElementById('cnt-no').onclick = () => { root.innerHTML = ''; onNo(); };
}

export function showResult(winnerLabel) {
  document.getElementById('result-text').textContent = `${winnerLabel}の勝ち！🎉`;
  showScreen('result');
}
```

- [ ] **Step 4: ブラウザで目視確認**

Run: ブラウザで `index.html` を直接開く（モジュールはローカルでも `file://` で動かない場合があるため、`python3 -m http.server` でローカルサーバを立てて `http://localhost:8000` を開く）
Expected: トップ画面に「CPUと対戦」「オンライン対戦」ボタンが表示される

- [ ] **Step 5: コミット**

```bash
git add index.html style.css src/ui.js
git commit -m "feat: HTML scaffold, styles, and card rendering"
```

---

### Task 12: CPU対戦の画面進行（main.js）

**Files:**
- Create: `src/main.js`
- Modify: `src/game-rules.js`（ログ追記ヘルパーが未実装ならここで `pushLog` を内部利用するよう調整。すでに各効果でログを積んでいない場合、UI側でログ文を生成する方針とし game-rules は変更しない）

**Interfaces:**
- Consumes: `ui.js`, `engine.js` の `takeTurn`、`game-rules.js` の `playCard/applyCounter/endTurn/createInitialState/legalPlays/opponent`、`ai.js`
- Produces: 画面遷移とCPU戦の対話ループ。人間=host固定、CPU=guest。人間がカードをタップ→playCard→（awaiting_counterならCPUのchooseCounterを呼ぶ）→applyCounter→endTurn→CPUの手番を `takeTurn` で自動進行→人間手番に戻して再描画。CPUが人間に割り込み判断を求める場合（CPUの得点/妨害に人間がカウンター可能なとき）は `showCounterPrompt` を表示

- [ ] **Step 1: `src/main.js` を作成**

```javascript
import { showScreen, renderBoard, showCounterPrompt, showResult } from './ui.js';
import {
  createInitialState, playCard, applyCounter, endTurn,
  legalPlays, opponent, needsCounter, CARD_TYPES, cardKind,
} from './game-rules.js';
import { chooseMain, chooseCounter } from './ai.js';

let state = null;
let difficulty = 'normal';
const HUMAN = 'host';
const CPU = 'guest';

function wireMenu() {
  document.getElementById('btn-cpu').onclick = () => showScreen('difficulty');
  document.getElementById('btn-online').onclick = () => showScreen('online');
  document.querySelectorAll('.back').forEach((b) => (b.onclick = () => showScreen('top')));
  document.getElementById('btn-home').onclick = () => showScreen('top');
  document.querySelectorAll('[data-diff]').forEach((b) => {
    b.onclick = () => { difficulty = b.dataset.diff; startCpuGame(); };
  });
}

function startCpuGame() {
  state = createInitialState();
  showScreen('game');
  refresh();
}

function refresh() {
  renderBoard(state, HUMAN, { onPlayCard });
  if (state.winner) {
    showResult(state.winner === HUMAN ? 'あなた' : 'CPU');
  }
}

function onPlayCard(cardId) {
  if (state.turn !== HUMAN || state.phase !== 'main') return;
  if (!legalPlays(state, HUMAN).includes(cardId)) return;

  let opts = {};
  if (cardKind(cardId) === 'drill') {
    // simple: discard nothing for human in v1 (could add a picker later)
    opts = { drillDiscard: [] };
  }
  state = playCard(state, HUMAN, cardId, opts);

  if (state.phase === 'awaiting_counter') {
    // CPU decides whether to counter the human's play
    const cpuCounter = chooseCounter(state, CPU, difficulty);
    state = applyCounter(state, CPU, cpuCounter);
  }
  if (!state.winner) state = endTurn(state);
  refresh();
  if (!state.winner) cpuTurn();
}

function cpuTurn() {
  if (state.turn !== CPU || state.winner) return;
  const { cardId, opts } = chooseMain(state, CPU, difficulty);
  if (!cardId) { state = endTurn(state); refresh(); return; }
  state = playCard(state, CPU, cardId, opts);

  if (state.phase === 'awaiting_counter') {
    // human may counter CPU's score/sabotage
    const humanCounters = legalPlays(state, HUMAN);
    if (humanCounters.length > 0) {
      const def = CARD_TYPES[cardKind(state.pending.cardId)];
      showCounterPrompt(
        def.name,
        () => { state = applyCounter(state, HUMAN, humanCounters[0]); finishCpuTurn(); },
        () => { state = applyCounter(state, HUMAN, null); finishCpuTurn(); },
      );
      return;
    }
    state = applyCounter(state, HUMAN, null);
  }
  finishCpuTurn();
}

function finishCpuTurn() {
  if (!state.winner) state = endTurn(state);
  refresh();
}

wireMenu();
showScreen('top');
```

- [ ] **Step 2: ローカルサーバで動作確認**

Run: `python3 -m http.server 8000` を起動し `http://localhost:8000` を開く →「CPUと対戦」→「ふつう」
Expected: 自分の手札が表示され、カードをタップすると得点が動き、CPUが応答して手番が回る。20点で結果画面に遷移

- [ ] **Step 3: 割り込みの目視確認**

手札に「拒否柴」がある状態でCPUが得点カードを出したとき、「○○が出されました！無効化しますか?」モーダルが出ることを確認

- [ ] **Step 4: コミット**

```bash
git add src/main.js
git commit -m "feat: CPU match screen flow and counter prompts"
```

---

### Task 13: Firebase設定とオンライン同期（online.js）

**Files:**
- Create: `src/online.js`
- Create: `src/firebase-config.example.js`
- Modify: `src/main.js`（オンライン画面のボタンを配線）
- Modify: `index.html`（Firebase SDK CDN読み込みは online.js 内のdynamic import で行うため変更不要なら省略）

**Interfaces:**
- Consumes: Firebase Realtime Database (modular SDK via CDN `https://www.gstatic.com/firebasejs/10.x/firebase-*.js`)、`game-rules.js`
- Produces:
  - `firebase-config.example.js` — 設定値の雛形（apiKey等）。実際の値は `firebase-config.js`（gitignore対象）にコピーして使う
  - `online.js`:
    - `createRoom(): Promise<{ code, role }>` — 4桁コードを生成しroomを `status:'waiting'` で作成、`role:'host'` を返す
    - `joinRoom(code): Promise<{ code, role }>` — 既存roomに `guest` として参加、`status:'playing'`＋初期state書き込み
    - `subscribe(code, onState): () => void` — roomのstate変更を購読しコールバック、解除関数を返す
    - `pushState(code, state): Promise<void>` — stateを書き込む（手番側のみ呼ぶ）

- [ ] **Step 1: `.gitignore` に追記**

```
src/firebase-config.js
```

- [ ] **Step 2: `src/firebase-config.example.js` を作成**

```javascript
// このファイルを firebase-config.js にコピーし、Firebaseコンソールの値を入れる
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  appId: 'YOUR_APP_ID',
};
```

- [ ] **Step 3: `src/online.js` を作成**

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, set, get, onValue, child,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';
import { createInitialState } from './game-rules.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function createRoom() {
  const code = genCode();
  await set(ref(db, `rooms/${code}`), {
    status: 'waiting',
    createdAt: Date.now(),
    players: { host: { name: 'host', connected: true } },
  });
  return { code, role: 'host' };
}

export async function joinRoom(code) {
  const snap = await get(child(ref(db), `rooms/${code}`));
  if (!snap.exists()) throw new Error('部屋が見つかりません');
  const initial = createInitialState();
  await set(ref(db, `rooms/${code}/players/guest`), { name: 'guest', connected: true });
  await set(ref(db, `rooms/${code}/status`), 'playing');
  await set(ref(db, `rooms/${code}/state`), initial);
  return { code, role: 'guest' };
}

export function subscribe(code, onState) {
  const stateRef = ref(db, `rooms/${code}`);
  return onValue(stateRef, (snap) => {
    const room = snap.val();
    if (room) onState(room);
  });
}

export async function pushState(code, state) {
  await set(ref(db, `rooms/${code}/state`), state);
}
```

- [ ] **Step 4: 接続スモークテスト（手動）**

Run: `firebase-config.js` を実値で用意し、ローカルサーバで「部屋を作る」を実行
Expected: Firebaseコンソールの Realtime Database に `rooms/{コード}` が `status:waiting` で出現する

- [ ] **Step 5: コミット**

```bash
git add .gitignore src/online.js src/firebase-config.example.js
git commit -m "feat: Firebase room creation and state sync"
```

---

### Task 14: オンライン対戦の画面進行統合

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `online.js`, `ui.js`, `game-rules.js`
- Produces: オンライン画面のボタン配線と対戦ループ。`subscribe` で受け取ったstateを描画。自分の手番（`state.turn === myRole`）のときだけ手札クリックを有効化し、`playCard`→（相手の割り込みは相手端末が処理）→`pushState`。`awaiting_counter` かつ自分が防御側なら `showCounterPrompt` を出し、選択結果を `applyCounter`→`pushState`。手番側は割り込み解決後の `endTurn` を、phaseがmainに戻ったことを検知してから実行する

- [ ] **Step 1: `src/main.js` にオンライン処理を追加**

```javascript
// 追加 import
import { createRoom, joinRoom, subscribe, pushState } from './online.js';

let myRole = null;
let roomCode = null;
let unsub = null;

function wireOnline() {
  document.getElementById('btn-create').onclick = async () => {
    const { code, role } = await createRoom();
    roomCode = code; myRole = role;
    document.getElementById('online-status').textContent = `コード: ${code}（相手の参加を待っています）`;
    startOnline();
  };
  document.getElementById('btn-join').onclick = async () => {
    const code = document.getElementById('join-code').value.trim();
    try {
      const res = await joinRoom(code);
      roomCode = res.code; myRole = res.role;
      startOnline();
    } catch (e) {
      document.getElementById('online-status').textContent = e.message;
    }
  };
}

function startOnline() {
  if (unsub) unsub();
  unsub = subscribe(roomCode, (room) => {
    if (room.status === 'playing' && room.state) {
      state = room.state;
      if (document.querySelector('[data-screen="game"]').classList.contains('hidden')) {
        showScreen('game');
      }
      renderOnline();
    }
  });
}

function renderOnline() {
  renderBoard(state, myRole, { onPlayCard: onPlayCardOnline });
  if (state.winner) { showResult(state.winner === myRole ? 'あなた' : '相手'); return; }

  // if I am the defender in an awaiting_counter, prompt me
  if (state.phase === 'awaiting_counter' && state.pending.actor !== myRole) {
    const counters = legalPlays(state, myRole);
    const def = CARD_TYPES[cardKind(state.pending.cardId)];
    if (counters.length > 0) {
      showCounterPrompt(
        def.name,
        async () => { state = applyCounter(state, myRole, counters[0]); await afterCounter(); },
        async () => { state = applyCounter(state, myRole, null); await afterCounter(); },
      );
    } else {
      // no counter available: auto-resolve as defender
      state = applyCounter(state, myRole, null);
      afterCounter();
    }
  }
}

async function afterCounter() {
  // defender resolved the counter; turn owner still needs to endTurn.
  // The actor end-turns when they see phase back to main on their next render.
  await pushState(roomCode, state);
}

function onPlayCardOnline(cardId) {
  if (state.turn !== myRole || state.phase !== 'main') return;
  if (!legalPlays(state, myRole).includes(cardId)) return;
  let opts = {};
  if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
  state = playCard(state, myRole, cardId, opts);
  pushState(roomCode, state).then(() => {
    if (state.phase === 'main') {
      // no counter needed; end my turn
      state = endTurn(state);
      pushState(roomCode, state);
    }
    // if awaiting_counter, defender will resolve; I endTurn when I next see main (handled below)
  });
}
```

- [ ] **Step 2: 手番側のendTurn待ち合わせを `renderOnline` に追加**

`renderOnline` の先頭付近（winnerチェックの後）に、自分が直前のactorで割り込みが解決されたケースのendTurnを入れる:

```javascript
// after counter resolved by opponent, the actor finalizes the turn
if (state.phase === 'main' && state.turn === myRole && state.pending === null && state._awaitingFinalize) {
  // _awaitingFinalize is set when actor plays a counterable card
}
```

実装を単純化するため、方式を次のように確定する: **手番側は playCard 後 awaiting_counter なら pushState だけして待つ。防御側が applyCounter で phase を main に戻し pushState する。その後、手番側は「自分がactorだったカードのpendingが消えてphase==='main'かつturnが自分」を検知して endTurn する。** この検知用に playCard 時 `state.lastActor = myRole` を持たせる:

```javascript
// onPlayCardOnline 内、playCard の直後に:
state.lastActor = myRole;
```

そして renderOnline 内（winnerチェック後・防御プロンプトの前）に:

```javascript
if (state.phase === 'main' && state.turn === myRole && state.lastActor === myRole) {
  delete state.lastActor;
  state = endTurn(state);
  pushState(roomCode, state);
  return;
}
```

`game-rules.js` の `applyCounter` は `lastActor` を保持したままにする（cloneでコピーされる）。`endTurn` 実行時に消える。

- [ ] **Step 3: `wireOnline()` を起動時に呼ぶ**

`main.js` 末尾の `wireMenu(); showScreen('top');` の前に `wireOnline();` を追加。

- [ ] **Step 4: 2端末（または2ブラウザタブ）で動作確認**

Run: ローカルサーバを立て、2つのブラウザタブで開く。タブAで「部屋を作る」→コード取得、タブBで「参加する」にコード入力
Expected: 両タブが対戦画面になり、手番側だけ手札を出せる。得点・割り込み・1回休みが両画面に同期する。先に20点で両画面が結果表示

- [ ] **Step 5: コミット**

```bash
git add src/main.js
git commit -m "feat: online match flow with synced counters and turns"
```

---

### Task 15: PWA対応とGitHub Pagesデプロイ準備

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Modify: `index.html`（service worker登録スクリプト追加）
- Create: `README.md`

**Interfaces:**
- Consumes: なし
- Produces: ホーム画面追加で全画面起動できるPWA。`README.md` にFirebaseセットアップ手順とGitHub Pages公開手順を記載

- [ ] **Step 1: `manifest.json` を作成**

```json
{
  "name": "至高の柴犬ライフ",
  "short_name": "柴犬ライフ",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#fff8f0",
  "theme_color": "#f48fb1",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: `sw.js`（最小キャッシュ）を作成**

```javascript
const CACHE = 'shiba-v1';
const ASSETS = [
  './', './index.html', './style.css',
  './src/main.js', './src/ui.js', './src/game-rules.js', './src/ai.js', './src/engine.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

- [ ] **Step 3: `index.html` にSW登録を追加**

`</body>` の直前:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
</script>
```

- [ ] **Step 4: `README.md` を作成**

```markdown
# 至高の柴犬ライフ

柴犬テーマの2人用カードゲーム。CPU対戦とオンライン対戦（Firebase）に対応。

## セットアップ
1. Firebaseでプロジェクトを作成し、Realtime Database を有効化（テストモード可）
2. `src/firebase-config.example.js` を `src/firebase-config.js` にコピーし、コンソールの設定値を記入
3. ローカル確認: `python3 -m http.server 8000` → http://localhost:8000

## テスト
`npm test`

## デプロイ（GitHub Pages）
1. リポジトリにpush
2. Settings → Pages → Branch を main / root に設定
3. 公開URLにアクセス（icon-192.png / icon-512.png を用意するとホーム画面追加が綺麗）

## アイコン
`icon-192.png`, `icon-512.png` を任意の柴犬画像で用意（無くても動作するがPWAインストール表示が簡素になる）。
```

- [ ] **Step 5: アイコンのプレースホルダ確認**

アイコン画像は任意。無い場合 `manifest.json` の icons 項目はそのままで良いが、用意できない場合は icons を空配列にしてもPWAは最低限動く。ここでは用意できる場合のみ追加する旨をREADMEに記載済み。

- [ ] **Step 6: コミット**

```bash
git add manifest.json sw.js index.html README.md
git commit -m "feat: PWA manifest, service worker, and deployment docs"
```

---

## 実装順序のまとめ

1. Task 1–8: ゲームロジック（TDDで網羅）
2. Task 9–10: AIとCPU vs CPU完走テスト
3. Task 11–12: UIとCPU対戦
4. Task 13–14: Firebaseオンライン対戦
5. Task 15: PWA・デプロイ

各タスクは独立してテスト/確認可能。Task 1–10 はFirebase不要で完結するため、オンライン部分の前にゲームとして遊べる状態になる。
</content>
