/**
 * Ruido y distancia de camino sobre la cuadrícula.
 * El ruido no viaja en línea recta: se mide la distancia por los pasillos (búsqueda en anchura por
 * celdas), así que las paredes y los estantes lo bloquean y un sonido al otro lado de una pared
 * puede no oírse aunque esté cerca en línea recta. Todo es puro y sin crear objetos por consulta.
 */
import { NOISE, WORLD } from '../data/balance';
import type { WallQuery } from './grid';

const CELL = WORLD.cellSize;

export type NoiseKind = 'crouch' | 'walk' | 'run' | 'chalk' | 'pickup' | 'locked' | 'hide';

export interface NoiseEvent {
  kind: NoiseKind;
  x: number;
  z: number;
  /** Alcance en metros de camino. */
  radius: number;
}

/** Nivel de ruido que muestra el HUD (con texto y barras, no solo color). */
export type NoiseLevel = 'silent' | 'low' | 'high';

export function noiseRadius(kind: NoiseKind): number {
  return NOISE.radius[kind];
}

export function noiseLevelOf(radius: number): NoiseLevel {
  if (radius <= 0) return 'silent';
  return radius <= NOISE.lowMax ? 'low' : 'high';
}

/**
 * Distancia de camino acotada entre dos puntos. Busca en una ventana de (2R+1)² celdas alrededor
 * del origen con arreglos preasignados; una marca por consulta evita limpiar los arreglos.
 */
export class PathDistance {
  private readonly side: number;
  private readonly stamp: Uint32Array;
  private readonly steps: Uint16Array;
  private readonly queue: Int32Array;
  private current = 0;
  /** Celdas visitadas en la última consulta (para depuración y tests de coste). */
  lastVisited = 0;

  constructor(readonly maxCells: number = NOISE.maxSearchCells) {
    this.side = maxCells * 2 + 1;
    const n = this.side * this.side;
    this.stamp = new Uint32Array(n);
    this.steps = new Uint16Array(n);
    this.queue = new Int32Array(n);
  }

  /**
   * Metros de camino de (ax, az) a (bx, bz), o Infinity si no se llega dentro de `maxMeters`.
   * En la misma celda es la distancia en línea recta; si no, (pasos - 1) × celda, sin bajar nunca
   * de la línea recta (una estimación algo corta: el sonido se oye un poco antes, nunca después).
   */
  measure(
    grid: WallQuery,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    maxMeters: number,
  ): number {
    const straight = Math.hypot(bx - ax, bz - az);
    if (straight > maxMeters) return Infinity;
    const sx = Math.floor(ax / CELL);
    const sz = Math.floor(az / CELL);
    const tx = Math.floor(bx / CELL);
    const tz = Math.floor(bz / CELL);
    if (sx === tx && sz === tz) return straight;
    const steps = this.cellSteps(grid, sx, sz, tx, tz, Math.floor(maxMeters / CELL) + 1);
    if (steps < 0) return Infinity;
    const d = Math.max(straight, (steps - 1) * CELL);
    return d <= maxMeters ? d : Infinity;
  }

  /** Pasos entre celdas (4 vecinos, solo por bordes abiertos) o -1 si supera `maxSteps`. */
  cellSteps(
    grid: WallQuery,
    sx: number,
    sz: number,
    tx: number,
    tz: number,
    maxSteps: number,
  ): number {
    const R = this.maxCells;
    const limit = Math.min(maxSteps, R);
    if (Math.abs(tx - sx) > limit || Math.abs(tz - sz) > limit) return -1;
    this.current = (this.current + 1) >>> 0;
    if (this.current === 0) {
      this.stamp.fill(0);
      this.current = 1;
    }
    const mark = this.current;
    const side = this.side;
    const idx = (x: number, z: number): number => (z - sz + R) * side + (x - sx + R);
    let head = 0;
    let tail = 0;
    const start = idx(sx, sz);
    this.stamp[start] = mark;
    this.steps[start] = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const i = this.queue[head++] as number;
      const lx = (i % side) - R + sx;
      const lz = Math.floor(i / side) - R + sz;
      const s = this.steps[i] as number;
      if (lx === tx && lz === tz) {
        this.lastVisited = tail;
        return s;
      }
      if (s >= limit) continue;
      // Vecinos: oeste, este, norte y sur, solo si el borde compartido está abierto.
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? lx - 1 : k === 1 ? lx + 1 : lx;
        const nz = k === 2 ? lz - 1 : k === 3 ? lz + 1 : lz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        const open =
          k === 0
            ? grid.wallV(lx, lz) === 0
            : k === 1
              ? grid.wallV(lx + 1, lz) === 0
              : k === 2
                ? grid.wallH(lx, lz) === 0
                : grid.wallH(lx, lz + 1) === 0;
        if (!open) continue;
        const j = idx(nx, nz);
        if (this.stamp[j] === mark) continue;
        this.stamp[j] = mark;
        this.steps[j] = s + 1;
        this.queue[tail++] = j;
      }
    }
    this.lastVisited = tail;
    return -1;
  }
}

/**
 * Fuerza (0..1) con la que se oye un ruido en (lx, lz): 1 en el origen, 0 al borde de su alcance
 * (medido por camino). `hearing` multiplica el alcance (oído de la criatura según la dificultad).
 */
export function hearStrength(
  paths: PathDistance,
  grid: WallQuery,
  noise: NoiseEvent,
  lx: number,
  lz: number,
  hearing: number,
): number {
  const reach = noise.radius * hearing;
  if (reach <= 0) return 0;
  const d = paths.measure(grid, noise.x, noise.z, lx, lz, reach);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, 1 - d / reach);
}

/** Distancia entre pasos (metros) según la postura: cada paso es un evento de ruido. */
export function stepLength(kind: 'crouch' | 'walk' | 'run'): number {
  return NOISE.stepMeters[kind];
}
