import { describe, expect, it } from 'vitest';
import { hash2, hash3, hashSeed, hashToUnit, mix32, Rng } from '../src/core/rng';

describe('hashSeed', () => {
  it('es determinista y distingue textos', () => {
    expect(hashSeed('OFICINA')).toBe(hashSeed('OFICINA'));
    expect(hashSeed('OFICINA')).not.toBe(hashSeed('OFICINB'));
    expect(hashSeed('')).toBe(0x811c9dc5);
  });
  it('devuelve enteros sin signo de 32 bits', () => {
    for (const s of ['A', 'ZZZZZZZZZZZZZZZZ', '123']) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('hash2 / hash3', () => {
  it('es determinista por coordenadas', () => {
    expect(hash2(42, 3, -7)).toBe(hash2(42, 3, -7));
    expect(hash3(42, 3, -7, 1)).toBe(hash3(42, 3, -7, 1));
  });
  it('cambia con la semilla, con cada coordenada y con el canal', () => {
    const base = hash2(42, 3, -7);
    expect(hash2(43, 3, -7)).not.toBe(base);
    expect(hash2(42, 4, -7)).not.toBe(base);
    expect(hash2(42, 3, -6)).not.toBe(base);
    expect(hash2(42, -7, 3)).not.toBe(base);
    expect(hash3(42, 3, -7, 0)).not.toBe(hash3(42, 3, -7, 1));
  });
  it('casi no tiene colisiones en una rejilla', () => {
    const seen = new Set<number>();
    for (let x = -50; x < 50; x++) for (let z = -50; z < 50; z++) seen.add(hash2(7, x, z));
    expect(seen.size).toBeGreaterThan(9990);
  });
  it('está bien distribuido en [0, 1)', () => {
    const buckets = new Array<number>(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const u = hashToUnit(hash2(99, i, i * 3));
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const b = Math.floor(u * 10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan((n / 10) * 0.1);
  });
  it('mix32 mezcla valores pequeños', () => {
    expect(mix32(1)).not.toBe(1);
    expect(mix32(1)).not.toBe(mix32(2));
  });
});

describe('Rng', () => {
  it('misma semilla, misma secuencia', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
  it('semillas distintas, secuencias distintas', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let equal = 0;
    for (let i = 0; i < 100; i++) if (a.nextU32() === b.nextU32()) equal++;
    expect(equal).toBe(0);
  });
  it('int respeta los extremos incluidos', () => {
    const r = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
  it('shuffle conserva los elementos', () => {
    const r = new Rng(9);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...r.shuffle([...arr])].sort()).toEqual(arr);
  });
});
