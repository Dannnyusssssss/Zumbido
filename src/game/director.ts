/**
 * Director: decide cuándo y dónde aparecen las criaturas para que el nivel sea tenso pero justo.
 * - Periodo de gracia al empezar (según la dificultad); la segunda criatura llega más tarde.
 * - Aparece solo lejos por camino, fuera de la línea de visión del jugador y separada de las demás.
 * - Tras retirarse, vuelve a aparecer pasado un tiempo.
 */
import { DIRECTOR, WORLD, type DifficultyParams } from '../data/balance';
import { TAU } from '../core/math';
import { hash3, Rng } from '../core/rng';
import type { Enemy } from './enemy';
import { chunkOfCell, insideWorld, type WallQuery } from './grid';
import type { PathDistance } from './noise';
import { lineOfSight } from './vision';

const CELL = WORLD.cellSize;
const DIRECTOR_CHANNEL = 0x5d;

export interface DirectorHost {
  readonly grid: WallQuery;
  readonly paths: PathDistance;
  readonly tuning: DifficultyParams;
  readonly player: { readonly x: number; readonly z: number };
}

/** ¿Es (x, z) un buen punto de aparición? Lejos por camino, sin línea de visión y lejos de las demás. */
export function spawnPointOk(
  host: DirectorHost,
  enemies: readonly Enemy[],
  x: number,
  z: number,
): boolean {
  const gx = Math.floor(x / CELL);
  const gz = Math.floor(z / CELL);
  if (!insideWorld(chunkOfCell(gx), chunkOfCell(gz)) || host.grid.column(gx, gz)) return false;
  const p = host.player;
  const straight = Math.hypot(x - p.x, z - p.z);
  if (straight < DIRECTOR.spawnDistance.min || straight > DIRECTOR.spawnDistance.max) return false;
  // Nunca a la vista: con pared en medio.
  if (lineOfSight(host.grid, p.x, p.z, x, z)) return false;
  // Y lejos por los pasillos (más cerca que el mínimo por camino = demasiado cerca).
  if (Number.isFinite(host.paths.measure(host.grid, p.x, p.z, x, z, DIRECTOR.spawnDistance.min))) {
    return false;
  }
  for (const e of enemies) {
    if (e.active && Math.hypot(e.x - x, e.z - z) < DIRECTOR.minSeparation) return false;
  }
  return true;
}

export class Director {
  /** Segundos hasta que cada criatura (dormida) intente aparecer. */
  readonly timers: number[];
  private readonly wasActive: boolean[];
  private readonly rng: Rng;

  constructor(seed: number, count: number, tuning: DifficultyParams) {
    this.rng = new Rng(hash3(seed, count, 0, DIRECTOR_CHANNEL));
    this.timers = [];
    this.wasActive = [];
    for (let i = 0; i < count; i++) {
      this.timers.push(tuning.graceSeconds + i * tuning.secondCreatureDelay);
      this.wasActive.push(false);
    }
  }

  update(host: DirectorHost, enemies: readonly Enemy[], dt: number): void {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i] as Enemy;
      if (e.active) {
        this.wasActive[i] = true;
        continue;
      }
      // Acaba de retirarse: programa su vuelta.
      if (this.wasActive[i] === true) {
        this.wasActive[i] = false;
        const r = host.tuning.respawnSeconds;
        this.timers[i] = this.rng.range(r.min, r.max);
      }
      const left = (this.timers[i] as number) - dt;
      this.timers[i] = left;
      if (left > 0) continue;
      // Se marca como activa al aparecer, para notar su retirada aunque ocurra muy pronto.
      if (this.trySpawn(host, enemies, e)) this.wasActive[i] = true;
    }
  }

  /** Prueba unos pocos puntos al azar alrededor del jugador; si ninguno sirve, lo reintenta el paso siguiente. */
  private trySpawn(host: DirectorHost, enemies: readonly Enemy[], e: Enemy): boolean {
    const p = host.player;
    const d = DIRECTOR.spawnDistance;
    for (let k = 0; k < DIRECTOR.spawnAttemptsPerStep; k++) {
      const a = this.rng.range(0, TAU);
      const r = this.rng.range(d.min, d.max);
      const x = (Math.floor((p.x + Math.cos(a) * r) / CELL) + 0.5) * CELL;
      const z = (Math.floor((p.z + Math.sin(a) * r) / CELL) + 0.5) * CELL;
      if (!spawnPointOk(host, enemies, x, z)) continue;
      // Mira más o menos hacia el jugador (no lo ve: hay paredes en medio).
      e.spawn(x, z, Math.atan2(-(p.x - x), -(p.z - z)));
      return true;
    }
    return false;
  }
}
