/**
 * Dirección aproximada de un punto respecto a la mirada del jugador, en 8 sectores.
 * La usan los subtítulos de sonido y la ayuda de dirección (texto y flecha, nunca solo color).
 */
import { wrapAngle } from '../core/math';

export type Sector = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Ángulo del punto respecto a la mirada: 0 delante, positivo a la izquierda (radianes). */
export function relativeAngle(px: number, pz: number, yaw: number, tx: number, tz: number): number {
  const world = Math.atan2(-(tx - px), -(tz - pz));
  return wrapAngle(world - yaw);
}

/** Sector 0..7 empezando delante y girando hacia la izquierda. */
export function sectorOf(angle: number): Sector {
  const s = Math.round(wrapAngle(angle) / (Math.PI / 4));
  return (((s % 8) + 8) % 8) as Sector;
}

/** Flechas por sector (delante, delante-izquierda, izquierda, ...). */
export const SECTOR_ARROWS: readonly string[] = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
