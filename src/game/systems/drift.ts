/**
 * Sistema del modo Deriva: anota el terreno nuevo que pisa el jugador y, una vez por segundo,
 * actualiza la atención de la criatura según el tiempo sobrevivido. En el modo Salida no hace nada.
 */
import { cellOf } from '../grid';
import { driftTuning } from '../drift';
import type { World } from '../world';

/** Cada cuánto se recalculan los parámetros de la criatura (segundos de juego). */
const TUNING_PERIOD = 1;

export function driftSystem(world: World, _input: unknown, dt: number): void {
  const drift = world.drift;
  if (drift === null) return;
  const p = world.player;
  drift.tracker.visit(cellOf(p.x), cellOf(p.z));
  drift.tuningTimer -= dt;
  if (drift.tuningTimer > 0) return;
  drift.tuningTimer = TUNING_PERIOD;
  world.tuning = driftTuning(drift.base, world.time);
}
