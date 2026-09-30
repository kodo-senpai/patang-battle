const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function initPlayer(id, side, name) {
  return {
    id,
    name: name || (side === 'left' ? 'Player 1' : 'Player 2'),
    side,
    x: side === 'left' ? 25 : 75,
    y: 45,
    angle: 0,
    tension: 70,
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
        wind: 0.4,
        status: 'waiting'
      };
    }

    const room = rooms[roomId];
    const currentCount = Object.keys(room.players).length;

    if (currentCount >= 2 && !room.players[socket.id]) {
      socket.emit('roomFull');
      return;
    }

    const side = currentCount === 0 ? 'left' : 'right';
    room.players[socket.id] = initPlayer(socket.id, side, playerName);

    if (Object.keys(room.players).length === 2) {
      room.status = 'playing';
      io.to(roomId).emit('gameStart', room);
    } else {
      socket.emit('waitingForOpponent', { side });
    }

    socket.on('updatePosition', (pos) => {
      const p = room.players[socket.id];
      if (p && !p.isCut) {
        p.x = pos.x;
        p.y = pos.y;
        p.angle = pos.angle;
        p.tension = pos.tension;
      }
    });

    socket.on('playerCutKite', ({ loserSide }) => {
      if (!room) return;
      const loserId = Object.keys(room.players).find(id => room.players[id].side === loserSide);
      const winnerId = Object.keys(room.players).find(id => room.players[id].side !== loserSide);

      if (loserId && room.players[loserId] && !room.players[loserId].isCut) {
        room.players[loserId].isCut = true;
        if (winnerId && room.players[winnerId]) room.players[winnerId].score += 1;

        io.to(roomId).emit('kiteCutBroadcast', { loserId, winnerId });

        setTimeout(() => {
          if (rooms[roomId]) {
            Object.values(rooms[roomId].players).forEach(p => {
              p.isCut = false;
              p.x = p.side === 'left' ? 25 : 75;
              p.y = 45;
              p.tension = 70;
            });
            io.to(roomId).emit('gameStart', rooms[roomId]);
          }
        }, 3000);
      }
    });

    socket.on('disconnect', () => {
      if (room && room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomId).emit('playerLeft');
        if (Object.keys(room.players).length === 0) delete rooms[roomId];
      }
    });
  });
});

// Periodic broadcast (30 FPS)
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.status === 'playing') {
      io.to(roomId).emit('tick', {
        players: room.players,
        wind: room.wind
      });
    }
  }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server live on port ${PORT}`);
});
