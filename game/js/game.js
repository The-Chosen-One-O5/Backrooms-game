import {
  TILE_SIZE, CANVAS_W, CANVAS_H, PLAYER_SPEED, RUN_MULTIPLIER,
  MONSTER_SPEED, MONSTER_CHASE_SPEED, MONSTER_DETECT_RANGE,
  MONSTER_ATTACK_RANGE, MONSTER_ATTACK_DAMAGE, MONSTER_ATTACK_COOLDOWN,
  PLAYER_MAX_HP, WEAPON_PICKUP_RANGE, WEAPON_DAMAGE, WEAPON_ATTACK_RANGE,
  WEAPON_ATTACK_COOLDOWN, EXIT_RANGE, MAP_PICKUP_RANGE, LIGHT_RADIUS,
  GHOST_ALPHA, SHIRT_COLORS, TILE, MAPS, clamp
} from './config.js';

import {
  initNetwork, getPlayerId, getIsHost, setIsHost, getRoomCode,
  onEvent, hostRoom, joinRoom, sendStartGame,
  sendPlayerPos, sendPlayerAttack, sendWeaponPicked, sendMonsterKilled,
  sendMapPicked, sendExitReached, sendNextLevel, sendGameOver,
  sendYouWon, sendPlayerDied, leaveRoom
} from './network.js';

let canvas, ctx;
let lightCanvas, lightCtx;
let gameState = 'menu';
let currentLevel = 0;
let tiles = [];
let mapW = 0, mapH = 0;
let localPlayer = null;
let monsters = [];
let weapons = [];
let mapFragments = [];
let exitPos = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };
let keys = {};
let isMobile = false;
let mobileZoom = 1;
let joystick = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, dx: 0, dy: 0 };
let touchId = null;
let attackTouchId = null;
let images = {};
let imagesLoaded = 0;
let totalImages = 0;
let lastTime = 0;
let lobbyPlayers = [];
let lobbyHostId = null;
let playerName = '';
let hasMapFragment = false;
let monsterIdCounter = 0;
let weaponIdCounter = 0;
let fragmentIdCounter = 0;
let remotePlayers = {};
let gameStarted = false;
let deathPopup = 0;
let ghostEnabled = true;
let playersAtExit = new Set();
let attackSwingTimer = 0;

const CACHE_BUST = '?v=' + Date.now();
const imageFiles = {
  'char_front_idle': 'assets/char/Idle.png' + CACHE_BUST,
  'char_front_1': 'assets/char/front-01.png' + CACHE_BUST,
  'char_front_2': 'assets/char/front-02.png' + CACHE_BUST,
  'char_front_3': 'assets/char/front-03.png' + CACHE_BUST,
  'char_front_4': 'assets/char/front-04.png' + CACHE_BUST,
  'char_front_5': 'assets/char/front-05.png' + CACHE_BUST,
  'char_front_6': 'assets/char/front-06.png' + CACHE_BUST,
  'char_back_idle': 'assets/char/back-idle.png' + CACHE_BUST,
  'char_back_1': 'assets/char/back-01.png' + CACHE_BUST,
  'char_back_2': 'assets/char/back-02.png' + CACHE_BUST,
  'char_back_3': 'assets/char/back-03.png' + CACHE_BUST,
  'char_back_4': 'assets/char/back-04.png' + CACHE_BUST,
  'char_back_5': 'assets/char/back-05.png' + CACHE_BUST,
  'char_back_6': 'assets/char/back-06.png' + CACHE_BUST,
  'char_left_idle': 'assets/char/left-idle.png' + CACHE_BUST,
  'char_left_1': 'assets/char/left-01.png' + CACHE_BUST,
  'char_left_2': 'assets/char/left-02.png' + CACHE_BUST,
  'char_left_3': 'assets/char/left-03.png' + CACHE_BUST,
  'char_left_4': 'assets/char/left-04.png' + CACHE_BUST,
  'char_left_5': 'assets/char/left-05.png' + CACHE_BUST,
  'char_left_6': 'assets/char/left-06.png' + CACHE_BUST,
  'char_right_idle': 'assets/char/right-idle.png' + CACHE_BUST,
  'char_right_1': 'assets/char/right-01.png' + CACHE_BUST,
  'char_right_2': 'assets/char/right-02.png' + CACHE_BUST,
  'char_right_3': 'assets/char/right-03.png' + CACHE_BUST,
  'char_right_4': 'assets/char/right-04.png' + CACHE_BUST,
  'char_right_5': 'assets/char/right-05.png' + CACHE_BUST,
  'char_right_6': 'assets/char/right-06.png' + CACHE_BUST,
  'monster1_front': 'assets/Monster-front.png' + CACHE_BUST,
  'monster1_back': 'assets/Monster-back.png' + CACHE_BUST,
  'monster1_left': 'assets/Monster-side-left.png' + CACHE_BUST,
  'monster1_right': 'assets/Monster-side-right.png' + CACHE_BUST,
  'monster2': 'assets/Monster-2.png' + CACHE_BUST,
  'monster3': 'assets/Monster-3.png' + CACHE_BUST,
};

const CHAR_FRAME_W = 32;
const CHAR_FRAME_H = 32;
const CHAR_DRAW_W = 24;
const CHAR_DRAW_H = 32;
const CHAR_TOTAL_FRAMES = 6;
const CHAR_ANIM_SPEED = 0.12;
const DIR_ROW = { down: 0, right: 1, up: 2, left: 3 };

function loadImages(callback) {
  totalImages = Object.keys(imageFiles).length;
  let loaded = 0;
  for (const [key, src] of Object.entries(imageFiles)) {
    const img = new Image();
    img.onload = () => { loaded++; if (loaded >= totalImages) callback(); };
    img.onerror = () => { loaded++; if (loaded >= totalImages) callback(); };
    img.src = src;
    images[key] = img;
  }
}

async function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx.imageSmoothingEnabled = false;

  lightCanvas = document.createElement('canvas');
  lightCanvas.width = CANVAS_W;
  lightCanvas.height = CANVAS_H;
  lightCtx = lightCanvas.getContext('2d');

  function resizeCanvas() {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  setupUI();
  loadImages(() => { requestAnimationFrame(gameLoop); });
  initNetwork().catch(err => console.error('Network init failed:', err));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function setupUI() {
  document.getElementById('btnSolo').onclick = () => {
    playerName = document.getElementById('playerName').value.trim() || 'Player';
    startSoloGame();
  };

  document.getElementById('btnMultiplayer').onclick = () => {
    document.getElementById('multiplayerOptions').classList.toggle('hidden');
  };

  document.getElementById('btnHost').onclick = () => {
    playerName = document.getElementById('playerName').value.trim() || 'Player';
    showScreen('lobbyScreen');
    hostRoom(playerName);
  };

  document.getElementById('btnJoin').onclick = () => {
    playerName = document.getElementById('playerName').value.trim() || 'Player';
    showScreen('joinScreen');
  };

  document.getElementById('btnJoinConfirm').onclick = () => {
    const code = document.getElementById('roomCodeInput').value.trim();
    if (code.length >= 4) {
      joinRoom(code, playerName);
    }
  };

  document.getElementById('btnStart').onclick = () => {
    if (getIsHost()) {
      const playerList = lobbyPlayers.map(p => ({ id: p.id, name: p.name }));
      sendStartGame({ players: playerList, level: 0, ghostEnabled });
    }
  };

  document.getElementById('btnGhostToggle').onclick = () => {
    ghostEnabled = !ghostEnabled;
    const btn = document.getElementById('btnGhostToggle');
    if (ghostEnabled) {
      btn.classList.add('on');
      btn.classList.remove('off');
      btn.textContent = 'ON';
    } else {
      btn.classList.remove('on');
      btn.classList.add('off');
      btn.textContent = 'OFF';
    }
  };

  document.getElementById('btnBack').onclick = () => {
    leaveRoom();
    showScreen('menuScreen');
  };

  document.getElementById('btnBackLobby').onclick = () => {
    leaveRoom();
    showScreen('menuScreen');
  };

  document.getElementById('btnRestart').onclick = () => {
    leaveRoom();
    gameState = 'menu';
    gameStarted = false;
    showScreen('menuScreen');
  };

  document.getElementById('btnPlayAgain').onclick = () => {
    leaveRoom();
    gameState = 'menu';
    gameStarted = false;
    showScreen('menuScreen');
  };

  document.getElementById('btnGoHome').onclick = () => {
    leaveRoom();
    gameState = 'menu';
    gameStarted = false;
    document.getElementById('permDeathScreen').classList.remove('active');
    showScreen('menuScreen');
  };

  onEvent('room_hosted', (data) => {
    document.getElementById('roomCodeDisplay').textContent = data.code;
    document.getElementById('btnStart').classList.remove('hidden');
    document.getElementById('btnStart').disabled = true;
    document.getElementById('ghostToggleBox').classList.remove('hidden');
    ghostEnabled = true;
  });

  onEvent('room_joined', (data) => {
    showScreen('lobbyScreen');
    document.getElementById('roomCodeDisplay').textContent = data.code;
    document.getElementById('btnStart').classList.add('hidden');
    document.getElementById('ghostToggleBox').classList.add('hidden');
  });

  onEvent('join_error', (data) => {
    alert(data.error);
    showScreen('joinScreen');
  });

  onEvent('lobby_update', (data) => {
    lobbyPlayers = data.players;
    lobbyHostId = data.hostId;
    const list = document.getElementById('playerList');
    list.innerHTML = '';
    const colors = ['#3355cc','#cc3333','#33aa33','#cc8833','#8833cc','#33cccc','#cccc33','#cc33aa'];
    data.players.forEach((p, i) => {
      const li = document.createElement('li');
      const color = colors[i % colors.length];
      const isMe = p.id === getPlayerId();
      const isHost = p.id === data.hostId;
      li.innerHTML = `
        <span class="color-dot" style="background:${color}"></span>
        <span class="player-name">${p.name}</span>
        ${isMe ? '<span class="badge-you">YOU</span>' : ''}
        ${isHost ? '<span class="badge-host">HOST</span>' : ''}
      `;
      list.appendChild(li);
    });
    const count = data.players.length;
    document.getElementById('playerCount').textContent = `(${count}/8)`;
    document.getElementById('startCount').textContent = count;
    const startBtn = document.getElementById('btnStart');
    if (getIsHost()) {
      startBtn.disabled = count < 1;
    }
  });

  document.getElementById('btnCopyCode').onclick = () => {
    const code = document.getElementById('roomCodeDisplay').textContent;
    if (code && code !== '------') {
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btnCopyCode');
        btn.textContent = 'COPIED!';
        setTimeout(() => { btn.textContent = 'COPY CODE'; }, 1500);
      }).catch(() => {});
    }
  };

  document.getElementById('roomCodeInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  onEvent('game_start', (data) => {
    if (!gameStarted) {
      gameStarted = true;
      startGameFromLobby(data);
    }
  });

  onEvent('player_pos', (data) => {
    if (data.from !== getPlayerId()) {
      if (!remotePlayers[data.from]) {
        const pInfo = lobbyPlayers.find(p => p.id === data.from);
        remotePlayers[data.from] = createRemotePlayer(data.from, pInfo?.name || 'Player', pInfo?.color || '#888888');
      }
      const rp = remotePlayers[data.from];
      rp.targetX = data.x;
      rp.targetY = data.y;
      rp.dir = data.dir;
      rp.hp = data.hp;
      rp.hasWeapon = data.hasWeapon;
      rp.isGhost = data.isGhost;
    }
  });

  onEvent('player_attack', (data) => {
    if (data.from !== getPlayerId() && remotePlayers[data.from]) {
      const rp = remotePlayers[data.from];
      rp.attacking = true;
      rp.attackTimer = 0.25;
    }
  });

  onEvent('weapon_picked', (data) => {
    weapons = weapons.filter(w => w.id !== data.weaponId);
    if (data.from !== getPlayerId() && remotePlayers[data.from]) {
      remotePlayers[data.from].hasWeapon = true;
    }
  });

  onEvent('monster_killed', (data) => {
    const idx = monsters.findIndex(m => m.id === data.monsterId);
    if (idx >= 0) {
      const m = monsters[idx];
      mapFragments.push({ id: data.mapFragment, x: m.x, y: m.y });
      monsters.splice(idx, 1);
    }
    if (data.from === getPlayerId()) {
      hasMapFragment = true;
      if (localPlayer) localPlayer.hasMap = true;
    }
    if (data.from !== getPlayerId() && remotePlayers[data.from]) {
      remotePlayers[data.from].hasMap = true;
    }
  });

  onEvent('map_picked', (data) => {
    mapFragments = mapFragments.filter(f => f.id !== data.fragmentId);
    if (data.from === getPlayerId()) {
      hasMapFragment = true;
      if (localPlayer) localPlayer.hasMap = true;
    }
  });

  onEvent('exit_reached', (data) => {
    playersAtExit.add(data.from);
    if (data.from !== getPlayerId() && remotePlayers[data.from]) {
      remotePlayers[data.from].atExit = true;
    }
  });

  onEvent('next_level', (data) => {
    if (!getIsHost()) {
      playersAtExit.clear();
      loadLevel(data.level);
    }
  });

  onEvent('game_over', () => showGameOver());
  onEvent('you_won', () => showWin());

  onEvent('player_left', (data) => {
    delete remotePlayers[data.id];
    playersAtExit.delete(data.id);
  });

  onEvent('new_host', (data) => {
    lobbyHostId = data.id;
    if (data.id === getPlayerId()) {
      setIsHost(true);
      document.getElementById('btnStart').classList.remove('hidden');
      document.getElementById('ghostToggleBox').classList.remove('hidden');
    }
  });

  onEvent('host_disconnected', () => {
    leaveRoom();
    gameState = 'menu';
    gameStarted = false;
    alert('Host disconnected!');
    showScreen('menuScreen');
  });

  onEvent('player_died', (data) => {
    if (data.from !== getPlayerId() && remotePlayers[data.from]) {
      remotePlayers[data.from].hp = 0;
      if (ghostEnabled) {
        remotePlayers[data.from].isGhost = true;
      }
    }
  });

  setupControls();
}

function startSoloGame() {
  remotePlayers = {};
  currentLevel = 0;
  ghostEnabled = true;
  loadLevel(0);

  const spawns = [];
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++)
      if (tiles[y][x] === TILE.SPAWN) spawns.push({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });

  const sp = spawns[0] || { x: TILE_SIZE * 2, y: TILE_SIZE * 2 };
  localPlayer = createPlayer('solo', playerName || 'Player', SHIRT_COLORS[0], sp.x, sp.y);

  showScreen('gameScreen');
  gameState = 'playing';
  playersAtExit.clear();
  gameStarted = true;
}

function startGameFromLobby(data) {
  const players = data.players;
  const level = data.level || 0;
  ghostEnabled = data.ghostEnabled !== false;

  remotePlayers = {};
  currentLevel = level;
  loadLevel(level);

  const spawns = [];
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++)
      if (tiles[y][x] === TILE.SPAWN) spawns.push({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });

  players.forEach((p, i) => {
    const sp = spawns[i % Math.max(spawns.length, 1)] || { x: TILE_SIZE * 2, y: TILE_SIZE * 2 };
    const color = SHIRT_COLORS[i % SHIRT_COLORS.length];

    if (p.id === getPlayerId()) {
      localPlayer = createPlayer(p.id, p.name, color, sp.x, sp.y);
    } else {
      remotePlayers[p.id] = createRemotePlayer(p.id, p.name, color);
      remotePlayers[p.id].x = sp.x;
      remotePlayers[p.id].y = sp.y;
      remotePlayers[p.id].targetX = sp.x;
      remotePlayers[p.id].targetY = sp.y;
    }
  });

  if (!localPlayer) {
    localPlayer = createPlayer(getPlayerId(), playerName || 'Player', SHIRT_COLORS[0], TILE_SIZE * 2, TILE_SIZE * 2);
  }

  showScreen('gameScreen');
  gameState = 'playing';
  playersAtExit.clear();

  if (isMobile && window.innerHeight > window.innerWidth) {
    const hint = document.getElementById('rotateHint');
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 3500);
  }
}

function loadLevel(levelIdx) {
  currentLevel = levelIdx;
  const mapDef = MAPS[levelIdx];
  const mapData = mapDef.generate();
  tiles = mapData.tiles.map(r => [...r]);
  mapW = mapData.w;
  mapH = mapData.h;
  monsters = [];
  weapons = [];
  mapFragments = [];
  hasMapFragment = false;
  monsterIdCounter = 0;
  weaponIdCounter = 0;
  fragmentIdCounter = 0;
  playersAtExit.clear();

  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++)
      if (tiles[y][x] === TILE.EXIT) {
        exitPos = { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 };
        break;
      }

  spawnMonsters(mapDef);
  spawnWeapons(mapDef);
}

function createPlayer(id, name, color, x, y) {
  return {
    id, name, color, x, y, dir: 'down', hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    hasWeapon: false, isGhost: false, speed: PLAYER_SPEED,
    attacking: false, attackTimer: 0, moving: false,
    animFrame: 0, animTimer: 0, hasMap: false, atExit: false
  };
}

function createRemotePlayer(id, name, color) {
  return {
    id, name, color, x: 0, y: 0, targetX: 0, targetY: 0,
    dir: 'down', hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    hasWeapon: false, isGhost: false, attacking: false, attackTimer: 0,
    moving: false, animFrame: 0, animTimer: 0, hasMap: false, atExit: false
  };
}

function spawnMonsters(map) {
  const floors = [];
  for (let y = 4; y < mapH - 4; y++)
    for (let x = 4; x < mapW - 4; x++)
      if (tiles[y][x] === TILE.FLOOR && !isNearSpawn(x, y))
        floors.push({ x, y });

  for (let i = 0; i < map.monsterCount && floors.length > 0; i++) {
    const idx = Math.floor(Math.random() * floors.length);
    const f = floors.splice(idx, 1)[0];
    monsters.push({
      id: monsterIdCounter++, type: map.monsterType,
      x: f.x * TILE_SIZE + TILE_SIZE / 2, y: f.y * TILE_SIZE + TILE_SIZE / 2,
      dir: 'down', hp: 100, speed: MONSTER_SPEED, chaseSpeed: MONSTER_CHASE_SPEED,
      attackTimer: 0, animFrame: 0, animTimer: 0, wanderTimer: 0,
      wanderAngle: Math.random() * Math.PI * 2
    });
  }
}

function spawnWeapons(map) {
  const floors = [];
  for (let y = 3; y < mapH - 3; y++)
    for (let x = 3; x < mapW - 3; x++)
      if (tiles[y][x] === TILE.FLOOR) floors.push({ x, y });

  for (let i = 0; i < map.weaponCount && floors.length > 0; i++) {
    const idx = Math.floor(Math.random() * floors.length);
    const f = floors.splice(idx, 1)[0];
    weapons.push({ id: weaponIdCounter++, x: f.x * TILE_SIZE + TILE_SIZE / 2, y: f.y * TILE_SIZE + TILE_SIZE / 2 });
  }
}

function isNearSpawn(tx, ty) {
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++)
      if (tiles[y][x] === TILE.SPAWN && Math.abs(x - tx) + Math.abs(y - ty) < 6) return true;
  return false;
}

function setupControls() {
  isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isMobile) {
    const diag = Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight);
    mobileZoom = Math.max(2.5, Math.min(3.8, diag / 400));
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    if (k === ' ' && localPlayer && !localPlayer.isGhost && localPlayer.hasWeapon && !localPlayer.attacking) {
      attack();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && localPlayer && !localPlayer.isGhost && localPlayer.hasWeapon && !localPlayer.attacking) {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
      const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);
      aimAt(mx, my);
      attack();
    }
  });

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

function aimAt(mx, my) {
  if (!localPlayer) return;
  const px = localPlayer.x - camera.x;
  const py = localPlayer.y - camera.y;
  const angle = Math.atan2(my - py, mx - px);
  if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
    localPlayer.dir = Math.cos(angle) > 0 ? 'right' : 'left';
  } else {
    localPlayer.dir = Math.sin(angle) > 0 ? 'down' : 'up';
  }
}

function attack() {
  if (!localPlayer || localPlayer.attacking || localPlayer.isGhost || !localPlayer.hasWeapon) return;
  localPlayer.attacking = true;
  localPlayer.attackTimer = WEAPON_ATTACK_COOLDOWN / 1000;
  attackSwingTimer = 0.3;
  sendPlayerAttack(localPlayer.x, localPlayer.y, localPlayer.dir);
  checkWeaponAttack();
}

function canvasCoords(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (CANVAS_W / rect.width),
    y: (touch.clientY - rect.top) * (CANVAS_H / rect.height)
  };
}

function handleTouchStart(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const { x, y } = canvasCoords(touch);

    if (x > CANVAS_W * 0.65 && localPlayer && !localPlayer.isGhost && localPlayer.hasWeapon && !localPlayer.attacking) {
      attackTouchId = touch.identifier;
      aimAt(x, y);
      attack();
      continue;
    }

    if (!joystick.active) {
      joystick.active = true;
      joystick.sx = x;
      joystick.sy = y;
      joystick.cx = x;
      joystick.cy = y;
      joystick.dx = 0;
      joystick.dy = 0;
      touchId = touch.identifier;
    }
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (touch.identifier === touchId && joystick.active) {
      const { x, y } = canvasCoords(touch);
      joystick.cx = x;
      joystick.cy = y;
      const dx = joystick.cx - joystick.sx;
      const dy = joystick.cy - joystick.sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 55;
      if (dist > maxDist) {
        joystick.cx = joystick.sx + (dx / dist) * maxDist;
        joystick.cy = joystick.sy + (dy / dist) * maxDist;
      }
      joystick.dx = clamp(dx / maxDist, -1, 1);
      joystick.dy = clamp(dy / maxDist, -1, 1);
    }
  }
}

function handleTouchEnd(e) {
  for (const touch of e.changedTouches) {
    if (touch.identifier === touchId) {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      touchId = null;
    }
    if (touch.identifier === attackTouchId) {
      attackTouchId = null;
    }
  }
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (gameState === 'playing') {
    update(dt);
    render();
    renderJoystick();
    renderMobileAttackBtn();
  }

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (!localPlayer) return;
  if (deathPopup > 0) deathPopup -= dt;
  if (attackSwingTimer > 0) attackSwingTimer -= dt;

  for (const rp of Object.values(remotePlayers)) {
    if (rp.targetX !== undefined) {
      const lerp = 0.15;
      rp.x += (rp.targetX - rp.x) * lerp;
      rp.y += (rp.targetY - rp.y) * lerp;
      rp.moving = Math.abs(rp.targetX - rp.x) > 1 || Math.abs(rp.targetY - rp.y) > 1;
      if (rp.moving) rp.animTimer += dt;
      if (rp.animTimer > CHAR_ANIM_SPEED) { rp.animTimer = 0; rp.animFrame = (rp.animFrame + 1) % CHAR_TOTAL_FRAMES; }
    }
    if (rp.attacking) {
      rp.attackTimer -= dt;
      if (rp.attackTimer <= 0) rp.attacking = false;
    }
  }

  if (localPlayer.isGhost) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;
    if (joystick.active) { dx = joystick.dx; dy = joystick.dy; }
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { dx /= len; dy /= len; }
      localPlayer.x += dx * PLAYER_SPEED * 1.5 * dt;
      localPlayer.y += dy * PLAYER_SPEED * 1.5 * dt;
      if (Math.abs(dx) > Math.abs(dy)) localPlayer.dir = dx > 0 ? 'right' : 'left';
      else localPlayer.dir = dy > 0 ? 'down' : 'up';
    }
    updateCamera();
    return;
  }

  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy = -1;
  if (keys['s'] || keys['arrowdown']) dy = 1;
  if (keys['a'] || keys['arrowleft']) dx = -1;
  if (keys['d'] || keys['arrowright']) dx = 1;
  if (joystick.active) { dx = joystick.dx; dy = joystick.dy; }

  const running = keys['shift'];
  const speed = localPlayer.speed * (running ? RUN_MULTIPLIER : 1);
  localPlayer.moving = Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15;

  if (localPlayer.moving) {
    if (Math.abs(dx) > Math.abs(dy)) localPlayer.dir = dx > 0 ? 'right' : 'left';
    else localPlayer.dir = dy > 0 ? 'down' : 'up';

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) { dx /= len; dy /= len; }

    const newX = localPlayer.x + dx * speed * dt;
    const newY = localPlayer.y + dy * speed * dt;
    if (!isBlocked(newX, localPlayer.y)) localPlayer.x = newX;
    if (!isBlocked(localPlayer.x, newY)) localPlayer.y = newY;

    localPlayer.animTimer += dt;
    if (localPlayer.animTimer > CHAR_ANIM_SPEED) { localPlayer.animTimer = 0; localPlayer.animFrame = (localPlayer.animFrame + 1) % CHAR_TOTAL_FRAMES; }
  } else {
    localPlayer.animFrame = 0;
    localPlayer.animTimer = 0;
  }

  if (localPlayer.attacking) {
    localPlayer.attackTimer -= dt;
    if (localPlayer.attackTimer <= 0) localPlayer.attacking = false;
  }

  updateMonsters(dt);
  checkPickups();
  checkMapFragmentPickup();
  checkExit();

  updateCamera();
  sendPlayerPos(localPlayer.x, localPlayer.y, localPlayer.dir, localPlayer.hp, localPlayer.hasWeapon, localPlayer.isGhost);
}

function updateCamera() {
  camera.x = localPlayer.x - CANVAS_W / 2;
  camera.y = localPlayer.y - CANVAS_H / 2;
  const edgeAllow = (mobileZoom - 1) * CANVAS_W / 2;
  const edgeAllowY = (mobileZoom - 1) * CANVAS_H / 2;
  camera.x = clamp(camera.x, -edgeAllow, mapW * TILE_SIZE - CANVAS_W + edgeAllow);
  camera.y = clamp(camera.y, -edgeAllowY, mapH * TILE_SIZE - CANVAS_H + edgeAllowY);
}

function isBlocked(x, y) {
  const r = 8;
  const pts = [
    { x: x - r, y: y - r }, { x: x + r, y: y - r },
    { x: x - r, y: y + r }, { x: x + r, y: y + r }
  ];
  for (const pt of pts) {
    const tx = Math.floor(pt.x / TILE_SIZE);
    const ty = Math.floor(pt.y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return true;
    if (tiles[ty][tx] === TILE.WALL || tiles[ty][tx] === TILE.VOID) return true;
  }
  return false;
}

function isMonsterBlocked(x, y) {
  const r = 6;
  const pts = [
    { x: x - r, y: y - r }, { x: x + r, y: y - r },
    { x: x - r, y: y + r }, { x: x + r, y: y + r }
  ];
  for (const pt of pts) {
    const tx = Math.floor(pt.x / TILE_SIZE);
    const ty = Math.floor(pt.y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return true;
    if (tiles[ty][tx] === TILE.WALL || tiles[ty][tx] === TILE.VOID) return true;
  }
  return false;
}

function getAllAlivePlayers() {
  const list = [];
  if (localPlayer && !localPlayer.isGhost) list.push({ id: localPlayer.id, x: localPlayer.x, y: localPlayer.y });
  for (const [id, rp] of Object.entries(remotePlayers))
    if (!rp.isGhost) list.push({ id, x: rp.x, y: rp.y });
  return list;
}

function updateMonsters(dt) {
  for (const m of monsters) {
    m.attackTimer -= dt;
    m.animTimer += dt;
    if (m.animTimer > 0.3) { m.animTimer = 0; m.animFrame = (m.animFrame + 1) % 2; }

    const alive = getAllAlivePlayers();
    let closest = null, closestDist = Infinity;
    for (const p of alive) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < closestDist) { closestDist = d; closest = p; }
    }

    if (closest && closestDist < MONSTER_DETECT_RANGE) {
      const angle = Math.atan2(closest.y - m.y, closest.x - m.x);
      const spd = m.chaseSpeed || MONSTER_CHASE_SPEED;
      const mx = Math.cos(angle) * spd * dt;
      const my = Math.sin(angle) * spd * dt;
      if (!isMonsterBlocked(m.x + mx, m.y)) m.x += mx;
      if (!isMonsterBlocked(m.x, m.y + my)) m.y += my;
      m.dir = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? (Math.cos(angle) > 0 ? 'right' : 'left')
        : (Math.sin(angle) > 0 ? 'down' : 'up');

      if (closestDist < MONSTER_ATTACK_RANGE && m.attackTimer <= 0) {
        m.attackTimer = MONSTER_ATTACK_COOLDOWN / 1000;
        if (closest.id === localPlayer?.id) {
          localPlayer.hp -= MONSTER_ATTACK_DAMAGE;
          if (localPlayer.hp <= 0) {
            localPlayer.hp = 0;
            sendPlayerDied();
            if (ghostEnabled) {
              localPlayer.isGhost = true;
              deathPopup = 2;
            } else {
              gameState = 'dead';
              showPermanentDeath();
            }
            checkAllDead();
          }
        }
      }
    } else {
      m.wanderTimer += dt;
      if (m.wanderTimer > 2 + Math.random() * 2) {
        m.wanderTimer = 0;
        m.wanderAngle = Math.random() * Math.PI * 2;
      }
      const mx = Math.cos(m.wanderAngle) * m.speed * 0.3 * dt;
      const my = Math.sin(m.wanderAngle) * m.speed * 0.3 * dt;
      if (!isMonsterBlocked(m.x + mx, m.y)) m.x += mx;
      else m.wanderAngle += Math.PI / 2;
      if (!isMonsterBlocked(m.x, m.y + my)) m.y += my;
      else m.wanderAngle += Math.PI / 2;
    }
  }
}

function checkWeaponAttack() {
  if (!localPlayer || !localPlayer.hasWeapon) return;
  const offsets = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const off = offsets[localPlayer.dir];
  const ax = localPlayer.x + off.x * WEAPON_ATTACK_RANGE;
  const ay = localPlayer.y + off.y * WEAPON_ATTACK_RANGE;

  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    if (Math.hypot(ax - m.x, ay - m.y) < WEAPON_ATTACK_RANGE + 10) {
      m.hp -= WEAPON_DAMAGE;
      if (m.hp <= 0) {
        const mfId = fragmentIdCounter++;
        mapFragments.push({ id: mfId, x: m.x, y: m.y });
        hasMapFragment = true;
        localPlayer.hasMap = true;
        sendMonsterKilled(m.id, mfId);
        monsters.splice(i, 1);
      }
      break;
    }
  }
}

function checkPickups() {
  if (!localPlayer || localPlayer.isGhost) return;
  for (let i = weapons.length - 1; i >= 0; i--) {
    if (Math.hypot(localPlayer.x - weapons[i].x, localPlayer.y - weapons[i].y) < WEAPON_PICKUP_RANGE) {
      localPlayer.hasWeapon = true;
      sendWeaponPicked(weapons[i].id);
      weapons.splice(i, 1);
    }
  }
}

function checkMapFragmentPickup() {
  if (!localPlayer || localPlayer.isGhost) return;
  for (let i = mapFragments.length - 1; i >= 0; i--) {
    if (Math.hypot(localPlayer.x - mapFragments[i].x, localPlayer.y - mapFragments[i].y) < MAP_PICKUP_RANGE) {
      hasMapFragment = true;
      localPlayer.hasMap = true;
      sendMapPicked(mapFragments[i].id);
      mapFragments.splice(i, 1);
    }
  }
}

function checkExit() {
  if (!localPlayer || localPlayer.isGhost) return;

  const atExitNow = hasMapFragment && Math.hypot(localPlayer.x - exitPos.x, localPlayer.y - exitPos.y) < EXIT_RANGE;
  const wasAtExit = playersAtExit.has(getPlayerId());

  if (atExitNow && !wasAtExit) {
    playersAtExit.add(getPlayerId());
    localPlayer.atExit = true;
    sendExitReached();
  }

  if (!atExitNow && wasAtExit) {
    playersAtExit.delete(getPlayerId());
    localPlayer.atExit = false;
  }

  if (getIsHost() && playersAtExit.size > 0) {
    const allAlive = getAllAlivePlayers();
    const allAtExit = allAlive.every(p => playersAtExit.has(p.id));
    if (allAtExit && allAlive.length > 0) {
      if (currentLevel < MAPS.length - 1) {
        const next = currentLevel + 1;
        playersAtExit.clear();
        loadLevel(next);
        sendNextLevel(next);

        const spawns = [];
        for (let y = 0; y < mapH; y++)
          for (let x = 0; x < mapW; x++)
            if (tiles[y][x] === TILE.SPAWN) spawns.push({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });

        let si = 0;
        if (localPlayer) {
          const sp = spawns[si++ % Math.max(spawns.length, 1)] || { x: 64, y: 64 };
          localPlayer.x = sp.x; localPlayer.y = sp.y;
          localPlayer.hp = PLAYER_MAX_HP;
          localPlayer.isGhost = false;
          localPlayer.hasWeapon = false;
          localPlayer.hasMap = false;
          localPlayer.atExit = false;
          hasMapFragment = false;
        }
        for (const rp of Object.values(remotePlayers)) {
          if (!rp.isGhost) {
            const sp = spawns[si++ % Math.max(spawns.length, 1)] || { x: 64, y: 64 };
            rp.x = sp.x; rp.y = sp.y;
            rp.targetX = sp.x; rp.targetY = sp.y;
            rp.hp = PLAYER_MAX_HP;
            rp.isGhost = false;
            rp.hasWeapon = false;
            rp.hasMap = false;
            rp.atExit = false;
          }
        }
      } else {
        sendYouWon();
        showWin();
      }
    }
  }
}

function checkAllDead() {
  if (getAllAlivePlayers().length === 0) {
    sendGameOver();
    showGameOver();
  }
}

function showGameOver() {
  gameState = 'gameover';
  document.getElementById('gameOverScreen').classList.add('active');
}

function showWin() {
  gameState = 'win';
  document.getElementById('winScreen').classList.add('active');
}

function showPermanentDeath() {
  document.getElementById('permDeathScreen').classList.add('active');
}

function render() {
  const map = MAPS[currentLevel];
  ctx.fillStyle = map.bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (mobileZoom > 1) {
    ctx.save();
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.scale(mobileZoom, mobileZoom);
    ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
  }

  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endX = Math.min(mapW, Math.ceil((camera.x + CANVAS_W) / TILE_SIZE) + 1);
  const endY = Math.min(mapH, Math.ceil((camera.y + CANVAS_H) / TILE_SIZE) + 1);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const sx = x * TILE_SIZE - camera.x;
      const sy = y * TILE_SIZE - camera.y;
      const tile = tiles[y][x];

      if (tile === TILE.FLOOR || tile === TILE.SPAWN) {
        ctx.fillStyle = (x + y) % 2 === 0 ? map.floorColor : map.floorColor2;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
      } else if (tile === TILE.WALL) {
        ctx.fillStyle = map.wallColor;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = map.wallColorTop;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE * 0.4);
        ctx.fillStyle = map.wallSide;
        ctx.fillRect(sx, sy + TILE_SIZE - 3, TILE_SIZE, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(sx, sy, 2, TILE_SIZE);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(sx + TILE_SIZE - 2, sy, 2, TILE_SIZE);
      } else if (tile === TILE.EXIT) {
        const pulse = Math.sin(Date.now() / 400) * 0.3 + 0.7;
        ctx.fillStyle = (x + y) % 2 === 0 ? map.floorColor : map.floorColor2;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = hasMapFragment
          ? `rgba(50, 255, 50, ${pulse * 0.5})`
          : `rgba(255, 50, 50, ${0.2 + pulse * 0.15})`;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = hasMapFragment ? '#44ff44' : '#ff4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        ctx.fillStyle = hasMapFragment ? 'rgba(100,255,100,0.6)' : 'rgba(255,100,100,0.3)';
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 4 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const w of weapons) {
    const sx = w.x - camera.x;
    const sy = w.y - camera.y;
    const bob = Math.sin(Date.now() / 300 + w.id) * 2;
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(sx - 2, sy - 10 + bob, 4, 16);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(sx - 5, sy + 4 + bob, 10, 4);
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(sx - 2, sy + 7 + bob, 4, 5);
    ctx.fillStyle = 'rgba(255,204,0,0.2)';
    ctx.beginPath();
    ctx.arc(sx, sy + bob, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const f of mapFragments) {
    const sx = f.x - camera.x;
    const sy = f.y - camera.y;
    const bob = Math.sin(Date.now() / 350 + f.id) * 3;
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(sx - 8, sy - 6 + bob, 16, 12);
    ctx.fillStyle = '#f0d0a0';
    ctx.fillRect(sx - 6, sy - 4 + bob, 12, 8);
    ctx.fillStyle = '#664422';
    ctx.fillRect(sx - 4, sy - 2 + bob, 2, 2);
    ctx.fillRect(sx, sy - 1 + bob, 4, 1);
    ctx.fillRect(sx - 3, sy + 1 + bob, 6, 1);
    ctx.fillStyle = 'rgba(68,170,255,0.25)';
    ctx.beginPath();
    ctx.arc(sx, sy + bob, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const m of monsters) drawMonster(m);

  for (const rp of Object.values(remotePlayers)) drawCharacter(rp);

  if (localPlayer) drawCharacter(localPlayer);

  renderLighting();

  if (mobileZoom > 1) {
    ctx.restore();
  }

  renderHUD();
}

function drawSword(sx, sy, dir, attacking, swingTimer) {
  ctx.save();
  let swordX = sx + 12;
  let swordY = sy + 8;
  let angle = 0;

  if (attacking && swingTimer > 0) {
    const swing = (0.3 - swingTimer) / 0.3;
    switch (dir) {
      case 'right': angle = -Math.PI / 3 + swing * Math.PI * 0.8; swordX = sx + 20; swordY = sy + 12; break;
      case 'left': angle = Math.PI / 3 - swing * Math.PI * 0.8; swordX = sx + 4; swordY = sy + 12; break;
      case 'down': angle = Math.PI / 2 - Math.PI / 3 + swing * Math.PI * 0.8; swordX = sx + 14; swordY = sy + 18; break;
      case 'up': angle = -Math.PI / 2 + Math.PI / 3 - swing * Math.PI * 0.8; swordX = sx + 14; swordY = sy + 2; break;
    }
  } else {
    switch (dir) {
      case 'right': angle = 0.3; swordX = sx + 18; swordY = sy + 14; break;
      case 'left': angle = -0.3; swordX = sx + 6; swordY = sy + 14; break;
      case 'down': angle = Math.PI / 2 + 0.3; swordX = sx + 14; swordY = sy + 20; break;
      case 'up': angle = -Math.PI / 2 - 0.3; swordX = sx + 14; swordY = sy + 4; break;
    }
  }

  ctx.translate(swordX, swordY);
  ctx.rotate(angle);

  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(-1.5, -12, 3, 14);

  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(-4, -1, 8, 3);

  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-1.5, 2, 3, 6);

  if (attacking && swingTimer > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(0, -8, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawCharacter(p) {
  const sx = p.x - camera.x - CHAR_DRAW_W / 2;
  const sy = p.y - camera.y - CHAR_DRAW_H;

  ctx.save();
  ctx.globalAlpha = p.isGhost ? GHOST_ALPHA : 1;

  const DIR_TO_IMG = { down: 'front', up: 'back', left: 'left', right: 'right' };
  const imgDir = DIR_TO_IMG[p.dir] || 'front';
  let imgKey;
  if (p.moving) {
    const frame = (p.animFrame % CHAR_TOTAL_FRAMES) + 1;
    imgKey = `char_${imgDir}_${frame}`;
  } else {
    imgKey = `char_${imgDir}_idle`;
  }

  const img = images[imgKey];
  if (img?.complete && img?.naturalWidth > 0) {
    ctx.drawImage(img, sx, sy, CHAR_DRAW_W, CHAR_DRAW_H);
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(sx + 5, sy + 10, 14, 10);
    ctx.fillStyle = '#ffd5a0';
    ctx.fillRect(sx + 6, sy + 2, 12, 9);
    ctx.fillStyle = '#222';
    ctx.fillRect(sx + 5, sy + 0, 14, 5);
    const legAnim = p.moving ? Math.sin(p.animFrame * Math.PI / 2) * 3 : 0;
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(sx + 6, sy + 20 + legAnim, 4, 8);
    ctx.fillRect(sx + 14, sy + 20 - legAnim, 4, 8);
    ctx.fillStyle = '#ffd5a0';
    ctx.fillRect(sx + 2, sy + 11, 3, 7);
    ctx.fillRect(sx + 19, sy + 11, 3, 7);
  }

  ctx.restore();

  if (p.hasWeapon && !p.isGhost) {
    drawSword(p.x - camera.x, p.y - camera.y - 16, p.dir, p.attacking, p === localPlayer ? attackSwingTimer : p.attackTimer);
  }

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  const nameW = ctx.measureText(p.name).width;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  roundRect(ctx, sx + 12 - nameW / 2 - 4, sy - 13, nameW + 8, 12, 3);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.fillRect(sx + 12 - nameW / 2 - 4, sy - 13, nameW + 8, 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(p.name, sx + 12, sy - 4);

  if (p.hp < p.maxHp && !p.isGhost) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx, sy - 18, 24, 4);
    const r = p.hp / p.maxHp;
    ctx.fillStyle = r > 0.5 ? '#44ff44' : r > 0.25 ? '#ffff44' : '#ff4444';
    ctx.fillRect(sx + 1, sy - 17, 22 * r, 2);
  }

  if (p.isGhost) {
    ctx.fillStyle = 'rgba(180,180,255,0.15)';
    ctx.beginPath();
    ctx.arc(sx + 12, sy + 16, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p.atExit && hasMapFragment) {
    ctx.fillStyle = 'rgba(50,255,50,0.3)';
    ctx.beginPath();
    ctx.arc(sx + 12, sy + 16, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMonster(m) {
  const sx = m.x - camera.x;
  const sy = m.y - camera.y;
  let imgKey;

  if (m.type === 'skeleton') {
    switch (m.dir) {
      case 'down': imgKey = 'monster1_front'; break;
      case 'up': imgKey = 'monster1_back'; break;
      case 'left': imgKey = 'monster1_left'; break;
      case 'right': imgKey = 'monster1_right'; break;
    }
  } else if (m.type === 'ghost') {
    imgKey = 'monster2';
  } else {
    imgKey = 'monster3';
  }

  const sz = m.type === 'spider' ? 36 : 30;

  if (images[imgKey]?.complete && images[imgKey]?.naturalWidth > 0) {
    ctx.drawImage(images[imgKey], sx - sz / 2, sy - sz / 2, sz, sz);
  } else {
    const colors = { skeleton: '#440000', ghost: '#cccccc', spider: '#cc3333' };
    ctx.fillStyle = colors[m.type] || '#666';
    ctx.fillRect(sx - 10, sy - 10, 20, 20);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(sx - 5, sy - 3, 3, 3);
    ctx.fillRect(sx + 2, sy - 3, 3, 3);
  }

  const glowInt = Math.sin(Date.now() / 250 + m.id * 2) * 0.1 + 0.15;
  const glowColors = { skeleton: '180,0,0', ghost: '150,150,255', spider: '255,80,0' };
  ctx.fillStyle = `rgba(${glowColors[m.type] || '100,100,100'},${glowInt})`;
  ctx.beginPath();
  ctx.arc(sx, sy, sz / 2 + 8, 0, Math.PI * 2);
  ctx.fill();

  if (m.hp < 100) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - 12, sy - sz / 2 - 8, 24, 4);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(sx - 12, sy - sz / 2 - 8, 24 * (m.hp / 100), 3);
  }
}

function isWall(wx, wy) {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return true;
  return tiles[ty][tx] === TILE.WALL || tiles[ty][tx] === TILE.VOID;
}

function isWallTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return true;
  return tiles[ty][tx] === TILE.WALL || tiles[ty][tx] === TILE.VOID;
}

function castRayDDA(worldX, worldY, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  let tileX = Math.floor(worldX / TILE_SIZE);
  let tileY = Math.floor(worldY / TILE_SIZE);

  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(TILE_SIZE / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(TILE_SIZE / dy);

  let tMaxX, tMaxY;
  if (dx >= 0) {
    tMaxX = ((tileX + 1) * TILE_SIZE - worldX);
  } else {
    tMaxX = (tileX * TILE_SIZE - worldX);
  }
  if (dy >= 0) {
    tMaxY = ((tileY + 1) * TILE_SIZE - worldY);
  } else {
    tMaxY = (tileY * TILE_SIZE - worldY);
  }
  if (dx !== 0) tMaxX /= dx; else tMaxX = Infinity;
  if (dy !== 0) tMaxY /= dy; else tMaxY = Infinity;

  let dist = 0;
  let side = 0;

  for (let i = 0; i < 100; i++) {
    if (tMaxX < tMaxY) {
      dist = tMaxX;
      tMaxX += tDeltaX;
      tileX += stepX;
      side = 0;
    } else {
      dist = tMaxY;
      tMaxY += tDeltaY;
      tileY += stepY;
      side = 1;
    }

    if (dist > maxDist) break;

    if (isWallTile(tileX, tileY)) {
      const hitX = worldX + dx * (dist - 0.1);
      const hitY = worldY + dy * (dist - 0.1);
      return { x: hitX, y: hitY, dist: dist - 0.1 };
    }
  }

  return { x: worldX + dx * maxDist, y: worldY + dy * maxDist, dist: maxDist };
}

function computeVisibility(worldX, worldY, maxDist) {
  const RAYS = 720;
  const points = [];
  for (let i = 0; i < RAYS; i++) {
    const angle = (i / RAYS) * Math.PI * 2;
    const hit = castRayDDA(worldX, worldY, angle, maxDist);
    points.push(hit);
  }
  return points;
}

function renderLighting() {
  if (!localPlayer) return;
  const map = MAPS[currentLevel];
  const px = localPlayer.x - camera.x;
  const py = localPlayer.y - camera.y;
  const lr = map.lightRadius || LIGHT_RADIUS;

  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.fillStyle = '#000000';
  lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const vis = computeVisibility(localPlayer.x, localPlayer.y, lr);
  lightCtx.globalCompositeOperation = 'destination-out';
  lightCtx.beginPath();
  lightCtx.moveTo(vis[0].x - camera.x, vis[0].y - camera.y);
  for (let i = 1; i < vis.length; i++) {
    lightCtx.lineTo(vis[i].x - camera.x, vis[i].y - camera.y);
  }
  lightCtx.closePath();
  lightCtx.fillStyle = 'rgba(0,0,0,1)';
  lightCtx.fill();

  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.moveTo(vis[0].x - camera.x, vis[0].y - camera.y);
  for (let i = 1; i < vis.length; i++) {
    lightCtx.lineTo(vis[i].x - camera.x, vis[i].y - camera.y);
  }
  lightCtx.closePath();
  lightCtx.clip();

  const falloff = lightCtx.createRadialGradient(px, py, lr * 0.15, px, py, lr);
  falloff.addColorStop(0, 'rgba(0,0,0,0)');
  falloff.addColorStop(0.4, 'rgba(0,0,0,0)');
  falloff.addColorStop(0.7, 'rgba(0,0,0,0.5)');
  falloff.addColorStop(0.9, 'rgba(0,0,0,0.8)');
  falloff.addColorStop(1, 'rgba(0,0,0,0.95)');
  lightCtx.fillStyle = falloff;
  lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  lightCtx.restore();

  for (const rp of Object.values(remotePlayers)) {
    if (rp.isGhost) continue;
    const rx = rp.x - camera.x;
    const ry = rp.y - camera.y;
    const rlr = lr * 0.3;
    lightCtx.globalCompositeOperation = 'destination-out';
    const rg = lightCtx.createRadialGradient(rx, ry, 0, rx, ry, rlr);
    rg.addColorStop(0, 'rgba(0,0,0,0.35)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = rg;
    lightCtx.beginPath();
    lightCtx.arc(rx, ry, rlr, 0, Math.PI * 2);
    lightCtx.fill();
  }

  lightCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);
}

function renderJoystick() {
  if (!joystick.active) return;
  const baseR = 55;
  const knobR = 22;

  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(joystick.sx, joystick.sy, baseR + 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(joystick.sx, joystick.sy, baseR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(joystick.sx - baseR, joystick.sy);
  ctx.lineTo(joystick.sx + baseR, joystick.sy);
  ctx.moveTo(joystick.sx, joystick.sy - baseR);
  ctx.lineTo(joystick.sx, joystick.sy + baseR);
  ctx.stroke();

  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#ff6a00';
  ctx.beginPath();
  ctx.arc(joystick.cx, joystick.cy, knobR + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#333';
  ctx.strokeStyle = '#ff8800';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joystick.cx, joystick.cy, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ff6a00';
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(joystick.cx, joystick.cy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function renderMobileAttackBtn() {
  if (!isMobile) return;
  const btnX = CANVAS_W - 70;
  const btnY = CANVAS_H - 90;
  const btnR = 36;

  const showAttack = localPlayer && !localPlayer.isGhost && localPlayer.hasWeapon;

  if (showAttack) {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    ctx.arc(btnX, btnY, btnR + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#220000';
    ctx.strokeStyle = '#cc3300';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(btnX - 8, btnY + 10);
    ctx.lineTo(btnX + 8, btnY - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(btnX + 4, btnY - 14);
    ctx.lineTo(btnX + 12, btnY - 6);
    ctx.stroke();

    ctx.fillStyle = '#ffcc00';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6;
    ctx.fillText('ATK', btnX, btnY + btnR + 14);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  } else if (localPlayer && !localPlayer.isGhost && !localPlayer.hasWeapon) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO WPN', btnX, btnY + 3);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

function renderHUD() {
  if (!localPlayer) return;
  const map = MAPS[currentLevel];

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, 10, 10, 200, 28, 4);
  ctx.fill();
  ctx.fillStyle = '#220000';
  ctx.fillRect(14, 14, 192, 20);
  const hpR = localPlayer.hp / localPlayer.maxHp;
  ctx.fillStyle = hpR > 0.5 ? '#44cc44' : hpR > 0.25 ? '#cccc44' : '#cc4444';
  ctx.fillRect(14, 14, 192 * hpR, 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(14, 14, 192, 20);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`HP ${localPlayer.hp}/${localPlayer.maxHp}`, 110, 29);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, 10, 42, 220, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#ccc888';
  ctx.font = '10px monospace';
  ctx.fillText(`Map ${currentLevel + 1}/${MAPS.length}: ${map.name}`, 18, 56);

  if (localPlayer.hasWeapon) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, 10, 66, 140, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.font = '10px monospace';
    ctx.fillText('Sword Equipped', 18, 80);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, CANVAS_W - 230, 10, 220, 20, 4);
  ctx.fill();
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  if (hasMapFragment) {
    ctx.fillStyle = '#44ff44';
    ctx.fillText('Map found! Go to exit!', CANVAS_W - 18, 24);
  } else {
    ctx.fillStyle = '#cc8844';
    ctx.fillText('Kill monster -> Get map -> Find exit', CANVAS_W - 18, 24);
  }

  if (localPlayer.isGhost) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, CANVAS_W / 2 - 110, 50, 220, 32, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,180,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#aaaaff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GHOST - Spectating', CANVAS_W / 2, 71);
  }

  if (localPlayer.atExit && hasMapFragment) {
    const waiting = getAllAlivePlayers().filter(p => !playersAtExit.has(p.id)).length;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, CANVAS_W / 2 - 140, 85, 280, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#44ff44';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(waiting > 0 ? `Waiting for ${waiting} player(s)...` : 'All players at exit! Next level...', CANVAS_W / 2, 103);
  }

  if (deathPopup > 0) {
    const alpha = Math.min(1, deathPopup);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, CANVAS_W / 2 - 200, CANVAS_H / 2 - 50, 400, 100, 8);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,50,50,${alpha * 0.8})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU CAN PHASE THROUGH WALLS', CANVAS_W / 2, CANVAS_H / 2 - 8);
    ctx.fillText('NOW AND HELP YOUR', CANVAS_W / 2, CANVAS_H / 2 + 12);
    ctx.fillText('PLAYERS TO FIND EXIT', CANVAS_W / 2, CANVAS_H / 2 + 32);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, CANVAS_W - 80, CANVAS_H - 28, 70, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.fillText(`Alive: ${getAllAlivePlayers().length}`, CANVAS_W - 16, CANVAS_H - 14);
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

window.addEventListener('load', init);
