/** Progreso guardado: niveles desbloqueados y mejores tiempos. Lógica pura con validación. */
import { LEVEL_COUNT } from '../data/levels';

export interface Progress {
  /** Nivel más alto desbloqueado (1..LEVEL_COUNT). */
  unlocked: number;
  /** Mejor tiempo por nivel en segundos (índice 0 = nivel 1). */
  bestTimes: Array<number | null>;
  /** Mejor tiempo de una partida completa (los 3 niveles seguidos). */
  bestRun: number | null;
}

/** Tiempo máximo aceptado al leer un guardado (24 h): valores mayores se consideran corruptos. */
const MAX_TIME = 24 * 3600;

export function defaultProgress(): Progress {
  return { unlocked: 1, bestTimes: Array.from({ length: LEVEL_COUNT }, () => null), bestRun: null };
}

function readTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_TIME ? v : null;
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
  };
}

/** Registra un nivel completado. Devuelve true si es un nuevo mejor tiempo del nivel. */
export function recordLevel(p: Progress, levelId: number, time: number): boolean {
  if (levelId < 1 || levelId > LEVEL_COUNT || !(time > 0)) return false;
  p.unlocked = Math.max(p.unlocked, Math.min(levelId + 1, LEVEL_COUNT));
  const prev = p.bestTimes[levelId - 1] ?? null;
  if (prev === null || time < prev) {
    p.bestTimes[levelId - 1] = time;
    return true;
  }
  return false;
}

/** Registra una partida completa. Devuelve true si es la mejor. */
export function recordRun(p: Progress, total: number): boolean {
  if (!(total > 0)) return false;
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
