import { CARD_TYPES, cardKind } from './game-rules.js';

const EFFECT_TEXT = {
  hikoki: 'スキ+2', hesoten: 'スキ+3 & 1枚引く', kyohi: '相手の得点を無効化',
  kyomu: '妨害を無効化', shibakyori: 'スキ+1 & 相手手札1枚捨て',
  sukima: '次の自分の番まで効果を受けない', drill: '捨てた枚数+1引く',
  zoomies: '甘えならスキ+5 / 外れで終了', kangeki: '相手1回休み',
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
    `あなた スキ${state.scores[viewer]} - スキ${state.scores[opp]} あいて`;

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

  const log = document.getElementById('log');
  const total = state.log.length;
  const shown = state.log.slice(-6);
  const startNo = total - shown.length + 1;
  log.innerHTML = shown.map((l, i) => `<div>${startNo + i}. ${l}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

export function effectTextFor(cardId) {
  return EFFECT_TEXT[cardKind(cardId)];
}

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

export function showResult(winnerLabel) {
  document.getElementById('result-text').textContent = `${winnerLabel}の勝ち！🎉`;
  showScreen('result');
}

export function showHandoff(playerLabel, onReady) {
  const root = document.getElementById('handoff-root');
  root.innerHTML = `
    <div class="handoff"><div class="handoff-box">
      <p>📱 ${playerLabel} に渡してください</p>
      <button id="handoff-ready">準備ができたらタップ</button>
    </div></div>`;
  document.getElementById('handoff-ready').onclick = () => { root.innerHTML = ''; onReady(); };
}
