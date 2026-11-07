import { describe, expect, it } from 'vitest';
import { loudness } from '../src/audio/creature';
import { FLICKER, THREAT } from '../src/data/balance';
import { closeness, nearestThreat, type ThreatSource } from '../src/game/cues';
import { creatureDim } from '../src/game/flicker';

describe('señales de cercanía', () => {
  const src = (active: boolean, d: number): ThreatSource => ({
    active,
    x: 0,
    z: 0,
    threatDistance: d,
  });

  it('elige la criatura activa más cercana por camino', () => {
    expect(nearestThreat([])).toBe(-1);
    expect(nearestThreat([src(true, Infinity)])).toBe(-1);
    expect(nearestThreat([src(true, 20), src(true, 8), src(false, 1)])).toBe(1);
  });

  it('la cercanía va de 1 (encima) a 0 (lejos) y no sale de rango', () => {
    expect(closeness(0, 20)).toBe(1);
    expect(closeness(10, 20)).toBeCloseTo(0.5);
    expect(closeness(30, 20)).toBe(0);
    expect(closeness(Infinity, 20)).toBe(0);
    expect(closeness(-5, 20)).toBe(1);
  });

  it('el volumen de la criatura baja con la distancia por camino y es 0 fuera de alcance', () => {
    expect(loudness(0)).toBe(1);
    expect(loudness(10)).toBeGreaterThan(loudness(20));
    expect(loudness(THREAT.range)).toBe(0);
    expect(loudness(Infinity)).toBe(0);
    expect(loudness(Number.NaN)).toBe(0);
  });
});

describe('atenuación de luces cerca de la criatura', () => {
  it('nunca baja del 70 % y lejos no hace nada', () => {
    let min = 1;
    for (let t = 0; t < 10; t += 0.01) min = Math.min(min, creatureDim(0, t, false));
    expect(min).toBeGreaterThanOrEqual(1 - THREAT.lightDimDepth - 1e-9);
    expect(creatureDim(THREAT.lightDimRadius, 1.234, false)).toBe(1);
    expect(creatureDim(100, 0.5, false)).toBe(1);
  });

  it('con "Reducir parpadeo" la luz queda fija', () => {
    for (let t = 0; t < 5; t += 0.05) expect(creatureDim(0, t, true)).toBe(1);
  });

  it('como mucho 3 caídas de brillo por segundo y cambios suaves', () => {
    const dt = 1 / 240;
    const samples: number[] = [];
    for (let t = 0; t < 20; t += dt) samples.push(creatureDim(1, t, false));
    // Mínimos locales (caídas) en cualquier ventana de 1 s.
    const minima: number[] = [];
    for (let i = 1; i < samples.length - 1; i++) {
      const s = samples[i] as number;
      if (s < (samples[i - 1] as number) && s <= (samples[i + 1] as number)) minima.push(i * dt);
    }
    for (const start of minima) {
      const inWindow = minima.filter((m) => m >= start && m < start + 1).length;
      expect(inWindow).toBeLessThanOrEqual(FLICKER.maxFlashesPerSecond);
    }
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs((samples[i] as number) - (samples[i - 1] as number))).toBeLessThan(0.02);
    }
  });
});
