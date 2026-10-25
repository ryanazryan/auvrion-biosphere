/** Client-side energy regions. This is NOT AI species detection or sound-source separation. */
export type EnergyRegion = {
  startSeconds: number;
  endSeconds: number;
  peak: number;
};

export function energyRegions(
  peaks: readonly number[],
  duration: number,
): EnergyRegion[] {
  if (!peaks.length || !Number.isFinite(duration) || duration <= 0) return [];
  const values = peaks.map((value) =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0,
  );
  const sorted = [...values].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(0.035, baseline * 2.5);
  if (Math.max(...values) < threshold) return [];

  // Smooth isolated spikes, but do not invent an event on completely silent windows.
  const loud = values.map((v) => v >= threshold);
  for (let i = 1; i < loud.length - 1; i++) {
    if (!loud[i] && loud[i - 1] && loud[i + 1]) loud[i] = true;
  }
  const regions: EnergyRegion[] = [];
  let start: number | null = null;
  for (let i = 0; i <= loud.length; i++) {
    if (i < loud.length && loud[i]) {
      if (start === null) start = i;
    } else if (start !== null) {
      const end = i;
      if (end - start >= 2) {
        regions.push({
          startSeconds: (start / loud.length) * duration,
          endSeconds: (end / loud.length) * duration,
          peak: Math.max(...values.slice(start, end)),
        });
      }
      start = null;
    }
  }
  return regions.slice(0, 24);
}
