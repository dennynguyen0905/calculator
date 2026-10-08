let ctx: AudioContext | null = null;

/** short mechanical-ish key click, generated with WebAudio (no assets) */
export function click(kind: 'key' | 'mod' = 'key'): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(kind === 'mod' ? 1500 : 2100, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.025);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  } catch {
    /* audio not available */
  }
}
