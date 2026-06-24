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
