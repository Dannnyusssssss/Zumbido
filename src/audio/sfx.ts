/**
 * Efectos breves sintetizados: tiza raspando, fusible recogido, salida bloqueada y salida activada.
 * Volumen moderado y envolventes suaves (sin picos). Pasan por el bus del mundo, que lleva el eco del nivel.
 */
import { SOUND } from '../data/balance';
import type { AudioEngine } from './engine';

export type SfxName = 'chalk' | 'pickup' | 'locked' | 'activated';

export class Sfx {
  private noise: AudioBuffer | null = null;

  constructor(private readonly engine: AudioEngine) {}

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise !== null) return this.noise;
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 4242;
    for (let i = 0; i < length; i++) {
      // Generador simple con semilla fija: el ruido es audio, no lógica de juego.
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      data[i] = (state >>> 8) / 8388608 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private tone(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    start: number,
    dur: number,
    peak: number,
    type: OscillatorType = 'sine',
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  play(name: SfxName): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.world;
    if (ctx === null || bus === null || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = SOUND.sfx;
    out.connect(bus);
    if (name === 'chalk') {
      // Raspado: ruido en banda media con un pequeño vaivén.
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2400;
      band.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.5, now + 0.03);
      g.gain.linearRampToValueAtTime(0.25, now + 0.15);
      g.gain.linearRampToValueAtTime(0, now + 0.32);
      src.connect(band).connect(g).connect(out);
      src.start(now);
      src.stop(now + 0.35);
    } else if (name === 'pickup') {
      this.tone(ctx, out, 660, now, 0.35, 0.35);
      this.tone(ctx, out, 990, now + 0.09, 0.4, 0.25);
    } else if (name === 'locked') {
      this.tone(ctx, out, 140, now, 0.3, 0.4, 'square');
    } else {
      this.tone(ctx, out, 330, now, 0.6, 0.25);
      this.tone(ctx, out, 495, now + 0.15, 0.7, 0.22);
      this.tone(ctx, out, 660, now + 0.3, 0.8, 0.18);
    }
    // Desconecta el bus temporal cuando ya no suena.
    window.setTimeout(() => out.disconnect(), 1500);
  }
}
