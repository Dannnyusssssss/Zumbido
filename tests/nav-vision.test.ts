import { describe, expect, it } from 'vitest';
import { ENEMY } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { ChunkStore, WorldGrid } from '../src/game/grid';
import { Navigator } from '../src/game/nav';
import { canSee, lineOfSight, sightRange } from '../src/game/vision';
import { ArenaGrid, at } from './helpers/fake';
import { findPath } from './helpers/path';

/** yaw que mira en la dirección (dx, dz): forward = (-sin yaw, -cos yaw). */
const yawTo = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

describe('Navigator (A*)', () => {
  it('en línea recta da el camino más corto', () => {
    const nav = new Navigator(1000);
    const out: number[] = [];
    expect(nav.find(new ArenaGrid(10, 10), 0, 0, 4, 0, out)).toBe('found');
    expect(out).toEqual([1, 0, 2, 0, 3, 0, 4, 0]);
  });

  it('rodea una pared por su hueco', () => {
    const g = new ArenaGrid(10, 10);
    g.wallLineV(3, 0, 8); // solo se pasa por z = 9
    const out: number[] = [];
    expect(new Navigator(1000).find(g, 1, 0, 5, 0, out)).toBe('found');
    // 9 abajo, 4 a la derecha, 9 arriba.
    expect(out.length / 2).toBe(22);
    expect(out).toContain(9);
  });

  it('evita las celdas con columna salvo si son el destino', () => {
    const g = new ArenaGrid(3, 3);
    g.cols.add('1,1');
    const out: number[] = [];
    expect(new Navigator(1000).find(g, 0, 1, 2, 1, out)).toBe('found');
    for (let i = 0; i < out.length; i += 2) expect(`${out[i]},${out[i + 1]}`).not.toBe('1,1');
    expect(new Navigator(1000).find(g, 0, 1, 1, 1, out)).toBe('found');
  });

  it('sin camino: none; con el tope de nodos corto: camino parcial hacia el destino', () => {
    const closed = new ArenaGrid(10, 10);
    closed.wallLineV(5, 0, 9);
    const out: number[] = [];
    // Partial si avanza algo hacia el destino; aquí sí puede acercarse hasta la pared.
    expect(new Navigator(1000).find(closed, 0, 0, 8, 0, out)).toBe('partial');
    expect(out[out.length - 2]).toBe(4);
    const box = new ArenaGrid(1, 1);
    expect(new Navigator(1000).find(box, 0, 0, 3, 0, out)).toBe('none');
    const nav = new Navigator(5);
    expect(nav.find(new ArenaGrid(40, 40), 0, 0, 30, 30, out)).toBe('partial');
    expect(nav.lastExpanded).toBeLessThanOrEqual(5);
  });

  it('en el mundo generado su longitud coincide con la búsqueda en anchura (sin columnas)', () => {
    const level = getLevel(3);
    const grid = new WorldGrid(new ChunkStore(777, level));
    const nav = new Navigator(20000);
    const out: number[] = [];
    for (const [sx, sz, tx, tz] of [
      [7, 7, 20, -5],
      [-10, 3, 12, 30],
      [40, 40, 30, 18],
    ] as const) {
      const bfs = findPath(grid, { x: sx, z: sz }, (c) => c.x === tx && c.z === tz);
      expect(bfs).not.toBeNull();
      expect(nav.find(grid, sx, sz, tx, tz, out)).toBe('found');
      expect(out.length / 2).toBe((bfs as unknown[]).length - 1);
    }
  });
});

describe('visión', () => {
  const g = new ArenaGrid(12, 12);
  it('ve delante dentro del alcance y del cono', () => {
    expect(canSee(g, g, at(1), at(5), yawTo(1, 0), at(4), at(5), false, 1)).toBe(true);
  });
  it('no ve detrás (fuera del cono) salvo muy cerca', () => {
    expect(canSee(g, g, at(5), at(5), yawTo(1, 0), at(2), at(5), false, 1)).toBe(false);
    expect(canSee(g, g, at(5), at(5), yawTo(1, 0), at(5) - 1.2, at(5), false, 1)).toBe(true);
  });
  it('las paredes cortan la línea de visión', () => {
    const w = new ArenaGrid(12, 12);
    w.wallLineV(3, 0, 11);
    expect(lineOfSight(w, at(1), at(5), at(5), at(5))).toBe(false);
    expect(canSee(w, w, at(1), at(5), yawTo(1, 0), at(5), at(5), false, 1)).toBe(false);
  });
  it('en la oscuridad y agachado se te ve desde menos lejos', () => {
    const lit = new ArenaGrid(12, 12);
    const dark = new ArenaGrid(12, 12);
    dark.dark = true;
    const far = at(1) + 10;
    expect(canSee(lit, lit, at(1), at(5), yawTo(1, 0), far, at(5), false, 1)).toBe(true);
    expect(canSee(dark, dark, at(1), at(5), yawTo(1, 0), far, at(5), false, 1)).toBe(false);
    expect(canSee(lit, lit, at(1), at(5), yawTo(1, 0), far, at(5), true, 1)).toBe(false);
    expect(sightRange(lit, 0, 0, true, 1)).toBeCloseTo(ENEMY.sightLit * ENEMY.crouchSightFactor);
    expect(sightRange(dark, 0, 0, false, 1)).toBe(ENEMY.sightDark);
  });
  it('la luz del mundo generado depende de los paneles cercanos', () => {
    const grid = new WorldGrid(new ChunkStore(1, getLevel(1)));
    let lit = 0;
    let dark = 0;
    for (let x = 0; x < 48; x++) {
      for (let z = 0; z < 16; z++) {
        if (grid.lit(x, z)) lit++;
        else dark++;
      }
    }
    expect(lit).toBeGreaterThan(dark);
  });
});
