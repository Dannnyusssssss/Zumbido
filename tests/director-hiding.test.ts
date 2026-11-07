import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';
import { DIFFICULTY, DIRECTOR, EDGE, HIDING, NOISE, PLAYER, WORLD } from '../src/data/balance';
import { getLevel, LEVELS, type LevelDef } from '../src/data/levels';
import { resolveCircle } from '../src/game/collision';
import type { Enemy } from '../src/game/enemy';
import { cellOf } from '../src/game/grid';
import { exitPoint, hideSpotOf, type HideSpot } from '../src/game/hiding';
import { lineOfSight } from '../src/game/vision';
import { World } from '../src/game/world';
import { cellIndex, generateChunk, hIndex, vIndex } from '../src/game/worldgen';

const DT = 1 / 60;
const C = WORLD.cellSize;

describe('director', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    '%s: respeta el periodo de gracia y aparece lejos por camino y fuera de la vista',
    (difficulty) => {
      const world = new World('DIRECTOR', getLevel(1), { difficulty });
      const input = new InputState();
      const grace = DIFFICULTY[difficulty].graceSeconds;
      const e = world.enemies[0] as Enemy;
      let spawnedAt = -1;
      for (let i = 0; i < (grace + 10) * 60; i++) {
        world.step(DT, input);
        if (spawnedAt < 0 && e.active) {
          spawnedAt = world.time;
          const p = world.player;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          expect(d).toBeGreaterThanOrEqual(DIRECTOR.spawnDistance.min);
          expect(d).toBeLessThanOrEqual(DIRECTOR.spawnDistance.max);
          expect(lineOfSight(world.grid, p.x, p.z, e.x, e.z)).toBe(false);
          expect(
            world.paths.measure(world.grid, p.x, p.z, e.x, e.z, DIRECTOR.spawnDistance.min),
          ).toBe(Infinity);
        }
      }
      expect(spawnedAt).toBeGreaterThanOrEqual(grace);
      expect(spawnedAt).toBeLessThan(grace + 3);
    },
  );

  it('apariciones válidas con muchas semillas y posiciones del jugador', () => {
    let spawns = 0;
    for (let s = 0; s < 6; s++) {
      for (const level of LEVELS) {
        const world = new World(`S${s}`, level);
        // El jugador se coloca en otro sitio del mundo antes de que acabe la gracia.
        world.player.x += (s - 3) * 7;
        world.player.z += (s % 2) * 9;
        const input = new InputState();
        const p = world.player;
        for (let i = 0; i < (DIFFICULTY.normal.graceSeconds + 3) * 60; i++) {
          // Quieto en su sitio (sin ruido): solo cuenta la aparición.
          world.step(DT, input);
          for (const e of world.enemies) {
            if (e.active && e.stateTime <= DT * 1.5 && e.state === 'wander') {
              spawns++;
              expect(lineOfSight(world.grid, p.x, p.z, e.x, e.z)).toBe(false);
              expect(world.grid.column(cellOf(e.x), cellOf(e.z))).toBe(false);
            }
          }
        }
      }
    }
    expect(spawns).toBeGreaterThanOrEqual(18);
  });

  it('el nivel 3 tiene dos criaturas y la segunda llega más tarde', () => {
    expect(getLevel(1).creatures).toBe(1);
    expect(getLevel(2).creatures).toBe(1);
    expect(getLevel(3).creatures).toBe(2);
    const world = new World('DOS', getLevel(3));
    expect(world.enemies.length).toBe(2);
    const t = DIFFICULTY.normal;
    expect(world.director.timers[1]).toBe(t.graceSeconds + t.secondCreatureDelay);
  });

  it('sin criaturas (depuración) el mundo no crea ninguna', () => {
    expect(new World('X', getLevel(3), { creatures: false }).enemies.length).toBe(0);
  });

  it('tras retirarse, vuelve a aparecer pasado el tiempo de reaparición', () => {
    const world = new World('VUELVE', getLevel(2), { difficulty: 'hard' });
    const input = new InputState();
    const e = world.enemies[0] as Enemy;
    for (let i = 0; i < 60 * 60 && !e.active; i++) world.step(DT, input);
    expect(e.active).toBe(true);
    // Se fuerza la retirada completa.
    e.state = 'dormant';
    world.step(DT, input);
    const r = DIFFICULTY.hard.respawnSeconds;
    const timer = world.director.timers[0] as number;
    expect(timer).toBeGreaterThan(r.min - 0.1);
    expect(timer).toBeLessThanOrEqual(r.max);
    let back = -1;
    const start = world.time;
    for (let i = 0; i < (r.max + 5) * 60 && back < 0; i++) {
      world.step(DT, input);
      if (e.active) back = world.time - start;
    }
    expect(back).toBeGreaterThanOrEqual(r.min - 0.5);
    expect(e.spawnCount).toBe(2);
  });
});

describe('escondites: generación', () => {
  function chunks(level: LevelDef): ReturnType<typeof generateChunk>[] {
    const out = [];
    for (let cx = -2; cx <= 2; cx++)
      for (let cz = -2; cz <= 2; cz++) out.push(generateChunk(99, level, cx, cz));
    return out;
  }

  it.each(LEVELS.map((l) => l.id))(
    'nivel %i: contra una pared, en salas, sin columnas, uno por celda y con paso libre',
    (id) => {
      const level = getLevel(id);
      let total = 0;
      for (const chunk of chunks(level)) {
        expect(chunk.hides.length).toBeLessThanOrEqual(level.gen.hides.max);
        const cells = new Set<number>();
        for (const h of chunk.hides) {
          total++;
          const wall =
            h.side === 0
              ? chunk.vWalls[vIndex(h.x, h.z)]
              : h.side === 1
                ? chunk.vWalls[vIndex(h.x + 1, h.z)]
                : h.side === 2
                  ? chunk.hWalls[hIndex(h.x, h.z)]
                  : chunk.hWalls[hIndex(h.x, h.z + 1)];
          expect(wall).toBe(EDGE.wall);
          expect(chunk.columns[cellIndex(h.x, h.z)]).toBe(0);
          expect(
            chunk.rooms.some((r) => h.x >= r.x && h.x < r.x + r.w && h.z >= r.z && h.z < r.z + r.h),
          ).toBe(true);
          expect(cells.has(cellIndex(h.x, h.z))).toBe(false);
          cells.add(cellIndex(h.x, h.z));
          // La caja deja libre el centro de la celda con holgura para pasar.
          const spot = hideSpotOf(chunk.cx, chunk.cz, h);
          const cxm = (spot.gx + 0.5) * C;
          const czm = (spot.gz + 0.5) * C;
          const px = Math.max(spot.box.minX, Math.min(cxm, spot.box.maxX));
          const pz = Math.max(spot.box.minZ, Math.min(czm, spot.box.maxZ));
          expect(Math.hypot(px - cxm, pz - czm)).toBeGreaterThan(PLAYER.radius + 0.4);
        }
      }
      expect(total).toBeGreaterThan(10);
    },
  );

  it('son deterministas y no cambian las paredes ni las salas de cada semilla', () => {
    for (const level of LEVELS) {
      const a = generateChunk(5, level, 3, -2);
      const b = generateChunk(5, level, 3, -2);
      expect(a.hides).toEqual(b.hides);
      const without = generateChunk(
        5,
        { ...level, gen: { ...level.gen, hides: { min: 0, max: 0 } } },
        3,
        -2,
      );
      expect(without.hides.length).toBe(0);
      expect(Array.from(without.vWalls)).toEqual(Array.from(a.vWalls));
      expect(Array.from(without.hWalls)).toEqual(Array.from(a.hWalls));
      expect(without.rooms).toEqual(a.rooms);
    }
  });

  it('el punto de salida queda en la misma celda y libre de paredes', () => {
    const level = getLevel(1);
    const world = new World('SALIDA', level, { creatures: false });
    let checked = 0;
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        for (const s of world.hides.spotsOf(cx, cz)) {
          const out = exitPoint(s, PLAYER.radius);
          expect(cellOf(out.x)).toBe(s.gx);
          expect(cellOf(out.z)).toBe(s.gz);
          const pos = { x: out.x, z: out.z };
          resolveCircle(world.grid, pos, PLAYER.radius, world.obstaclesNear(out.x, out.z));
          expect(pos.x).toBeCloseTo(out.x, 6);
          expect(pos.z).toBeCloseTo(out.z, 6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('escondites: uso', () => {
  /** Un escondite del chunk de inicio y un mundo con el jugador delante mirándolo. */
  function before(level = 1): { world: World; spot: HideSpot } {
    for (let s = 0; s < 50; s++) {
      const world = new World(`ESC${s}`, getLevel(level));
      const spot = world.hides.spotsOf(0, 0)[0];
      if (spot === undefined) continue;
      const p = world.player;
      p.x = spot.frontX + spot.nx * 1;
      p.z = spot.frontZ + spot.nz * 1;
      p.prevX = p.x;
      p.prevZ = p.z;
      p.yaw = Math.atan2(spot.nx, spot.nz); // mira hacia el escondite
      return { world, spot };
    }
    throw new Error('sin escondites en el chunk de inicio');
  }

  const press = (world: World, code: string): void => {
    const input = new InputState();
    input.keyDown(code);
    world.step(DT, input);
  };

  it('E entra y sale; dentro no se mueve ni hace ruido', () => {
    const { world, spot } = before();
    world.step(DT, new InputState());
    expect(world.focusHide?.id).toBe(spot.id);
    press(world, 'KeyE');
    expect(world.hidden?.id).toBe(spot.id);
    expect(world.player.x).toBeCloseTo(spot.x, 6);
    expect(world.noiseAt(0).radius).toBe(NOISE.radius.hide);
    // Con las teclas de moverse y correr pulsadas, sigue quieto y en silencio.
    const input = new InputState();
    input.keyDown('KeyW');
    input.keyDown('ShiftLeft');
    let noises = 0;
    for (let i = 0; i < 120; i++) {
      world.step(DT, input);
      noises += world.noiseCountThisStep;
    }
    expect(noises).toBe(0);
    expect(world.player.x).toBeCloseTo(spot.x, 6);
    // La tiza tampoco funciona dentro.
    press(world, 'KeyQ');
    expect(world.chalk.count).toBe(0);
    press(world, 'KeyE');
    expect(world.hidden).toBeNull();
    const out = exitPoint(spot, PLAYER.radius);
    expect(world.player.x).toBeCloseTo(out.x, 6);
    expect(world.player.z).toBeCloseTo(out.z, 6);
  });

  it('si la criatura no te vio entrar, no te encuentra aunque pase cerca', () => {
    const { world, spot } = before();
    press(world, 'KeyE');
    const e = world.enemies[0] as Enemy;
    // Aparece justo al lado, de espaldas al escondite.
    e.spawn(spot.x + spot.nx * 1.4, spot.z + spot.nz * 1.4, Math.atan2(spot.nx, spot.nz));
    const input = new InputState();
    for (let i = 0; i < 20 * 60; i++) world.step(DT, input);
    expect(world.defeated).toBe(false);
  });

  it('si te vio entrar, va a por ti', () => {
    const { world, spot } = before();
    const e = world.enemies[0] as Enemy;
    // Aparece detrás del jugador, a poco más de un metro y en la misma celda: lo nota.
    const p = world.player;
    const ex = p.x + spot.nx * 1.2;
    const ez = p.z + spot.nz * 1.2;
    e.spawn(ex, ez, Math.atan2(-(p.x - ex), -(p.z - ez)));
    world.step(DT, new InputState());
    expect(e.seesPlayer || e.state === 'chase').toBe(true);
    const events: string[] = [];
    const input = new InputState();
    input.keyDown('KeyE');
    world.step(DT, input);
    for (const ev of world.drainEvents([])) if (ev.type === 'hide') events.push(String(ev.seen));
    expect(world.hidden).not.toBeNull();
    expect(events).toContain('true');
    const idle = new InputState();
    for (let i = 0; i < 10 * 60 && !world.defeated; i++) world.step(DT, idle);
    expect(world.defeated).toBe(true);
  });

  it('el escondite tiene colisión: no se puede atravesar', () => {
    const { world, spot } = before();
    const pos = { x: spot.x, z: spot.z + 0.0 };
    resolveCircle(world.grid, pos, PLAYER.radius, world.obstaclesNear(pos.x, pos.z));
    expect(Math.hypot(pos.x - spot.x, pos.z - spot.z)).toBeGreaterThan(HIDING.depth / 2);
  });
});
