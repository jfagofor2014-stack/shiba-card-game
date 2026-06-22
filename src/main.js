import { showScreen, renderBoard, showCounterPrompt, showResult } from './ui.js';
import {
  createInitialState, playCard, applyCounter, endTurn,
  legalPlays, CARD_TYPES, cardKind,
} from './game-rules.js';
import { chooseMain, chooseCounter } from './ai.js';

let state = null;
let difficulty = 'normal';
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
  document.querySelectorAll('.back').forEach((b) => (b.onclick = () => showScreen('top')));
  document.getElementById('btn-home').onclick = () => showScreen('top');
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

function startOnline(subscribe, pushState) {
  if (unsub) unsub();
  unsub = subscribe(roomCode, (room) => {
    if (room.status === 'playing' && room.state) {
      state = room.state;
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
  if (state.winner) { showResult(state.winner === myRole ? 'あなた' : '相手'); return; }

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
        def.name,
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
  let opts = {};
  if (cardKind(cardId) === 'drill') opts = { drillDiscard: [] };
  state = playCard(state, myRole, cardId, opts);
  if (state.phase === 'awaiting_counter') {
    // counterable card: push awaiting_counter and do nothing else.
    // The defender resolves the counter and finalizes the turn.
    await pushState(roomCode, state);
  } else {
    // non-counterable card: end turn immediately and push once.
    state = endTurn(state);
    await pushState(roomCode, state);
  }
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
  if (!state.winner && state.turn === CPU) cpuTurn();
}

wireMenu();
wireOnline();
showScreen('top');
