/**
 * Modo Deriva: mundo sin fin y sin salida. Lógica pura de la puntuación (terreno nuevo explorado y
 * tiempo sobrevivido) y de la atención de la criatura, que crece con el tiempo hasta un tope.
 */
import { DIFFICULTY, DRIFT, WORLD, type Difficulty, type DifficultyParams } from '../data/balance';
import { clamp } from '../core/math';
import { cellKey } from './nav';

/** Atención de la criatura (0 al empezar, 1 en el tope) tras `seconds` de partida. */
export function attention(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return clamp(seconds / DRIFT.attentionRampSeconds, 0, 1);
}

/**
 * Parámetros base de la criatura en Deriva: los de la dificultad elegida, con la segunda criatura
 * programada para `DRIFT.secondCreatureSeconds` desde el inicio.
 */
export function driftBaseTuning(difficulty: Difficulty): DifficultyParams {
  const base = DIFFICULTY[difficulty];
  return {
    ...base,
    secondCreatureDelay: Math.max(0, DRIFT.secondCreatureSeconds - base.graceSeconds),
  };
}

/**
 * Parámetros de la criatura con la atención de `seconds`: oye y ve más, vaga más cerca del jugador y
 * vuelve antes tras retirarse. La velocidad de persecución no cambia: correr siempre sirve para escapar.
 */
export function driftTuning(base: DifficultyParams, seconds: number): DifficultyParams {
  const a = attention(seconds);
  const respawn = 1 - (1 - DRIFT.minRespawnFactor) * a;
  return {
    ...base,
    hearing: base.hearing * (1 + (DRIFT.maxHearingBoost - 1) * a),
    sight: base.sight * (1 + (DRIFT.maxSightBoost - 1) * a),
    wanderBias: Math.min(DRIFT.wanderBiasCap, base.wanderBias + DRIFT.wanderBiasBoost * a),
    respawnSeconds: {
      min: base.respawnSeconds.min * respawn,
      max: base.respawnSeconds.max * respawn,
    },
  };
}

/** Resultado de una partida de Deriva. */
export interface DriftResult {
  /** Metros de terreno nuevo explorado. */
  readonly meters: number;
  /** Segundos sobrevividos. */
  readonly time: number;
  readonly score: number;
}

/** Puntuación de una distancia y un tiempo (entera, nunca negativa). */
export function driftScore(meters: number, time: number): number {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  return Math.floor(m * DRIFT.pointsPerMeter + t * DRIFT.pointsPerSecond);
}

/**
 * Terreno explorado: cuenta las celdas distintas que pisa el jugador. Volver a una celda ya pisada
 * no suma, así que dar vueltas en el mismo sitio no da puntos. La celda de inicio no cuenta.
 */
export class DriftTracker {
  private readonly visited = new Set<number>();
  private lastKey = Number.NaN;

  constructor(startGx: number, startGz: number) {
    this.visit(startGx, startGz);
  }

  /** Marca la celda; devuelve true si era nueva. */
  visit(gx: number, gz: number): boolean {
    const key = cellKey(gx, gz);
    // Lo normal es seguir en la misma celda: se evita consultar el conjunto.
    if (key === this.lastKey) return false;
    this.lastKey = key;
    if (this.visited.has(key)) return false;
    this.visited.add(key);
    return true;
  }

  get cells(): number {
    return Math.max(0, this.visited.size - 1);
  }

  get meters(): number {
    return this.cells * WORLD.cellSize;
  }

  result(time: number): DriftResult {
    const meters = this.meters;
    return { meters, time, score: driftScore(meters, time) };
  }
}
