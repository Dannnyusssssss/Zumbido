/**
 * Zumbido ambiental sintetizado con WebAudio (sin archivos externos).
 * Hum de 120 Hz con armónicos audibles en altavoces de portátil, un batido lento por
 * osciladores apenas desafinados y un siseo eléctrico muy bajo. La mezcla pasa por un
 * compresor y un limitador; el volumen entra con un fundido para que no haya sustos.
 * El contexto de audio solo se crea tras un clic del jugador.
 */
import { AUDIO } from '../data/balance';

interface HumPartial {
  freq: number;
  gain: number;
  type: OscillatorType;
}

const PARTIALS: readonly HumPartial[] = [
  { freq: 120, gain: 0.32, type: 'sine' },
  { freq: 120.6, gain: 0.18, type: 'sine' },
  { freq: 240, gain: 0.26, type: 'sine' },
  { freq: 240.9, gain: 0.12, type: 'sine' },
  { freq: 360, gain: 0.16, type: 'sine' },
  { freq: 480, gain: 0.07, type: 'sine' },
  { freq: 600, gain: 0.04, type: 'sine' },
];

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private failed = false;

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

    // Limitador final: compresor con relación alta y umbral bajo, para que nada sobresalga.
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

    // Hum: suma de parciales.
    const humBus = ctx.createGain();
    humBus.gain.value = 0.55;
    humBus.connect(this.master);
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
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
    noise.connect(band).connect(hiss).connect(this.master);
    noise.start(now);
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
