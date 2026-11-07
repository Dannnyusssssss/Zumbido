/**
 * Sonido de la Escucha y latido del jugador, sintetizados con WebAudio.
 * - Pasos arrastrados: ráfagas de ruido filtrado entre ~150 y 600 Hz (se oyen en altavoces de portátil).
 * - Respiración: ruido en banda (~420 Hz) con una envolvente lenta; más rápida al perseguir.
 * Ambos pasan por un PannerNode HRTF (de qué lado viene) y su volumen depende de la distancia por
 * los pasillos, no de la línea recta. Si hay paredes de por medio, un paso bajo los apaga (oclusión).
 * - Latido: dos golpes graves (78 Hz con armónico a 156 Hz) que se aceleran con la cercanía.
 * Volúmenes moderados, envolventes suaves y todo por el compresor y el limitador: sin sustos.
 */
import { CREATURE_SOUND, THREAT } from '../data/balance';
import type { AudioEngine } from './engine';

let sharedNoise: AudioBuffer | null = null;

/** Ruido blanco de 2 s con semilla fija (es audio, no lógica de juego). */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (sharedNoise !== null && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 7331;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    data[i] = (state >>> 8) / 8388608 - 1;
  }
  sharedNoise = buffer;
  return buffer;
}

/** Volumen (0..1) según la distancia por camino: nada más allá del alcance de las señales. */
export function loudness(pathDistance: number): number {
  if (!Number.isFinite(pathDistance) || pathDistance >= THREAT.range) return 0;
  const t = 1 - pathDistance / THREAT.range;
  return t * t;
}

export class CreatureVoice {
  private panner: PannerNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private level: GainNode | null = null;
  private breathGain: GainNode | null = null;
  private breathLfo: OscillatorNode | null = null;
  private breathSource: AudioBufferSourceNode | null = null;
  private lastStep = 0;

  constructor(private readonly engine: AudioEngine) {
    engine.whenReady(() => this.build());
  }

  private build(): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.world;
    if (ctx === null || bus === null) return;
    // Sin atenuación propia del panner: el volumen lo decide la distancia por camino.
    this.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 0,
    });
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = CREATURE_SOUND.openCutoff;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.lowpass.connect(this.level).connect(this.panner).connect(bus);

    // Respiración: ruido en banda con una envolvente lenta (LFO) que nunca llega a ser un golpe.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 1.4;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = CREATURE_SOUND.breath * 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.28;
    const depth = ctx.createGain();
    depth.gain.value = CREATURE_SOUND.breath * 0.45;
    lfo.connect(depth).connect(this.breathGain.gain);
    src.connect(band).connect(this.breathGain).connect(this.lowpass);
    src.start();
    lfo.start();
    this.breathSource = src;
    this.breathLfo = lfo;
  }

  /** Paso arrastrado: ruido en banda grave-media con subida y caída lentas. */
  private step(ctx: AudioContext): void {
    if (this.lowpass === null || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 260;
    band.Q.value = 0.9;
    const g = ctx.createGain();
    const peak = CREATURE_SOUND.steps;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.06);
    g.gain.linearRampToValueAtTime(peak * 0.45, now + 0.22);
    g.gain.linearRampToValueAtTime(0, now + 0.5);
    src.connect(band).connect(g).connect(this.lowpass);
    // Cada paso empieza en un punto distinto del ruido para que no suene idéntico.
    src.start(now, (this.lastStep * 0.37) % 1.4, 0.55);
  }

  /**
   * Actualiza posición, volumen y oclusión. `distance` es la distancia total recorrida por la
   * criatura (para los pasos), `pathDistance` la distancia por camino al jugador.
   */
  update(
    active: boolean,
    x: number,
    z: number,
    distance: number,
    stepMeters: number,
    pathDistance: number,
    occluded: boolean,
    chasing: boolean,
  ): void {
    const ctx = this.engine.ctx;
    if (ctx === null || this.panner === null || this.level === null || this.lowpass === null)
      return;
    const now = ctx.currentTime;
    const target = active ? loudness(pathDistance) : 0;
    this.level.gain.setTargetAtTime(target, now, 0.15);
    this.lowpass.frequency.setTargetAtTime(
      occluded ? CREATURE_SOUND.occludedCutoff : CREATURE_SOUND.openCutoff,
      now,
      0.2,
    );
    this.panner.positionX.setValueAtTime(x, now);
    this.panner.positionY.setValueAtTime(1.6, now);
    this.panner.positionZ.setValueAtTime(z, now);
    this.breathLfo?.frequency.setTargetAtTime(chasing ? 0.55 : 0.28, now, 0.5);
    if (!active) {
      this.lastStep = distance;
      return;
    }
    if (distance - this.lastStep >= stepMeters) {
      this.lastStep = distance;
      if (target > 0.001) this.step(ctx);
    }
  }

  dispose(): void {
    try {
      this.breathSource?.stop();
      this.breathLfo?.stop();
    } catch {
      // Ya estaban parados.
    }
    this.breathSource?.disconnect();
    this.breathLfo?.disconnect();
    this.breathGain?.disconnect();
    this.level?.disconnect();
    this.lowpass?.disconnect();
    this.panner?.disconnect();
  }
}

/** Latido del jugador: más rápido y algo más fuerte cuanto más cerca está la criatura. */
export class Heartbeat {
  private phase = 0;

  constructor(private readonly engine: AudioEngine) {}

  /** `closeness` 0..1 (0 = lejos, sin latido). `dt` en segundos de reloj. */
  update(closeness: number, dt: number): void {
    const ctx = this.engine.ctx;
    const out = this.engine.master;
    if (ctx === null || out === null || ctx.state !== 'running' || closeness <= 0) {
      this.phase = 0;
      return;
    }
    const bpm = 62 + 58 * closeness;
    this.phase += (dt * bpm) / 60;
    if (this.phase < 1) return;
    this.phase -= 1;
    const now = ctx.currentTime;
    const peak = CREATURE_SOUND.heart * (0.35 + 0.65 * closeness);
    this.thump(ctx, out, now, peak);
    this.thump(ctx, out, now + 0.19, peak * 0.7);
  }

  private thump(ctx: AudioContext, out: AudioNode, start: number, peak: number): void {
    for (const [freq, g] of [
      [78, 1],
      [156, 0.45],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak * g, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  }
}
