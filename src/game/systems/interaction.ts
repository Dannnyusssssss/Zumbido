/**
 * Interacción con E: decide qué objeto está al alcance (cerca y delante) y lo usa.
 * Recoger un fusible; usar la salida (solo si tiene todos los fusibles).
 */
import type { InputState } from '../../core/input';
import { INTERACT } from '../../data/balance';
import type { PlacedObject } from '../layout';
import type { World } from '../world';

/** ¿El objeto está al alcance y más o menos delante del jugador? Devuelve la distancia o -1. */
export function reachDistance(
  px: number,
  pz: number,
  yaw: number,
  obj: { x: number; z: number },
): number {
  const dx = obj.x - px;
  const dz = obj.z - pz;
  const d = Math.hypot(dx, dz);
  if (d > INTERACT.range) return -1;
  if (d < 0.5) return d;
  // Producto escalar entre la mirada y la dirección al objeto.
  const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
  return facing >= INTERACT.minFacing ? d : -1;
}

export function interactionSystem(world: World, input: InputState): void {
  const p = world.player;
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  const consider = (obj: PlacedObject): void => {
    const d = reachDistance(p.x, p.z, p.yaw, obj);
    if (d >= 0 && d < bestD) {
      best = obj;
      bestD = d;
    }
  };
  consider(world.layout.exit);
  for (const fuse of world.layout.fuses) if (!world.fuseTaken[fuse.index]) consider(fuse);
  world.focus = best;

  if (!input.consumePressed('interact') || world.focus === null) return;
  const target: PlacedObject = world.focus;
  if (target.kind === 'fuse') {
    world.fuseTaken[target.index] = true;
    const remaining = world.fusesRequired - world.fusesCollected;
    world.events.push({ type: 'fuse', index: target.index, remaining });
    if (remaining === 0) world.events.push({ type: 'exitActivated' });
    world.focus = null;
    return;
  }
  if (world.exitActive) {
    world.completed = true;
    world.events.push({ type: 'levelComplete' });
  } else {
    world.events.push({ type: 'exitLocked', missing: world.fusesRequired - world.fusesCollected });
  }
}
