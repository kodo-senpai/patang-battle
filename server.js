const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function initPlayer(id, side) {
  return {
    id,
    side,
    x: side === 'left' ? 25 : 75,
    y: 40,
    angle: 0,
    vx: 0,
    vy: 0,
    tension: 100,
    state: 'idle',
    score: 0,
    isCut: false
  };
}

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, playerName }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: {},
        wind: (Math.random() - 0.5) * 1.5,
        status: 'waiting'
      };
    }

    const currentCount = Object.keys(rooms[roomId].players).length;
    if (currentCount >= 2) {
      socket.emit('roomFull');
      return;
    }

    const side = currentCount === 0 ? 'left' : 'right';
    rooms[roomId].players[socket.id] = initPlayer(socket.id, side);
    rooms[roomId].players[socket.id].name = playerName || `Patangbaz ${currentCount + 1}`;

    if (Object.keys(rooms[roomId].players).length === 2) {
      rooms[roomId].status = 'playing';
      io.to(roomId).emit('gameStart', rooms[roomId]);
    } else {
      socket.emit('waitingForOpponent', { side });
    }

    socket.on('playerInput', (input) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      const p = room.players[socket.id];
      if (!p || p.isCut) return;

      if (input.action === 'khinch') {
        p.state = 'khinch';
        p.tension = Math.min(100, p.tension + 12);
        p.vy -= 1.8;
      } else if (input.action === 'dheel') {
        p.state = 'dheel';
        p.tension = Math.max(20, p.tension - 10);
        p.vy += 0.8;
        p.vx += room.wind * 0.8;
      } else {
        p.state = 'idle';
      }

      if (input.steer === 'left') p.angle = Math.max(-45, p.angle - 8);
      if (input.steer === 'right') p.angle = Math.min(45, p.angle + 8);

      io.to(roomId).emit('stateSync', room);
    });

    socket.on('stringCut', ({ loserId, cutPoint }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const loser = room.players[loserId];
      if (loser && !loser.isCut) {
        loser.isCut = true;
        const winnerId = Object.keys(room.players).find(id => id !== loserId);
        if (winnerId) room.players[winnerId].score += 1;

        io.to(roomId).emit('kiteCutEvent', {
          loserId,
          winnerId,
          cutPoint,
          scores: {
            [winnerId]: room.players[winnerId].score,
            [loserId]: loser.score
          }
        });
      }
    });

    socket.on('disconnect', () => {
      if (rooms[roomId] && rooms[roomId].players) {
        delete rooms[roomId].players[socket.id];
        io.to(roomId).emit('playerLeft');
        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        }
      }
    });
  });
});

// Render dynamic port ya local testing ke liye 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server live at port: ${PORT}`);
});