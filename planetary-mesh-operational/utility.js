// Connection Utility - Live P2P Mesh Functionality
class MeshUtility {
  constructor() {
    this.peers = new Map();
    this.localID = 'node-' + Math.random().toString(36).substr(2, 9);
    this.messages = [];
    this.channels = [];
  }

  async initWebRTC() {
    const config = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]};
    this.localConnection = new RTCPeerConnection(config);
    this.localConnection.onicecandidate = this.handleICECandidate.bind(this);
    this.localConnection.ontrack = this.handleRemoteStream.bind(this);
  }

  sendMessage(targetID, data) {
    if (this.channels[targetID]) {
      this.channels[targetID].send(JSON.stringify(data));
    } else {
      this.messages.push({to: targetID, data, time: Date.now()});
    }
  }

  handleICECandidate(event) {
    if (event.candidate) {
      // Broadcast ICE candidate via signaling server or QR/manual
      console.log('New ICE candidate', event.candidate);
    }
  }

  handleRemoteStream(event) {
    console.log('Remote stream received');
  }

  generateConnectionQR() {
    const qrData = {
      id: this.localID,
      type: 'offer',
      sdp: this.localConnection.localDescription.sdp
    };
    // QR lib or canvas QR
    console.log('QR for connection:', JSON.stringify(qrData));
    return qrData;
  }

  async createOffer() {
    const offer = await this.localConnection.createOffer();
    await this.localConnection.setLocalDescription(offer);
    return offer;
  }
}

// Global utility instance
window.meshUtility = new MeshUtility();
window.meshUtility.initWebRTC();

function connectPeer() {
  meshUtility.createOffer().then(offer => {
    prompt('Share this SDP for connection:', JSON.stringify(offer));
  });
}

function sendUtilityMsg() {
  const msg = prompt('Utility message:');
  if (msg) {
    meshUtility.sendMessage('peer1', {type: 'utility', data: msg});
  }
}
