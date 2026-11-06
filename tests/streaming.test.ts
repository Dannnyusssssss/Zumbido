import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { chunkKey, chunkOf, ChunkStore, keyToCx, keyToCz } from '../src/game/grid';
import { desiredChunks, planStreaming } from '../src/game/streaming';

describe('claves y coordenadas de chunk', () => {
  it('la clave es reversible, también con negativos', () => {
    for (const [x, z] of [
      [0, 0],
      [-1, 5],
      [1000, -1000],
      [-999, 999],
    ] as const) {
      const k = chunkKey(x, z);
      expect(keyToCx(k)).toBe(x);
      expect(keyToCz(k)).toBe(z);
    }
  });
  it('chunkOf funciona con coordenadas negativas', () => {
    const size = WORLD.cellSize * WORLD.chunkCells;
    expect(chunkOf(0)).toBe(0);
    expect(chunkOf(size - 0.01)).toBe(0);
    expect(chunkOf(size)).toBe(1);
    expect(chunkOf(-0.01)).toBe(-1);
  });
});

describe('desiredChunks', () => {
  it('devuelve el cuadrado del radio, del más cercano al más lejano', () => {
    const list = desiredChunks(0, 0, 2);
    expect(list.length).toBe(25);
    expect(list[0]).toBe(chunkKey(0, 0));
    const d = list.map((k) => keyToCx(k) ** 2 + keyToCz(k) ** 2);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1] as number);
  });
  it('no pide chunks fuera del mundo', () => {
    const list = desiredChunks(WORLD.maxChunk, 0, 2);
    expect(list.length).toBe(15);
    for (const k of list) expect(keyToCx(k)).toBeLessThanOrEqual(WORLD.maxChunk);
  });
});

describe('planStreaming', () => {
  it('carga lo que falta y descarga lo lejano con histéresis', () => {
    const loaded = new Set(desiredChunks(0, 0, 2));
    // Un paso al este: no se descarga nada todavía (histéresis de 1).
    let plan = planStreaming(loaded, 1, 0, 2);
    expect(plan.toUnload).toEqual([]);
    expect(plan.toLoad.length).toBe(5);
    for (const k of plan.toLoad) loaded.add(k);
    // Otro paso: la columna x = -2 queda a 4 chunks (más que radio + 1) y se descarga.
    plan = planStreaming(loaded, 2, 0, 2);
    expect(plan.toUnload.length).toBe(5);
    for (const k of plan.toUnload) expect(keyToCx(k)).toBe(-2);
  });
  it('la memoria no crece sin parar al avanzar en línea recta', () => {
    const loaded = new Set<number>();
    for (let cx = 0; cx < 200; cx++) {
      const plan = planStreaming(loaded, cx, 0, 2);
      for (const k of plan.toUnload) loaded.delete(k);
      for (const k of plan.toLoad) loaded.add(k);
      expect(loaded.size).toBeLessThanOrEqual(5 * 7);
    }
  });
});

describe('ChunkStore', () => {
  it('es una caché LRU acotada', () => {
    const store = new ChunkStore(7, getLevel(1), 10);
    for (let i = 0; i < 50; i++) store.get(i, 0);
    expect(store.size).toBe(10);
    expect(store.has(49, 0)).toBe(true);
    expect(store.has(0, 0)).toBe(false);
  });
  it('devuelve el mismo chunk aunque se haya descartado y regenerado', () => {
    const store = new ChunkStore(7, getLevel(1), 2);
    const first = store.get(3, 3);
    store.get(4, 4);
    store.get(5, 5);
    store.get(6, 6);
    const again = store.get(3, 3);
    expect(again).not.toBe(first);
    expect([...again.vWalls]).toEqual([...first.vWalls]);
  });
});
