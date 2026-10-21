'use strict';

// Deterministic digital resonance model. Frequencies are simulation/control parameters,
// not measured EM/acoustic outputs and not a quantum hardware claim.
const DEFAULTS = Object.freeze({ baseHz: 7.83, radix: 12, order: 3, phaseLockToleranceRad: 1e-9 });
const ROLE_COLORS = Object.freeze({
  architecture: '#5B8CFF', implementation: '#35D6C4', security: '#FF5B6E',
  verification: '#F4C95D', synthesis: '#B78CFF', unbound: '#8B95A5'
});

function hash32(input) {
  let h = 2166136261;
  for (const ch of String(input)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mod(n, m) { return ((n % m) + m) % m; }
function wrapPhase(x) { return mod(x + Math.PI, 2 * Math.PI) - Math.PI; }
function assertFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(name + ' must be a finite positive number');
}
function createResonanceProfile(agent, options = {}) {
  if (!agent || typeof agent.id !== 'string' || !agent.id.trim()) throw new TypeError('agent.id is required');
  const baseHz = options.baseHz === undefined ? DEFAULTS.baseHz : options.baseHz;
  const radix = options.radix === undefined ? DEFAULTS.radix : options.radix;
  const order = options.order === undefined ? DEFAULTS.order : options.order;
  const timeSeconds = options.timeSeconds === undefined ? 0 : options.timeSeconds;
  const tolerance = options.phaseLockToleranceRad === undefined ? DEFAULTS.phaseLockToleranceRad : options.phaseLockToleranceRad;
  assertFinitePositive(baseHz, 'baseHz');
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) throw new TypeError('radix must be an integer from 2 through 36');
  if (!Number.isInteger(order) || order < 1 || order > 6) throw new TypeError('order must be an integer from 1 through 6');
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new TypeError('timeSeconds must be finite and nonnegative');
  const masterHz = baseHz * Math.pow(radix, order);
  if (!Number.isFinite(masterHz) || masterHz > 1e12) throw new RangeError('master frequency exceeds safe simulation bound');
  const identityHash = hash32(agent.id + ':' + (agent.name || 'unnamed'));
  const identityPhase = (identityHash / 0x100000000) * 2 * Math.PI;
  const roles = Array.isArray(agent.boundLanes) ? agent.boundLanes : [];
  const role = roles.length === 1 ? roles[0] : 'unbound';
  const frequencies = [baseHz, baseHz * radix, baseHz * radix * radix];
  // Each oscillator is a subharmonic of the master. Dividing the master phase by
  // its integer harmonic order creates an exact digital phase-lock relationship.
  const masterPhase = 2 * Math.PI * masterHz * timeSeconds;
  const phases = frequencies.map(f => {
    const harmonicOrder = Math.round(masterHz / f);
    return wrapPhase(identityPhase + masterPhase / harmonicOrder);
  });
  const normalizedMasterPhase = wrapPhase(identityPhase + masterPhase);
  const lockErrors = frequencies.map((f, i) => {
    const harmonicOrder = Math.round(masterHz / f);
    return wrapPhase(harmonicOrder * (phases[i] - identityPhase) - masterPhase);
  });
  const phaseLockErrorRad = Math.max(...lockErrors.map(Math.abs));
  const majorRadius = 1 + ((identityHash % 1000) / 10000);
  const minorRadius = majorRadius / (radix / 2);
  const spinDirection = identityHash & 1 ? 'clockwise' : 'counterclockwise';
  const spinRateRadPerSecond = (1 + ((identityHash >>> 1) % 17)) * (2 * Math.PI / radix);
  const spinAngleRad = wrapPhase(identityPhase + spinRateRadPerSecond * timeSeconds);
  const color = ROLE_COLORS[role] || ROLE_COLORS.unbound;
  const coherence = Math.max(0, Math.min(1, 1 - phaseLockErrorRad / Math.PI));
  return {
    schema: 'heavenzfire.resonance-profile.v1', agentId: agent.id, agentName: agent.name || null,
    modelOnly: true, physicalOutputVerified: false,
    radix: { base: radix, order, masterHz, componentHz: frequencies, ratiosToMaster: frequencies.map(f => masterHz / f) },
    phase: { componentRad: phases, masterRad: normalizedMasterPhase, lockErrorRad: phaseLockErrorRad, toleranceRad: tolerance, locked: phaseLockErrorRad <= tolerance, coherence },
    geometry: { model: 'toroidal-feedback-with-gyroid-inspired-cross-coupling', majorRadius, minorRadius, gyroidCoupling: 1 / radix, brainLoop: 'planning-and-reasoning', heartLoop: 'values-care-and-safety', couplingBounded: true },
    spin: { direction: spinDirection, rateRadPerSecond: spinRateRadPerSecond, angleRad: spinAngleRad },
    auricField: { color, intensity: coherence, meaning: role === 'unbound' ? 'registered-but-not-lane-bound' : role, represents: 'visualized-model-state-not-a-physical-field' }
  };
}

function createResonanceAtlas(agents, options = {}) {
  if (!Array.isArray(agents)) throw new TypeError('agents must be an array');
  const profiles = agents.map(agent => createResonanceProfile(agent, options));
  return {
    schema: 'heavenzfire.resonance-atlas.v1', generatedAt: options.generatedAt || new Date().toISOString(),
    modelOnly: true, physicalOutputVerified: false, radix: options.radix === undefined ? DEFAULTS.radix : options.radix,
    agentCount: profiles.length, phaseLockedCount: profiles.filter(p => p.phase.locked).length,
    note: 'Digital resonance signatures are deterministic simulation parameters. They do not establish hardware resonance, electromagnetic aura, quantum behavior, consciousness, or live connectivity.',
    agents: profiles
  };
}
module.exports = { DEFAULTS, ROLE_COLORS, createResonanceProfile, createResonanceAtlas };
