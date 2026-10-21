'use strict';

// Bounded raster simulation for exploring spatial density versus temporal carrier.
// This is synthetic rendering math, not a physical sensor or quantum simulation.
const FREQUENCY_PRESETS_HZ = Object.freeze([7.83, 33, 144]);
const DENSITY_PRESETS = Object.freeze([32, 64, 128, 256]);
const MAX_PIXELS_PER_FRAME = 256 * 256;
const DEFAULT_SAMPLE_TIME_SECONDS = 1 / 60;

function renderFieldMetrics({ frequencyHz, width, height = width, sampleTimeSeconds = DEFAULT_SAMPLE_TIME_SECONDS }) {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > 1000) throw new TypeError('frequencyHz must be in (0, 1000]');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width * height > MAX_PIXELS_PER_FRAME) throw new RangeError('Raster must be at least 8x8 and no larger than 256x256');
  if (!Number.isFinite(sampleTimeSeconds) || sampleTimeSeconds < 0 || sampleTimeSeconds > 10) throw new TypeError('sampleTimeSeconds must be in [0, 10]');
  const carrierPhase = 2 * Math.PI * frequencyHz * sampleTimeSeconds;
  let sum = 0, sumSquares = 0, gradientSum = 0, min = Infinity, max = -Infinity, previousRow = new Float64Array(width);
  const currentRow = new Float64Array(width);
  const cx = (width - 1) / 2, cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / Math.max(1, cx), ny = (y - cy) / Math.max(1, cy);
      const radius = Math.sqrt(nx * nx + ny * ny);
      const theta = Math.atan2(ny, nx);
      const torus = Math.sin(6 * theta + carrierPhase) * Math.cos(2 * Math.PI * radius - carrierPhase);
      const gyroid = Math.sin(3 * nx + carrierPhase) * Math.cos(3 * ny) + Math.sin(3 * ny - carrierPhase) * Math.cos(3 * nx) + Math.sin(3 * nx + 3 * ny);
      const value = Math.tanh(0.65 * torus + 0.35 * gyroid / 1.5);
      currentRow[x] = value;
      sum += value; sumSquares += value * value;
      if (value < min) min = value; if (value > max) max = value;
      if (x > 0) gradientSum += Math.abs(value - currentRow[x - 1]);
      if (y > 0) gradientSum += Math.abs(value - previousRow[x]);
    }
    previousRow = currentRow.slice();
  }
  const pixelCount = width * height;
  const mean = sum / pixelCount;
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean);
  return {
    frequencyHz, width, height, pixelCount, sampleTimeSeconds, carrierPhaseRad: carrierPhase % (2 * Math.PI),
    mean: Number(mean.toFixed(8)), variance: Number(variance.toFixed(8)), contrastRms: Number(Math.sqrt(variance).toFixed(8)),
    min: Number(min.toFixed(8)), max: Number(max.toFixed(8)),
    meanNeighborGradient: Number((gradientSum / (width * (height - 1) + height * (width - 1))).toFixed(8)),
    estimatedRgbaBytes: pixelCount * 4, estimatedRgbaMiB: Number((pixelCount * 4 / (1024 * 1024)).toFixed(4))
  };
}

function runPixelDensitySweep(options = {}) {
  const frequencies = options.frequenciesHz || FREQUENCY_PRESETS_HZ;
  const densities = options.densities || DENSITY_PRESETS;
  const sampleTimeSeconds = options.sampleTimeSeconds === undefined ? DEFAULT_SAMPLE_TIME_SECONDS : options.sampleTimeSeconds;
  if (!Array.isArray(frequencies) || !frequencies.length || frequencies.length > 8) throw new TypeError('frequenciesHz must contain 1 to 8 frequencies');
  if (!Array.isArray(densities) || !densities.length || densities.length > 6) throw new TypeError('densities must contain 1 to 6 raster sizes');
  const results = [];
  for (const frequencyHz of frequencies) for (const size of densities) results.push(renderFieldMetrics({ frequencyHz, width: size, height: size, sampleTimeSeconds }));
  return {
    schema: 'heavenzfire.resonance-pixel-lab.v1', modelOnly: true, physicalOutputVerified: false,
    geometry: 'toroidal carrier + gyroid-inspired scalar field', frequencyPresetsHz: frequencies, densityPresets: densities,
    sampleTimeSeconds, resultCount: results.length, results,
    interpretation: 'Compare pixel count, contrast, and neighbor gradient at a fixed observation time. Raster density controls spatial detail and memory; frequency controls temporal phase. Results do not establish physical resonance or quantum behavior.'
  };
}
function renderHyperOscillationMetrics({ frequenciesHz = FREQUENCY_PRESETS_HZ, width = 64, height = width, sampleTimeSeconds = DEFAULT_SAMPLE_TIME_SECONDS, spinHz = 0.5, modulationOrder = 12 }) {
  if (!Array.isArray(frequenciesHz) || frequenciesHz.length !== 3 || frequenciesHz.some(f => !Number.isFinite(f) || f <= 0 || f > 1000)) throw new TypeError('frequenciesHz must contain exactly three valid frequencies');
  if (!Number.isFinite(spinHz) || spinHz < 0 || spinHz > 20) throw new TypeError('spinHz must be in [0, 20]');
  if (!Number.isInteger(modulationOrder) || modulationOrder < 2 || modulationOrder > 36) throw new TypeError('modulationOrder must be an integer from 2 through 36');
  if (!Number.isFinite(sampleTimeSeconds) || sampleTimeSeconds < 0 || sampleTimeSeconds > 10) throw new TypeError('sampleTimeSeconds must be in [0, 10]');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width * height > MAX_PIXELS_PER_FRAME) throw new RangeError('Raster must be at least 8x8 and no larger than 256x256');
  const [f1, f2, f3] = frequenciesHz;
  const p1 = 2 * Math.PI * f1 * sampleTimeSeconds;
  const p2 = 2 * Math.PI * f2 * sampleTimeSeconds;
  const p3 = 2 * Math.PI * f3 * sampleTimeSeconds;
  const spinAngleRad = 2 * Math.PI * spinHz * sampleTimeSeconds;
  const hyperPhase = Math.sin(p1) * Math.sin(p2) * Math.sin(p3);
  const cx = (width - 1) / 2, cy = (height - 1) / 2;
  let sum = 0, sumSq = 0, gradient = 0, min = Infinity, max = -Infinity;
  let prev = new Float64Array(width), curr = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / Math.max(1, cx), ny = (y - cy) / Math.max(1, cy);
      const c = Math.cos(spinAngleRad), s = Math.sin(spinAngleRad);
      const rx = nx * c - ny * s, ry = nx * s + ny * c;
      const radius = Math.sqrt(rx * rx + ry * ry), theta = Math.atan2(ry, rx);
      const carrier = Math.sin(modulationOrder * theta + p1) * Math.cos(2 * Math.PI * radius - p2);
      const gyroid = Math.sin(3 * rx + p2) * Math.cos(3 * ry - p1) + Math.sin(3 * ry + p3) * Math.cos(3 * rx - p2) + Math.sin(3 * (rx + ry) + hyperPhase);
      const value = Math.tanh(0.5 * carrier + 0.3 * gyroid / 1.5 + 0.2 * hyperPhase);
      curr[x] = value; sum += value; sumSq += value * value;
      if (value < min) min = value; if (value > max) max = value;
      if (x) gradient += Math.abs(value - curr[x - 1]);
      if (y) gradient += Math.abs(value - prev[x]);
    }
    prev = curr.slice();
  }
  const pixels = width * height, mean = sum / pixels, variance = Math.max(0, sumSq / pixels - mean * mean);
  return { width, height, pixelCount:pixels, frequenciesHz:[f1,f2,f3], sampleTimeSeconds, spinHz, spinAngleRad:Number(spinAngleRad.toFixed(8)), modulationOrder, hyperPhase:Number(hyperPhase.toFixed(8)), mean:Number(mean.toFixed(8)), variance:Number(variance.toFixed(8)), contrastRms:Number(Math.sqrt(variance).toFixed(8)), meanNeighborGradient:Number((gradient / (width * (height - 1) + height * (width - 1))).toFixed(8)), min:Number(min.toFixed(8)), max:Number(max.toFixed(8)), estimatedRgbaBytes:pixels * 4 };
}

function runHyperOscillationSweep(options = {}) {
  const densities = options.densities || [32, 64, 128, 256];
  const frames = options.frames === undefined ? 12 : options.frames;
  const sampleRateHz = options.sampleRateHz === undefined ? 60 : options.sampleRateHz;
  const spinHz = options.spinHz === undefined ? 0.5 : options.spinHz;
  const modulationOrder = options.modulationOrder === undefined ? 12 : options.modulationOrder;
  if (!Array.isArray(densities) || !densities.length || densities.length > 4 || densities.some(d => !DENSITY_PRESETS.includes(d))) throw new TypeError('densities must be selected from 32, 64, 128, 256');
  if (!Number.isInteger(frames) || frames < 2 || frames > 24) throw new RangeError('frames must be an integer from 2 through 24');
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 1 || sampleRateHz > 240) throw new RangeError('sampleRateHz must be in [1, 240]');
  const frameResults = [];
  for (const size of densities) for (let frame = 0; frame < frames; frame++) frameResults.push({ frame, ...renderHyperOscillationMetrics({ frequenciesHz:options.frequenciesHz || FREQUENCY_PRESETS_HZ, width:size, height:size, sampleTimeSeconds:frame / sampleRateHz, spinHz, modulationOrder }) });
  const groups = densities.map(size => {
    const seq = frameResults.filter(r => r.width === size);
    let delta = 0; for (let i = 1; i < seq.length; i++) delta += Math.abs(seq[i].contrastRms - seq[i - 1].contrastRms);
    return { density:size, pixels:size * size, frames:seq.length, meanContrastRms:Number((seq.reduce((s,r)=>s+r.contrastRms,0)/seq.length).toFixed(8)), totalContrastVariation:Number(delta.toFixed(8)), estimatedFrameBytes:size * size * 4, estimatedSequenceBytes:size * size * 4 * frames };
  });
  return { schema:'heavenzfire.hyper-oscillation-sweep.v1', modelOnly:true, physicalOutputVerified:false, geometry:'rotating toroidal scalar field + gyroid-inspired cross-coupling', frequenciesHz:options.frequenciesHz || FREQUENCY_PRESETS_HZ, spinHz, modulationOrder, sampleRateHz, frameCount:frames, resultCount:frameResults.length, densitySummary:groups, frames:frameResults, interpretation:'Frame-to-frame contrast variation is a synthetic stability proxy, not a physical resonance measurement. Sample rate can alias fast carriers; visual frame rate does not reproduce 144 Hz oscillations as physical output.' };
}

module.exports = { FREQUENCY_PRESETS_HZ, DENSITY_PRESETS, renderFieldMetrics, runPixelDensitySweep, renderHyperOscillationMetrics, runHyperOscillationSweep };
