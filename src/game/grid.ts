/**
 * Acceso a la cuadrícula del mundo a través de los chunks: coordenadas, caché de datos
 * generados y consultas de paredes y columnas en coordenadas globales de celda.
 */
import { EDGE, WORLD } from '../data/balance';
import type { LevelDef } from '../data/levels';
import { cellIndex, generateChunk, hIndex, N, vIndex, type ChunkData } from './worldgen';

const KEY_OFFSET = 4096;

/** Clave numérica única de un chunk (sin crear cadenas). */
export function chunkKey(cx: number, cz: number): number {
  return (cx + KEY_OFFSET) * (KEY_OFFSET * 2) + (cz + KEY_OFFSET);
}

export function keyToCx(key: number): number {
  return Math.floor(key / (KEY_OFFSET * 2)) - KEY_OFFSET;
}

export function keyToCz(key: number): number {
  return (key % (KEY_OFFSET * 2)) - KEY_OFFSET;
}

/** Celda global que contiene la coordenada en metros. */
export function cellOf(meters: number): number {
  return Math.floor(meters / WORLD.cellSize);
}

/** Chunk que contiene la celda global. */
export function chunkOfCell(cell: number): number {
  return Math.floor(cell / N);
}

/** Chunk que contiene la coordenada en metros. */
export function chunkOf(meters: number): number {
  return chunkOfCell(cellOf(meters));
}

export function insideWorld(cx: number, cz: number): boolean {
  const M = WORLD.maxChunk;
  return cx >= -M && cx <= M && cz >= -M && cz <= M;
}

/** Caché LRU de chunks generados. Genera bajo demanda. */
export class ChunkStore {
  private readonly cache = new Map<number, ChunkData>();
  private lastKey = Number.NaN;
  private lastChunk: ChunkData | null = null;
  generatedCount = 0;

  constructor(
    readonly seed: number,
    readonly level: LevelDef,
    readonly capacity: number = WORLD.chunkCacheSize,
  ) {}

  get size(): number {
    return this.cache.size;
  }

  has(cx: number, cz: number): boolean {
    return this.cache.has(chunkKey(cx, cz));
  }

  /** Devuelve el chunk (cx, cz), generándolo si no está en caché. */
  get(cx: number, cz: number): ChunkData {
    const key = chunkKey(cx, cz);
    if (key === this.lastKey && this.lastChunk !== null) return this.lastChunk;
    let chunk = this.cache.get(key);
    if (chunk !== undefined) {
      // Se reinserta para marcarlo como usado recientemente.
      this.cache.delete(key);
      this.cache.set(key, chunk);
    } else {
      chunk = generateChunk(this.seed, this.level, cx, cz);
      this.generatedCount++;
      this.cache.set(key, chunk);
      if (this.cache.size > this.capacity) {
        const oldest = this.cache.keys().next().value as number;
        this.cache.delete(oldest);
      }
    }
    this.lastKey = key;
    this.lastChunk = chunk;
    return chunk;
  }
}

/** Consultas de colisión sobre la cuadrícula (implementada por WorldGrid y por los tests). */
export interface WallQuery {
  /** Tipo de borde vertical (0 abierto, 1 pared, 2 estante) en la línea x global `lineX`, fila global `gz`. */
  wallV(lineX: number, gz: number): number;
  /** Tipo de borde horizontal en la línea z global `lineZ`, columna global `gx`. */
  wallH(gx: number, lineZ: number): number;
  /** Columna en la celda global. */
  column(gx: number, gz: number): boolean;
}

export class WorldGrid implements WallQuery {
  constructor(readonly store: ChunkStore) {}

  wallV(lineX: number, gz: number): number {
    const cx = chunkOfCell(lineX);
    const cz = chunkOfCell(gz);
    // Fuera del mundo acotado todo es pared.
    if (!insideWorld(cx, cz)) return EDGE.wall;
    const chunk = this.store.get(cx, cz);
    return chunk.vWalls[vIndex(lineX - cx * N, gz - cz * N)] ?? EDGE.wall;
  }

  wallH(gx: number, lineZ: number): number {
    const cx = chunkOfCell(gx);
    const cz = chunkOfCell(lineZ);
    if (!insideWorld(cx, cz)) return EDGE.wall;
    const chunk = this.store.get(cx, cz);
    return chunk.hWalls[hIndex(gx - cx * N, lineZ - cz * N)] ?? EDGE.wall;
  }

  column(gx: number, gz: number): boolean {
    const cx = chunkOfCell(gx);
    const cz = chunkOfCell(gz);
    if (!insideWorld(cx, cz)) return false;
    const chunk = this.store.get(cx, cz);
    return chunk.columns[cellIndex(gx - cx * N, gz - cz * N)] === 1;
  }
}

/** Medio grosor de un borde según su tipo (pared fina o estante profundo). */
export function edgeHalf(type: number): number {
  return type === EDGE.shelf ? WORLD.shelfDepth / 2 : WORLD.wallThickness / 2;
}

/** Cuánto se alarga un borde por cada extremo para cerrar las esquinas (los estantes no se alargan). */
export function edgeExtend(type: number): number {
  return type === EDGE.shelf ? 0 : WORLD.wallThickness / 2;
}
