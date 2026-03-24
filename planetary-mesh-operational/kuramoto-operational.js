const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

class Node {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.1 + Math.random() * 0.1;
  }
  update(nodes, couplingStrength = 1.0) {
    let avgAngle = 0;
    nodes.forEach(n => avgAngle += n.angle);
    avgAngle /= nodes.length;
    this.angle += (avgAngle - this.angle) * couplingStrength * 0.01;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    gradient.addColorStop(0, `hsl(${this.angle * 57.3}, 100%, 70%)`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-15, -15, 30, 30);
    ctx.restore();
  }
}

let nodes = [];
const baseNodes = 100;
for (let i = 0; i < baseNodes; i++) {
  nodes.push(new Node(i, Math.random() * canvas.width, Math.random() * canvas.height));
}

let coupling = 0;
let resonanceActive = false;

function calculateCoherence() {
  let r = 0;
  for (let i = 1; i < nodes.length; i++) {
    r += Math.cos(nodes[i].angle - nodes[0].angle);
  }
  return Math.abs(r) / nodes.length;
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

