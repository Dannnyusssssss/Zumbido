import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';
import { CHALK, STAMINA, WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { castRay, ChalkPool, makeMark, type ChalkMark, type RayHit } from '../src/game/chalk';
import { relativeAngle, sectorOf, SECTOR_ARROWS } from '../src/game/cues';
import type { WallQuery } from '../src/game/grid';
import { Stamina } from '../src/game/stamina';
import { reachDistance } from '../src/game/systems/interaction';
import { World } from '../src/game/world';

const C = WORLD.cellSize;

class FakeGrid implements WallQuery {
  readonly v = new Map<string, number>();
  readonly h = new Map<string, number>();
  readonly cols = new Set<string>();
  wallV(x: number, z: number): number {
    return this.v.get(`${x},${z}`) ?? 0;
  }
  wallH(x: number, z: number): number {
    return this.h.get(`${x},${z}`) ?? 0;
  }
  column(x: number, z: number): boolean {
    return this.cols.has(`${x},${z}`);
  }
}

const hit = (): RayHit => ({ dist: 0, x: 0, z: 0, nx: 0, nz: 0 });

/** Salida del nivel (en el modo Salida siempre existe). */
function exitOf(world: World): { x: number; z: number } {
  const exit = world.layout.exit;
  if (exit === null) throw new Error('El nivel no tiene salida');
  return exit;
}

describe('castRay', () => {
  it('choca con una pared y devuelve la superficie y la normal', () => {
    const g = new FakeGrid();
    g.v.set('1,0', 1);
    const out = hit();
    expect(castRay(g, 1.5, 1.5, 1, 0, 5, out)).toBe(true);
    expect(out.x).toBeCloseTo(C - WORLD.wallThickness / 2, 6);
    expect(out.nx).toBe(-1);
  });
  it('tiene en cuenta el fondo de los estantes', () => {
    const g = new FakeGrid();
    g.h.set('0,1', 2);
    const out = hit();
    expect(castRay(g, 1.5, 1.5, 0, 1, 5, out)).toBe(true);
    expect(out.z).toBeCloseTo(C - WORLD.shelfDepth / 2, 6);
    expect(out.nz).toBe(-1);
  });
  it('choca con columnas', () => {
    const g = new FakeGrid();
    g.cols.add('1,0');
    const out = hit();
    expect(castRay(g, 1.5, 1.5, 1, 0, 5, out)).toBe(true);
    expect(out.x).toBeCloseTo(4.5 - WORLD.columnSize / 2, 6);
  });
  it('no choca más allá del alcance ni en espacio abierto', () => {
    const g = new FakeGrid();
    g.v.set('3,0', 1);
    expect(castRay(g, 1.5, 1.5, 1, 0, 2.5, hit())).toBe(false);
    expect(castRay(new FakeGrid(), 1.5, 1.5, 0.6, 0.8, 10, hit())).toBe(false);
  });
  it('funciona en diagonal y con coordenadas negativas', () => {
    const g = new FakeGrid();
    g.v.set('-1,-1', 1);
    const out = hit();
    const d = Math.SQRT1_2;
    expect(castRay(g, -1.5, -1, -d, -d, 5, out)).toBe(true);
    expect(out.nx).toBe(1);
  });
});

describe('tiza', () => {
  it('marca la pared que se mira y si no, el suelo delante', () => {
    const g = new FakeGrid();
    g.h.set('0,0', 1); // pared al norte (z = 0)
    const wall = makeMark(g, 1.5, 1.5, 0); // yaw 0 mira hacia -z
    expect(wall.onWall).toBe(true);
    expect(wall.y).toBe(CHALK.wallMarkHeight);
    expect(wall.nz).toBe(1);
    const floor = makeMark(g, 1.5, 1.5, Math.PI); // mira hacia +z, sin pared cerca
    expect(floor.onWall).toBe(false);
    expect(floor.z).toBeCloseTo(1.5 + CHALK.floorDistance, 6);
  });
  it('el pool reutiliza la marca más antigua al llenarse', () => {
    const pool = new ChalkPool(3);
    const m = (i: number): ChalkMark => ({
      x: i,
      y: 0,
      z: 0,
      nx: 0,
      nz: 0,
      onWall: false,
      angle: 0,
    });
    for (let i = 0; i < 5; i++) pool.add(m(i));
    expect(pool.count).toBe(3);
    expect(pool.marks.map((k) => k.x).sort()).toEqual([2, 3, 4]);
    expect(pool.version).toBe(5);
    pool.clear();
    expect(pool.count).toBe(0);
  });
});

describe('resistencia', () => {
  it('se gasta corriendo y se agota', () => {
    const s = new Stamina();
    const seconds = STAMINA.max / STAMINA.drainPerSecond;
    for (let i = 0; i < Math.ceil(seconds * 60) + 2; i++) s.update(1 / 60, true);
    expect(s.value).toBe(0);
    expect(s.canRun).toBe(false);
  });
  it('se recupera tras la espera y vuelve a permitir correr al pasar el umbral', () => {
    const s = new Stamina();
    for (let i = 0; i < 400; i++) s.update(1 / 60, true);
    // Durante la espera no se recupera nada.
    for (let i = 0; i < Math.floor(STAMINA.regenDelay * 60) - 2; i++) s.update(1 / 60, false);
    expect(s.value).toBe(0);
    let t = 0;
    while (!s.canRun && t < 20) {
      s.update(1 / 60, false);
      t += 1 / 60;
    }
    expect(s.value).toBeGreaterThanOrEqual(STAMINA.recoverThreshold);
    expect(s.value).toBeLessThan(STAMINA.recoverThreshold + 1);
  });
  it('nunca supera el máximo', () => {
    const s = new Stamina();
    for (let i = 0; i < 1000; i++) s.update(1 / 60, false);
    expect(s.value).toBe(STAMINA.max);
    expect(s.ratio).toBe(1);
  });
});

describe('interacción', () => {
  it('alcance: cerca y delante sí; lejos o detrás no', () => {
    expect(reachDistance(0, 0, 0, { x: 0, z: -1 })).toBeCloseTo(1, 6);
    expect(reachDistance(0, 0, 0, { x: 0, z: 1 })).toBe(-1);
    expect(reachDistance(0, 0, 0, { x: 0, z: -3 })).toBe(-1);
    expect(reachDistance(0, 0, 0, { x: 0.2, z: 0.2 })).toBeGreaterThanOrEqual(0);
  });

  /** Coloca al jugador mirando a un objeto a 1 m. */
  function standBefore(world: World, obj: { x: number; z: number }): void {
    world.player.x = obj.x;
    world.player.z = obj.z + 1;
    world.player.prevX = world.player.x;
    world.player.prevZ = world.player.z;
    world.player.yaw = 0;
  }

  it('la salida del nivel 1 está activa y completa el nivel', () => {
    const world = new World('DEMO', getLevel(1));
    expect(world.exitActive).toBe(true);
    const input = new InputState();
    world.step(1 / 60, input);
    standBefore(world, exitOf(world));
    input.keyDown('KeyE');
    world.step(1 / 60, input);
    expect(world.completed).toBe(true);
    expect(world.drainEvents([]).map((e) => e.type)).toContain('levelComplete');
  });

  it('con fusibles pendientes la salida no funciona; al recogerlos sí', () => {
    const world = new World('DEMO', getLevel(2));
    const input = new InputState();
    expect(world.exitActive).toBe(false);
    standBefore(world, exitOf(world));
    input.keyDown('KeyE');
    world.step(1 / 60, input);
    input.keyUp('KeyE');
    expect(world.completed).toBe(false);
    const ev = world.drainEvents([]);
    expect(ev).toContainEqual({ type: 'exitLocked', missing: 2 });
    for (const fuse of world.layout.fuses) {
      standBefore(world, fuse);
      input.keyDown('KeyE');
      world.step(1 / 60, input);
      input.keyUp('KeyE');
    }
    expect(world.fusesCollected).toBe(2);
    expect(world.exitActive).toBe(true);
    expect(world.drainEvents([]).map((e) => e.type)).toEqual(['fuse', 'fuse', 'exitActivated']);
    // Un fusible recogido ya no se puede volver a usar.
    standBefore(world, world.layout.fuses[0] ?? world.layout.exit);
    world.step(1 / 60, input);
    expect(world.focus?.kind).not.toBe('fuse');
    standBefore(world, exitOf(world));
    input.keyDown('KeyE');
    world.step(1 / 60, input);
    expect(world.completed).toBe(true);
  });

  it('el tiempo no avanza tras completar el nivel', () => {
    const world = new World('DEMO', getLevel(1));
    const input = new InputState();
    standBefore(world, exitOf(world));
    input.keyDown('KeyE');
    world.step(1 / 60, input);
    const t = world.time;
    world.step(1 / 60, input);
    expect(world.time).toBe(t);
  });

  it('Q deja marcas de tiza a través del sistema', () => {
    const world = new World('DEMO', getLevel(1));
    const input = new InputState();
    input.keyDown('KeyQ');
    world.step(1 / 60, input);
    expect(world.chalk.count).toBe(1);
    expect(world.drainEvents([]).some((e) => e.type === 'chalk')).toBe(true);
  });

  it('correr sin resistencia no es posible', () => {
    const world = new World('DEMO', getLevel(1));
    world.stamina.value = 0;
    world.stamina.exhausted = true;
    const input = new InputState();
    input.keyDown('KeyW');
    input.keyDown('ShiftLeft');
    world.step(1 / 60, input);
    expect(world.intent.run).toBe(false);
  });
});

describe('dirección aproximada', () => {
  it('delante, izquierda, derecha y detrás', () => {
    // yaw 0 mira hacia -z.
    expect(sectorOf(relativeAngle(0, 0, 0, 0, -5))).toBe(0);
    expect(sectorOf(relativeAngle(0, 0, 0, -5, 0))).toBe(2);
    expect(sectorOf(relativeAngle(0, 0, 0, 5, 0))).toBe(6);
    expect(sectorOf(relativeAngle(0, 0, 0, 0, 5))).toBe(4);
    expect(sectorOf(relativeAngle(0, 0, 0, -5, -5))).toBe(1);
    expect(SECTOR_ARROWS[sectorOf(relativeAngle(0, 0, Math.PI / 2, -5, 0))]).toBe('↑');
  });
});
