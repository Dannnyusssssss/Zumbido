/**
 * Partida: modo (completa o nivel suelto), semilla, nivel actual y tiempos.
 * Máquina de estados pura; la capa de arranque decide qué pantalla mostrar con su resultado.
 */
import { LEVEL_COUNT } from '../data/levels';

/** Partida completa, nivel suelto o deriva (mundo sin fin, sin niveles que completar). */
export type RunMode = 'full' | 'single' | 'drift';

export interface RunState {
  readonly mode: RunMode;
  readonly seed: string;
  levelId: number;
  /** Tiempos de los niveles completados en esta partida, en orden. */
  readonly times: number[];
}

export interface LevelResult {
  readonly levelId: number;
  readonly time: number;
  /** Siguiente nivel disponible para "Continuar" (null tras el último). */
  readonly nextLevelId: number | null;
  /** Verdadero si terminó una partida completa (los 3 niveles seguidos). */
  readonly runFinished: boolean;
  /** Tiempo total de la partida completa, si terminó. */
  readonly runTotal: number | null;
}

/** Empieza una partida. La completa y la deriva empiezan siempre en el nivel 1 (la deriva, en su zona). */
export function startRun(mode: RunMode, levelId: number, seed: string): RunState {
  const start = mode === 'single' ? Math.min(Math.max(1, Math.floor(levelId)), LEVEL_COUNT) : 1;
  return { mode, seed, levelId: start, times: [] };
}

/** Registra que se completó el nivel actual con el tiempo dado. */
export function completeLevel(run: RunState, time: number): LevelResult {
  run.times.push(time);
  const next = run.levelId < LEVEL_COUNT ? run.levelId + 1 : null;
  const finished = run.mode === 'full' && next === null && run.times.length === LEVEL_COUNT;
  return {
    levelId: run.levelId,
    time,
    nextLevelId: next,
    runFinished: finished,
    runTotal: finished ? run.times.reduce((a, b) => a + b, 0) : null,
  };
}

/** Pasa al siguiente nivel. Devuelve false si no hay más (o si es una deriva). */
export function advanceRun(run: RunState): boolean {
  if (run.mode === 'drift' || run.levelId >= LEVEL_COUNT) return false;
  run.levelId += 1;
  return true;
}

/**
 * Reintentar el nivel: misma semilla y mismo nivel. En una partida completa, el tiempo del nivel
 * repetido sustituye al anterior (los tiempos ya registrados de niveles previos se conservan).
 */
export function retryLevel(run: RunState): void {
  const completedBefore = run.levelId - (run.mode === 'full' ? 1 : run.levelId);
  run.times.length = Math.max(0, Math.min(run.times.length, completedBefore));
}
