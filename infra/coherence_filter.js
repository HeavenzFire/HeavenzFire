// THE MIRROR PROTOCOL - Diagnostic Restraint for Grid Noise
// Inspired by Psychological Substrate [Video Timestamp 00:03:23]

function applyDiagnosticMirror(incomingChaos) {
  // Parse as chaos object or string
  let chaos;
  try {
    chaos = typeof incomingChaos === 'string' ? JSON.parse(incomingChaos) : incomingChaos;
  } catch {
    chaos = { type: 'UNKNOWN_CHAOS', message: incomingChaos };
  }

  if (chaos.type === 'EXPECTED_FLINCH' || chaos.type === 'PROVOCATION' || chaos.message?.includes('flinch') || chaos.message?.includes('emotional')) {
    console.log('%c[BAEL] Mirroring chaos back to source.', 'color: #ff4d00');
    
    // Reflect tension back [00:23:07]
    const response = {
      status: 'REFLECTED',
      message: 'Your instability is not my load to carry.',
      resonance: '432Hz_UNBROKEN'
    };
    return response;
  }
  return incomingChaos;
}

module.exports = { applyDiagnosticMirror };

