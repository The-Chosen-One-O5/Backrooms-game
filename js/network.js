let peer = null;
let hostConn = null;
let joinerConns = new Map();
let playerId = null;
let isHost = false;
let roomCode = null;
let callbacks = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function onMsg(data) {
  if (data.event) {
    if (data.event === 'player_pos' && data.from === playerId) return;
    emit(data.event, data);
  }
}

function emit(type, data) { if (callbacks[type]) callbacks[type](data); }

function safeEmit(event, data) {
  const msg = { event, ...data };
  if (isHost) {
    for (const [id, conn] of joinerConns) {
      if (conn.open) conn.send(msg);
    }
  } else if (hostConn && hostConn.open) {
    hostConn.send(msg);
  }
}

export function initNetwork() {
  return new Promise((resolve) => {
    try {
      peer = new Peer();
      peer.on('open', (id) => {
        playerId = id;
        resolve(id);
      });
      peer.on('error', (err) => {
        console.error('Peer error:', err);
        resolve(null);
      });
    } catch (err) {
      console.error('PeerJS init error:', err);
      resolve(null);
    }
  });
}

export function getPlayerId() { return playerId; }
export function getIsHost() { return isHost; }
export function setIsHost(val) { isHost = val; }
export function getRoomCode() { return roomCode; }

export function onEvent(type, cb) { callbacks[type] = cb; }

export function hostRoom(name) {
  isHost = true;
  roomCode = genCode();

  if (peer) peer.destroy();
  peer = new Peer(roomCode);
  playerId = roomCode;

  peer.on('open', () => {
    emit('room_hosted', { code: roomCode });
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      joinerConns.set(conn.peer, conn);

      conn.on('data', (data) => {
        if (data.event === 'join') {
          conn._playerName = data.name;
          broadcastLobby();
        } else {
          onMsg(data);
        }
      });

      conn.on('close', () => {
        const leftId = conn.peer;
        joinerConns.delete(conn.peer);
        for (const [id, c] of joinerConns) {
          if (c.open) c.send({ event: 'player_left', id: leftId });
        }
        emit('player_left', { id: leftId });
        broadcastLobby();
      });
    });
  });

  peer.on('disconnected', () => {
    if (peer && !peer.destroyed) peer.reconnect();
  });
}

export function joinRoom(code, name) {
  isHost = false;
  roomCode = code.toUpperCase();

  if (peer) peer.destroy();
  peer = new Peer();

  peer.on('open', (id) => {
    playerId = id;
    const conn = peer.connect(roomCode, { metadata: { name } });
    hostConn = conn;

    conn.on('open', () => {
      conn.send({ event: 'join', name });
      emit('room_joined', { code: roomCode });
    });

    conn.on('data', (data) => {
      if (data.event === 'lobby_update') {
        emit('lobby_update', data);
      } else if (data.event === 'game_start') {
        emit('game_start', data);
      } else {
        onMsg(data);
      }
    });

    conn.on('close', () => {
      emit('host_disconnected', {});
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    emit('join_error', { error: 'Connection failed' });
  });
}

function broadcastLobby() {
  const players = [{ id: roomCode, name: 'Host' }];
  for (const [id, conn] of joinerConns) {
    players.push({ id, name: conn._playerName || 'Player' });
  }
  const msg = { event: 'lobby_update', players, hostId: roomCode };
  emit('lobby_update', msg);
  for (const [id, conn] of joinerConns) {
    if (conn.open) conn.send(msg);
  }
}

export function sendStartGame(data) {
  const players = [{ id: roomCode, name: 'Host' }];
  for (const [id, conn] of joinerConns) {
    players.push({ id, name: conn._playerName || 'Player' });
  }
  const msg = { event: 'game_start', players, level: data.level || 0, ghostEnabled: data.ghostEnabled };
  emit('game_start', msg);
  for (const [id, conn] of joinerConns) {
    if (conn.open) conn.send(msg);
  }
}

export function sendPlayerPos(x, y, dir, hp, hasWeapon, isGhost) {
  safeEmit('player_pos', { from: playerId, x, y, dir, hp, hasWeapon, isGhost });
}

export function sendPlayerAttack(x, y, dir) {
  safeEmit('player_attack', { from: playerId, x, y, dir });
}

export function sendWeaponPicked(weaponId) {
  safeEmit('weapon_picked', { from: playerId, weaponId });
}

export function sendMonsterKilled(monsterId, mapFragment) {
  safeEmit('monster_killed', { from: playerId, monsterId, mapFragment });
}

export function sendMapPicked(fragmentId) {
  safeEmit('map_picked', { from: playerId, fragmentId });
}

export function sendExitReached() {
  safeEmit('exit_reached', { from: playerId });
}

export function sendNextLevel(level) {
  safeEmit('next_level', { level });
}

export function sendGameOver() {
  safeEmit('game_over', {});
}

export function sendYouWon() {
  safeEmit('you_won', {});
}

export function sendPlayerDied() {
  safeEmit('player_died', { from: playerId });
}

export function leaveRoom() {
  if (hostConn) { hostConn.close(); hostConn = null; }
  for (const [id, conn] of joinerConns) conn.close();
  joinerConns.clear();
  if (peer && !peer.destroyed) peer.destroy();
  peer = null;
  roomCode = null;
  isHost = false;
}
