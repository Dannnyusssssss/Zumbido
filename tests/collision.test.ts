import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src/core/rng';
import { PLAYER, WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { moveCircle, resolveCircle } from '../src/game/collision';
import { ChunkStore, WorldGrid, type WallQuery } from '../src/game/grid';
import { Player } from '../src/game/player';
import { SPAWN_POINT } from '../src/game/worldgen';
import { findPath, followPath } from './helpers/path';

const C = WORLD.cellSize;
const R = PLAYER.radius;
const HALF = WORLD.wallThickness / 2;

/** Cuadrícula de prueba con paredes definidas a mano. */
class FakeGrid implements WallQuery {
  readonly v = new Set<string>();
  readonly h = new Set<string>();
  readonly cols = new Set<string>();
  wallV(x: number, z: number): boolean {
    return this.v.has(`${x},${z}`);
  }
  wallH(x: number, z: number): boolean {
    return this.h.has(`${x},${z}`);
  }
  column(x: number, z: number): boolean {
    return this.cols.has(`${x},${z}`);
  }
}

describe('colisión círculo contra paredes', () => {
  it('una pared detiene al jugador a la distancia del radio', () => {
    const g = new FakeGrid();
    g.v.add('1,0'); // pared vertical en x = 3 m, fila 0
    const pos = { x: 1.5, z: 1.5 };
    moveCircle(g, pos, 5, 0, R);
    expect(pos.x).toBeCloseTo(C - HALF - R, 5);
    expect(pos.z).toBeCloseTo(1.5, 5);
  });

  it('desliza a lo largo de la pared al moverse en diagonal', () => {
    const g = new FakeGrid();
    for (let z = -2; z <= 3; z++) g.v.add(`1,${z}`);
    const pos = { x: 2.5, z: 1.5 };
    moveCircle(g, pos, 1, 1, R);
    expect(pos.x).toBeLessThanOrEqual(C - HALF - R + 1e-6);
    expect(pos.z).toBeCloseTo(2.5, 5);
  });

  it('no atraviesa una pared ni con un movimiento grande', () => {
    const g = new FakeGrid();
    g.h.add('0,1');
    const pos = { x: 1.5, z: 1.5 };
    moveCircle(g, pos, 0, 50, R);
    expect(pos.z).toBeLessThan(C);
  });

  it('en una esquina queda dentro y sin quedar atrapado', () => {
    const g = new FakeGrid();
    g.v.add('1,0');
    g.h.add('0,1');
    const pos = { x: 1.5, z: 1.5 };
    moveCircle(g, pos, 3, 3, R);
    expect(pos.x).toBeCloseTo(C - HALF - R, 4);
    expect(pos.z).toBeCloseTo(C - HALF - R, 4);
    // Puede volver a salir de la esquina.
    moveCircle(g, pos, -1, -1, R);
    expect(pos.x).toBeLessThan(C - HALF - R - 0.5);
    expect(pos.z).toBeLessThan(C - HALF - R - 0.5);
  });

  it('la esquina exterior de una pared en L no deja pasar', () => {
    const g = new FakeGrid();
    // La celda (0, 0) queda cerrada al este y al sur; las dos paredes se tocan en el vértice (3, 3).
    g.v.add('1,0');
    g.h.add('0,1');
    const pos = { x: C + 0.5, z: C + 0.5 };
    // Choca contra el extremo alargado de las paredes y no entra por el vértice.
    moveCircle(g, pos, -2, -2, R);
    const inside = pos.x < C && pos.z < C;
    expect(inside).toBe(false);
  });

  it('las columnas bloquean', () => {
    const g = new FakeGrid();
    g.cols.add('0,0');
    const pos = { x: 0.2, z: 1.5 };
    moveCircle(g, pos, 3, 0, R);
    expect(pos.x).toBeLessThan(1.5 - WORLD.columnSize / 2);
  });

  it('si aparece dentro de una pared, sale de ella', () => {
    const g = new FakeGrid();
    g.v.add('1,0');
    const pos = { x: C + 0.01, z: 1.5 };
    resolveCircle(g, pos, R);
    expect(Math.abs(pos.x - C)).toBeGreaterThanOrEqual(HALF + R - 1e-6);
  });
});

describe('colisión en el mundo generado', () => {
  const level = getLevel(1);

  it('un paseo largo nunca deja al jugador dentro de una pared ni fuera del mundo conectado', () => {
    for (const seedText of ['A', 'PASILLO', 'Z9Z9']) {
      const store = new ChunkStore(hashSeed(seedText), level);
      const grid = new WorldGrid(store);
      const player = new Player(24, 24);
      const intent = { forward: 1, strafe: 0, run: true };
      for (let i = 0; i < 6000; i++) {
        // Cambia de rumbo de forma determinista; cruza varios bordes de chunk.
        if (i % 90 === 0) player.yaw += 1.3 + (i % 7) * 0.4;
        player.step(1 / 60, intent, grid);
        const before = { x: player.x, z: player.z };
        resolveCircle(grid, before, R);
        expect(Math.hypot(before.x - player.x, before.z - player.z)).toBeLessThan(1e-3);
      }
    }
  });

  it('el jugador avanza por el mundo (no se queda atascado)', () => {
    const store = new ChunkStore(hashSeed('ABIERTO'), level);
    const grid = new WorldGrid(store);
    const player = new Player(24, 24);
    const intent = { forward: 1, strafe: 0.3, run: false };
    let maxDist = 0;
    for (let i = 0; i < 4000; i++) {
      if (i % 120 === 0) player.yaw += 2.1;
      player.step(1 / 60, intent, grid);
      maxDist = Math.max(maxDist, Math.hypot(player.x - 24, player.z - 24));
    }
    expect(player.distance).toBeGreaterThan(30);
    expect(maxDist).toBeGreaterThan(3);
  });

  it('velocidades: correr más rápido que caminar y agacharse más lento', () => {
    const store = new ChunkStore(1, level);
    const grid = new WorldGrid(store);
    const measure = (run: boolean, crouch: boolean): number => {
      const p = new Player(24, 24);
      p.crouching = crouch;
      for (let i = 0; i < 30; i++) p.step(1 / 60, { forward: 1, strafe: 0, run }, grid);
      return Math.hypot(p.vx, p.vz);
    };
    const walk = measure(false, false);
    expect(measure(true, false)).toBeGreaterThan(walk);
    expect(measure(false, true)).toBeLessThan(walk);
  });

  it('se puede cruzar de chunk en chunk siguiendo un camino real, en las cuatro direcciones', () => {
    const chunkCells = WORLD.chunkCells;
    const goals: Array<(x: number, z: number) => boolean> = [
      (x) => x >= 3 * chunkCells,
      (x) => x < -2 * chunkCells,
      (_x, z) => z >= 3 * chunkCells,
      (_x, z) => z < -2 * chunkCells,
    ];
    for (const seedText of ['DEMO', 'B7', 'PASILLO']) {
      const grid = new WorldGrid(new ChunkStore(hashSeed(seedText), level));
      for (const goal of goals) {
        const start = {
          x: Math.floor(SPAWN_POINT.x / C),
          z: Math.floor(SPAWN_POINT.z / C),
        };
        const path = findPath(grid, start, (c) => goal(c.x, c.z));
        expect(path).not.toBeNull();
        const player = new Player(SPAWN_POINT.x, SPAWN_POINT.z);
        expect(followPath(player, grid, path ?? [])).toBe(true);
      }
    }
  });
});
