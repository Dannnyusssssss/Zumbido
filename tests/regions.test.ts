import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src/core/rng';
import { DRIFT, EDGE } from '../src/data/balance';
import { LEVELS } from '../src/data/levels';
import { ChunkStore, WorldGrid } from '../src/game/grid';
import {
  borderLevel,
  constantLevelMap,
  driftLevelMap,
  regionLevelIndex,
  regionOf,
} from '../src/game/regions';
import { generateChunk, hIndex, N, vIndex, type ChunkData } from '../src/game/worldgen';

const SEEDS = ['DEMO', 'DERIVA1', 'Z9', 'D20261107'].map(hashSeed);
const R = DRIFT.regionChunks;

describe('zonas del modo Deriva', () => {
  it('la zona de inicio es siempre el primer nivel', () => {
    for (const seed of SEEDS) {
      expect(regionLevelIndex(seed, 0, 0)).toBe(0);
      const map = driftLevelMap(seed);
      for (let c = 0; c < R; c++) expect(map(c, R - 1 - c).id).toBe(LEVELS[0]?.id);
    }
  });

  it('regionOf agrupa los chunks en zonas, también en negativos', () => {
    expect(regionOf(0)).toBe(0);
    expect(regionOf(R - 1)).toBe(0);
    expect(regionOf(R)).toBe(1);
    expect(regionOf(-1)).toBe(-1);
    expect(regionOf(-R)).toBe(-1);
    expect(regionOf(-R - 1)).toBe(-2);
  });

  it('es determinista, usa los tres niveles y cambia con la semilla', () => {
    for (const seed of SEEDS) {
      const seen = new Set<number>();
      for (let rz = -5; rz <= 5; rz++) {
        for (let rx = -5; rx <= 5; rx++) {
          const i = regionLevelIndex(seed, rx, rz);
          expect(i).toBe(regionLevelIndex(seed, rx, rz));
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(LEVELS.length);
          seen.add(i);
        }
      }
      expect(seen.size).toBe(LEVELS.length);
    }
    const a = SEEDS.map((s) => regionLevelIndex(s, 3, -2) * 9 + regionLevelIndex(s, -1, 4));
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it('borderLevel es simétrico y no cambia un borde entre chunks del mismo nivel', () => {
    for (const a of LEVELS) {
      expect(borderLevel(a, a)).toBe(a);
      for (const b of LEVELS) expect(borderLevel(a, b)).toBe(borderLevel(b, a));
    }
  });

  it('con un mapa de un solo nivel genera lo mismo que sin mapa', () => {
    const level = LEVELS[1];
    if (level === undefined) throw new Error('nivel');
    const a = generateChunk(7, level, 3, -2);
    const b = generateChunk(7, level, 3, -2, constantLevelMap(level));
    expect(b.vWalls).toEqual(a.vWalls);
    expect(b.hWalls).toEqual(a.hWalls);
    expect(b.levelId).toBe(level.id);
  });
});

describe.each(SEEDS)('mundo de Deriva (semilla %i)', (seed) => {
  const map = driftLevelMap(seed);
  const gen = (cx: number, cz: number): ChunkData => generateChunk(seed, map(cx, cz), cx, cz, map);
  const LO = -R - 1;
  const HI = R;

  it('los bordes coinciden entre chunks vecinos, también entre zonas de distinto nivel', () => {
    let mixed = 0;
    for (let cz = LO; cz <= HI; cz++) {
      for (let cx = LO; cx <= HI; cx++) {
        const c = gen(cx, cz);
        const east = gen(cx + 1, cz);
        const south = gen(cx, cz + 1);
        if (c.levelId !== east.levelId || c.levelId !== south.levelId) mixed++;
        expect(c.levelId).toBe(map(cx, cz).id);
        for (let i = 0; i < N; i++) {
          expect(c.vWalls[vIndex(N, i)]).toBe(east.vWalls[vIndex(0, i)]);
          expect(c.hWalls[hIndex(i, N)]).toBe(south.hWalls[hIndex(i, 0)]);
        }
      }
    }
    // La ventana cruza fronteras de zona: debe haber bordes entre niveles distintos para que el test valga.
    if (new Set([map(LO, LO).id, map(0, 0).id, map(HI, HI).id, map(LO, HI).id]).size > 1) {
      expect(mixed).toBeGreaterThan(0);
    }
  });

  it('todo el terreno de una ventana que cruza zonas está conectado', () => {
    const grid = new WorldGrid(new ChunkStore(seed, LEVELS[0] as (typeof LEVELS)[0], 512, map));
    const minG = LO * N;
    const maxG = (HI + 1) * N - 1;
    const W = maxG - minG + 1;
    const seen = new Uint8Array(W * W);
    const queue: number[] = [8 - minG + (8 - minG) * W];
    seen[queue[0] as number] = 1;
    let count = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi] as number;
      count++;
      const gx = (idx % W) + minG;
      const gz = Math.floor(idx / W) + minG;
      const tryGo = (nx: number, nz: number, open: boolean): void => {
        if (!open || nx < minG || nx > maxG || nz < minG || nz > maxG) return;
        const n = nx - minG + (nz - minG) * W;
        if (seen[n] === 1) return;
        seen[n] = 1;
        queue.push(n);
      };
      tryGo(gx - 1, gz, grid.wallV(gx, gz) === EDGE.open);
      tryGo(gx + 1, gz, grid.wallV(gx + 1, gz) === EDGE.open);
      tryGo(gx, gz - 1, grid.wallH(gx, gz) === EDGE.open);
      tryGo(gx, gz + 1, grid.wallH(gx, gz + 1) === EDGE.open);
    }
    expect(count).toBe(W * W);
  });

  it('no depende del orden en que se generan los chunks', () => {
    const coords: Array<[number, number]> = [
      [R - 1, 0],
      [R, 0],
      [-1, -1],
      [0, -R],
    ];
    const forward = coords.map(([x, z]) => gen(x, z));
    const backward = [...coords]
      .reverse()
      .map(([x, z]) => gen(x, z))
      .reverse();
    forward.forEach((c, i) => {
      expect(backward[i]?.vWalls).toEqual(c.vWalls);
      expect(backward[i]?.hWalls).toEqual(c.hWalls);
    });
  });
});
