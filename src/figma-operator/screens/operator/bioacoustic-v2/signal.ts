/** Browser-only sample analysis. No mock waveform or fabricated detections. */
export type SignalData = {
  duration: number;
  sampleRate: number;
  peaks: number[];
  spectrum: number[][];
  peak: number;
  rms: number;
};

const WINDOW = 1024;
const COLUMNS = 320;
const BINS = 128;

/** Radix-2 FFT, Hann-windowed; output amplitudes are uncalibrated visualization values. */
function spectrumWindow(samples: Float32Array, offset: number): number[] {
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let n = 0; n < WINDOW; n++) {
    const sample = samples[offset + n] ?? 0;
    re[n] = sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (WINDOW - 1)));
  }
  for (let i = 1, j = 0; i < WINDOW; i++) {
    let bit = WINDOW >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const temp = re[i];
      re[i] = re[j];
      re[j] = temp;
    }
  }
  for (let len = 2; len <= WINDOW; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < WINDOW; i += len) {
      let uRe = 1;
      let uIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const vr = re[b] * uRe - im[b] * uIm;
        const vi = re[b] * uIm + im[b] * uRe;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const nextRe = uRe * wr - uIm * wi;
        uIm = uRe * wi + uIm * wr;
        uRe = nextRe;
      }
    }
  }
  const out: number[] = [];
  const bucket = WINDOW / 2 / BINS;
  for (let bin = 0; bin < BINS; bin++) {
    let power = 0;
    for (
      let k = Math.floor(bin * bucket);
      k < Math.floor((bin + 1) * bucket);
      k++
    ) {
      power += re[k] * re[k] + im[k] * im[k];
    }
    // Fixed dB mapping, not relative per-frame normalization. Silence remains dark.
    const db = 10 * Math.log10(power / (WINDOW * WINDOW) + 1e-12);
    out.push(Math.max(0, Math.min(1, (db + 90) / 70)));
  }
  return out;
}

export function analyzeSignal(decoded: AudioBuffer): SignalData {
  const channels = decoded.numberOfChannels;
  const samples = new Float32Array(decoded.length);
  for (let c = 0; c < channels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < samples.length; i++)
      samples[i] += channel[i] / channels;
  }
  let peak = 0;
  let sum = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  const peaks: number[] = [];
  const spectrum: number[][] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const from = Math.floor((i / COLUMNS) * samples.length);
    const to = Math.min(
      samples.length,
      Math.max(from + 1, Math.floor(((i + 1) / COLUMNS) * samples.length)),
    );
    let columnPeak = 0;
    for (let s = from; s < to; s++)
      columnPeak = Math.max(columnPeak, Math.abs(samples[s] ?? 0));
    peaks.push(columnPeak);
    const center = Math.floor(((i + 0.5) / COLUMNS) * samples.length);
    const start = Math.max(
      0,
      Math.min(Math.max(0, samples.length - WINDOW), center - WINDOW / 2),
    );
    spectrum.push(spectrumWindow(samples, start));
  }
  return {
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    peaks,
    spectrum,
    peak,
    rms: Math.sqrt(sum / Math.max(1, samples.length)),
  };
}

export const displayTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "00:00";
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
