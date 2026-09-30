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
    y: 40,
    vx: 0,
    vy: 0,
    angle: 0,
    targetAngle: 0,
    tension: 80,
    inputs: { left: false, right: false, khinch: false, dheel: false },
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
        wind: 0.5,
        windTarget: 0.5,
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

    socket.on('inputState', (inputs) => {
      if (room.players[socket.id]) {
        room.players[socket.id].inputs = inputs;
      }
    });

    socket.on('playerCutKite', ({ loserId }) => {
      if (!room || room.status !== 'playing') return;
      const loser = room.players[loserId];
      if (loser && !loser.isCut) {
        loser.isCut = true;
        const winnerId = Object.keys(room.players).find(id => id !== loserId);
        if (winnerId) room.players[winnerId].score += 1;
        io.to(roomId).emit('kiteCutBroadcast', { loserId, winnerId });
        
        // Auto reset pecha after 4 seconds
        setTimeout(() => {
          if (rooms[roomId]) {
            Object.values(rooms[roomId].players).forEach(p => {
              p.isCut = false;
              p.x = p.side === 'left' ? 25 : 75;
              p.y = 40;
              p.vx = 0;
              p.vy = 0;
              p.tension = 80;
            });
            io.to(roomId).emit('roundReset', rooms[roomId]);
          }
        }, 3500);
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

// Continuous 45 FPS Server Physics Loop
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.status !== 'playing') continue;

    // Smooth random wind changes
    if (Math.random() < 0.03) {
      room.windTarget = (Math.random() - 0.5) * 2.2;
    }
    room.wind += (room.windTarget - room.wind) * 0.05;

    for (const id in room.players) {
      const p = room.players[id];
      if (p.isCut) {
        p.y += 0.4;
        p.x += room.wind * 0.4;
        p.angle += 5;
        continue;
      }

      const inp = p.inputs;

      // Steering
      if (inp.left) p.targetAngle = -35;
      else if (inp.right) p.targetAngle = 35;
      else p.targetAngle = 0;

      p.angle += (p.targetAngle - p.angle) * 0.15;

      // Aerodynamic forces
      const rad = (p.angle * Math.PI) / 180;
      let lift = -0.06;
      let drag = room.wind * 0.1;

      if (inp.khinch) {
        // Aggressive pull towards angle direction
        p.vx += Math.sin(rad) * 0.8;
        p.vy -= 0.6;
        p.tension = Math.min(100, p.tension + 1.5);
      } else if (inp.dheel) {
        // Drift freely with wind & float higher
        p.vx += room.wind * 0.25;
        p.vy += 0.2;
        p.tension = Math.max(15, p.tension - 2.0);
      } else {
        // Natural tension stabilization
        p.tension += (70 - p.tension) * 0.05;
      }

      p.vx += drag + Math.sin(rad) * 0.2;
      p.vy += lift;

      // Friction damping
      p.vx *= 0.92;
      p.vy *= 0.92;

      p.x += p.vx;
      p.y += p.vy;

      // Boundary limits
      p.x = Math.max(8, Math.min(92, p.x));
      p.y = Math.max(10, Math.min(75, p.y));
    }

    io.to(roomId).emit('tick', {
      players: room.players,
      wind: room.wind
    });
  }
}, 1000 / 45);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server live on port ${PORT}`);
});
