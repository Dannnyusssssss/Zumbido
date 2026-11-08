/**
 * Bot de pruebas: juega un nivel con la criatura activa usando solo lo que ve un jugador
 * (camino aprendido de antemano, distancia de la criatura que indica el HUD y si lo persigue).
 * Estrategia sencilla: camina hacia el objetivo; se agacha cuando hay algo cerca; si lo persiguen,
 * corre mientras tenga resistencia y se esconde si tiene un escondite a mano.
 */
import { InputState } from '../../src/core/input';
import type { Difficulty } from '../../src/data/balance';
import { getLevel } from '../../src/data/levels';
import { cellOf } from '../../src/game/grid';
import type { HideSpot } from '../../src/game/hiding';
import type { PlacedObject } from '../../src/game/layout';
import { lineOfSight } from '../../src/game/vision';
import { World } from '../../src/game/world';
import { cellCenter, findPath, type Cell } from './path';

const DT = 1 / 60;

export interface BotResult {
  won: boolean;
  caught: boolean;
  time: number;
  hides: number;
}

function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Escondite libre más cercano (en línea recta) al jugador, a menos de `max` metros. */
function nearestHide(world: World, max: number): HideSpot | null {
  let best: HideSpot | null = null;
  let bestD = max;
  const p = world.player;
  world.hides.forEachNear(p.x, p.z, (s) => {
    const d = Math.hypot(s.frontX - p.x, s.frontZ - p.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  });
  return best;
}

/**
 * Celda a la que huir: entre las alcanzables a 5–10 pasos, la más alejada de las criaturas activas.
 */
function fleeCell(world: World): Cell | null {
  const p = world.player;
  const start = { x: cellOf(p.x), z: cellOf(p.z) };
  const seen = new Map<string, number>([[`${start.x},${start.z}`, 0]]);
  const queue: Cell[] = [start];
  let best: Cell | null = null;
  let bestScore = -Infinity;
  const g = world.grid;
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head] as Cell;
    const steps = seen.get(`${c.x},${c.z}`) as number;
    if (steps >= 5) {
      const m = cellCenter(c);
      let score = Infinity;
      for (const e of world.enemies) {
        if (!e.active) continue;
        // Lejos de la criatura y, mejor aún, detrás de una pared.
        const hidden = lineOfSight(g, e.x, e.z, m.x, m.z) ? 0 : 12;
        score = Math.min(score, Math.hypot(e.x - m.x, e.z - m.z) + hidden);
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (steps >= 10) continue;
    const moves: Array<[number, number, boolean]> = [
      [c.x - 1, c.z, g.wallV(c.x, c.z) === 0],
      [c.x + 1, c.z, g.wallV(c.x + 1, c.z) === 0],
      [c.x, c.z - 1, g.wallH(c.x, c.z) === 0],
      [c.x, c.z + 1, g.wallH(c.x, c.z + 1) === 0],
    ];
    for (const [x, z, open] of moves) {
      const k = `${x},${z}`;
      if (!open || seen.has(k) || g.column(x, z)) continue;
      seen.set(k, steps + 1);
      queue.push({ x, z });
    }
  }
  return best;
}

export function playLevel(
  levelId: number,
  seed: string,
  difficulty: Difficulty,
  maxSeconds = 900,
): BotResult {
  const world = new World(seed, getLevel(levelId), { difficulty });
  const p = world.player;
  const input = new InputState();
  input.keyDown('KeyW');
  let hides = 0;
  let hideWait = 0;
  let hideTarget: HideSpot | null = null;
  const pending: PlacedObject[] = [...world.layout.fuses];

  const nextTarget = (): PlacedObject => {
    // El fusible pendiente más cercano; después, la salida.
    let best: PlacedObject | null = null;
    let bestD = Infinity;
    for (const f of pending) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    const exit = world.layout.exit;
    if (best === null && exit === null) throw new Error('El nivel no tiene salida');
    return best ?? (exit as PlacedObject);
  };

  let target = nextTarget();
  let path: Cell[] | null = null;
  let index = 0;
  const plan = (gx: number, gz: number): void => {
    path = findPath(
      world.grid,
      { x: cellOf(p.x), z: cellOf(p.z) },
      (c) => c.x === gx && c.z === gz,
    );
    index = 1;
  };
  plan(target.gx, target.gz);
  let fleeing = false;
  let fleeTimer = 0;

  const step = (keys: { run: boolean; interact?: boolean }): void => {
    if (keys.run) input.keyDown('ShiftLeft');
    else input.keyUp('ShiftLeft');
    if (keys.interact === true) input.keyDown('KeyE');
    world.step(DT, input);
    if (keys.interact === true) input.keyUp('KeyE');
  };

  while (world.time < maxSeconds) {
    if (world.defeated) return { won: false, caught: true, time: world.time, hides };
    if (world.completed) return { won: true, caught: false, time: world.time, hides };

    const chased = world.enemies.some((e) => e.state === 'chase');
    const threat = Math.min(...world.enemies.map((e) => e.threatDistance), Infinity);

    // Escondido: espera a que la criatura se aleje o deje de buscar, y sale.
    if (world.hidden !== null) {
      hideWait += DT;
      const busy = world.enemies.some((e) => e.state === 'chase' || e.state === 'search');
      if ((!busy && threat > 12) || hideWait > 40) {
        step({ run: false, interact: true });
        hideTarget = null;
        plan(target.gx, target.gz);
      } else step({ run: false });
      continue;
    }

    const watched = world.enemies.some((e) => e.seesPlayer);
    // Perseguido y fuera de su vista: si hay un escondite a mano, corre a él.
    if (chased && hideTarget === null && !watched) {
      hideTarget = nearestHide(world, 9);
      if (hideTarget !== null) plan(hideTarget.gx, hideTarget.gz);
    }
    // Si vuelve a verlo mientras va al escondite, mejor seguir huyendo (lo vería entrar).
    if (hideTarget !== null && watched && chased) {
      hideTarget = null;
      fleeTimer = 0;
    }
    if (hideTarget !== null && !chased && threat > 15) hideTarget = null;
    if (hideTarget !== null) {
      const h = hideTarget;
      const d = Math.hypot(h.frontX - p.x, h.frontZ - p.z);
      if (d < 1.2) {
        p.yaw = yawTo(h.frontX - p.x, h.frontZ - p.z);
        world.step(DT, input);
        if (world.focusHide?.id === h.id && !world.enemies.some((e) => e.seesPlayer)) {
          step({ run: false, interact: true });
          hides++;
          hideWait = 0;
          continue;
        }
      }
      // Camino hacia el escondite, corriendo si lo persiguen.
      const cells: Cell[] = path ?? [];
      let wx = h.frontX;
      let wz = h.frontZ;
      while (index < cells.length - 1) {
        const c = cellCenter(cells[index] as Cell);
        if (Math.hypot(c.x - p.x, c.z - p.z) > 0.5) {
          wx = c.x;
          wz = c.z;
          break;
        }
        index++;
      }
      p.crouching = !chased;
      p.yaw = yawTo(wx - p.x, wz - p.z);
      step({ run: chased && world.stamina.canRun });
      continue;
    }

    // Perseguido, o con algo muy cerca: se aleja de la criatura (recalcula la huida cada segundo).
    // Si no lo persiguen, se aleja agachado y sin correr (sin hacer ruido).
    const cautious = !chased && threat < 10;
    if ((chased || cautious) && hideTarget === null) {
      fleeTimer -= DT;
      if (!fleeing || fleeTimer <= 0) {
        const c = fleeCell(world);
        if (c !== null) {
          path = findPath(
            world.grid,
            { x: cellOf(p.x), z: cellOf(p.z) },
            (k) => k.x === c.x && k.z === c.z,
          );
          index = 1;
        }
        fleeing = true;
        fleeTimer = 1;
      }
      const cells: Cell[] = path ?? [];
      const last = cells[cells.length - 1];
      let wx = p.x;
      let wz = p.z;
      while (index < cells.length) {
        const c = cellCenter(cells[index] as Cell);
        if (Math.hypot(c.x - p.x, c.z - p.z) > 0.5) {
          wx = c.x;
          wz = c.z;
          break;
        }
        index++;
      }
      if (last === undefined || index >= cells.length) fleeTimer = 0;
      p.crouching = cautious;
      p.yaw = yawTo(wx - p.x, wz - p.z);
      step({ run: chased && world.stamina.canRun });
      continue;
    }
    if (fleeing) {
      // Fin de la huida: vuelve a su objetivo.
      fleeing = false;
      plan(target.gx, target.gz);
    }

    // Postura: agachado si hay algo cerca (correr cancela el agachado).
    p.crouching = threat < 15;

    const goalX = target.x;
    const goalZ = target.z;
    const cells: Cell[] = path ?? [];
    let wx = goalX;
    let wz = goalZ;
    while (index < cells.length - 1) {
      const c = cellCenter(cells[index] as Cell);
      if (Math.hypot(c.x - p.x, c.z - p.z) > 0.5) {
        wx = c.x;
        wz = c.z;
        break;
      }
      index++;
    }
    const dGoal = Math.hypot(goalX - p.x, goalZ - p.z);
    if (dGoal < 1.1) {
      // Delante del objetivo: mirarlo y pulsar E si es lo que está en foco.
      p.yaw = yawTo(goalX - p.x, goalZ - p.z);
      input.keyUp('KeyW');
      world.step(DT, input);
      input.keyDown('KeyW');
      if (world.focus === target) {
        step({ run: false, interact: true });
        if (target.kind === 'fuse') {
          pending.splice(pending.indexOf(target), 1);
          target = nextTarget();
          plan(target.gx, target.gz);
        }
        continue;
      }
    }
    p.yaw = yawTo(wx - p.x, wz - p.z);
    step({ run: chased && world.stamina.canRun });
  }
  return { won: false, caught: false, time: world.time, hides };
}
