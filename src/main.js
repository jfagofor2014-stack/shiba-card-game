import { showScreen, renderBoard, showCounterPrompt, showResult, effectTextFor, showHandoff } from './ui.js';
import {
  createInitialState, playCard, applyCounter, endTurn,
  legalPlays, CARD_TYPES, cardKind, opponent, setLabels, consumeExtraAction,
} from './game-rules.js';
import { chooseMain, chooseCounter } from './ai.js';
import { requestLandscape, initOrientationGuard, showLottery, playCardBattle, showWinCelebration } from './effects.js';

let state = null;
let difficulty = 'normal';
let currentMode = null; // 'cpu' | 'pass' | 'online'
const HUMAN = 'host';
const CPU = 'guest';

// Online state
let myRole = null;
let roomCode = null;
let unsub = null;
let resolvingCounter = false;

function wireMenu() {
  document.getElementById('btn-cpu').onclick = () => showScreen('difficulty');
  document.getElementById('btn-online').onclick = () => showScreen('online');
  document.getElementById('btn-guide').onclick = () => showScreen('guide');
  document.querySelectorAll('.back').forEach((b) => (b.onclick = () => showScreen('top')));
  document.getElementById('btn-home').onclick = () => showScreen('top');
  document.getElementById('btn-again').onclick = () => {
    if (currentMode === 'cpu') startCpuGame();
    else if (currentMode === 'pass') startPassGame();
    else if (currentMode === 'online') requestOnlineRematch();
  };
  document.querySelectorAll('[data-diff]').forEach((b) => {
    b.onclick = () => { difficulty = b.dataset.diff; startCpuGame(); };
  });
}

function wireOnline() {
  document.getElementById('btn-create').onclick = async () => {
    const { createRoom, subscribe, pushState } = await import('./online.js');
    const { code, role } = await createRoom();
    roomCode = code; myRole = role;
    document.getElementById('online-status').textContent = `コード: ${code}（相手の参加を待っています）`;
    startOnline(subscribe, pushState);
  };
  document.getElementById('btn-join').onclick = async () => {
    const code = document.getElementById('join-code').value.trim();
    try {
      const { joinRoom, subscribe, pushState } = await import('./online.js');
      const res = await joinRoom(code);
      roomCode = res.code; myRole = res.role;
      startOnline(subscribe, pushState);
    } catch (e) {
      document.getElementById('online-status').textContent = e.message;
    }
  };
}

let onlineLotteryShown = false;
function startOnline(subscribe, pushState) {
  setLabels('あなた', 'あいて');
  currentMode = 'online';
  onlineLotteryShown = false;
  if (unsub) unsub();
  unsub = subscribe(roomCode, async (room) => {
    if (room.rematch && room.rematch.host && room.rematch.guest) {
      if (myRole === 'host') {
        const first = Math.random() < 0.5 ? 'host' : 'guest';
        const { startNewGame } = await import('./online.js');
        await startNewGame(roomCode, createInitialState(Math.random, first));
      }
      onlineLotteryShown = false;
      return;
    }
    if (room.status === 'playing' && room.state) {
      state = room.state;
      if (!onlineLotteryShown) {
        onlineLotteryShown = true;
        showScreen('lottery');
        showLottery({ host: 'あなた', guest: 'あいて' }, { forced: state.turn }, () => {
          showScreen('game'); renderOnline(pushState);
        });
        return;
      }
      // While the tail-lottery animation is still on screen, don't render into the
      // (hidden) game screen — the lottery's onResult will show the game and render.
      if (!document.querySelector('[data-screen="lottery"]').classList.contains('hidden')) return;
      if (document.querySelector('[data-screen="game"]').classList.contains('hidden')) {
        showScreen('game');
      }
      renderOnline(pushState);
    }
  });
}

async function renderOnline(pushState) {
  // Reset re-entrancy guard whenever we are not in awaiting_counter phase,
  // so it cannot get permanently stuck true.
  if (state.phase !== 'awaiting_counter') resolvingCounter = false;

  renderBoard(state, myRole, { onPlayCard: (cardId) => onPlayCardOnline(cardId, pushState) });
  if (state.winner) { const l = state.winner === myRole ? 'あなた' : '相手'; showWinCelebration(l, () => showResult(l)); return; }

  // if I am the defender in an awaiting_counter, I resolve the counter,
  // run endTurn, and push the finalized next-turn state in a single write.
  if (state.phase === 'awaiting_counter' && state.pending && state.pending.actor !== myRole) {
    // Guard: if a resolution is already in-flight, ignore duplicate snapshots.
    if (resolvingCounter) return;
    resolvingCounter = true;

    const counters = legalPlays(state, myRole);
    const def = CARD_TYPES[cardKind(state.pending.cardId)];
    if (counters.length > 0) {
      showCounterPrompt(
        'あいて', def.name, effectTextFor(state.pending.cardId),
        async () => { state = applyCounter(state, myRole, counters[0]); await afterCounter(pushState); resolvingCounter = false; },
        async () => { state = applyCounter(state, myRole, null); await afterCounter(pushState); resolvingCounter = false; },
      );
    } else {
      // no counter available: auto-resolve as defender
      state = applyCounter(state, myRole, null);
      await afterCounter(pushState);
      resolvingCounter = false;
    }
  }
}

async function afterCounter(pushState) {
  // The defender (this client) resolved the counter. Finalize the turn here and
  // push once, so counter resolution is a single atomic write — no echo race,
  // and the actor never finalizes.
  if (!state.winner) state = endTurn(state);
  await pushState(roomCode, state);
}

async function onPlayCardOnline(cardId, pushState) {
  if (state.turn !== myRole || state.phase !== 'main') return;
  if (!legalPlays(state, myRole).includes(cardId)) return;
  const def = CARD_TYPES[cardKind(cardId)];
  playCardBattle(def.name, effectTextFor(cardId), async () => {
    let opts = {};
    if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
    state = playCard(state, myRole, cardId, opts);
    if (state.phase === 'awaiting_counter') {
      // counterable card: push awaiting_counter and do nothing else.
      // The defender resolves the counter and finalizes the turn.
      await pushState(roomCode, state);
    } else if (state.turn === myRole && state.extraActions > 0) {
      state = consumeExtraAction(state);
      renderBoard(state, myRole, { onPlayCard: (id) => onPlayCardOnline(id, pushState) });
      await pushState(roomCode, state);
    } else {
      // non-counterable card: end turn immediately and push once.
      state = endTurn(state);
      await pushState(roomCode, state);
    }
  });
}

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

function refresh() {
  renderBoard(state, HUMAN, { onPlayCard });
  if (state.winner) {
    const label = state.winner === HUMAN ? 'あなた' : 'CPU';
    showWinCelebration(label, () => showResult(label));
  }
}

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
    // CPU decides whether to counter the human's play
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
}

function cpuTurn() {
  if (state.turn !== CPU || state.winner) return;
  const { cardId, opts } = chooseMain(state, CPU, difficulty);
  if (!cardId) { state = endTurn(state); refresh(); return; }
  const def = CARD_TYPES[cardKind(cardId)];
  playCardBattle(def.name, effectTextFor(cardId), () => {
    state = playCard(state, CPU, cardId, opts);

    if (state.phase === 'awaiting_counter') {
      // human may counter CPU's score/sabotage
      const humanCounters = legalPlays(state, HUMAN);
      if (humanCounters.length > 0) {
        const cpuDef = CARD_TYPES[cardKind(state.pending.cardId)];
        showCounterPrompt(
          'あいて', cpuDef.name, effectTextFor(state.pending.cardId),
          () => { state = applyCounter(state, HUMAN, humanCounters[0]); finishCpuTurn(); },
          () => { state = applyCounter(state, HUMAN, null); finishCpuTurn(); },
        );
        return;
      }
      state = applyCounter(state, HUMAN, null);
    }
    finishCpuTurn();
  });
}

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

// Pass-and-play state
const P_LABEL = { host: 'プレイヤー1', guest: 'プレイヤー2' };
let holder = null;

function wirePass() {
  document.getElementById('btn-pass').onclick = startPassGame;
}

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


function renderPass() {
  renderBoard(state, holder, { onPlayCard: onPlayCardPass });
  if (state.winner) { const l = P_LABEL[state.winner]; showWinCelebration(l, () => showResult(l)); return; }

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
  const def = CARD_TYPES[cardKind(cardId)];
  playCardBattle(def.name, effectTextFor(cardId), () => {
    let opts = {};
    if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
    state = playCard(state, holder, cardId, opts);
    afterActionPass();
  });
}

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

async function requestOnlineRematch() {
  const { setRematch } = await import('./online.js');
  document.getElementById('result-text').textContent = '相手の返事待ち…';
  await setRematch(roomCode, myRole);
}

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
