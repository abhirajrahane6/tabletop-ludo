const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { createGame, rollGame, moveGame, legalTokens } = require('./src/rules');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.ALLOWED_ORIGIN || '*' } });
const rooms = new Map();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true }));

function code() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }
function publicState(room) {
  return { code: room.code, players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })), game: room.game, started: !!room.game };
}
function broadcast(room) { io.to(room.code).emit('room:state', publicState(room)); }
io.on('connection', socket => {
  socket.on('room:create', ({ name }, done = () => {}) => {
    let id = code(); while (rooms.has(id)) id = code();
    const player = { id: socket.id, token: crypto.randomBytes(24).toString('base64url'), name: cleanName(name), color: 'red', connected: true };
    const room = { code: id, players: [player], game: null };
    rooms.set(id, room); socket.join(id); socket.data.room = id;
    done({ ok: true, state: publicState(room), resumeToken: player.token }); broadcast(room);
  });
  socket.on('room:join', ({ code: raw, name }, done = () => {}) => {
    const room = rooms.get(String(raw || '').trim().toUpperCase());
    if (!room) return done({ ok: false, error: 'Room not found. Check the code and try again.' });
    if (room.game || room.players.length >= 4) return done({ ok: false, error: 'This room is full or the game has already started.' });
    const colors = ['red', 'blue', 'yellow', 'green'];
    const player = { id: socket.id, token: crypto.randomBytes(24).toString('base64url'), name: cleanName(name), color: colors[room.players.length], connected: true };
    room.players.push(player);
    socket.join(room.code); socket.data.room = room.code;
    done({ ok: true, state: publicState(room), resumeToken: player.token }); broadcast(room);
  });
  socket.on('room:resume', ({ token }, done = () => {}) => {
    let foundRoom, player;
    for (const room of rooms.values()) {
      const candidate = room.players.find(p => p.token === token);
      if (candidate) { foundRoom = room; player = candidate; break; }
    }
    if (!foundRoom) return done({ ok: false, error: 'That room session has expired. Join with a fresh invite.' });
    player.id = socket.id; player.connected = true; socket.join(foundRoom.code); socket.data.room = foundRoom.code;
    done({ ok: true, state: publicState(foundRoom), resumeToken: player.token }); broadcast(foundRoom);
  });
  socket.on('room:leave', (_, done = () => {}) => {
    const room = rooms.get(socket.data.room); if (!room) return done({ ok: true });
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      if (!room.game) {
        room.players = room.players.filter(p => p.id !== socket.id);
        const colors = ['red', 'blue', 'yellow', 'green'];
        room.players.forEach((p, i) => { p.color = colors[i]; });
        if (!room.players.length) rooms.delete(room.code);
      } else player.connected = false;
    }
    socket.leave(room.code); socket.data.room = null; broadcast(room); done({ ok: true });
  });
  socket.on('room:start', (_, done = () => {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.players[0].id !== socket.id) return done({ ok: false, error: 'Only the host can start this room.' });
    if (room.players.length < 2) return done({ ok: false, error: 'Invite at least one more player first.' });
    if (!room.game) room.game = createGame(room.players.map(p => ({ name: p.name, color: p.color })));
    broadcast(room); done({ ok: true });
  });
  socket.on('game:roll', (_, done = () => {}) => {
    const room = rooms.get(socket.data.room); const player = room?.players.find(p => p.id === socket.id);
    if (!room?.game || !player || room.players[room.game.turn].id !== socket.id) return done({ ok: false, error: 'It is not your turn.' });
    if (room.game.pendingRoll !== null) return done({ ok: false, error: 'Choose a token before rolling again.' });
    room.game = rollGame(room.game); broadcast(room); done({ ok: true });
  });
  socket.on('game:move', ({ token }, done = () => {}) => {
    const room = rooms.get(socket.data.room); const player = room?.players.find(p => p.id === socket.id);
    if (!room?.game || !player || room.players[room.game.turn].id !== socket.id) return done({ ok: false, error: 'It is not your turn.' });
    if (!legalTokens(room.game).includes(token)) return done({ ok: false, error: 'That token cannot move.' });
    room.game = moveGame(room.game, token); broadcast(room); done({ ok: true });
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room); if (!room) return;
    const player = room.players.find(p => p.id === socket.id); if (player) player.connected = false;
    broadcast(room);
    if (room.players.every(p => !p.connected)) setTimeout(() => { if (rooms.get(room.code) === room && room.players.every(p => !p.connected)) rooms.delete(room.code); }, 300000);
  });
});
function cleanName(value) { return String(value || 'Guest').trim().slice(0, 18) || 'Guest'; }
const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Ludo is ready on http://localhost:${port}`));
