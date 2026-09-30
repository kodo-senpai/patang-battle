const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId = null;
let currentRoom = null;
let sparks = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.getElementById('btn-join').addEventListener('click', () => {
  sounds.init();
  const playerName = document.getElementById('player-name').value || 'Patangbaz';
  const roomId = document.getElementById('room-code').value.toUpperCase() || 'ROOF1';
  socket.emit('joinRoom', { roomId, playerName });
  document.getElementById('lobby-status').innerText = 'Room join ho raha hai...';
});

socket.on('connect', () => { myId = socket.id; });

socket.on('waitingForOpponent', () => {
  document.getElementById('lobby-status').innerText = 'Dusre player ka intezar hai... Dusre phone me same room code enter karein!';
});

socket.on('gameStart', (roomData) => {
  currentRoom = roomData;
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');
});

socket.on('stateSync', (roomData) => {
  currentRoom = roomData;
});

socket.on('kiteCutEvent', ({ loserId, cutPoint, scores }) => {
  sounds.playCutCelebration();
  for (let i = 0; i < 40; i++) {
    sparks.push({
      x: (cutPoint.x / 100) * canvas.width,
      y: (cutPoint.y / 100) * canvas.height,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1.0,
      color: '#fbbf24'
    });
  }

  const pIds = Object.keys(scores);
  if (pIds[0]) document.getElementById('p1-score').innerText = scores[pIds[0]];
  if (pIds[1]) document.getElementById('p2-score').innerText = scores[pIds[1]];
});

function emitInput(action, steer) {
  socket.emit('playerInput', { action, steer });
}

// Touch events for mobile buttons
['touchstart', 'mousedown'].forEach(evt => {
  document.getElementById('btn-khinch').addEventListener(evt, (e) => {
    e.preventDefault();
    sounds.playKhinch();
    emitInput('khinch', null);
  });
  document.getElementById('btn-dheel').addEventListener(evt, (e) => {
    e.preventDefault();
    emitInput('dheel', null);
  });
  document.getElementById('btn-steer-left').addEventListener(evt, (e) => {
    e.preventDefault();
    emitInput(null, 'left');
  });
  document.getElementById('btn-steer-right').addEventListener(evt, (e) => {
    e.preventDefault();
    emitInput(null, 'right');
  });
});

function checkLineIntersection(x1, y1, x2, y2, x3, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: x1 + ua * (x2 - x1),
      y: y1 + ua * (y2 - y1)
    };
  }
  return null;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, '#0284c7');
  skyGrad.addColorStop(0.6, '#38bdf8');
  skyGrad.addColorStop(1, '#fed7aa');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (currentRoom && currentRoom.players) {
    const players = Object.values(currentRoom.players);
    let kitePositions = [];

    players.forEach((p) => {
      const kx = (p.x / 100) * canvas.width;
      const ky = (p.y / 100) * canvas.height;
      const handX = p.side === 'left' ? canvas.width * 0.15 : canvas.width * 0.85;
      const handY = canvas.height - 30;

      ctx.beginPath();
      ctx.moveTo(handX, handY);
      const slack = (100 - p.tension) * 0.8;
      const midX = (handX + kx) / 2;
      const midY = (handY + ky) / 2 + slack;

      if (!p.isCut) {
        ctx.quadraticCurveTo(midX, midY, kx, ky);
        ctx.strokeStyle = p.side === 'left' ? '#f43f5e' : '#10b981';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(kx, ky);
      ctx.rotate((p.angle * Math.PI) / 180);

      if (p.isCut) {
        p.y += 0.2;
        p.x += currentRoom.wind * 0.5;
        p.angle += 3;
      }

      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(20, 0);
      ctx.lineTo(0, 24);
      ctx.lineTo(-20, 0);
      ctx.closePath();
      ctx.fillStyle = p.side === 'left' ? '#f97316' : '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(-5, 40);
      ctx.lineTo(5, 40);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();

      ctx.restore();
      kitePositions.push({ p, handX, handY, kx, ky });
    });

    if (kitePositions.length === 2 && !kitePositions[0].p.isCut && !kitePositions[1].p.isCut) {
      const p1 = kitePositions[0];
      const p2 = kitePositions[1];

      const cross = checkLineIntersection(p1.handX, p1.handY, p1.kx, p1.ky, p2.handX, p2.handY, p2.kx, p2.ky);

      if (cross) {
        sparks.push({
          x: cross.x,
          y: cross.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 0.6,
          color: '#ffffff'
        });

        if (p1.p.id === myId) {
          if (p1.p.state === 'khinch' && p2.p.state === 'dheel') {
            socket.emit('stringCut', {
              loserId: p2.p.id,
              cutPoint: { x: (cross.x / canvas.width) * 100, y: (cross.y / canvas.height) * 100 }
            });
          } else if (p2.p.state === 'khinch' && p1.p.state === 'dheel') {
            socket.emit('stringCut', {
              loserId: p1.p.id,
              cutPoint: { x: (cross.x / canvas.width) * 100, y: (cross.y / canvas.height) * 100 }
            });
          }
        }
      }
    }
  }

  sparks.forEach((s, idx) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 3, 3);
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 0.03;
    if (s.life <= 0) sparks.splice(idx, 1);
  });

  requestAnimationFrame(render);
}

requestAnimationFrame(render);