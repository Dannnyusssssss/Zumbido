/**
 * Colisión de un círculo (el jugador) contra las paredes finas y las columnas de la cuadrícula.
 * Cada pared es una caja delgada alargada un poco por los extremos para cerrar las esquinas.
 * Se empuja el círculo fuera de cada caja; así desliza por las paredes en vez de frenarse.
 */
import { WORLD } from '../data/balance';
import type { WallQuery } from './grid';

export interface Vec2 {
  x: number;
  z: number;
}

const CELL = WORLD.cellSize;
const HALF_WALL = WORLD.wallThickness / 2;
const HALF_COLUMN = WORLD.columnSize / 2;
const MAX_SUBSTEP = 0.1;
const MAX_ITERATIONS = 4;

/** Empuja `pos` fuera de la caja si el círculo la toca. Devuelve true si hubo empuje. */
function pushOutOfBox(
  pos: Vec2,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const px = pos.x < minX ? minX : pos.x > maxX ? maxX : pos.x;
  const pz = pos.z < minZ ? minZ : pos.z > maxZ ? maxZ : pos.z;
  const dx = pos.x - px;
  const dz = pos.z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const push = (radius - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
    return true;
  }
  // El centro quedó dentro de la caja: se sale por la cara más cercana.
  const left = pos.x - minX;
  const right = maxX - pos.x;
  const top = pos.z - minZ;
  const bottom = maxZ - pos.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = minX - radius;
  else if (m === right) pos.x = maxX + radius;
  else if (m === top) pos.z = minZ - radius;
  else pos.z = maxZ + radius;
  return true;
}

/** Resuelve las superposiciones del círculo con la cuadrícula cercana. */
export function resolveCircle(grid: WallQuery, pos: Vec2, radius: number): void {
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let pushed = false;
    const gx = Math.floor(pos.x / CELL);
    const gz = Math.floor(pos.z / CELL);
    // Paredes verticales: líneas gx y gx+1, filas vecinas (sus extremos alargados también cuentan).
    for (let lx = gx; lx <= gx + 1; lx++) {
      for (let rz = gz - 1; rz <= gz + 1; rz++) {
        if (!grid.wallV(lx, rz)) continue;
        const x = lx * CELL;
        if (
          pushOutOfBox(
            pos,
            radius,
            x - HALF_WALL,
            x + HALF_WALL,
            rz * CELL - HALF_WALL,
            (rz + 1) * CELL + HALF_WALL,
          )
        ) {
          pushed = true;
        }
      }
    }
    // Paredes horizontales: líneas gz y gz+1, columnas vecinas.
    for (let lz = gz; lz <= gz + 1; lz++) {
      for (let cxCell = gx - 1; cxCell <= gx + 1; cxCell++) {
        if (!grid.wallH(cxCell, lz)) continue;
        const z = lz * CELL;
        if (
          pushOutOfBox(
            pos,
            radius,
            cxCell * CELL - HALF_WALL,
            (cxCell + 1) * CELL + HALF_WALL,
            z - HALF_WALL,
            z + HALF_WALL,
          )
        ) {
          pushed = true;
        }
      }
    }
    // Columna en el centro de la celda actual.
    if (grid.column(gx, gz)) {
      const cx = (gx + 0.5) * CELL;
      const cz = (gz + 0.5) * CELL;
      if (
        pushOutOfBox(
          pos,
          radius,
          cx - HALF_COLUMN,
          cx + HALF_COLUMN,
          cz - HALF_COLUMN,
          cz + HALF_COLUMN,
        )
      ) {
        pushed = true;
      }
    }
    if (!pushed) return;
  }
}

/** Mueve el círculo (dx, dz) en sub-pasos cortos para no atravesar paredes y resuelve la colisión. */
export function moveCircle(
  grid: WallQuery,
  pos: Vec2,
  dx: number,
  dz: number,
  radius: number,
): void {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.z += sz;
    resolveCircle(grid, pos, radius);
  }
}
