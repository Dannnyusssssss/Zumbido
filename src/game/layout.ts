/**
 * Colocación determinista de la salida y los fusibles de un nivel.
 * Función pura de (semilla, nivel): elige una dirección y una distancia en chunks a partir del hash
 * y una celda libre de ese chunk. El mundo es conexo por construcción (cada chunk está conectado por
 * dentro y cada borde tiene al menos una abertura), así que todo lo colocado es alcanzable;
 * los tests lo comprueban además con una búsqueda real.
 */
import { EDGE, OBJECTS, WORLD } from '../data/balance';
import type { IntRange, LevelDef } from '../data/levels';
import { TAU } from '../core/math';
import { hash3, Rng } from '../core/rng';
import type { Box } from './collision';
import {
  cellDegree,
  cellIndex,
  generateChunk,
  hIndex,
  N,
  vIndex,
  type ChunkData,
} from './worldgen';

export type ObjectKind = 'exit' | 'fuse';

export interface PlacedObject {
  readonly kind: ObjectKind;
  readonly index: number;
  /** Celda global. */
  readonly gx: number;
  readonly gz: number;
  /** Centro en metros. */
  readonly x: number;
  readonly z: number;
  readonly cx: number;
  readonly cz: number;
  /** Orientación de la puerta: 0 = a lo ancho en x, 1 = a lo ancho en z. */
  readonly rot: 0 | 1;
}

export interface LevelLayout {
  readonly exit: PlacedObject;
  readonly fuses: readonly PlacedObject[];
}

const LAYOUT_CHANNEL = 0x1a;

/** Chunk a una distancia (en chunks) y ángulo dados, garantizando la distancia mínima tras redondear. */
function chunkAt(angle: number, dist: number, range: IntRange): [number, number] {
  let d = dist;
  for (let i = 0; i < 40; i++) {
    const cx = Math.round(Math.cos(angle) * d);
    const cz = Math.round(Math.sin(angle) * d);
    if (Math.hypot(cx, cz) >= range.min) return [cx, cz];
    d += 0.25;
  }
  return [Math.ceil(range.min), 0];
}

/** ¿La celda sirve para colocar un objeto? Sin columna, sin estantes alrededor y con al menos dos salidas. */
function cellUsable(chunk: ChunkData, x: number, z: number): boolean {
  if (chunk.columns[cellIndex(x, z)] === 1) return false;
  const edges = [
    chunk.vWalls[vIndex(x, z)],
    chunk.vWalls[vIndex(x + 1, z)],
    chunk.hWalls[hIndex(x, z)],
    chunk.hWalls[hIndex(x, z + 1)],
  ];
  if (edges.some((e) => e === EDGE.shelf)) return false;
  return cellDegree(chunk, x, z) >= 2;
}

/** Elige una celda del chunk: preferentemente dentro de una sala, nunca repetida. */
function pickCell(chunk: ChunkData, rng: Rng, taken: ReadonlySet<string>): [number, number] {
  const inRoom: Array<[number, number]> = [];
  const others: Array<[number, number]> = [];
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const key = `${chunk.cx * N + x},${chunk.cz * N + z}`;
      if (taken.has(key) || !cellUsable(chunk, x, z)) continue;
      const room = chunk.rooms.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);
      (room ? inRoom : others).push([x, z]);
    }
  }
  const pool = inRoom.length > 0 ? inRoom : others;
  if (pool.length === 0) return [N >> 1, N >> 1];
  return pool[rng.int(0, pool.length - 1)] as [number, number];
}

function place(
  kind: ObjectKind,
  index: number,
  seed: number,
  level: LevelDef,
  cx: number,
  cz: number,
  rng: Rng,
  taken: Set<string>,
): PlacedObject {
  const chunk = generateChunk(seed, level, cx, cz);
  const [lx, lz] = pickCell(chunk, rng, taken);
  const gx = cx * N + lx;
  const gz = cz * N + lz;
  taken.add(`${gx},${gz}`);
  return {
    kind,
    index,
    gx,
    gz,
    x: (gx + 0.5) * WORLD.cellSize,
    z: (gz + 0.5) * WORLD.cellSize,
    cx,
    cz,
    rot: rng.chance(0.5) ? 0 : 1,
  };
}

/** Diseño del nivel: salida y fusibles. */
export function levelLayout(seed: number, level: LevelDef): LevelLayout {
  const rng = new Rng(hash3(seed ^ level.salt, 0, 0, LAYOUT_CHANNEL));
  const taken = new Set<string>();
  const o = level.objective;

  const exitAngle = rng.range(0, TAU);
  const [ex, ez] = chunkAt(exitAngle, rng.range(o.exitChunks.min, o.exitChunks.max), o.exitChunks);
  const exit = place('exit', 0, seed, level, ex, ez, rng, taken);

  // Fusibles repartidos alrededor del inicio, empezando lejos de la dirección de la salida.
  const fuses: PlacedObject[] = [];
  const base = exitAngle + Math.PI;
  for (let i = 0; i < o.fuses; i++) {
    const angle = base + (i * TAU) / Math.max(1, o.fuses) + rng.range(-0.35, 0.35);
    const [fx, fz] = chunkAt(angle, rng.range(o.fuseChunks.min, o.fuseChunks.max), o.fuseChunks);
    fuses.push(place('fuse', i, seed, level, fx, fz, rng, taken));
  }
  return { exit, fuses };
}

/** Caja de colisión de la puerta de salida. */
export function exitBox(exit: PlacedObject): Box {
  const hw = OBJECTS.doorWidth / 2;
  const hd = OBJECTS.doorDepth / 2;
  return exit.rot === 0
    ? { minX: exit.x - hw, maxX: exit.x + hw, minZ: exit.z - hd, maxZ: exit.z + hd }
    : { minX: exit.x - hd, maxX: exit.x + hd, minZ: exit.z - hw, maxZ: exit.z + hw };
}

/** Caja de colisión del pedestal de un fusible. */
export function fuseBox(fuse: PlacedObject): Box {
  const h = OBJECTS.pedestalSize / 2;
  return { minX: fuse.x - h, maxX: fuse.x + h, minZ: fuse.z - h, maxZ: fuse.z + h };
}
