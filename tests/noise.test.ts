import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';
import { NOISE, WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { ChunkStore, WorldGrid, type WallQuery } from '../src/game/grid';
import { hearStrength, noiseLevelOf, PathDistance, type NoiseEvent } from '../src/game/noise';
import { World } from '../src/game/world';
import { findPath } from './helpers/path';

const C = WORLD.cellSize;

class FakeGrid implements WallQuery {
  readonly v = new Map<string, number>();
  readonly h = new Map<string, number>();
  wallV(x: number, z: number): number {
    return this.v.get(`${x},${z}`) ?? 0;
  }
  wallH(x: number, z: number): number {
    return this.h.get(`${x},${z}`) ?? 0;
  }
  column(): boolean {
    return false;
  }
}

const center = (cell: number): number => (cell + 0.5) * C;

describe('PathDistance', () => {
  it('en la misma celda es la distancia en línea recta', () => {
    const p = new PathDistance();
    expect(p.measure(new FakeGrid(), 0.5, 0.5, 2, 2.5, 10)).toBeCloseTo(Math.hypot(1.5, 2), 6);
  });

  it('en un pasillo recto coincide con la línea recta', () => {
    const p = new PathDistance();
    expect(p.measure(new FakeGrid(), center(0), center(0), center(4), center(0), 20)).toBeCloseTo(
      12,
      6,
    );
  });

  it('una pared obliga a rodear: el camino es mucho más largo que la línea recta', () => {
    // Pared vertical en la línea x = 1 de z = -5 a z = 4; solo se pasa por z = 5.
    const g = new FakeGrid();
    for (let z = -5; z <= 4; z++) g.v.set(`1,${z}`, 1);
    const p = new PathDistance();
    const d = p.measure(g, center(0), center(0), center(1), center(0), 60);
    // 5 celdas hacia abajo, 1 a la derecha y 5 de vuelta: 11 pasos.
    expect(d).toBeCloseTo(10 * C, 6);
    // Con el alcance de un paso normal no se llega al otro lado.
    expect(p.measure(g, center(0), center(0), center(1), center(0), NOISE.radius.walk)).toBe(
      Infinity,
    );
  });

  it('los estantes también bloquean', () => {
    const g = new FakeGrid();
    g.v.set('1,0', 2);
    g.h.set('0,0', 1);
    g.h.set('0,1', 1);
    g.v.set('0,0', 1);
    expect(new PathDistance().measure(g, center(0), center(0), center(1), center(0), 40)).toBe(
      Infinity,
    );
  });

  it('una sala cerrada no deja salir el ruido', () => {
    const g = new FakeGrid();
    g.v.set('0,0', 1);
    g.v.set('1,0', 1);
    g.h.set('0,0', 1);
    g.h.set('0,1', 1);
    const p = new PathDistance();
    expect(p.measure(g, center(0), center(0), center(0), center(2), 40)).toBe(Infinity);
  });

  it('fuera de la ventana de búsqueda devuelve Infinity sin recorrer nada', () => {
    const p = new PathDistance(4);
    expect(p.cellSteps(new FakeGrid(), 0, 0, 5, 0, 99)).toBe(-1);
    expect(p.measure(new FakeGrid(), center(0), center(0), center(30), center(0), 200)).toBe(
      Infinity,
    );
  });

  it('se puede reutilizar muchas veces seguidas con resultados estables', () => {
    const p = new PathDistance();
    const g = new FakeGrid();
    for (let i = 0; i < 500; i++) {
      expect(p.cellSteps(g, 0, 0, 3, -2, 20)).toBe(5);
    }
  });

  it('coincide con una búsqueda real en el mundo generado, también entre chunks y con negativos', () => {
    for (const levelId of [1, 2, 3]) {
      const level = getLevel(levelId);
      const grid = new WorldGrid(new ChunkStore(12345, level));
      const p = new PathDistance();
      const starts = [
        { x: -2, z: -3 },
        { x: 15, z: 15 },
        { x: 31, z: -1 },
      ];
      for (const s of starts) {
        for (const [dx, dz] of [
          [3, 0],
          [-4, 2],
          [1, -5],
        ] as const) {
          const t = { x: s.x + dx, z: s.z + dz };
          const path = findPath(grid, s, (c) => c.x === t.x && c.z === t.z, 4000);
          const steps = p.cellSteps(grid, s.x, s.z, t.x, t.z, 16);
          if (path === null || path.length - 1 > 16) expect(steps).toBe(-1);
          else {
            // findPath evita las columnas; con columnas el camino real puede ser más corto.
            expect(steps).toBeLessThanOrEqual(path.length - 1);
            expect(steps).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('hearStrength', () => {
  const noise = (radius: number): NoiseEvent => ({
    kind: 'walk',
    x: center(0),
    z: center(0),
    radius,
  });

  it('se oye fuerte cerca y nada más allá del alcance', () => {
    const p = new PathDistance();
    const g = new FakeGrid();
    expect(hearStrength(p, g, noise(8), center(0) + 0.1, center(0), 1)).toBeGreaterThan(0.95);
    expect(hearStrength(p, g, noise(8), center(2), center(0), 1)).toBeCloseTo(0.25, 6);
    expect(hearStrength(p, g, noise(8), center(4), center(0), 1)).toBe(0);
  });

  it('el oído de la criatura multiplica el alcance', () => {
    const p = new PathDistance();
    const g = new FakeGrid();
    expect(hearStrength(p, g, noise(8), center(3), center(0), 1)).toBe(0);
    expect(hearStrength(p, g, noise(8), center(3), center(0), 1.2)).toBeGreaterThan(0);
    expect(hearStrength(p, g, noise(0), center(0), center(0), 1)).toBe(0);
  });

  it('el ruido al otro lado de una pared no se oye aunque esté cerca en línea recta', () => {
    const g = new FakeGrid();
    for (let z = -5; z <= 4; z++) g.v.set(`1,${z}`, 1);
    expect(hearStrength(new PathDistance(), g, noise(18), center(1), center(0), 1)).toBe(0);
  });
});

describe('ruido del jugador', () => {
  function walk(world: World, keys: string[], seconds: number): number {
    const input = new InputState();
    for (const k of keys) input.keyDown(k);
    let count = 0;
    const radii = new Set<number>();
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      world.step(1 / 60, input);
      count += world.noiseCountThisStep;
      for (let n = 0; n < world.noiseCountThisStep; n++) radii.add(world.noiseAt(n).radius);
    }
    lastRadii = radii;
    return count;
  }
  let lastRadii = new Set<number>();

  it('quieto no hace ruido y el HUD dice silencio', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    expect(walk(world, [], 2)).toBe(0);
    expect(world.noiseLevel).toBe('silent');
  });

  it('caminando emite pasos de alcance medio', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    // Hacia delante 1 segundo (la sala de inicio deja sitio).
    expect(walk(world, ['KeyW'], 1)).toBeGreaterThanOrEqual(1);
    expect([...lastRadii]).toEqual([NOISE.radius.walk]);
    expect(world.noiseLevel).toBe('low');
  });

  it('corriendo, los pasos llegan mucho más lejos y el HUD dice alto', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    walk(world, ['KeyW', 'ShiftLeft'], 1);
    expect(lastRadii.has(NOISE.radius.run)).toBe(true);
    expect(world.noiseLevel).toBe('high');
  });

  it('agachado los pasos casi no se oyen', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    world.player.crouching = true;
    walk(world, ['KeyW'], 1.5);
    expect([...lastRadii]).toEqual([NOISE.radius.crouch]);
    expect(world.noiseLevel).toBe('low');
  });

  it('el HUD vuelve a silencio poco después de pararse', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    walk(world, ['KeyW', 'ShiftLeft'], 0.8);
    walk(world, [], NOISE.hudHoldSeconds + 0.6);
    expect(world.noiseLevel).toBe('silent');
  });

  it('la tiza hace ruido', () => {
    const world = new World('RUIDO', getLevel(1), { creatures: false });
    const input = new InputState();
    input.keyDown('KeyQ');
    world.step(1 / 60, input);
    expect(world.noiseCountThisStep).toBe(1);
    expect(world.noiseAt(0).kind).toBe('chalk');
  });

  it('niveles del HUD por alcance', () => {
    expect(noiseLevelOf(0)).toBe('silent');
    expect(noiseLevelOf(NOISE.radius.crouch)).toBe('low');
    expect(noiseLevelOf(NOISE.radius.walk)).toBe('low');
    expect(noiseLevelOf(NOISE.radius.run)).toBe('high');
  });
});
