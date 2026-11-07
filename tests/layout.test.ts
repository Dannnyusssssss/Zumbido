import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src/core/rng';
import { EDGE, WORLD } from '../src/data/balance';
import { LEVELS } from '../src/data/levels';
import { ChunkStore, WorldGrid } from '../src/game/grid';
import { exitBox, levelLayout } from '../src/game/layout';
import { SPAWN_POINT } from '../src/game/worldgen';
import { findPath } from './helpers/path';

const SEEDS = ['A', 'DEMO', 'OFICINA1', 'Z9', 'D20261106'];
const spawnCell = {
  x: Math.floor(SPAWN_POINT.x / WORLD.cellSize),
  z: Math.floor(SPAWN_POINT.z / WORLD.cellSize),
};

describe.each(LEVELS)('levelLayout nivel $id ($name)', (level) => {
  it('es determinista y cambia con la semilla', () => {
    const a = levelLayout(hashSeed('DEMO'), level);
    const b = levelLayout(hashSeed('DEMO'), level);
    expect(a).toEqual(b);
    const others = SEEDS.map((s) => levelLayout(hashSeed(s), level).exit);
    expect(new Set(others.map((e) => `${e.gx},${e.gz}`)).size).toBeGreaterThan(3);
  });

  it('respeta las distancias y el número de fusibles', () => {
    for (let i = 0; i < 40; i++) {
      const layout = levelLayout(hashSeed(`S${i}`), level);
      const o = level.objective;
      const d = Math.hypot(layout.exit.cx, layout.exit.cz);
      expect(d).toBeGreaterThanOrEqual(o.exitChunks.min);
      expect(d).toBeLessThanOrEqual(o.exitChunks.max + 1);
      expect(layout.fuses.length).toBe(o.fuses);
      for (const f of layout.fuses)
        expect(Math.hypot(f.cx, f.cz)).toBeGreaterThanOrEqual(o.fuseChunks.min);
      // Todos los objetos en celdas distintas.
      const cells = [layout.exit, ...layout.fuses].map((p) => `${p.gx},${p.gz}`);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it('coloca los objetos en celdas libres (sin columna ni estantes)', () => {
    for (let i = 0; i < 20; i++) {
      const seed = hashSeed(`L${i}`);
      const grid = new WorldGrid(new ChunkStore(seed, level));
      const layout = levelLayout(seed, level);
      for (const p of [layout.exit, ...layout.fuses]) {
        expect(grid.column(p.gx, p.gz)).toBe(false);
        for (const e of [
          grid.wallV(p.gx, p.gz),
          grid.wallV(p.gx + 1, p.gz),
          grid.wallH(p.gx, p.gz),
          grid.wallH(p.gx, p.gz + 1),
        ]) {
          expect(e).not.toBe(EDGE.shelf);
        }
      }
    }
  });

  it('la salida y cada fusible son alcanzables desde el inicio', () => {
    for (const seedText of SEEDS) {
      const seed = hashSeed(seedText);
      const grid = new WorldGrid(new ChunkStore(seed, level, 2048));
      const layout = levelLayout(seed, level);
      for (const target of [layout.exit, ...layout.fuses]) {
        const path = findPath(
          grid,
          spawnCell,
          (c) => c.x === target.gx && c.z === target.gz,
          400000,
        );
        expect(path, `${seedText} → ${target.kind} ${target.index}`).not.toBeNull();
      }
    }
  });

  it('la caja de la puerta queda dentro de su celda', () => {
    const layout = levelLayout(hashSeed('DEMO'), level);
    const box = exitBox(layout.exit);
    const cs = WORLD.cellSize;
    expect(box.minX).toBeGreaterThan(layout.exit.gx * cs);
    expect(box.maxX).toBeLessThan((layout.exit.gx + 1) * cs);
    expect(box.minZ).toBeGreaterThan(layout.exit.gz * cs);
    expect(box.maxZ).toBeLessThan((layout.exit.gz + 1) * cs);
  });
});
