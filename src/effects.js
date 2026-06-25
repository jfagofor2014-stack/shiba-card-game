// 純UI演出モジュール（DOM操作のみ、ゲーム状態を持たない）

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

export function requestLandscape() {
  const el = document.documentElement;
  try { if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

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
