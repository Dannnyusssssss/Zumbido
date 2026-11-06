import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('ejecuta un paso por cada 1/60 s acumulado', () => {
    const loop = new FixedStepLoop(60);
    let steps = 0;
    loop.advance(1 / 60 + 1e-9, () => steps++);
    expect(steps).toBe(1);
    loop.advance(0.5 / 60, () => steps++);
    expect(steps).toBe(1);
    loop.advance(0.5 / 60, () => steps++);
    expect(steps).toBe(2);
  });

  it('pasa siempre el mismo dt a la lógica', () => {
    const loop = new FixedStepLoop(60);
    const dts: number[] = [];
    loop.advance(0.07, (dt) => dts.push(dt));
    expect(dts.length).toBe(4);
    for (const dt of dts) expect(dt).toBeCloseTo(1 / 60, 12);
  });

  it('el número de pasos no depende de cómo se reparte el tiempo', () => {
    const a = new FixedStepLoop(60);
    const b = new FixedStepLoop(60);
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < 144; i++) a.advance(1 / 144, () => sa++);
    for (let i = 0; i < 30; i++) b.advance(1 / 30, () => sb++);
    expect(Math.abs(sa - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(sb - 60)).toBeLessThanOrEqual(1);
  });

  it('alpha queda en [0, 1) y refleja el resto', () => {
    const loop = new FixedStepLoop(60);
    const alpha = loop.advance(1.5 / 60, () => undefined);
    expect(alpha).toBeCloseTo(0.5, 6);
  });

  it('limita los pasos tras un parón largo', () => {
    const loop = new FixedStepLoop(60, 5);
    let steps = 0;
    loop.advance(10, () => steps++);
    expect(steps).toBe(5);
  });

  it('ignora tiempos negativos o no finitos', () => {
    const loop = new FixedStepLoop(60);
    let steps = 0;
    loop.advance(-1, () => steps++);
    loop.advance(Number.NaN, () => steps++);
    loop.advance(Number.POSITIVE_INFINITY, () => steps++);
    expect(steps).toBe(0);
  });

  it('reset descarta el tiempo acumulado', () => {
    const loop = new FixedStepLoop(60);
    loop.advance(0.9 / 60, () => undefined);
    loop.reset();
    let steps = 0;
    loop.advance(0.2 / 60, () => steps++);
    expect(steps).toBe(0);
  });
});
