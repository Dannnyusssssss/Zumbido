/**
 * Zumbido propio de la salida: más grave e irregular que el de los fluorescentes (180 y 270 Hz con
 * un vaivén lento), posicional con PannerNode para saber de qué lado y a qué distancia está.
 * Inactiva suena débil; con todos los fusibles, algo más fuerte. Con paredes de por medio, un paso
 * bajo lo apaga (oclusión). Su señal visual es la luz de la puerta y el subtítulo de sonido.
 */
import { CREATURE_SOUND, SOUND } from '../data/balance';
import type { AudioEngine } from './engine';

export class ExitHum {
  private panner: PannerNode | null = null;
  private gain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private readonly sources: Array<OscillatorNode> = [];

  constructor(
    private readonly engine: AudioEngine,
    x: number,
    z: number,
  ) {
    engine.whenReady(() => this.build(x, z));
  }

  private build(x: number, z: number): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.world;
    if (ctx === null || bus === null) return;
    const now = ctx.currentTime;
    this.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: SOUND.exitRefDistance,
      maxDistance: SOUND.exitMaxDistance,
      rolloffFactor: 1.3,
      positionX: x,
      positionY: 1.4,
      positionZ: z,
    });
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(SOUND.exitHumIdle, now + 2);
    this.gain.connect(this.panner).connect(bus);

    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const [freq, g] of [
      [180, 0.5],
      [270, 0.3],
      [181.3, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(mix);
      osc.start(now);
      this.sources.push(osc);
    }
    // Vaivén lento (0,5 Hz) del volumen: lo distingue del zumbido ambiental.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(mix.gain);
    lfo.start(now);
    this.sources.push(lfo);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = CREATURE_SOUND.openCutoff;
    mix.connect(this.lowpass).connect(this.gain);
  }

  /** Oclusión: con paredes entre la salida y el jugador suena apagado. */
  setOccluded(occluded: boolean): void {
    const ctx = this.engine.ctx;
    if (ctx === null || this.lowpass === null) return;
    this.lowpass.frequency.setTargetAtTime(
      occluded ? CREATURE_SOUND.occludedCutoff : CREATURE_SOUND.openCutoff,
      ctx.currentTime,
      0.3,
    );
  }

  setActive(active: boolean): void {
    const ctx = this.engine.ctx;
    if (ctx === null || this.gain === null) return;
    this.gain.gain.setTargetAtTime(
      active ? SOUND.exitHumActive : SOUND.exitHumIdle,
      ctx.currentTime,
      0.5,
    );
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // Ya estaba parada.
      }
      s.disconnect();
    }
    this.sources.length = 0;
    this.lowpass?.disconnect();
    this.gain?.disconnect();
    this.panner?.disconnect();
  }
}
