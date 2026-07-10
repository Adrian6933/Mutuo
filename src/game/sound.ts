let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean): void {
  enabled = v;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.04,
  delay = 0
): void {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  /** tic sutil al arrastrar la aguja */
  tick(): void {
    blip(1100, 0.03, 'square', 0.015);
  },
  /** redoble corto al abrir la pantalla */
  reveal(): void {
    blip(220, 0.09, 'triangle', 0.05);
    blip(330, 0.09, 'triangle', 0.05, 0.1);
    blip(440, 0.12, 'triangle', 0.05, 0.2);
  },
  /** arpegio de celebración al clavar el 4 */
  tada(): void {
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.06, i * 0.09));
  },
  /** fuera de sintonía */
  fail(): void {
    blip(180, 0.25, 'sawtooth', 0.03);
    blip(140, 0.3, 'sawtooth', 0.03, 0.12);
  },
};
