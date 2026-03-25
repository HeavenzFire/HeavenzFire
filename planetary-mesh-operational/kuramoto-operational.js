import { getTheta, getOmega, getPsi, getGamma, HEARTBEAT_CONFIG } from './heartbeat-harmonizer.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const N_TOTAL = HEARTBEAT_CONFIG.N;
let heartbeatFreq = HEARTBEAT_CONFIG.f_heartbeat;
let vizSize = 500; // Visualize subsample for perf
let lastTime = 0;
let dt = 0.016; // 60fps default
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

class Node {
  constructor(id, x, y, theta0, omega0) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.angle = theta0 || Math.random() * Math.PI * 2; // Initial harmonized phase ψ or random
    this.omega = omega0 || getOmega(heartbeatFreq); // Biological angular freq
    this.couplingK = 1.0; // Kuramoto coupling
  }
  update(nodes, dt, couplingStrength = 1.0) {
    // Classic Kuramoto: dθ/dt = ω + (K/N) Σ sin(θj - θi)
    let sinSum = 0;
    nodes.forEach(n => {
      sinSum += Math.sin(n.angle - this.angle);
    });
    sinSum /= nodes.length;
    this.angle += (this.omega * dt + this.couplingK * sinSum * dt) * couplingStrength;
    this.angle = (this.angle + Math.PI*2) % (Math.PI*2); // Normalize [0,2π]
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    gradient.addColorStop(0, `hsl(${this.angle * 57.3 % 360}, 100%, 70%)`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-15, -15, 30, 30);
    ctx.restore();
  }
}

let allNodes = []; // 42K logical nodes
let vizNodes = []; // Subsample for visualization

// Initialize 42K nodes with harmonized phases
const theta = getTheta();
const omega = getOmega(heartbeatFreq);
for (let i = 0; i < N_TOTAL; i++) {
  const psi = getPsi(i, theta, omega);
  allNodes.push(new Node(i, 0, 0, psi, omega)); // Positions virtual
}

// Viz subsample - random positions
for (let i = 0; i < vizSize; i++) {
  const idx = Math.floor(Math.random() * N_TOTAL);
  vizNodes.push(new Node(allNodes[idx].id, Math.random() * canvas.width, Math.random() * canvas.height, allNodes[idx].angle, allNodes[idx].omega));
}

let coupling = 0;
let resonanceActive = false;

function calculateCoherence() {
  // Global Coherence Γ from equations
  const angles = allNodes.map(n => n.angle);
  return getGamma(angles).toFixed(4);
}

function animate() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  nodes.forEach(node => node.update(nodes, coupling));

  const coh = calculateCoherence();
  document.getElementById('coherence').textContent = `Coherence: ${coh.toFixed(2)}`;
  document.getElementById('nodeCount').textContent = nodes.length;
  document.getElementById('status').textContent = resonanceActive ? 'OPERATIONAL' : 'SIM OFFLINE';

  nodes.forEach(node => node.draw());
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

function toggleResonance() {
  resonanceActive = !resonanceActive;
  coupling = resonanceActive ? 1.5 : 0;
}

function addNode() {
  nodes.push(new Node(nodes.length, Math.random() * canvas.width, Math.random() * canvas.height));
}

animate();

