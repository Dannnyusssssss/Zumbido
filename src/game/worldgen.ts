/**
 * Generación procedural de chunks. Función pura: misma semilla, nivel y coordenadas
 * dan siempre el mismo chunk, sin depender de los chunks vecinos ni del orden de generación.
 *
 * Modelo: cuadrícula de N×N celdas con paredes finas en los bordes de las celdas.
 * - vWalls[z * (N + 1) + x]: pared vertical en la línea x (0..N) de la fila z.
 * - hWalls[z * N + x]: pared horizontal en la línea z (0..N) de la columna x.
 * Los bordes del chunk (x = 0, x = N, z = 0, z = N) se guardan en los dos chunks vecinos
 * y coinciden porque se calculan con el hash del borde compartido.
 */
import { WORLD } from '../data/balance';
import type { GenParams, LevelDef } from '../data/levels';
import { hash3, hashToUnit, Rng } from '../core/rng';

export const N = WORLD.chunkCells;

export interface RoomRect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly large: boolean;
}

export interface ChunkData {
  readonly cx: number;
  readonly cz: number;
  readonly vWalls: Uint8Array;
  readonly hWalls: Uint8Array;
  readonly columns: Uint8Array;
  readonly panels: Uint8Array;
  readonly rooms: readonly RoomRect[];
}

/** Sala de inicio fija del chunk (0, 0), en celdas locales. */
export const START_ROOM: RoomRect = { x: 6, z: 6, w: 4, h: 4, large: false };

/** Punto de aparición en metros (centro de la sala de inicio). */
export const SPAWN_POINT = {
  x: (START_ROOM.x + START_ROOM.w / 2) * WORLD.cellSize,
  z: (START_ROOM.z + START_ROOM.h / 2) * WORLD.cellSize,
} as const;

const BORDER_V = 0xb0;
const BORDER_H = 0xb1;
const CHUNK_CHANNEL = 0xc1;
const PANEL_CHANNEL = 0xd1;

export const vIndex = (x: number, z: number): number => z * (N + 1) + x;
export const hIndex = (x: number, z: number): number => z * N + x;
export const cellIndex = (x: number, z: number): number => z * N + x;

/**
 * Aberturas de un borde compartido. Para un borde vertical, (lineCx, cz) es la línea entre
 * los chunks lineCx - 1 y lineCx; para uno horizontal, (cx, lineCz) es la línea entre cz - 1 y cz.
 * Devuelve N valores: 1 = abierto.
 */
export function borderOpenings(
  seed: number,
  level: LevelDef,
  vertical: boolean,
  a: number,
  b: number,
): Uint8Array {
  const out = new Uint8Array(N);
  const M = WORLD.maxChunk;
  // Línea fuera del mundo acotado: borde cerrado.
  const line = vertical ? a : b;
  const other = vertical ? b : a;
  if (line <= -M || line > M || other < -M || other > M) return out;

  const rng = new Rng(hash3(seed ^ level.salt, a, b, vertical ? BORDER_V : BORDER_H));
  const g = level.gen;
  const count = rng.int(g.borderOpenings.min, g.borderOpenings.max);
  // Posiciones 1..N-2: se evitan las esquinas para que los cruces entre chunks se vean limpios.
  const candidates: number[] = [];
  for (let i = 1; i < N - 1; i++) candidates.push(i);
  rng.shuffle(candidates);
  for (let i = 0; i < count && i < candidates.length; i++) {
    const p = candidates[i] as number;
    out[p] = 1;
    if (rng.chance(g.wideOpeningChance) && p + 1 < N - 1) out[p + 1] = 1;
  }
  return out;
}

/** Unión-búsqueda sobre las celdas del chunk. */
class DisjointSet {
  private readonly parent: Int16Array;
  constructor(size: number) {
    this.parent = new Int16Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }
  find(a: number): number {
    let r = a;
    while (this.parent[r] !== r) r = this.parent[r] as number;
    // Compresión de camino.
    let c = a;
    while (this.parent[c] !== r) {
      const next = this.parent[c] as number;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[rb] = ra;
    return true;
  }
}

function overlaps(a: RoomRect, b: RoomRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.h && b.z < a.z + a.h;
}

function placeRoom(
  rng: Rng,
  rooms: RoomRect[],
  size: { min: number; max: number },
  large: boolean,
): void {
  const w = rng.int(size.min, size.max);
  const h = rng.int(size.min, size.max);
  const room: RoomRect = { x: rng.int(0, N - w), z: rng.int(0, N - h), w, h, large };
  for (const other of rooms) if (overlaps(room, other)) return;
  rooms.push(room);
}

/** Aristas internas codificadas: [0, N*(N-1)) verticales, [N*(N-1), 2*N*(N-1)) horizontales. */
const INTERNAL_EDGES = 2 * N * (N - 1);
const V_EDGES = N * (N - 1);

function edgeCells(edge: number): [number, number] {
  if (edge < V_EDGES) {
    const z = Math.floor(edge / (N - 1));
    const x = (edge % (N - 1)) + 1;
    return [cellIndex(x - 1, z), cellIndex(x, z)];
  }
  const e = edge - V_EDGES;
  const z = Math.floor(e / N) + 1;
  const x = e % N;
  return [cellIndex(x, z - 1), cellIndex(x, z)];
}

function edgeIsWall(chunk: ChunkData, edge: number): boolean {
  if (edge < V_EDGES) {
    const z = Math.floor(edge / (N - 1));
    const x = (edge % (N - 1)) + 1;
    return chunk.vWalls[vIndex(x, z)] === 1;
  }
  const e = edge - V_EDGES;
  return chunk.hWalls[hIndex(e % N, Math.floor(e / N) + 1)] === 1;
}

function openEdge(chunk: ChunkData, edge: number): void {
  if (edge < V_EDGES) {
    const z = Math.floor(edge / (N - 1));
    const x = (edge % (N - 1)) + 1;
    chunk.vWalls[vIndex(x, z)] = 0;
    return;
  }
  const e = edge - V_EDGES;
  chunk.hWalls[hIndex(e % N, Math.floor(e / N) + 1)] = 0;
}

/** Número de lados abiertos de una celda (contando las aberturas del borde del chunk). */
export function cellDegree(chunk: ChunkData, x: number, z: number): number {
  let d = 0;
  if (chunk.vWalls[vIndex(x, z)] === 0) d++;
  if (chunk.vWalls[vIndex(x + 1, z)] === 0) d++;
  if (chunk.hWalls[hIndex(x, z)] === 0) d++;
  if (chunk.hWalls[hIndex(x, z + 1)] === 0) d++;
  return d;
}

function carveRoom(chunk: ChunkData, room: RoomRect, sets: DisjointSet): void {
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (x > room.x) {
        chunk.vWalls[vIndex(x, z)] = 0;
        sets.union(cellIndex(x - 1, z), cellIndex(x, z));
      }
      if (z > room.z) {
        chunk.hWalls[hIndex(x, z)] = 0;
        sets.union(cellIndex(x, z - 1), cellIndex(x, z));
      }
    }
  }
}

function placeColumns(chunk: ChunkData, room: RoomRect, spacing: number): void {
  // Columnas en una retícula interior; nunca en el perímetro de la sala.
  for (let z = room.z + 1; z < room.z + room.h - 1; z += spacing) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x += spacing) {
      chunk.columns[cellIndex(x, z)] = 1;
    }
  }
}

function reduceDeadEnds(chunk: ChunkData, rng: Rng, g: GenParams): void {
  const maxDeadEnds = Math.floor(g.maxDeadEndRatio * N * N);
  const order: number[] = [];
  for (let i = 0; i < N * N; i++) order.push(i);
  rng.shuffle(order);
  let deadEnds = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) if (cellDegree(chunk, x, z) <= 1) deadEnds++;

  for (const cell of order) {
    if (deadEnds <= maxDeadEnds) break;
    const x = cell % N;
    const z = Math.floor(cell / N);
    if (cellDegree(chunk, x, z) > 1) continue;
    // Paredes internas que rodean la celda: se abre una al azar.
    const options: Array<[number, number]> = [];
    if (x > 0 && chunk.vWalls[vIndex(x, z)] === 1) options.push([x - 1, z]);
    if (x < N - 1 && chunk.vWalls[vIndex(x + 1, z)] === 1) options.push([x + 1, z]);
    if (z > 0 && chunk.hWalls[hIndex(x, z)] === 1) options.push([x, z - 1]);
    if (z < N - 1 && chunk.hWalls[hIndex(x, z + 1)] === 1) options.push([x, z + 1]);
    if (options.length === 0) continue;
    const [nx, nz] = options[rng.int(0, options.length - 1)] as [number, number];
    const neighborWasDeadEnd = cellDegree(chunk, nx, nz) <= 1;
    if (nx !== x) chunk.vWalls[vIndex(Math.max(x, nx), z)] = 0;
    else chunk.hWalls[hIndex(x, Math.max(z, nz))] = 0;
    deadEnds -= 1;
    if (neighborWasDeadEnd && cellDegree(chunk, nx, nz) > 1) deadEnds -= 1;
  }
}

function placePanels(chunk: ChunkData, seed: number, level: LevelDef): void {
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const gx = chunk.cx * N + x;
      const gz = chunk.cz * N + z;
      // Patrón de tablero con huecos al azar: luz regular pero con zonas más oscuras.
      if (((gx + gz) & 1) !== 0) continue;
      if (hashToUnit(hash3(seed ^ level.salt, gx, gz, PANEL_CHANNEL)) < level.gen.lightDensity) {
        chunk.panels[cellIndex(x, z)] = 1;
      }
    }
  }
}

/** Genera el chunk (cx, cz) del nivel con la semilla dada. */
export function generateChunk(seed: number, level: LevelDef, cx: number, cz: number): ChunkData {
  const g = level.gen;
  const chunk: ChunkData = {
    cx,
    cz,
    vWalls: new Uint8Array((N + 1) * N).fill(1),
    hWalls: new Uint8Array(N * (N + 1)).fill(1),
    columns: new Uint8Array(N * N),
    panels: new Uint8Array(N * N),
    rooms: [],
  };

  // 1. Bordes: aberturas decididas por el hash del borde compartido con cada vecino.
  const west = borderOpenings(seed, level, true, cx, cz);
  const east = borderOpenings(seed, level, true, cx + 1, cz);
  const north = borderOpenings(seed, level, false, cx, cz);
  const south = borderOpenings(seed, level, false, cx, cz + 1);
  for (let i = 0; i < N; i++) {
    if (west[i] === 1) chunk.vWalls[vIndex(0, i)] = 0;
    if (east[i] === 1) chunk.vWalls[vIndex(N, i)] = 0;
    if (north[i] === 1) chunk.hWalls[hIndex(i, 0)] = 0;
    if (south[i] === 1) chunk.hWalls[hIndex(i, N)] = 0;
  }

  const rng = new Rng(hash3(seed ^ level.salt, cx, cz, CHUNK_CHANNEL));
  const rooms = chunk.rooms as RoomRect[];

  // 2. Salas: la de inicio (solo en el origen), una grande ocasional y varias normales.
  if (cx === 0 && cz === 0) rooms.push(START_ROOM);
  if (rng.chance(g.largeRoomChance)) placeRoom(rng, rooms, g.largeRoomSize, true);
  for (let i = 0; i < g.roomAttempts; i++) placeRoom(rng, rooms, g.roomSize, false);

  const sets = new DisjointSet(N * N);
  for (const room of rooms) {
    carveRoom(chunk, room, sets);
    if (room.large) placeColumns(chunk, room, g.columnSpacing);
  }

  // 3. Árbol aleatorio (Kruskal): conecta todas las celdas y, con ellas, todas las aberturas.
  const edges: number[] = [];
  for (let e = 0; e < INTERNAL_EDGES; e++) edges.push(e);
  rng.shuffle(edges);
  for (const e of edges) {
    if (!edgeIsWall(chunk, e)) continue;
    const [a, b] = edgeCells(e);
    if (sets.union(a, b)) openEdge(chunk, e);
  }

  // 4. Bucles: se quitan algunas paredes más para que no sea un laberinto perfecto.
  for (const e of edges) {
    if (edgeIsWall(chunk, e) && rng.chance(g.loopRate)) openEdge(chunk, e);
  }

  // 5. Pocos callejones sin salida.
  reduceDeadEnds(chunk, rng, g);

  // 6. Paneles de luz del techo.
  placePanels(chunk, seed, level);
  return chunk;
}

export interface ChunkStats {
  openInternalEdges: number;
  /** Ciclos independientes del grafo de celdas: aristas abiertas - (celdas - 1). */
  loops: number;
  deadEnds: number;
  junctionsT: number;
  junctionsX: number;
  reachableCells: number;
}

/** Métricas de un chunk para los tests y la depuración. */
export function analyzeChunk(chunk: ChunkData): ChunkStats {
  let open = 0;
  for (let e = 0; e < INTERNAL_EDGES; e++) if (!edgeIsWall(chunk, e)) open++;
  let deadEnds = 0;
  let t = 0;
  let xj = 0;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const d = cellDegree(chunk, x, z);
      if (d <= 1) deadEnds++;
      else if (d === 3) t++;
      else if (d === 4) xj++;
    }
  }
  // BFS desde la celda 0 por las aristas internas abiertas.
  const seen = new Uint8Array(N * N);
  const queue: number[] = [0];
  seen[0] = 1;
  let reach = 0;
  while (queue.length > 0) {
    const c = queue.pop() as number;
    reach++;
    const x = c % N;
    const z = Math.floor(c / N);
    const tryVisit = (nx: number, nz: number, open: boolean): void => {
      const i = cellIndex(nx, nz);
      if (open && seen[i] === 0) {
        seen[i] = 1;
        queue.push(i);
      }
    };
    if (x > 0) tryVisit(x - 1, z, chunk.vWalls[vIndex(x, z)] === 0);
    if (x < N - 1) tryVisit(x + 1, z, chunk.vWalls[vIndex(x + 1, z)] === 0);
    if (z > 0) tryVisit(x, z - 1, chunk.hWalls[hIndex(x, z)] === 0);
    if (z < N - 1) tryVisit(x, z + 1, chunk.hWalls[hIndex(x, z + 1)] === 0);
  }
  return {
    openInternalEdges: open,
    loops: open - (N * N - 1),
    deadEnds,
    junctionsT: t,
    junctionsX: xj,
    reachableCells: reach,
  };
}
