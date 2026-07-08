/**
 * Pure helpers for chat voice-note waveforms. No React, no DOM — safe to unit
 * test and cheap to run on a low-end Android WebView.
 *
 * Two producers feed the same bar renderer:
 *  - `downsamplePeaks` turns the recorder's live amplitude samples into a fixed
 *    number of evenly-spaced, normalized peaks for the just-recorded clip.
 *  - `pseudoPeaks` deterministically fabricates a stable, voice-like waveform
 *    from a seed (storageKey/duration) for messages that arrive WITHOUT peaks
 *    — the wire `Attachment` has no place to carry them (see report), so sent
 *    voice notes always render this fallback. Deterministic = no `Math.random`
 *    at render, so a bar never flickers between renders.
 */

/** Default bar count for a rendered waveform. Kept small for cheap layout. */
export const WAVEFORM_BARS = 32;

/** djb2 string hash → unsigned 32-bit int. */
export function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32). Deterministic per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Downsample arbitrary-length amplitude samples to `count` peaks (max per
 * bucket), then normalize so the loudest bar ≈ 1. Returns `[]` when there is
 * nothing to sample (e.g. AnalyserNode unavailable) so callers can fall back.
 */
export function downsamplePeaks(samples: number[], count = WAVEFORM_BARS): number[] {
  if (!samples || samples.length === 0) return [];
  const n = samples.length;
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * n) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / count));
    let peak = 0;
    for (let j = start; j < end && j < n; j += 1) {
      const v = samples[j] ?? 0;
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  let max = 0;
  for (const v of out) if (v > max) max = v;
  for (let i = 0; i < count; i += 1) {
    out[i] = max > 0 ? Math.max(0.08, out[i] / max) : 0.08;
  }
  return out;
}

/**
 * A stable, voice-like waveform derived purely from a seed. Same seed → same
 * bars, every render. Values are clamped to [0.12, 1] so silent-looking bars
 * still show a dot.
 */
export function pseudoPeaks(seed: string, count = WAVEFORM_BARS): number[] {
  const base = hashSeed(seed) || 1;
  const rng = mulberry32(base);
  // A couple of low-frequency components give an organic rise/fall instead of
  // flat noise; the seed picks the "shape" so different notes look different.
  const waves = 1.5 + (base % 3);
  const phase = (base % 7) * 0.4;
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const env = 0.55 + 0.35 * Math.sin((i / count) * Math.PI * waves + phase);
    const noise = rng();
    const v = 0.15 + Math.min(1, env * (0.4 + noise * 0.6)) * 0.85;
    out[i] = Math.max(0.12, Math.min(1, v));
  }
  return out;
}
