/**
 * Motor de audio: un único AudioContext (creado tras un gesto del jugador), volumen general con
 * fundido, compresor y limitador final para que nada sobresalga, y un bus de efectos con eco
 * sintetizado según el nivel. Todo el sonido se genera aquí, sin archivos externos.
 */
import { AUDIO } from '../data/balance';

export class AudioEngine {
  ctx: AudioContext | null = null;
  /** Entrada de la mezcla (todo pasa por compresor y limitador). */
  master: GainNode | null = null;
  /** Bus de efectos y fuentes del mundo: va seco a la mezcla y también al eco. */
  world: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private muted = false;
  private failed = false;
  private readonly onReady: Array<(engine: AudioEngine) => void> = [];

  /** Debe llamarse desde un gesto del jugador (clic o tecla). */
  start(muted: boolean): void {
    this.muted = muted;
    if (this.failed) return;
    if (this.ctx !== null) {
      void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.failed = true;
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Limitador final: compresor con relación alta y umbral bajo.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 4;
    compressor.connect(limiter);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(
      muted ? 0 : AUDIO.masterVolume,
      now + AUDIO.fadeInSeconds,
    );
    this.master.connect(compressor);

    this.world = ctx.createGain();
    this.world.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;
    this.world.connect(this.reverb);
    this.reverb.connect(this.reverbGain).connect(this.master);

    for (const cb of this.onReady.splice(0)) cb(this);
  }

  /** Ejecuta `cb` en cuanto el contexto exista (inmediatamente si ya existe). */
  whenReady(cb: (engine: AudioEngine) => void): void {
    if (this.ctx !== null) cb(this);
    else this.onReady.push(cb);
  }

  /** Eco del nivel: respuesta al impulso sintetizada (ruido con caída exponencial). */
  setReverb(mix: number, seconds: number): void {
    const ctx = this.ctx;
    if (ctx === null || this.reverb === null || this.reverbGain === null) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * Math.max(0.1, seconds)));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    let state = 99991;
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Generador simple con semilla fija: el ruido es audio, no lógica de juego.
        state = (Math.imul(state, 1664525) + 1013904223) | 0;
        const noise = (state >>> 8) / 8388608 - 1;
        data[i] = noise * Math.pow(1 - i / length, 3);
      }
    }
    this.reverb.buffer = buffer;
    this.reverbGain.gain.setTargetAtTime(Math.max(0, Math.min(1, mix)), ctx.currentTime, 0.3);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx === null || this.master === null) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(muted ? 0 : AUDIO.masterVolume, now + AUDIO.muteRampSeconds);
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Posición y orientación del oyente (la cámara). */
  setListener(x: number, y: number, z: number, yaw: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (l.positionX !== undefined) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** Suspende el audio (pausa) y lo reanuda. */
  suspend(): void {
    if (this.ctx !== null && this.ctx.state === 'running')
      void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx !== null && this.ctx.state === 'suspended')
      void this.ctx.resume().catch(() => undefined);
  }
}
