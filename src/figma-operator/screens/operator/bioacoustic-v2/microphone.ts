/** Creates a monitor of the *existing recording stream*. No second microphone session. */
export function startMicrophoneMeter(
  stream: MediaStream,
  publish: (rms: number) => void,
): () => void {
  const ctx = new AudioContext();
  const analyzer = ctx.createAnalyser();
  analyzer.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyzer);
  const samples = new Float32Array(analyzer.fftSize);
  let raf = 0;
  let stopped = false;
  let last = 0;
  const tick = (time: number) => {
    if (stopped) return;
    analyzer.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += value * value;
    if (time - last > 100) {
      publish(Math.sqrt(sum / samples.length));
      last = time;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    publish(0);
    void ctx.close().catch(() => {});
  };
}
