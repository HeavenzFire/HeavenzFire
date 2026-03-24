// Real-time Network Heatmap Overlay
class HeatmapOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.peers = [];
    this.globalPeers = 4;
    this.regionalPeers = 12;
    this.coherenceGlobal = 0.982;
  }

  update(data) {
    this.peers = data.peers || [];
  }

  draw() {
    const mapImg = new Image();
    mapImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIwIDAgMTAwMCAxMDAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMDAwMDAwIi8+PHN2Zz4='; // World map placeholder
    this.ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);

    // Global peers (intercontinental)
    this.drawPeerCluster(canvas.width * 0.8, canvas.height * 0.2, this.globalPeers, '#00FFFF', this.coherenceGlobal);
    
    // Regional peers
    this.drawPeerCluster(canvas.width * 0.3, canvas.height * 0.6, this.regionalPeers, '#00FF00', 0.988);
    
    // Local node
    this.drawLocalNode(canvas.width / 2, canvas.height / 2);
  }

  drawPeerCluster(x, y, count, color, coh) {
    this.ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const dx = (Math.random() - 0.5) * 50;
      const dy = (Math.random() - 0.5) * 50;
      this.ctx.beginPath();
      this.ctx.arc(x + dx, y + dy, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.fillStyle = 'white';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Coh: ${coh.toFixed(3)}`, x, y - 10);
  }

  drawLocalNode(x, y) {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 30);
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(1, 'transparent');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 30, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = 'lime';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }
}

// Integrate with dashboard
window.heatmap = new HeatmapOverlay(document.getElementById('canvas'));

// Update in animate loop
// heatmap.draw();

