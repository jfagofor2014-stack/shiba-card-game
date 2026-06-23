// CPU対CPUを多数回回してバランス統計を出す計測ツール（アプリ本体からは未参照）
// 使い方: node scripts/balance-sim.mjs [games]
import { playOutGame } from '../src/engine.js';
import { chooseMain, chooseCounter } from '../src/ai.js';

function aiController(difficulty, rng) {
  return {
    main: (state, who) => chooseMain(state, who, difficulty, rng),
    counter: (state, defender) => chooseCounter(state, defender, difficulty, rng),
  };
}

const games = Number(process.argv[2] || 500);
let decisive = 0, loserScoreSum = 0, hostWins = 0;
const MAX_TURNS = 200;

for (let g = 0; g < games; g++) {
  let seed = (g + 1) * 2654435761 % 2147483647;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const final = playOutGame(
    { host: aiController('normal', rng), guest: aiController('normal', rng) },
    rng, MAX_TURNS,
  );
  if (final.winner) {
    decisive++;
    hostWins += final.winner === 'host' ? 1 : 0;
    const loser = final.winner === 'host' ? 'guest' : 'host';
    loserScoreSum += final.scores[loser];
  }
}

console.log(`games=${games}`);
console.log(`decisive(20点決着)=${(100 * decisive / games).toFixed(1)}%`);
console.log(`平均 敗者スコア=${(loserScoreSum / Math.max(decisive, 1)).toFixed(1)}`);
console.log(`先攻(host)勝率=${(100 * hostWins / Math.max(decisive, 1)).toFixed(1)}%`);
