/** Progreso guardado: niveles desbloqueados, mejores tiempos y mejor deriva. Lógica pura con validación. */
import { LEVEL_COUNT } from '../data/levels';
import { driftScore, type DriftResult } from './drift';

/** Mejor partida del modo Deriva. */
export interface DriftBest {
  readonly score: number;
  readonly meters: number;
  readonly time: number;
}

export interface Progress {
  /** Nivel más alto desbloqueado (1..LEVEL_COUNT). */
  unlocked: number;
  /** Mejor tiempo por nivel en segundos (índice 0 = nivel 1). */
  bestTimes: Array<number | null>;
  /** Mejor tiempo de una partida completa (los 3 niveles seguidos). */
  bestRun: number | null;
  /** Mejor partida de Deriva (null = sin marca). */
  drift: DriftBest | null;
}

/** Tiempo máximo aceptado al leer un guardado (24 h): valores mayores se consideran corruptos. */
const MAX_TIME = 24 * 3600;
/** Distancia máxima aceptada (el mundo acotado mide unos 96 km de lado): más es corrupto. */
const MAX_METERS = 1_000_000;

export function defaultProgress(): Progress {
  return {
    unlocked: 1,
    bestTimes: Array.from({ length: LEVEL_COUNT }, () => null),
    bestRun: null,
    drift: null,
  };
}

function readTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_TIME ? v : null;
}

/**
 * Valida una mejor deriva guardada. La puntuación se recalcula a partir de la distancia y el tiempo,
 * así un valor editado a mano no puede inflarla.
 */
function readDrift(v: unknown): DriftBest | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const meters = r.meters;
  const time = r.time;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0 || meters > MAX_METERS)
    return null;
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > MAX_TIME)
    return null;
  return { meters, time, score: driftScore(meters, time) };
}

/** Valida un progreso desconocido campo por campo. */
export function sanitizeProgress(raw: unknown): Progress {
  const d = defaultProgress();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  const unlocked =
    typeof r.unlocked === 'number' &&
    Number.isInteger(r.unlocked) &&
    r.unlocked >= 1 &&
    r.unlocked <= LEVEL_COUNT
      ? r.unlocked
      : 1;
  const times = Array.isArray(r.bestTimes) ? r.bestTimes : [];
  return {
    unlocked,
    bestTimes: d.bestTimes.map((_, i) => readTime(times[i])),
    bestRun: readTime(r.bestRun),
    // Los guardados de los hitos anteriores no la tienen: sin marca.
    drift: readDrift(r.drift),
  };
}

/*
 * `assisted`: partida con ayudas de depuración (por ejemplo sin criaturas). No guarda tiempos,
 * marcas ni desbloqueos, para que los récords solo reflejen partidas normales.
 */

/** Registra una partida de Deriva. Devuelve true si es la mejor puntuación. */
export function recordDrift(p: Progress, result: DriftResult, assisted = false): boolean {
  if (assisted || !(result.time > 0)) return false;
  if (p.drift === null || result.score > p.drift.score) {
    p.drift = { score: result.score, meters: result.meters, time: result.time };
    return true;
  }
  return false;
}

/** Registra un nivel completado. Devuelve true si es un nuevo mejor tiempo del nivel. */
export function recordLevel(p: Progress, levelId: number, time: number, assisted = false): boolean {
  if (assisted || levelId < 1 || levelId > LEVEL_COUNT || !(time > 0)) return false;
  p.unlocked = Math.max(p.unlocked, Math.min(levelId + 1, LEVEL_COUNT));
  const prev = p.bestTimes[levelId - 1] ?? null;
  if (prev === null || time < prev) {
    p.bestTimes[levelId - 1] = time;
    return true;
  }
  return false;
}

/** Registra una partida completa. Devuelve true si es la mejor. */
export function recordRun(p: Progress, total: number, assisted = false): boolean {
  if (assisted || !(total > 0)) return false;
  if (p.bestRun === null || total < p.bestRun) {
    p.bestRun = total;
    return true;
  }
  return false;
}

/** Formato mm:ss,d para mostrar tiempos. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const tenth = Math.floor((rest - whole) * 10);
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')},${tenth}`;
}
