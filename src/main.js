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
  if (!state.winner && state.turn === CPU) cpuTurn();
}

wireMenu();
showScreen('top');
