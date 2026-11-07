import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';
import { DIFFICULTY, ENEMY } from '../src/data/balance';
import { getLevel, LEVELS } from '../src/data/levels';
import { Enemy, type EnemyState } from '../src/game/enemy';
import { cellOf } from '../src/game/grid';
import { World } from '../src/game/world';
import { ArenaGrid, at, FakeHost } from './helpers/fake';

const DT = 1 / 60;
const yawTo = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Ejecuta la criatura `seconds` segundos; devuelve la secuencia de estados (sin repeticiones). */
function run(e: Enemy, host: FakeHost, seconds: number, each?: () => void): EnemyState[] {
  const states: EnemyState[] = [e.state];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    e.update(host, DT);
    host.clearNoises();
    each?.();
    if (states[states.length - 1] !== e.state) states.push(e.state);
  }
  return states;
}

function setup(w = 12, h = 12): { host: FakeHost; grid: ArenaGrid; e: Enemy } {
  const grid = new ArenaGrid(w, h);
  const host = new FakeHost(grid);
  const e = new Enemy(0, 1234);
  return { host, grid, e };
}

describe('la Escucha: estados', () => {
  it('dormida no hace nada', () => {
    const { host, e } = setup();
    run(e, host, 1);
    expect(e.state).toBe('dormant');
    expect(e.active).toBe(false);
  });

  it('si te ve, persigue', () => {
    const { host, e } = setup();
    e.spawn(at(1), at(5), yawTo(1, 0));
    host.player.x = at(4);
    host.player.z = at(5);
    e.update(host, DT);
    expect(e.state).toBe('chase');
  });

  it('si oye un ruido, va a investigarlo; al llegar mira y vuelve a vagar', () => {
    const { host, e } = setup();
    e.spawn(at(6), at(5), yawTo(1, 0));
    // Ruido detrás de ella (fuera del cono), a 6 m: lo oye pero no te ve.
    host.player.x = at(4);
    host.player.z = at(5);
    host.noise('walk');
    e.update(host, DT);
    expect(e.state).toBe('investigate');
    // El jugador se esconde: no lo verá al girarse.
    host.playerHidden = true;
    const states = run(e, host, 10);
    expect(states).toContain('wander');
    expect(Math.hypot(e.x - at(4), e.z - at(5))).toBeLessThan(6);
  });

  it('un ruido al otro lado de una pared sin hueco no se oye', () => {
    const { host, grid, e } = setup();
    grid.wallLineV(6, 0, 11);
    e.spawn(at(8), at(5), yawTo(1, 0));
    host.player.x = at(5);
    host.player.z = at(5);
    host.playerHidden = true;
    host.noise('run');
    e.update(host, DT);
    expect(e.state).toBe('wander');
  });

  it('si rompes la visión y te quedas agachado y quieto, te pierde, busca y se retira', () => {
    const { host, grid, e } = setup(24, 12);
    grid.wallLineV(6, 0, 10); // hueco solo en z = 11
    e.spawn(at(3), at(5), yawTo(1, 0));
    host.player.x = at(5);
    host.player.z = at(5);
    e.update(host, DT);
    expect(e.state).toBe('chase');
    // El jugador pasa al otro lado de la pared, lejos, agachado y sin moverse (sin ruido).
    host.player.x = at(18);
    host.player.z = at(1);
    host.player.crouching = true;
    const states = run(e, host, 50);
    expect(states.slice(0, 4)).toEqual(['chase', 'search', 'retreat', 'dormant']);
    expect(e.caught).toBe(false);
  });

  it('te alcanza si te quedas a la vista', () => {
    const { host, e } = setup();
    e.spawn(at(1), at(5), yawTo(1, 0));
    host.player.x = at(6);
    host.player.z = at(5);
    let t = 0;
    run(e, host, 10, () => {
      if (!e.caught) t += DT;
    });
    expect(e.caught).toBe(true);
    // A velocidad de persecución tarda más o menos lo que se tarda en recorrer la distancia.
    expect(t).toBeGreaterThan(4 / DIFFICULTY.normal.chaseSpeed);
    expect(t).toBeLessThan(8);
  });

  it('escondido no te alcanza aunque pase al lado; si te vio entrar, sí', () => {
    const { host, e } = setup();
    host.player.x = at(5);
    host.player.z = at(5);
    host.playerHidden = true;
    e.spawn(at(5) + 0.5, at(5), yawTo(1, 0));
    run(e, host, 3);
    expect(e.caught).toBe(false);

    const b = setup();
    b.host.player.x = at(5);
    b.host.player.z = at(5);
    b.host.playerHidden = true;
    b.e.spawn(at(1), at(5), yawTo(1, 0));
    b.e.sawHiding(at(5), at(5));
    run(b.e, b.host, 6);
    expect(b.e.caught).toBe(true);
  });

  it('la persecución es más rápida que caminar y más lenta que correr', () => {
    for (const d of Object.values(DIFFICULTY)) {
      expect(d.chaseSpeed).toBeGreaterThan(2.2);
      expect(d.chaseSpeed).toBeLessThan(4.5);
    }
    expect(ENEMY.speed.investigate).toBeLessThan(2.2);
  });
});

describe('la Escucha en el mundo generado', () => {
  /** Comprueba que cada cambio de celda pasa por un borde abierto. */
  function crossesOpen(world: World, ax: number, az: number, dx: number, dz: number): boolean {
    const g = world.grid;
    const viaX = (x: number, z: number, d: number): boolean =>
      d === 0 || g.wallV(d > 0 ? x + 1 : x, z) === 0;
    const viaZ = (x: number, z: number, d: number): boolean =>
      d === 0 || g.wallH(x, d > 0 ? z + 1 : z) === 0;
    if (Math.abs(dx) + Math.abs(dz) === 1) return viaX(ax, az, dx) && viaZ(ax, az, dz);
    // Esquina: vale cualquiera de los dos caminos en L.
    return (
      (viaX(ax, az, dx) && viaZ(ax + dx, az, dz)) || (viaZ(ax, az, dz) && viaX(ax, az + dz, dx))
    );
  }

  it.each(LEVELS.map((l) => l.id))(
    'nivel %i: no atraviesa paredes, no se atasca y recorre la zona',
    (id) => {
      const world = new World('ESCUCHA', getLevel(id), { difficulty: 'normal' });
      const input = new InputState();
      const cells = new Set<string>();
      let violations = 0;
      const prev = world.enemies.map((e) => [cellOf(e.x), cellOf(e.z)] as [number, number]);
      for (let i = 0; i < 150 * 60; i++) {
        world.step(DT, input);
        world.enemies.forEach((e, k) => {
          const now: [number, number] = [cellOf(e.x), cellOf(e.z)];
          const was = prev[k] as [number, number];
          const dx = now[0] - was[0];
          const dz = now[1] - was[1];
          // Al aparecer salta de celda; durante el movimiento, solo a una vecina y por un borde abierto.
          const justSpawned = e.state === 'wander' && e.stateTime <= DT * 1.5;
          if (e.active && !justSpawned && (dx !== 0 || dz !== 0)) {
            if (Math.abs(dx) > 1 || Math.abs(dz) > 1) violations++;
            else if (!crossesOpen(world, was[0], was[1], dx, dz)) violations++;
          }
          prev[k] = now;
          if (e.active) cells.add(`${k}:${now[0]},${now[1]}`);
        });
        if (world.defeated) break;
      }
      expect(violations).toBe(0);
      const e0 = world.enemies[0] as Enemy;
      expect(e0.spawnCount).toBeGreaterThan(0);
      expect(cells.size).toBeGreaterThan(12);
      expect(e0.distance).toBeGreaterThan(40);
    },
  );

  it('es determinista: misma semilla, mismo recorrido', () => {
    const a = new World('IGUAL', getLevel(2));
    const b = new World('IGUAL', getLevel(2));
    const input = new InputState();
    for (let i = 0; i < 90 * 60; i++) {
      a.step(DT, input);
      b.step(DT, input);
    }
    const ea = a.enemies[0] as Enemy;
    const eb = b.enemies[0] as Enemy;
    expect(ea.x).toBe(eb.x);
    expect(ea.z).toBe(eb.z);
    expect(ea.state).toBe(eb.state);
  });

  it('la captura causa la derrota y detiene el mundo', () => {
    const world = new World('CAPTURA', getLevel(1));
    const e = world.enemies[0] as Enemy;
    const p = world.player;
    e.spawn(p.x + 4, p.z, yawTo(-1, 0));
    const input = new InputState();
    let caughtEvent = false;
    for (let i = 0; i < 10 * 60 && !world.defeated; i++) {
      world.step(DT, input);
      for (const ev of world.drainEvents([])) if (ev.type === 'caught') caughtEvent = true;
    }
    expect(world.defeated).toBe(true);
    expect(caughtEvent).toBe(true);
    const t = world.time;
    world.step(DT, input);
    expect(world.time).toBe(t);
  });
});
