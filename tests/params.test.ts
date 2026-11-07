import { describe, expect, it } from 'vitest';
import { normalizeSeed, parseDebugParams, seedFromBytes } from '../src/core/params';

describe('normalizeSeed', () => {
  it('acepta letras y números y pasa a mayúsculas', () => {
    expect(normalizeSeed('abc123')).toBe('ABC123');
    expect(normalizeSeed('  Z9 ')).toBe('Z9');
    expect(normalizeSeed('A'.repeat(16))).toBe('A'.repeat(16));
  });
  it('rechaza vacío, largo excesivo y caracteres no permitidos', () => {
    expect(normalizeSeed('')).toBeNull();
    expect(normalizeSeed('A'.repeat(17))).toBeNull();
    expect(normalizeSeed('ÑAÑA')).toBeNull();
    expect(normalizeSeed('a-b')).toBeNull();
    expect(normalizeSeed('<script>')).toBeNull();
    expect(normalizeSeed(null)).toBeNull();
    expect(normalizeSeed(undefined)).toBeNull();
  });
});

describe('parseDebugParams', () => {
  it('detecta debug y semilla', () => {
    expect(parseDebugParams('?debug&seed=abc')).toEqual({
      debug: true,
      seed: 'ABC',
      creatures: true,
    });
    expect(parseDebugParams('?debug=1')).toEqual({ debug: true, seed: null, creatures: true });
  });
  it('por defecto todo desactivado', () => {
    expect(parseDebugParams('')).toEqual({ debug: false, seed: null, creatures: true });
    expect(parseDebugParams('?debug=0&seed=%%%')).toEqual({
      debug: false,
      seed: null,
      creatures: true,
    });
  });
  it('ignora cadenas enormes', () => {
    expect(parseDebugParams('?debug&seed=' + 'A'.repeat(2000))).toEqual({
      debug: false,
      seed: null,
      creatures: true,
    });
  });
  it('creature=off desactiva las criaturas; cualquier otro valor no', () => {
    expect(parseDebugParams('?creature=off').creatures).toBe(false);
    expect(parseDebugParams('?creature=on').creatures).toBe(true);
    expect(parseDebugParams('?creature=OFF').creatures).toBe(true);
  });
});

describe('seedFromBytes', () => {
  it('genera 8 caracteres válidos', () => {
    const seed = seedFromBytes([0, 1, 2, 255, 36, 100, 200, 35]);
    expect(seed).toHaveLength(8);
    expect(normalizeSeed(seed)).toBe(seed);
  });
});
