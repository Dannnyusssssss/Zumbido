/**
 * Interacción con E: decide qué está al alcance (cerca y delante) y lo usa.
 * Recoger un fusible; usar la salida (solo si tiene todos los fusibles); entrar o salir de un escondite.
 */
import type { InputState } from '../../core/input';
import { INTERACT, PLAYER } from '../../data/balance';
import { chunkOf } from '../grid';
import { exitPoint, facingOut, type HideSpot } from '../hiding';
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

/** Entra en el escondite. Si alguna criatura lo estaba viendo, sabe dónde está. */
export function enterHide(world: World, spot: HideSpot): void {
  const p = world.player;
  world.emitNoise('hide', spot.frontX, spot.frontZ);
  let seen = false;
  for (const e of world.enemies) {
    if (e.active && e.seesPlayer) {
      e.sawHiding(spot.x, spot.z);
      seen = true;
    }
  }
  world.hidden = spot;
  // El jugador queda dentro mirando hacia fuera (un corte tras el fundido, sin giro continuo).
  p.x = spot.x;
  p.z = spot.z;
  p.prevX = p.x;
  p.prevZ = p.z;
  p.vx = 0;
  p.vz = 0;
  p.yaw = facingOut(spot);
  world.focus = null;
  world.focusHide = spot;
  world.events.push({ type: 'hide', entering: true, seen });
}

/** Sale del escondite: queda delante, sin moverse de forma continua. */
export function leaveHide(world: World): void {
  const spot = world.hidden;
  if (spot === null) return;
  const p = world.player;
  const out = exitPoint(spot, PLAYER.radius);
  p.x = out.x;
  p.z = out.z;
  p.prevX = p.x;
  p.prevZ = p.z;
  world.hidden = null;
  world.focusHide = null;
  world.emitNoise('hide', spot.frontX, spot.frontZ);
  world.events.push({ type: 'hide', entering: false, seen: false });
}

/** Escondite más cercano al alcance, o null. */
function nearestHide(world: World, maxDist: number): HideSpot | null {
  const p = world.player;
  const cx = chunkOf(p.x);
  const cz = chunkOf(p.z);
  let best: HideSpot | null = null;
  let bestD = maxDist;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const s of world.hides.spotsOf(cx + dx, cz + dz)) {
        const d = reachDistance(p.x, p.z, p.yaw, { x: s.frontX, z: s.frontZ });
        if (d >= 0 && d < bestD) {
          best = s;
          bestD = d;
        }
      }
    }
  }
  return best;
}

export function interactionSystem(world: World, input: InputState): void {
  // Dentro de un escondite solo se puede salir.
  if (world.hidden !== null) {
    world.focus = null;
    world.focusHide = world.hidden;
    if (input.consumePressed('interact')) leaveHide(world);
    return;
  }

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
  if (world.layout.exit !== null) consider(world.layout.exit);
  for (const fuse of world.layout.fuses) if (!world.fuseTaken[fuse.index]) consider(fuse);
  // Gana lo más cercano: un escondite solo si está más cerca que el objeto.
  const hide = nearestHide(world, bestD);
  world.focus = hide === null ? best : null;
  world.focusHide = hide;

  if (!input.consumePressed('interact')) return;
  if (world.focusHide !== null) {
    enterHide(world, world.focusHide);
    return;
  }
  if (world.focus === null) return;
  const target: PlacedObject = world.focus;
  if (target.kind === 'fuse') {
    world.fuseTaken[target.index] = true;
    const remaining = world.fusesRequired - world.fusesCollected;
    world.events.push({ type: 'fuse', index: target.index, remaining });
    world.emitNoise('pickup');
    if (remaining === 0) world.events.push({ type: 'exitActivated' });
    world.focus = null;
    return;
  }
  if (world.exitActive) {
    world.completed = true;
    world.events.push({ type: 'levelComplete' });
  } else {
    world.events.push({ type: 'exitLocked', missing: world.fusesRequired - world.fusesCollected });
    world.emitNoise('locked', target.x, target.z);
  }
}
