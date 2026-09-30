const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId = null;
let currentRoom = null;
let mySide = null;
let clouds = [];
let sparks = [];

for (let i = 0; i < 5; i++) {
  clouds.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * (window.innerHeight * 0.4),
    scale: 0.6 + Math.random() * 0.8,
    speed: 0.3 + Math.random() * 0.4
  });
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Local active player state
const localPlayers = {
  left: { x: 25, y: 45, vx: 0, vy: 0, angle: 0, tension: 70, isCut: false, name: 'Player 1', score: 0 },
  right: { x: 75, y: 45, vx: 0, vy: 0, angle: 0, tension: 70, isCut: false, name: 'Player 2', score: 0 }
};

let windSpeed = 0.4;
const inputs = { left: false, right: false, khinch: false, dheel: false };

function syncInputs() {
  socket.emit('playerInput', inputs);
}

// Mobile Touch & Mouse binding
function bindAction(btnId, actionKey) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const onStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    sounds.init();
    if (actionKey === 'khinch') sounds.playKhinch();
    inputs[actionKey] = true;
    syncInputs();
  };

  const onEnd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    inputs[actionKey] = false;
    syncInputs();
  };

  btn.addEventListener('touchstart', onStart, { passive: false });
  btn.addEventListener('touchend', onEnd, { passive: false });
  btn.addEventListener('mousedown', onStart);
  btn.addEventListener('mouseup', onEnd);
  btn.addEventListener('mouseleave', onEnd);
}

bindAction('btn-steer-left', 'left');
bindAction('btn-steer-right', 'right');
bindAction('btn-khinch', 'khinch');
bindAction('btn-dheel', 'dheel');

// Keyboard binding
window.addEventListener('keydown', (e) => {
  sounds.init();
  if (e.key === 'ArrowLeft' || e.key === 'a') inputs.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') inputs.right = true;
  if (e.key === ' ' || e.key === 'w') { inputs.khinch = true; sounds.playKhinch(); }
  if (e.key === 's' || e.key === 'Shift') inputs.dheel = true;
  syncInputs();
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') inputs.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') inputs.right = false;
  if (e.key === ' ' || e.key === 'w') inputs.khinch = false;
  if (e.key === 's' || e.key === 'Shift') inputs.dheel = false;
  syncInputs();
});

// Lobby connection
document.getElementById('btn-join').addEventListener('click', () => {
  sounds.init();
  const playerName = document.getElementById('player-name').value.trim() || 'Patangbaz';
  const roomId = document.getElementById('room-code').value.trim().toUpperCase() || 'SKY1';
  socket.emit('joinRoom', { roomId, playerName });
  document.getElementById('lobby-status').innerText = 'Room join ho raha hai...';
});

socket.on('connect', () => { myId = socket.id; });

socket.on('waitingForOpponent', (data) => {
  mySide = data.side;
  document.getElementById('lobby-status').innerText = 'Room ban gaya! Dusre device me same room code enter karein.';
});

socket.on('gameStart', (roomData) => {
  currentRoom = roomData;
  const pList = Object.values(roomData.players);
  const me = pList.find(p => p.id === myId);
  if (me) mySide = me.side;

  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');
});

socket.on('tick', ({ players, wind }) => {
  windSpeed = wind;
  for (const id in players) {
    const s = players[id].side;
    if (localPlayers[s]) {
      // Remote player sync
      if (s !== mySide) {
        localPlayers[s].x += (players[id].x - localPlayers[s].x) * 0.4;
        localPlayers[s].y += (players[id].y - localPlayers[s].y) * 0.4;
        localPlayers[s].angle = players[id].angle;
        localPlayers[s].tension = players[id].tension;
      }
      localPlayers[s].isCut = players[id].isCut;
      localPlayers[s].name = players[id].name;
      localPlayers[s].score = players[id].score;
    }
  }

  document.getElementById('p1-name').innerText = localPlayers.left.name;
  document.getElementById('p1-score').innerText = localPlayers.left.score;
  document.getElementById('p2-name').innerText = localPlayers.right.name;
  document.getElementById('p2-score').innerText = localPlayers.right.score;

  const windArrow = document.getElementById('wind-arrow');
  windArrow.style.transform = `rotate(${wind > 0 ? 0 : 180}deg)`;
});

socket.on('kiteCutBroadcast', () => {
  sounds.playCutCelebration();
});

function getLineCross(x1, y1, x2, y2, x3, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
  }
  return null;
}

// 60 FPS Local Physics Loop
function updatePhysics() {
  const side = mySide || 'left';
  const me = localPlayers[side];

  if (me && !me.isCut) {
    // Steer angle
    if (inputs.left) me.angle = Math.max(-45, me.angle - 3.5);
    else if (inputs.right) me.angle = Math.min(45, me.angle + 3.5);
    else me.angle *= 0.92;

    const rad = (me.angle * Math.PI) / 180;

    // Khinch & Dheel
    if (inputs.khinch) {
      me.vx += Math.sin(rad) * 0.7;
      me.vy -= 0.5;
      me.tension = Math.min(100, me.tension + 1.2);
    } else if (inputs.dheel) {
      me.vx += windSpeed * 0.15;
      me.vy += 0.25;
      me.tension = Math.max(15, me.tension - 1.5);
    } else {
      me.tension += (65 - me.tension) * 0.05;
      me.vy += 0.05; // slight gravity
    }

    me.vx += windSpeed * 0.05 + Math.sin(rad) * 0.15;

    // Damping
    me.vx *= 0.93;
    me.vy *= 0.93;

    me.x += me.vx;
    me.y += me.vy;

    // Screen limits
    me.x = Math.max(10, Math.min(90, me.x));
    me.y = Math.max(15, Math.min(75, me.y));

    // Send position to server
    socket.emit('updatePosition', {
      x: me.x,
      y: me.y,
      angle: me.angle,
      tension: me.tension
    });
  }

  // Animate cut kites
  ['left', 'right'].forEach(s => {
    const p = localPlayers[s];
    if (p.isCut) {
      p.y += 0.5;
      p.x += windSpeed * 0.4;
      p.angle += 4;
    }
  });
}

let waveTime = 0;
function render() {
  updatePhysics();
  waveTime += 0.05;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sunny Sky
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.65, '#38bdf8');
  grad.addColorStop(1, '#ffedd5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clouds
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  clouds.forEach(c => {
    c.x += c.speed;
    if (c.x > canvas.width + 80) c.x = -80;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22 * c.scale, 0, Math.PI * 2);
    ctx.arc(c.x + 18 * c.scale, c.y - 8 * c.scale, 26 * c.scale, 0, Math.PI * 2);
    ctx.arc(c.x + 36 * c.scale, c.y, 20 * c.scale, 0, Math.PI * 2);
    ctx.fill();
  });

  // Rooftop
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, canvas.height - 35, canvas.width, 35);
  for (let rx = 0; rx < canvas.width; rx += 40) {
    ctx.fillRect(rx, canvas.height - 50, 16, 15);
  }

  let kitePoints = [];

  ['left', 'right'].forEach((side) => {
    const p = localPlayers[side];
    const kx = (p.x / 100) * canvas.width;
    const ky = (p.y / 100) * canvas.height;
    const handX = side === 'left' ? canvas.width * 0.16 : canvas.width * 0.84;
    const handY = canvas.height - 35;

    // String with curve & tension
    const slack = (100 - p.tension) * 0.8 + Math.sin(waveTime * 3 + p.x) * 3;
    const midX = (handX + kx) / 2;
    const midY = (handY + ky) / 2 + slack;

    if (!p.isCut) {
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.quadraticCurveTo(midX, midY, kx, ky);
      ctx.strokeStyle = side === 'left' ? '#f43f5e' : '#10b981';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Spool
      ctx.fillStyle = '#b45309';
      ctx.fillRect(handX - 8, handY - 10, 16, 20);
      ctx.fillStyle = side === 'left' ? '#ef4444' : '#10b981';
      ctx.fillRect(handX - 6, handY - 7, 12, 14);
    }

    // Kite Body
    ctx.save();
    ctx.translate(kx, ky);
    const flutter = Math.sin(waveTime * 7) * 2;
    ctx.rotate(((p.angle + flutter) * Math.PI) / 180);

    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(24, 0);
    ctx.lineTo(0, 30);
    ctx.lineTo(-24, 0);
    ctx.closePath();
    ctx.fillStyle = side === 'left' ? '#ea580c' : '#7c3aed';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bamboo Frame
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(0, 30);
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(0, -16, 24, 0);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(-6, 48 + Math.sin(waveTime * 5) * 3);
    ctx.lineTo(6, 48 + Math.sin(waveTime * 5) * 3);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();

    ctx.restore();
    kitePoints.push({ side, handX, handY, kx, ky, p });
  });

  // Pecha collision detection
  if (kitePoints.length === 2 && !kitePoints[0].p.isCut && !kitePoints[1].p.isCut) {
    const p1 = kitePoints[0];
    const p2 = kitePoints[1];
    const cross = getLineCross(p1.handX, p1.handY, p1.kx, p1.ky, p2.handX, p2.handY, p2.kx, p2.ky);

    if (cross) {
      for (let s = 0; s < 2; s++) {
        sparks.push({
          x: cross.x,
          y: cross.y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 0.5,
          color: '#ffffff'
        });
      }

      if (mySide === 'left') {
        if (inputs.khinch && p2.p.tension < 50) {
          socket.emit('playerCutKite', { loserSide: 'right' });
        }
      } else if (mySide === 'right') {
        if (inputs.khinch && p1.p.tension < 50) {
          socket.emit('playerCutKite', { loserSide: 'left' });
        }
      }
    }
  }

  // Draw Sparks
  sparks.forEach((s, idx) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 3, 3);
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 0.04;
    if (s.life <= 0) sparks.splice(idx, 1);
  });

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
