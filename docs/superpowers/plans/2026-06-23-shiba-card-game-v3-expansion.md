# 柴犬カードゲーム v3 カード拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の柴犬カードゲームに特殊カード8種を追加し、9種40枚→17種52枚に拡張する（効果：スキを奪う/減らす・コンボ連鎖・情報かく乱）。

**Architecture:** 純粋ロジック（game-rules.js）に8効果・追加行動（おかわり）・相手手札公開（クンクン）を加える。AI・エンジン・UI・3モード制御を順に対応。新カードはイラスト未用意のため絵文字カードで表示（既存9種は画像のまま）。バランスはCPU対CPUシミュレーションで最終確定。

**Tech Stack:** Vanilla JS (ES Modules), Node 組み込み `node:test`, 既存 `scripts/balance-sim.mjs`。

## Global Constraints

- 得点単位は「スキ」。勝利ライン20（addScore の `>= 20`）。バランス調整で変える場合は全表示と揃える
- カード総数 **52枚**（17種）。出発点の内訳は下表。最終枚数はシミュレーションで確定
- 相手スコアを下げる効果は `Math.max(0, ...)` で0未満にしない
- 「隙間にすっぽり」中の相手には、相手にマイナス/手札破壊/交換を与える効果は無効（自分が得る分は適用）。既存 `hasSukima(s, opp)` を使う
- needsCounter 分類：`score`= hikoki, hesoten, shibakyori, zoomies, **nusumi, kuidame** ／ `sabotage`= kangeki, **yakimochi, itazura** ／ それ以外 null
- game-rules.js は純粋関数（rng 引数、clone で非破壊）。既存の効果・ターン進行ロジックの仕組みは壊さない
- 既存テストは常に緑。既存の3モード（CPU `onPlayCard/cpuTurn/finishCpuTurn`、パス&プレイ `onPlayCardPass/renderPass/afterActionPass`、オンライン `onPlayCardOnline/renderOnline/afterCounter`）を壊さない
- 新カードのイラストは後日。今回は絵文字＋カテゴリ色。既存9種（hikoki,hesoten,kyohi,kyomu,shibakyori,sukima,drill,zoomies,kangeki）は画像表示を維持

新カードと出発点の枚数:

| kind | name | category | count | emoji | needsCounter |
| --- | --- | --- | --- | --- | --- |
| nusumi | 盗み食い | wild | 3 | 🍖 | score |
| yakimochi | ヤキモチ | wild | 2 | 😤 | sabotage |
| itazura | イタズラ | mypace | 2 | 😈 | sabotage |
| dassou | 脱走 | wild | 2 | 🏃 | null |
| kunkun | クンクン | mypace | 2 | 👃 | null |
| kokan | 物々交換 | mypace | 2 | 🔄 | null |
| kuidame | 食いだめ | amae | 3 | 🍚 | score |
| okawari | おかわり | amae | 2 | ♻️ | null |

既存の新count: hikoki6, hesoten5, kyohi3, kyomu2, shibakyori5, sukima3, drill3, zoomies4, kangeki3（計34）＋新規18＝52。

---

### Task 1: カード定義の追加と state 拡張

**Files:**
- Modify: `src/game-rules.js`（CARD_TYPES に8種、既存countの調整、createInitialState に extraActions/reveal）
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: なし
- Produces: 52枚・17種の CARD_TYPES。`createInitialState()` の戻り値に `extraActions: 0` と `reveal: { host: false, guest: false }` を追加

- [ ] **Step 1: 失敗するテストを書く** (`test/game-rules.test.js` に追記)

```javascript
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
```

既存の「buildDeck has exactly 40 cards」テストと「per-kind counts」テスト（hikoki 8 等）を新構成に更新する:
- 40→52 に変更
- hikoki 8→6, hesoten 6→5, shibakyori 6→5（既存テストがこれらを参照していれば更新）

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `npm test`
Expected: FAIL（52枚でない／新kind未定義／extraActions未定義）

- [ ] **Step 3: CARD_TYPES を更新** (`src/game-rules.js`)

既存9種の count を hikoki6, hesoten5, kyohi3, kyomu2, shibakyori5, sukima3, drill3, zoomies4, kangeki3 に変更し、末尾に8種を追加:

```javascript
  nusumi:   { name: '盗み食い',   category: 'wild',   count: 3, emoji: '🍖', color: 'orange' },
  yakimochi:{ name: 'ヤキモチ',   category: 'wild',   count: 2, emoji: '😤', color: 'orange' },
  itazura:  { name: 'イタズラ',   category: 'mypace', count: 2, emoji: '😈', color: 'green' },
  dassou:   { name: '脱走',       category: 'wild',   count: 2, emoji: '🏃', color: 'orange' },
  kunkun:   { name: 'クンクン',   category: 'mypace', count: 2, emoji: '👃', color: 'green' },
  kokan:    { name: '物々交換',   category: 'mypace', count: 2, emoji: '🔄', color: 'green' },
  kuidame:  { name: '食いだめ',   category: 'amae',   count: 3, emoji: '🍚', color: 'pink' },
  okawari:  { name: 'おかわり',   category: 'amae',   count: 2, emoji: '♻️', color: 'pink' },
```

- [ ] **Step 4: createInitialState に state フィールドを追加** (`src/game-rules.js`)

`createInitialState` の返すオブジェクトに追加:

```javascript
    skipNext: { host: false, guest: false },
    extraActions: 0,
    reveal: { host: false, guest: false },
    log: [],
```

- [ ] **Step 5: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: add 8 expansion card types and state fields"
```

---

### Task 2: needsCounter 分類の拡張

**Files:**
- Modify: `src/game-rules.js`（SCORE_CARDS、sabotage 判定）
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `cardKind`
- Produces: `needsCounter(cardId)` が新カードを正しく分類（nusumi/kuidame→'score'、yakimochi/itazura→'sabotage'、dassou/kunkun/kokan/okawari→null）

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL

- [ ] **Step 3: needsCounter を更新** (`src/game-rules.js`)

現在の実装を置換:

```javascript
const SCORE_CARDS = new Set(['hikoki', 'hesoten', 'shibakyori', 'zoomies', 'nusumi', 'kuidame']);
const SABOTAGE_CARDS = new Set(['kangeki', 'yakimochi', 'itazura']);

export function needsCounter(cardId) {
  const kind = cardKind(cardId);
  if (SCORE_CARDS.has(kind)) return 'score';
  if (SABOTAGE_CARDS.has(kind)) return 'sabotage';
  return null;
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: classify expansion cards for counter logic"
```

---

### Task 3: resolveEffect — 得点系（盗み食い・ヤキモチ・食いだめ）

**Files:**
- Modify: `src/game-rules.js`（resolveEffect の switch に3ケース追加）
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `addScore`, `hasSukima`, `opponent`, `label`, `CARD_TYPES`
- Produces: resolveEffect が nusumi/yakimochi/kuidame を処理

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL

- [ ] **Step 3: resolveEffect に3ケースを追加** (`src/game-rules.js`)

`switch (kind)` の中（default の前）に追加:

```javascript
    case 'nusumi':
      s = addScore(s, who, 1);
      if (!hasSukima(s, opp)) {
        s.scores[opp] = Math.max(0, s.scores[opp] - 1);
      }
      s.log.push(`${label(who)}は「${CARD_TYPES.nusumi.name}」で相手のスキを1奪った`);
      break;
    case 'yakimochi':
      if (!hasSukima(s, opp)) {
        s.scores[opp] = Math.max(0, s.scores[opp] - 2);
        s.log.push(`${label(who)}は「${CARD_TYPES.yakimochi.name}」で相手のスキを2減らした`);
      } else {
        s.log.push(`${label(who)}の「${CARD_TYPES.yakimochi.name}」は隙間にすっぽりで無効化された`);
      }
      break;
    case 'kuidame': {
      const gain = Math.min(4, s.hands[who].length);
      s = addScore(s, who, gain);
      s.log.push(`${label(who)}は「${CARD_TYPES.kuidame.name}」でスキを${gain}こ獲得`);
      break;
    }
```

注: `discardFromHand(s, who, cardId)` は switch の手前で既に実行済みなので、kuidame の `s.hands[who].length` はカードを出した後の残り枚数になる（仕様どおり）。

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: resolveEffect for nusumi, yakimochi, kuidame"
```

---

### Task 4: resolveEffect — 手札/情報系（イタズラ・脱走・物々交換・クンクン）

**Files:**
- Modify: `src/game-rules.js`（resolveEffect に4ケース追加）
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `drawCards`, `hasSukima`, `opponent`, `label`, `CARD_TYPES`, `shuffle`
- Produces: resolveEffect が itazura/dassou/kokan/kunkun を処理。kunkun は `s.reveal[who] = true` を立てる

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL

- [ ] **Step 3: resolveEffect に4ケースを追加** (`src/game-rules.js`)

`switch (kind)` の中（default の前）に追加:

```javascript
    case 'itazura':
      if (!hasSukima(s, opp)) {
        let n = 0;
        while (n < 2 && s.hands[opp].length > 0) {
          const j = Math.floor(rng() * s.hands[opp].length);
          s.discard.push(s.hands[opp].splice(j, 1)[0]);
          n++;
        }
        s.log.push(`${label(who)}は「${CARD_TYPES.itazura.name}」で相手の手札を${n}枚捨てさせた`);
      } else {
        s.log.push(`${label(who)}の「${CARD_TYPES.itazura.name}」は隙間にすっぽりで無効化された`);
      }
      break;
    case 'dassou': {
      while (s.hands[who].length > 0) s.discard.push(s.hands[who].pop());
      s = drawCards(s, who, 5, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.dassou.name}」で手札を引き直した`);
      break;
    }
    case 'kokan':
      if (!hasSukima(s, opp) && s.hands[who].length > 0 && s.hands[opp].length > 0) {
        const i = Math.floor(rng() * s.hands[who].length);
        const j = Math.floor(rng() * s.hands[opp].length);
        const mine = s.hands[who].splice(i, 1)[0];
        const theirs = s.hands[opp].splice(j, 1)[0];
        s.hands[who].push(theirs);
        s.hands[opp].push(mine);
        s.log.push(`${label(who)}は「${CARD_TYPES.kokan.name}」で手札を1枚交換した`);
      } else {
        s.log.push(`${label(who)}は「${CARD_TYPES.kokan.name}」を出したが交換できなかった`);
      }
      break;
    case 'kunkun':
      s.reveal[who] = true;
      s = drawCards(s, who, 1, rng);
      s.log.push(`${label(who)}は「${CARD_TYPES.kunkun.name}」で相手の手札をのぞき見した`);
      break;
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: resolveEffect for itazura, dassou, kokan, kunkun"
```

---

### Task 5: おかわり（追加行動）と reveal 解除を endTurn に組み込む

**Files:**
- Modify: `src/game-rules.js`（resolveEffect に okawari、endTurn に reveal 解除、consumeExtraAction 追加）
- Test: `test/game-rules.test.js`

**Interfaces:**
- Consumes: `clone`
- Produces:
  - resolveEffect が okawari で `s.extraActions += 1`
  - `consumeExtraAction(state): State` — extraActions を1減らした新stateを返す（0未満にしない）。エクスポートする
  - `endTurn` が、手番が次に移るプレイヤーの reveal を解除する（自分の番が再び始まるとき公開終了）

- [ ] **Step 1: 失敗するテストを書く**

```javascript
import { consumeExtraAction } from '../src/game-rules.js';

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
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/game-rules.test.js`
Expected: FAIL

- [ ] **Step 3: 実装** (`src/game-rules.js`)

resolveEffect の switch に追加:

```javascript
    case 'okawari':
      s.extraActions += 1;
      s.log.push(`${label(who)}は「${CARD_TYPES.okawari.name}」でもう1枚出せる`);
      break;
```

`consumeExtraAction` を追加（addScore の近くにエクスポート）:

```javascript
export function consumeExtraAction(state) {
  const s = clone(state);
  s.extraActions = Math.max(0, (s.extraActions || 0) - 1);
  return s;
}
```

`endTurn` の末尾、`s.turn = nextTurn;` の直前か直後に reveal 解除を追加（次に番が来るプレイヤーの公開を終了）:

```javascript
  s.turn = nextTurn;
  if (s.reveal[nextTurn]) s.reveal[nextTurn] = false;
  return s;
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "feat: okawari extra action, consumeExtraAction, reveal clearing"
```

---

### Task 6: AI（chooseMain / chooseCounter）の拡張

**Files:**
- Modify: `src/ai.js`
- Test: `test/ai.test.js`

**Interfaces:**
- Consumes: `legalPlays`, `cardKind`, `opponent`
- Produces: AI が新カードを合法手として選べ、ふつうAIが攻撃カードを適切に評価する

- [ ] **Step 1: 失敗するテストを書く** (`test/ai.test.js`)

```javascript
test('normal AI values nusumi/kuidame as scoring options', () => {
  const s = createInitialState();
  s.hands.host = ['nusumi_1', 'kokan_1']; // nusumi scores, kokan utility
  const { cardId } = chooseMain(s, 'host', 'normal', () => 0);
  assert.equal(cardId, 'nusumi_1');
});

test('normal AI plays yakimochi when opponent is near winning', () => {
  const s = createInitialState();
  s.scores.guest = 18;
  s.hands.host = ['kokan_1', 'yakimochi_1'];
  const { cardId } = chooseMain(s, 'host', 'normal', () => 0);
  assert.equal(cardId, 'yakimochi_1');
});

test('chooseMain always returns a legal card including expansion kinds', () => {
  const s = createInitialState();
  s.hands.host = ['kunkun_1', 'dassou_1', 'okawari_1'];
  const { cardId } = chooseMain(s, 'host', 'easy', () => 0);
  assert.ok(s.hands.host.includes(cardId));
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `node --test test/ai.test.js`
Expected: FAIL

- [ ] **Step 3: ai.js を更新** (`src/ai.js`)

現在 `SCORE_VALUE` は `{ hesoten:3, hikoki:2, zoomies:2, shibakyori:1 }`。拡張の得点カードを追加し、妨害優先に yakimochi を含める。`chooseMain` の normal 分岐を更新:

```javascript
const SCORE_VALUE = { hesoten: 3, hikoki: 2, zoomies: 2, shibakyori: 1, nusumi: 2, kuidame: 2 };
const SABOTAGE_KINDS = ['kangeki', 'yakimochi', 'itazura', 'shibakyori'];
```

normal 分岐の「相手が17以上なら妨害優先」を、複数候補から探すよう更新:

```javascript
  if (oppScore >= 17) {
    const sabotage = plays.find((id) => SABOTAGE_KINDS.includes(cardKind(id)));
    if (sabotage) return { cardId: sabotage, opts: {} };
  }
```

得点カードのソートは `SCORE_VALUE` 参照のままで nusumi/kuidame も拾える。フォールバックの drill 捨て札判定はそのまま。chooseCounter は既存ロジック（score≥3 or 相手17以上で拒否柴、sabotage は虚無顔があれば常に）でよいが、`SCORE_VALUE` に nusumi/kuidame が入ったことで attackValue が取れる。

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/ai.js test/ai.test.js
git commit -m "feat: AI evaluates expansion cards"
```

---

### Task 7: エンジン（CPU対CPU）の追加行動対応

**Files:**
- Modify: `src/engine.js`（takeTurn で extraActions を消費して同じプレイヤーが続行）
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: `playCard`, `applyCounter`, `endTurn`, `opponent`, `consumeExtraAction`、`controllers`
- Produces: takeTurn が追加行動を処理し、CPU対CPVが okawari を含んでも完走する

- [ ] **Step 1: 失敗するテストを書く** (`test/engine.test.js`)

```javascript
test('CPU vs CPU completes even with expansion deck (multiple seeds)', () => {
  for (let base = 1; base <= 20; base++) {
    let seed = base * 7919;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const final = playOutGame(
      { host: aiController('normal', rng), guest: aiController('easy', rng) },
      rng,
    );
    assert.ok(final.winner, `seed ${base} no winner`);
    assert.ok(final.scores[final.winner] >= 20, `seed ${base} winner below 20`);
  }
});
```

（`aiController` は既存テストのヘルパー。ファイル上部で定義済み。）

- [ ] **Step 2: テスト実行で失敗を確認（または既存が無限ループ/未完走になることを確認）**

Run: `node --test test/engine.test.js`
Expected: FAIL もしくは新デッキで追加行動が処理されず未完走

- [ ] **Step 3: takeTurn を更新** (`src/engine.js`)

現在の takeTurn は1手プレイして endTurn する。追加行動が残る間、同じプレイヤーがプレイを続けるループに変更:

```javascript
import { createInitialState, playCard, applyCounter, endTurn, opponent, consumeExtraAction } from './game-rules.js';

export function takeTurn(state, controllers, rng = Math.random) {
  if (state.winner) return state;
  const who = state.turn;
  let s = state;

  // The active player may take extra actions (おかわり) before the turn ends.
  while (true) {
    const { cardId, opts } = controllers[who].main(s, who);
    if (!cardId) break; // no legal move -> pass
    s = playCard(s, who, cardId, opts, rng);
    if (s.phase === 'awaiting_counter') {
      const defender = opponent(s.pending.actor);
      const counterCard = controllers[defender].counter(s, defender);
      s = applyCounter(s, defender, counterCard, rng);
    }
    if (s.winner) return s;
    if (s.extraActions > 0 && s.turn === who) {
      s = consumeExtraAction(s);
      continue; // same player plays again, no endTurn
    }
    break;
  }
  if (s.winner) return s;
  return endTurn(s, rng);
}
```

注意: zoomies の `forceEndTurn` が立っても、このエンジンでは追加行動より endTurn を優先しない簡略実装。forceEndTurn 時は extraActions が残っていてもターンを終える方が自然なので、ループ継続条件に `&& !s.forceEndTurn` を加える:

```javascript
    if (s.extraActions > 0 && s.turn === who && !s.forceEndTurn) {
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npm test`
Expected: PASS（全シード完走・勝者20点以上）

- [ ] **Step 5: コミット**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: engine supports extra actions (okawari)"
```

---

### Task 8: UI — 新カードの絵文字表示・効果テキスト・相手手札公開

**Files:**
- Modify: `src/ui.js`（EFFECT_TEXT 追加、renderCard の画像/絵文字分岐、reveal 時の相手手札描画）
- Modify: `index.html`（相手手札表示用に既存 `#opp-field` を流用、または手札表示領域。下記参照）
- Modify: `style.css`（絵文字カードの体裁）

**Interfaces:**
- Consumes: `CARD_TYPES`, `cardKind`, state.reveal
- Produces:
  - `renderCard(cardId)`：既存9種は画像、新8種は絵文字＋名前＋効果テキスト
  - `renderBoard`：`state.reveal[viewer]` が true のとき相手の手札を相手フィールド上部に表向きで表示

- [ ] **Step 1: EFFECT_TEXT に8種追加し、renderCard を画像/絵文字分岐に** (`src/ui.js`)

EFFECT_TEXT に追記:

```javascript
  nusumi: '相手のスキを1奪う', yakimochi: '相手のスキを2減らす',
  itazura: '相手の手札を2枚捨て', dassou: '手札を引き直す',
  kunkun: '相手の手札を見る & 1枚引く', kokan: '手札を1枚交換',
  kuidame: '手札の枚数ぶんスキ(最大4)', okawari: 'もう1枚出せる',
```

renderCard を分岐に変更（既存9種のみ画像）:

```javascript
const IMAGE_KINDS = new Set(['hikoki','hesoten','kyohi','kyomu','shibakyori','sukima','drill','zoomies','kangeki']);

export function renderCard(cardId) {
  const kind = cardKind(cardId);
  const def = CARD_TYPES[kind];
  const el = document.createElement('div');
  el.dataset.cardId = cardId;
  if (IMAGE_KINDS.has(kind)) {
    el.className = `card ${def.category}`;
    el.innerHTML = `
      <div class="card-art"><img src="img/${kind}.jpg" alt="${def.name}"></div>
      <div class="effect">${EFFECT_TEXT[kind]}</div>`;
  } else {
    el.className = `card text-card ${def.category}`;
    el.innerHTML = `
      <div class="emoji">${def.emoji}</div>
      <div class="name">${def.name}</div>
      <div class="effect">${EFFECT_TEXT[kind]}</div>`;
  }
  return el;
}
```

- [ ] **Step 2: renderBoard で reveal 時に相手手札を表示** (`src/ui.js`)

renderBoard 内、`#opp-field` を描画している箇所の後に、reveal 時の相手手札を追記する。現在 `state.field[opp]` を opp-field に描画している。reveal 時は相手手札カードも opp-field に続けて表示する:

```javascript
  state.field[opp].forEach((id) => fieldOpp.appendChild(renderCard(id)));
  if (state.reveal && state.reveal[viewer]) {
    state.hands[opp].forEach((id) => {
      const c = renderCard(id);
      c.classList.add('peek');
      fieldOpp.appendChild(c);
    });
  }
```

- [ ] **Step 3: style.css に絵文字カードと peek の体裁を追加** (`style.css`)

```css
.card.text-card { display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 135px; padding: 6px; gap: 4px; }
.card.text-card .emoji { font-size: 2.4rem; }
.card.text-card .name { font-weight: bold; font-size: .8rem; text-align: center; }
.card.text-card .effect { position: static; background: none; font-size: .66rem;
  text-align: center; line-height: 1.15; }
.card.peek { opacity: .85; transform: scale(.92); }
```

（`.card .effect` の絶対配置は画像カード用。text-card では static に上書きしている。）

- [ ] **Step 4: ブラウザで確認（コントローラ実施）**

ローカルサーバ → CPU戦。手札に新カードが絵文字＋名前＋効果で表示される／既存カードは画像のまま／クンクンを出すと相手手札が（peekスタイルで）相手側に表示される、を目視。

- [ ] **Step 5: コミット**

```bash
git add src/ui.js style.css
git commit -m "feat: render expansion cards (emoji) and peek opponent hand"
```

---

### Task 9: 3モードの追加行動（おかわり）対応

**Files:**
- Modify: `src/main.js`（CPU・パス&プレイ・オンラインで追加行動を処理）
- Test: なし（ブラウザ実機確認）

**Interfaces:**
- Consumes: `consumeExtraAction`（game-rules）
- Produces: おかわり後、同じプレイヤーがもう1枚プレイできる（パス&プレイでは受け渡し無し、オンラインでは actor の手番継続）

import に `consumeExtraAction` を追加:
```javascript
import {
  createInitialState, playCard, applyCounter, endTurn,
  legalPlays, CARD_TYPES, cardKind, opponent, setLabels, consumeExtraAction,
} from './game-rules.js';
```

- [ ] **Step 1: CPU戦の追加行動** (`src/main.js`)

`onPlayCard`（人間）と `cpuTurn`/`finishCpuTurn`（CPU）で、効果解決後に追加行動が残れば endTurn せず継続する。

`onPlayCard` の末尾を変更:

```javascript
  if (state.phase === 'awaiting_counter') {
    const cpuCounter = chooseCounter(state, CPU, difficulty);
    state = applyCounter(state, CPU, cpuCounter);
  }
  // 追加行動が残るなら手番を終えず、人間がもう1枚出せる
  if (!state.winner && state.turn === HUMAN && state.extraActions > 0) {
    state = consumeExtraAction(state);
    refresh();
    return;
  }
  if (!state.winner) state = endTurn(state);
  refresh();
  if (!state.winner) cpuTurn();
```

`finishCpuTurn` を変更（CPUの追加行動）:

```javascript
function finishCpuTurn() {
  if (!state.winner && state.turn === CPU && state.extraActions > 0) {
    state = consumeExtraAction(state);
    refresh();
    cpuTurn();
    return;
  }
  if (!state.winner) state = endTurn(state);
  refresh();
  if (!state.winner && state.turn === CPU) cpuTurn();
}
```

- [ ] **Step 2: パス&プレイの追加行動** (`src/main.js`)

`afterActionPass` の「phase==='main' で endTurn する」前に、追加行動が残れば同じ holder が続行する分岐を入れる:

```javascript
function afterActionPass() {
  if (state.winner) { renderPass(); return; }

  if (state.phase === 'awaiting_counter' && state.pending) {
    const actor = opponent(state.pending.actor);
    if (actor !== holder) { holder = actor; showHandoff(P_LABEL[actor], renderPass); }
    else { renderPass(); }
    return;
  }

  // 追加行動: 同じプレイヤーが受け渡し無しで続行
  if (state.turn === holder && state.extraActions > 0) {
    state = consumeExtraAction(state);
    renderPass();
    return;
  }

  state = endTurn(state);
  if (state.winner) { renderPass(); return; }
  const next = state.turn;
  if (next !== holder) { holder = next; showHandoff(P_LABEL[next], renderPass); }
  else { renderPass(); }
}
```

- [ ] **Step 3: オンラインの追加行動** (`src/main.js`)

`onPlayCardOnline`：非カウンターのプレイ後、追加行動が残れば endTurn せず push して自分の手番を継続:

```javascript
  state = playCard(state, myRole, cardId, opts);
  if (state.phase === 'awaiting_counter') {
    await pushState(roomCode, state);
  } else if (state.turn === myRole && state.extraActions > 0) {
    state = consumeExtraAction(state);
    await pushState(roomCode, state);
  } else {
    state = endTurn(state);
    await pushState(roomCode, state);
  }
```

`afterCounter`（防御側がカウンター解決後に endTurn する箇所）：カウンター解決後に攻撃側へ追加行動が残る場合の扱い。カウンターが起きるのは得点/妨害カードで、それらは okawari ではないため追加行動は発生しない。ただし防御側が endTurn する前に攻撃側 `extraActions` が残っている可能性は無い（okawari は awaiting_counter を作らない）。したがって `afterCounter` は現状のままでよい（変更不要）。

- [ ] **Step 4: ブラウザで確認（コントローラ実施）**

- CPU戦：手札に「おかわり」を出すと、もう1枚出せる（連続でカードを出せる）。2枚目を出すとターンが終わる。
- パス&プレイ：「おかわり」を出しても受け渡し画面が出ず、同じプレイヤーが続けて出せる。次の通常カードで相手に受け渡し。
- クンクン：相手手札が見える。
- CPU/パス/オンラインの基本フローが壊れていない。

- [ ] **Step 5: コミット**

```bash
git add src/main.js
git commit -m "feat: handle okawari extra action across CPU/pass/online modes"
```

---

### Task 10: バランス確定（シミュレーション）と最終調整

**Files:**
- Modify: `src/game-rules.js`（必要ならカード枚数の最終調整）
- Test: `test/game-rules.test.js`（枚数を変えた場合はアサーション更新、合計は変更後の値）

**Interfaces:**
- Consumes: `scripts/balance-sim.mjs`
- Produces: 実測に基づく最終デッキ構成

- [ ] **Step 1: 出発点構成で計測**

Run: `node scripts/balance-sim.mjs 1000`
Expected: 統計出力（決着率・平均敗者スコア・先攻勝率）。**出力を報告書に貼る。**

- [ ] **Step 2: 目標と比較**

目標: 決着率ほぼ100%、平均敗者スコア12〜18、先攻勝率45〜58%程度。新カードで攻撃が増え決着が早すぎる/遅すぎる場合は枚数調整の候補を報告する（実装者は出発点の計測を報告し、最終決定はコントローラが指示）。

- [ ] **Step 3: （コントローラ指示があれば）枚数を調整して再計測**

調整する場合は CARD_TYPES の count と、Task 1 の枚数テストのアサーション・合計を合わせて更新し、`npm test` が緑であること・`node scripts/balance-sim.mjs 1000` の再計測値を報告する。

- [ ] **Step 4: コミット**

```bash
git add src/game-rules.js test/game-rules.test.js
git commit -m "balance: finalize expansion deck counts from simulation"
```

---

## 実装順序のまとめ

1. Task 1–2: カード定義・state・分類（土台、TDD）
2. Task 3–5: resolveEffect の8効果＋追加行動＋公開（TDD）
3. Task 6–7: AI・エンジン（追加行動込みのCPU対CPV完走、TDD）
4. Task 8–9: UI・3モードの追加行動（ブラウザ確認）
5. Task 10: シミュレーションで最終バランス確定

Task 1–7 はテストで、Task 8–9 はブラウザ実機（コントローラがpreviewで確認）、Task 10 は計測。各タスクは独立検証可能。
</content>
