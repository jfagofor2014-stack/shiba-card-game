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
