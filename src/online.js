import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, set, get, onValue, child, update,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';
import { createInitialState } from './game-rules.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function createRoom() {
  const code = genCode();
  await set(ref(db, `rooms/${code}`), {
    status: 'waiting',
    createdAt: Date.now(),
    players: { host: { name: 'host', connected: true } },
  });
  return { code, role: 'host' };
}

export async function joinRoom(code) {
  const snap = await get(child(ref(db), `rooms/${code}`));
  if (!snap.exists()) throw new Error('部屋が見つかりません');
  const room = snap.val();
  if (room.status !== 'waiting') throw new Error('この部屋はすでに対戦中です');
  if (room.players && room.players.guest) throw new Error('この部屋は満員です');
  const initial = createInitialState();
  await update(ref(db, `rooms/${code}`), {
    'players/guest': { name: 'guest', connected: true },
    status: 'playing',
    state: initial,
  });
  return { code, role: 'guest' };
}

export function subscribe(code, onState) {
  const stateRef = ref(db, `rooms/${code}`);
  return onValue(stateRef, (snap) => {
    const room = snap.val();
    if (room) onState(room);
  });
}

export async function pushState(code, state) {
  await set(ref(db, `rooms/${code}/state`), state);
}

export async function setRematch(code, role) {
  await set(ref(db, `rooms/${code}/rematch/${role}`), true);
}

export async function resetRematch(code) {
  await set(ref(db, `rooms/${code}/rematch`), { host: false, guest: false });
}

export async function startNewGame(code, state) {
  await update(ref(db, `rooms/${code}`), { state, status: 'playing', rematch: { host: false, guest: false } });
}
