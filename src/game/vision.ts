/**
 * Visión de la criatura: cono, alcance según la luz y la postura, y línea de visión sobre la
 * cuadrícula (el rayo tiene en cuenta el grosor de paredes y estantes y las columnas).
 */
import { ENEMY, WORLD } from '../data/balance';
import { castRay, type RayHit } from './chalk';
import type { LightQuery, WallQuery } from './grid';

const CELL = WORLD.cellSize;
const tmpHit: RayHit = { dist: 0, x: 0, z: 0, nx: 0, nz: 0 };
const HALF_FOV_COS = Math.cos(((ENEMY.fovDegrees / 2) * Math.PI) / 180);

/** ¿Hay línea de visión directa entre dos puntos? (sin pared, estante ni columna en medio). */
export function lineOfSight(
  grid: WallQuery,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return !castRay(grid, ax, az, dx / d, dz / d, d, tmpHit);
}

/** Alcance de la vista hacia un punto: menor en la oscuridad y si el jugador va agachado. */
export function sightRange(
  light: LightQuery,
  px: number,
  pz: number,
  crouching: boolean,
  multiplier: number,
): number {
  const lit = light.lit(Math.floor(px / CELL), Math.floor(pz / CELL));
  const base = lit ? ENEMY.sightLit : ENEMY.sightDark;
  return base * (crouching ? ENEMY.crouchSightFactor : 1) * multiplier;
}

/**
 * ¿La criatura en (ex, ez) mirando a `yaw` ve el punto (px, pz)?
 * Dentro del alcance y del cono, o muy cerca (la nota aunque no la mire), y siempre sin pared en medio.
 */
export function canSee(
  grid: WallQuery,
  light: LightQuery,
  ex: number,
  ez: number,
  yaw: number,
  px: number,
  pz: number,
  crouching: boolean,
  multiplier: number,
): boolean {
  const dx = px - ex;
  const dz = pz - ez;
  const d = Math.hypot(dx, dz);
  if (d > sightRange(light, px, pz, crouching, multiplier)) return false;
  if (d > ENEMY.senseDistance) {
    // forward = (-sin yaw, -cos yaw); producto escalar con la dirección al punto.
    const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
    if (facing < HALF_FOV_COS) return false;
  }
  return lineOfSight(grid, ex, ez, px, pz);
}
