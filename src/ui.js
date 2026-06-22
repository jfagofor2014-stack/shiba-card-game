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
