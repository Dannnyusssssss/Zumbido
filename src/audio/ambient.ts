/**
 * Zumbido ambiental de los fluorescentes: hum de 120 Hz con armónicos audibles en altavoces de
 * portátil, batido lento por osciladores apenas desafinados, respiración lenta de volumen y un
 * siseo eléctrico muy bajo. Va directo a la mezcla (sin eco) y suena durante toda la partida.
 */
import { SOUND } from '../data/balance';
import type { AudioEngine } from './engine';

interface HumPartial {
  freq: number;
  gain: number;
}

const PARTIALS: readonly HumPartial[] = [
  { freq: 120, gain: 0.32 },
  { freq: 120.6, gain: 0.18 },
  { freq: 240, gain: 0.26 },
  { freq: 240.9, gain: 0.12 },
  { freq: 360, gain: 0.16 },
  { freq: 480, gain: 0.07 },
  { freq: 600, gain: 0.04 },
];

export function startAmbientHum(engine: AudioEngine): void {
  const ctx = engine.ctx;
  const master = engine.master;
  if (ctx === null || master === null) return;
  const now = ctx.currentTime;

  const humBus = ctx.createGain();
  humBus.gain.value = SOUND.humBus;
  humBus.connect(master);
  for (const p of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = p.freq;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g).connect(humBus);
    osc.start(now);
  }

  // Respiración lenta del volumen del hum (variación de la red eléctrica).
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;
  lfo.connect(lfoGain).connect(humBus.gain);
  lfo.start(now);

  // Siseo eléctrico: ruido filtrado en banda, muy bajo.
  const noise = ctx.createBufferSource();
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 22222;
  for (let i = 0; i < length; i++) {
    // Generador simple con semilla fija: el ruido es audio, no lógica de juego.
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    data[i] = ((state >>> 8) / 8388608 - 1) * 0.5;
  }
  noise.buffer = buffer;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200;
  band.Q.value = 0.8;
  const hiss = ctx.createGain();
  hiss.gain.value = 0.025;
  noise.connect(band).connect(hiss).connect(master);
  noise.start(now);
}
