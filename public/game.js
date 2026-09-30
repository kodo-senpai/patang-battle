const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myId = null;
let currentRoom = null;
let clouds = [];
let sparks = [];
let birds = [];

// Initialize animated background clouds & birds
for (let i = 0; i < 5; i++) {
  clouds.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * (window.innerHeight * 0.45),
    scale: 0.6 + Math.random() * 0.8,
    speed: 0.2 + Math.random() * 0.4
  });
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const inputState = { left: false, right: false, khinch: false, dheel: false };

function syncInputs() {
  socket.emit('inputState', inputState);
}

// Universal Touch & Mouse Handler (Never misses a tap)
function bindKeyButton(elemId, keyProp) {
  const el = document.getElementById(elemId);
  const start = (e) => {
    e.preventDefault();
    sounds.init();
    if (keyProp === 'khinch') sounds.playKhinch();
    inputState[keyProp] = true;
    el.classList.add('active');
    syncInputs();
  };
  const end = (e) => {
    e.preventDefault();
    inputState[keyProp] = false;
    el.classList.remove('active');
    syncInputs();
  };

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
}

bindKeyButton('btn-steer-left', 'left');
bindKeyButton('btn-steer-right', 'right');
bindKeyButton('btn-khinch', 'khinch');
bindKeyButton('btn-dheel', 'dheel');

// Keyboard support for PC
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') inputState.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') inputState.right = true;
  if (e.key === ' ' || e.key === 'w') { inputState.khinch = true; sounds.playKhinch(); }
  if (e.key === 's' || e.key === 'Shift') inputState.dheel = true;
  syncInputs();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') inputState.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') inputState.right = false;
  if (e.key === ' ' || e.key === 'w') inputState.khinch = false;
  if (e.key === 's' || e.key === 'Shift') inputState.dheel = false;
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

socket.on('waitingForOpponent', () => {
  document.getElementById('lobby-status').innerText = 'Room ban gaya! Dusre phone se same room code daal kar join karein.';
});

socket.on('gameStart', (roomData) => {
  currentRoom = roomData;
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');
});

socket.on('tick', ({ players, wind }) => {
  if (!currentRoom) currentRoom = {};
  currentRoom.players = players;
  currentRoom.wind = wind;

  // Update HUD
  const pList = Object.values(players);
  if (pList[0]) {
    document.getElementById('p1-name').innerText = pList[0].name;
    document.getElementById('p1-score').innerText = pList[0].score;
  }
  if (pList[1]) {
    document.getElementById('p2-name').innerText = pList[1].name;
    document.getElementById('p2-score').innerText = pList[1].score;
  }
  const windArrow = document.getElementById('wind-arrow');
  windArrow.style.transform = `rotate(${wind > 0 ? 0 : 180}deg)`;
});

socket.on('kiteCutBroadcast', ({ loserId, winnerId }) => {
  sounds.playCutCelebration();
});

socket.on('roundReset', (roomData) => {
  currentRoom = roomData;
});

// Math intersection for Dor cross
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

// Draw clouds
function drawClouds() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  clouds.forEach(c => {
    c.x += c.speed;
    if (c.x > canvas.width + 100) c.x = -100;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 25 * c.scale, 0, Math.PI * 2);
    ctx.arc(c.x + 20 * c.scale, c.y - 10 * c.scale, 30 * c.scale, 0, Math.PI * 2);
    ctx.arc(c.x + 45 * c.scale, c.y, 22 * c.scale, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Main Render Loop
let waveTime = 0;
function render() {
  waveTime += 0.05;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Vibrant Sunny Sky Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.55, '#38bdf8');
  grad.addColorStop(0.85, '#bae6fd');
  grad.addColorStop(1, '#ffedd5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawClouds();

  // Draw Rooftop Terrace Silhouette at Bottom
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
  ctx.fillStyle = '#0f172a';
  for (let rx = 0; rx < canvas.width; rx += 45) {
    ctx.fillRect(rx, canvas.height - 55, 14, 16);
  }

  if (currentRoom && currentRoom.players) {
    const players = Object.values(currentRoom.players);
    let kitePoints = [];

    players.forEach((p) => {
      const kx = (p.x / 100) * canvas.width;
      const ky = (p.y / 100) * canvas.height;
      const handX = p.side === 'left' ? canvas.width * 0.16 : canvas.width * 0.84;
      const handY = canvas.height - 35;

      // Realistic Dor (Thread) with Catenary sag and flutter
      const slack = (100 - p.tension) * 0.8 + Math.sin(waveTime * 3 + p.x) * 4;
      const midX = (handX + kx) / 2;
      const midY = (handY + ky) / 2 + slack;

      if (!p.isCut) {
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.quadraticCurveTo(midX, midY, kx, ky);
        ctx.strokeStyle = p.side === 'left' ? '#f43f5e' : '#10b981';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Charkhi (Spool) at hands
        ctx.save();
        ctx.translate(handX, handY);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(-8, -12, 16, 24);
        ctx.fillStyle = p.side === 'left' ? '#ef4444' : '#10b981';
        ctx.fillRect(-6, -8, 12, 16);
        ctx.restore();
      }

      // Kite Body with shadow & flutter
      ctx.save();
      ctx.translate(kx, ky);
      const flutter = Math.sin(waveTime * 8) * 3;
      ctx.rotate(((p.angle + flutter) * Math.PI) / 180);

      // Kite Shadow
      ctx.beginPath();
      ctx.moveTo(8, -26);
      ctx.lineTo(34, 0);
      ctx.lineTo(8, 26);
      ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fill();

      // Kite Shape
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(26, 0);
      ctx.lineTo(0, 32);
      ctx.lineTo(-26, 0);
      ctx.closePath();
      ctx.fillStyle = p.side === 'left' ? '#ea580c' : '#7c3aed';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Cross Bamboo Sticks (Thadda & Kaamp)
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(0, 32);
      ctx.moveTo(-26, 0);
      ctx.quadraticCurveTo(0, -18, 26, 0);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Decorative Tail (Patta)
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(-7, 52 + Math.sin(waveTime * 5) * 4);
      ctx.lineTo(7, 52 + Math.sin(waveTime * 5) * 4);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();

      ctx.restore();
      kitePoints.push({ p, handX, handY, kx, ky });
    });

    // Pecha Cross Collision Resolution
    if (kitePoints.length === 2 && !kitePoints[0].p.isCut && !kitePoints[1].p.isCut) {
      const p1 = kitePoints[0];
      const p2 = kitePoints[1];

      const cross = getLineCross(p1.handX, p1.handY, p1.kx, p1.ky, p2.handX, p2.handY, p2.kx, p2.ky);

      if (cross) {
        // Friction Sparks
        for (let s = 0; s < 2; s++) {
          sparks.push({
            x: cross.x,
            y: cross.y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 0.5,
            color: '#fff'
          });
        }

        // Host handles decision based on dynamic action comparison
        if (p1.p.id === myId) {
          if (p1.p.inputs.khinch && p2.p.inputs.dheel) {
            socket.emit('playerCutKite', { loserId: p2.p.id });
          } else if (p2.p.inputs.khinch && p1.p.inputs.dheel) {
            socket.emit('playerCutKite', { loserId: p1.p.id });
          }
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
