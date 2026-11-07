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

/** Lo mínimo de una criatura que necesitan las señales de cercanía. */
export interface ThreatSource {
  readonly active: boolean;
  readonly x: number;
  readonly z: number;
  /** Metros por camino hasta el jugador (Infinity si está lejos o no se llega). */
  readonly threatDistance: number;
}

/** Índice de la criatura más cercana por camino, o -1 si ninguna está al alcance de las señales. */
export function nearestThreat(sources: readonly ThreatSource[]): number {
  let best = -1;
  let bestD = Infinity;
  sources.forEach((s, i) => {
    if (s.active && s.threatDistance < bestD) {
      bestD = s.threatDistance;
      best = i;
    }
  });
  return best;
}

/** Cercanía 0..1 (1 encima, 0 a `range` metros o más). */
export function closeness(distance: number, range: number): number {
  if (!Number.isFinite(distance) || range <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - distance / range));
}
