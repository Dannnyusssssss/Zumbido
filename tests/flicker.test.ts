import { describe, expect, it } from 'vitest';
import { FLICKER } from '../src/data/balance';
import { flickerLevel, flickerParams, isFlickering, type FlickerParams } from '../src/game/flicker';

const blank = (): FlickerParams => ({
  freq: 0,
  phase: 0,
  phase2: 0,
  episodeFreq: 0,
  episodePhase: 0,
});

/** Cuenta caídas de brillo apreciables (mínimos locales con bajada >= threshold desde el máximo previo). */
function countDips(samples: number[], threshold: number): number[] {
  const dips: number[] = [];
  let lastMax = samples[0] as number;
  let falling = false;
  for (let i = 1; i < samples.length - 1; i++) {
    const v = samples[i] as number;
    if (v > lastMax) lastMax = v;
    if (!falling && lastMax - v >= threshold) falling = true;
    const next = samples[i + 1] as number;
    if (falling && v <= (samples[i - 1] as number) && v < next) {
      dips.push(i);
      falling = false;
      lastMax = v;
    }
  }
  return dips;
}

describe('parpadeo seguro', () => {
  const RATE = 240;

  it('nunca supera 3 destellos en ningún segundo y nunca se apaga', () => {
    const p = blank();
    for (let cell = 0; cell < 60; cell++) {
      flickerParams(12345, cell, cell * 7, p);
      const samples: number[] = [];
      for (let i = 0; i < RATE * 60; i++) samples.push(flickerLevel(p, i / RATE, false));
      const min = Math.min(...samples);
      expect(min).toBeGreaterThanOrEqual(1 - FLICKER.depth - 1e-9);
      expect(min).toBeGreaterThan(0.6);
      const dips = countDips(samples, 0.02);
      // Ventana deslizante de 1 segundo.
      for (let a = 0, b = 0; b < dips.length; b++) {
        while ((dips[b] as number) - (dips[a] as number) >= RATE) a++;
        expect(b - a + 1).toBeLessThanOrEqual(FLICKER.maxFlashesPerSecond);
      }
    }
  });

  it('los cambios son suaves (sin saltos bruscos entre muestras)', () => {
    const p = flickerParams(9, 4, 4, blank());
    let prev = flickerLevel(p, 0, false);
    for (let i = 1; i < RATE * 30; i++) {
      const v = flickerLevel(p, i / RATE, false);
      // A 240 muestras/s, una onda de ~2 Hz y 35 % de profundidad cambia menos de 2 % por muestra.
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
  });

  it('"Reducir parpadeo" deja la luz fija', () => {
    const p = flickerParams(1, 2, 3, blank());
    for (let i = 0; i < 1000; i++) expect(flickerLevel(p, i * 0.037, true)).toBe(1);
  });

  it('solo parpadea una pequeña parte de los paneles', () => {
    let count = 0;
    const total = 100 * 100;
    for (let x = 0; x < 100; x++)
      for (let z = 0; z < 100; z++) if (isFlickering(5, x, z, 0.06)) count++;
    expect(count / total).toBeGreaterThan(0.04);
    expect(count / total).toBeLessThan(0.08);
    // El tope se aplica aunque los datos pidan más.
    let capped = 0;
    for (let x = 0; x < 100; x++)
      for (let z = 0; z < 100; z++) if (isFlickering(5, x, z, 0.9)) capped++;
    expect(capped / total).toBeLessThan(FLICKER.maxRatio + 0.02);
  });

  it('la frecuencia más alta posible queda por debajo de 3 Hz', () => {
    expect(FLICKER.maxHz * FLICKER.secondRatio).toBeLessThan(FLICKER.maxFlashesPerSecond);
  });
});
