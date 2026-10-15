// Tiny WebAudio synth — no audio files needed, works offline.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

export function setVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v;
}

/** Call from a key/click handler so the browser allows audio. */
export const unlockAudio = () => void audio();

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + start;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function grumbleNote(base: number, dur: number, gain = 0.3) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime;
  const osc = a.ctx.createOscillator();
  const lfo = a.ctx.createOscillator();
  const lfoGain = a.ctx.createGain();
  const filter = a.ctx.createBiquadFilter();
  const g = a.ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base, t0);
  osc.frequency.linearRampToValueAtTime(base * 0.8, t0 + dur);
  lfo.frequency.value = 9;
  lfoGain.gain.value = base * 0.12;
  lfo.connect(lfoGain).connect(osc.frequency);
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filter).connect(g).connect(a.out);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function noise(dur: number, from: number, to: number, gain = 0.15) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime;
  const buf = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * dur), a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 8;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t0);
}

export const sfx = {
  key: () => tone(900, 0, 0.03, 'square', 0.04),
  send: () => tone(520, 0, 0.08, 'triangle', 0.15, 780),
  grumble: () => grumbleNote(95, 0.45),
  angry: () => { grumbleNote(70, 0.6, 0.4); noise(0.4, 300, 120, 0.12); },
  happy: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.18, 'triangle', 0.18)),
  trustUp: () => tone(660, 0, 0.12, 'sine', 0.15, 990),
  trustDown: () => tone(330, 0, 0.18, 'sine', 0.15, 200),
  tick: () => tone(1500, 0, 0.025, 'square', 0.06),
  gateOpen: () => {
    noise(1.6, 200, 900, 0.18);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.9 + i * 0.12, i === 5 ? 0.6 : 0.16, 'triangle', 0.22));
  },
  lose: () => [392, 370, 349, 311].forEach((f, i) => tone(f, i * 0.28, i === 3 ? 0.7 : 0.26, 'sawtooth', 0.08, i === 3 ? 260 : undefined)),
  coin: () => { tone(988, 0, 0.08, 'square', 0.1); tone(1319, 0.08, 0.3, 'square', 0.1); },
};
