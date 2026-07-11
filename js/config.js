export const TILE_SIZE = 32;
export const CANVAS_W = 960;
export const CANVAS_H = 640;
export const PLAYER_SPEED = 120;
export const RUN_MULTIPLIER = 1.6;
export const MONSTER_SPEED = 55;
export const MONSTER_CHASE_SPEED = 85;
export const MONSTER_DETECT_RANGE = 160;
export const MONSTER_ATTACK_RANGE = 26;
export const MONSTER_ATTACK_DAMAGE = 20;
export const MONSTER_ATTACK_COOLDOWN = 1200;
export const PLAYER_MAX_HP = 100;
export const WEAPON_PICKUP_RANGE = 24;
export const WEAPON_DAMAGE = 50;
export const WEAPON_ATTACK_RANGE = 36;
export const WEAPON_ATTACK_COOLDOWN = 500;
export const EXIT_RANGE = 28;
export const MAP_PICKUP_RANGE = 28;
export const LIGHT_RADIUS = 150;
export const GHOST_ALPHA = 0.35;
export const SHIRT_COLORS = ['#3355cc','#cc3333','#33aa33','#cc8833','#8833cc','#33cccc','#cccc33','#cc33aa'];
export const TILE = { VOID:0, FLOOR:1, WALL:2, EXIT:4, SPAWN:5 };
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillRect(m, x, y, w, h, val) {
  for (let j = y; j < y + h && j < m.length; j++)
    for (let i = x; i < x + w && i < m[0].length; i++)
      m[j][i] = val !== undefined ? val : 2;
}

function carveRect(m, x, y, w, h) {
  fillRect(m, x, y, w, h, 1);
}

function countOpenNeighbors(m, x, y) {
  let c = 0;
  for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
    const nx = x + dx, ny = y + dy;
    if (ny >= 0 && ny < m.length && nx >= 0 && nx < m[0].length && m[ny][nx] !== 2) c++;
  }
  return c;
}

function generateRoomsAndCorridors(W, H, roomCount, roomMin, roomMax) {
  const m = Array.from({length: H}, () => Array(W).fill(2));
  const rooms = [];

  for (let attempt = 0; attempt < roomCount * 20 && rooms.length < roomCount; attempt++) {
    const rw = roomMin + Math.floor(Math.random() * (roomMax - roomMin + 1));
    const rh = roomMin + Math.floor(Math.random() * (roomMax - roomMin + 1));
    const rx = 2 + Math.floor(Math.random() * (W - rw - 4));
    const ry = 2 + Math.floor(Math.random() * (H - rh - 4));

    let overlaps = false;
    for (const r of rooms) {
      if (rx - 1 < r.x + r.w && rx + rw + 1 > r.x && ry - 1 < r.y + r.h && ry + rh + 1 > r.y) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) });
    }
  }

  for (const r of rooms) {
    carveRect(m, r.x, r.y, r.w, r.h);
  }

  const sorted = [...rooms].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];

    if (Math.random() < 0.5) {
      carveHCorridor(m, a.cx, b.cx, a.cy);
      carveVCorridor(m, a.cy, b.cy, b.cx);
    } else {
      carveVCorridor(m, a.cy, b.cy, a.cx);
      carveHCorridor(m, a.cx, b.cx, b.cy);
    }
  }

  if (rooms.length >= 3) {
    const extra = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < extra; i++) {
      const a = rooms[Math.floor(Math.random() * rooms.length)];
      const b = rooms[Math.floor(Math.random() * rooms.length)];
      if (a !== b) {
        if (Math.random() < 0.5) {
          carveHCorridor(m, a.cx, b.cx, a.cy);
          carveVCorridor(m, a.cy, b.cy, b.cx);
        } else {
          carveVCorridor(m, a.cy, b.cy, a.cx);
          carveHCorridor(m, a.cx, b.cx, b.cy);
        }
      }
    }
  }

  return { m, rooms };
}

function carveHCorridor(m, x1, x2, y) {
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  for (let x = start; x <= end; x++) {
    if (y >= 0 && y < m.length && x >= 0 && x < m[0].length) {
      if (m[y][x] === 2) m[y][x] = 1;
      if (y + 1 < m.length && m[y + 1][x] === 2) m[y + 1][x] = 1;
    }
  }
}

function carveVCorridor(m, y1, y2, x) {
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  for (let y = start; y <= end; y++) {
    if (y >= 0 && y < m.length && x >= 0 && x < m[0].length) {
      if (m[y][x] === 2) m[y][x] = 1;
      if (x + 1 < m[0].length && m[y][x + 1] === 2) m[y][x + 1] = 1;
    }
  }
}

function placeExitFarFromSpawn(m, rooms, spawnRoom) {
  let farthest = null;
  let maxDist = 0;
  for (const r of rooms) {
    if (r === spawnRoom) continue;
    const d = Math.hypot(r.cx - spawnRoom.cx, r.cy - spawnRoom.cy);
    if (d > maxDist) {
      maxDist = d;
      farthest = r;
    }
  }
  if (!farthest) farthest = rooms[rooms.length - 1];

  const candidates = [];
  for (let y = farthest.y + 1; y < farthest.y + farthest.h - 1; y++) {
    for (let x = farthest.x + 1; x < farthest.x + farthest.w - 1; x++) {
      if (m[y][x] === 1 && countOpenNeighbors(m, x, y) >= 2) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) candidates.push({ x: farthest.cx, y: farthest.cy });
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  m[pick.y][pick.x] = 4;
  return pick;
}

function generateMap1() {
  const W = 40, H = 30;
  const { m, rooms } = generateRoomsAndCorridors(W, H, 8 + Math.floor(Math.random() * 3), 4, 7);

  const spawnRoom = rooms[0];
  m[spawnRoom.cy][spawnRoom.cx] = 5;
  m[spawnRoom.cy][spawnRoom.cx + 1] = 5;
  if (spawnRoom.cy + 1 < H) m[spawnRoom.cy + 1][spawnRoom.cx] = 5;

  const exitPos = placeExitFarFromSpawn(m, rooms, spawnRoom);

  return { tiles: m, w: W, h: H, spawnPos: { x: spawnRoom.cx, y: spawnRoom.cy }, exitTile: exitPos };
}

function generateMap2() {
  const W = 40, H = 30;
  const m = Array.from({length: H}, () => Array(W).fill(1));

  for (let x = 0; x < W; x++) { m[0][x] = 2; m[H-1][x] = 2; }
  for (let y = 0; y < H; y++) { m[y][0] = 2; m[y][W-1] = 2; }

  const pillarSpacing = 5;
  for (let py = 3; py < H - 3; py += pillarSpacing) {
    for (let px = 3; px < W - 3; px += pillarSpacing) {
      const pw = 1 + Math.floor(Math.random() * 2);
      const ph = 1 + Math.floor(Math.random() * 2);
      fillRect(m, px, py, pw, ph, 2);
    }
  }

  m[2][2] = 5; m[2][3] = 5;

  const candidates = [];
  for (let y = 4; y < H - 2; y++)
    for (let x = 4; x < W - 2; x++)
      if (m[y][x] === 1 && countOpenNeighbors(m, x, y) >= 2)
        candidates.push({ x, y });
  if (candidates.length === 0) candidates.push({ x: W - 4, y: H - 4 });
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  m[pick.y][pick.x] = 4;

  return { tiles: m, w: W, h: H, spawnPos: { x: 2, y: 2 }, exitTile: pick };
}

function generateMap3() {
  const W = 40, H = 30;
  const { m, rooms } = generateRoomsAndCorridors(W, H, 10 + Math.floor(Math.random() * 3), 3, 6);

  for (const r of rooms) {
    if (Math.random() < 0.4) {
      const pillarCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pillarCount; i++) {
        const px = r.x + 1 + Math.floor(Math.random() * (r.w - 2));
        const py = r.y + 1 + Math.floor(Math.random() * (r.h - 2));
        if (m[py][px] === 1) m[py][px] = 2;
      }
    }
  }

  const spawnRoom = rooms[0];
  m[spawnRoom.cy][spawnRoom.cx] = 5;
  m[spawnRoom.cy][spawnRoom.cx + 1] = 5;
  if (spawnRoom.cy + 1 < H) m[spawnRoom.cy + 1][spawnRoom.cx] = 5;

  const exitPos = placeExitFarFromSpawn(m, rooms, spawnRoom);

  return { tiles: m, w: W, h: H, spawnPos: { x: spawnRoom.cx, y: spawnRoom.cy }, exitTile: exitPos };
}

export const MAPS = [
  {
    name: 'The Yellow Halls',
    floorColor: '#c8b832',
    floorColor2: '#baa828',
    wallColor: '#8a7a20',
    wallColorTop: '#a09028',
    wallSide: '#6a5a10',
    bgColor: '#1a1a0a',
    monsterType: 'skeleton',
    monsterCount: 3,
    weaponCount: 3,
    lightRadius: 170,
    ambientLight: 0.15,
    generate: generateMap1
  },
  {
    name: 'The Dark Rooms',
    floorColor: '#2a2a2a',
    floorColor2: '#222222',
    wallColor: '#1a1a1a',
    wallColorTop: '#333333',
    wallSide: '#111111',
    bgColor: '#050505',
    monsterType: 'ghost',
    monsterCount: 4,
    weaponCount: 4,
    lightRadius: 120,
    ambientLight: 0.05,
    generate: generateMap2
  },
  {
    name: 'The Red Corridors',
    floorColor: '#999999',
    floorColor2: '#8a8a8a',
    wallColor: '#6b2020',
    wallColorTop: '#7a2828',
    wallSide: '#4a1010',
    bgColor: '#0a0000',
    monsterType: 'spider',
    monsterCount: 5,
    weaponCount: 5,
    lightRadius: 160,
    ambientLight: 0.1,
    generate: generateMap3
  }
];
