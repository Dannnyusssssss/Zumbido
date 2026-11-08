/**
 * Zonas del mundo: qué nivel (oficina, cochera, almacén) corresponde a cada chunk.
 * En el modo Salida todo el mundo es de un solo nivel. En el modo Deriva el mundo se divide en
 * zonas cuadradas de varios chunks y el nivel de cada zona sale del hash de la semilla.
 * Todo es puro y determinista.
 */
import { hash3 } from '../core/rng';
import { DRIFT } from '../data/balance';
import { LEVELS, type LevelDef } from '../data/levels';

/** Nivel de cada chunk. */
export type LevelMap = (cx: number, cz: number) => LevelDef;

const REGION_CHANNEL = 0x2e;

/** Mapa de un solo nivel (modo Salida). */
export function constantLevelMap(level: LevelDef): LevelMap {
  return () => level;
}

/** Zona que contiene el chunk (en una dimensión). */
export function regionOf(chunk: number): number {
  return Math.floor(chunk / DRIFT.regionChunks);
}

/** Índice (0..LEVELS.length-1) del nivel de la zona (rx, rz). La zona de inicio es siempre el primero. */
export function regionLevelIndex(seed: number, rx: number, rz: number): number {
  if (rx === 0 && rz === 0) return 0;
  return hash3(seed, rx, rz, REGION_CHANNEL) % LEVELS.length;
}

/** Mapa del modo Deriva: el nivel cambia por zonas. */
export function driftLevelMap(seed: number): LevelMap {
  return (cx, cz) => LEVELS[regionLevelIndex(seed, regionOf(cx), regionOf(cz))] as LevelDef;
}

/**
 * Nivel que decide las aberturas de un borde compartido por dos chunks. Debe ser el mismo visto desde
 * los dos lados: se usa el de número menor. Si los dos chunks son del mismo nivel, es ese nivel
 * (así los mundos de un solo nivel no cambian).
 */
export function borderLevel(a: LevelDef, b: LevelDef): LevelDef {
  return a.id <= b.id ? a : b;
}
