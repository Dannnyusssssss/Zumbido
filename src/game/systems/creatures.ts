/**
 * Sistemas de las criaturas: el director (aparición), su lógica (sentidos, estados y movimiento),
 * la captura (derrota) y las señales de amenaza que usa la presentación (distancia por camino
 * y línea de visión, recalculadas con un periodo fijo para no repetir la búsqueda cada paso).
 */
import { THREAT } from '../../data/balance';
import { lineOfSight } from '../vision';
import type { World } from '../world';

export function directorSystem(world: World, _input: unknown, dt: number): void {
  if (world.enemies.length === 0) return;
  world.director.update(world, world.enemies, dt);
}

export function enemySystem(world: World, _input: unknown, dt: number): void {
  for (const e of world.enemies) e.update(world, dt);
}

export function captureSystem(world: World): void {
  for (const e of world.enemies) {
    if (!e.caught) continue;
    world.defeated = true;
    world.events.push({ type: 'caught' });
    return;
  }
}

export function threatSystem(world: World, _input: unknown, dt: number): void {
  world.threatTimer -= dt;
  if (world.threatTimer > 0) return;
  world.threatTimer = THREAT.updateSeconds;
  const p = world.player;
  for (const e of world.enemies) {
    if (!e.active) {
      e.threatDistance = Infinity;
      e.threatLos = false;
      continue;
    }
    e.threatDistance = world.paths.measure(world.grid, p.x, p.z, e.x, e.z, THREAT.range);
    e.threatLos =
      Math.hypot(e.x - p.x, e.z - p.z) <= THREAT.range &&
      lineOfSight(world.grid, p.x, p.z, e.x, e.z);
  }
}
