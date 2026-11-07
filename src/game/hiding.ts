/**
 * Escondites (taquillas y armarios) en coordenadas globales: caja de colisión, punto desde el que
 * se usan y posición del jugador al salir. Los datos vienen de los chunks generados (deterministas);
 * aquí solo se derivan y se guardan en una caché pequeña para no crear objetos en cada paso.
 */
import { HIDING, WORLD } from '../data/balance';
import type { Box } from './collision';
import { chunkKey, chunkOf, insideWorld, type ChunkStore } from './grid';
import { N, type HideCell } from './worldgen';

const CELL = WORLD.cellSize;

export interface HideSpot {
  /** Identificador estable (celda global). */
  readonly id: number;
  readonly gx: number;
  readonly gz: number;
  /** Centro de la caja en metros (donde queda el jugador escondido). */
  readonly x: number;
  readonly z: number;
  /** Normal del frente (hacia fuera de la pared). */
  readonly nx: number;
  readonly nz: number;
  readonly box: Box;
  /** Punto del frente, para decidir si el jugador lo tiene delante. */
  readonly frontX: number;
  readonly frontZ: number;
  /** 0 = la caja es ancha en x (pared norte o sur), 1 = ancha en z. */
  readonly rot: 0 | 1;
}

/** Identificador de celda global sin crear cadenas. */
export function hideId(gx: number, gz: number): number {
  return (gx + 20000) * 40000 + (gz + 20000);
}

/** Calcula el escondite global a partir de la celda local de su chunk. */
export function hideSpotOf(cx: number, cz: number, h: HideCell): HideSpot {
  const gx = cx * N + h.x;
  const gz = cz * N + h.z;
  // Normal hacia dentro de la celda (lejos de la pared).
  const nx = h.side === 0 ? 1 : h.side === 1 ? -1 : 0;
  const nz = h.side === 2 ? 1 : h.side === 3 ? -1 : 0;
  // La pared está en el borde de la celda; la caja se apoya en su cara (medio grosor).
  const wallX = h.side === 0 ? gx * CELL : h.side === 1 ? (gx + 1) * CELL : (gx + 0.5) * CELL;
  const wallZ = h.side === 2 ? gz * CELL : h.side === 3 ? (gz + 1) * CELL : (gz + 0.5) * CELL;
  const back = WORLD.wallThickness / 2;
  const x = wallX + nx * (back + HIDING.depth / 2);
  const z = wallZ + nz * (back + HIDING.depth / 2);
  const along = nx === 0;
  const hw = HIDING.width / 2;
  const hd = HIDING.depth / 2;
  const box: Box = along
    ? { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd }
    : { minX: x - hd, maxX: x + hd, minZ: z - hw, maxZ: z + hw };
  return {
    id: hideId(gx, gz),
    gx,
    gz,
    x,
    z,
    nx,
    nz,
    box,
    frontX: x + nx * hd,
    frontZ: z + nz * hd,
    rot: along ? 0 : 1,
  };
}

/** Posición del jugador al salir: delante del escondite, con su radio de holgura. */
export function exitPoint(spot: HideSpot, playerRadius: number): { x: number; z: number } {
  const d = HIDING.depth / 2 + HIDING.exitGap + playerRadius;
  return { x: spot.x + spot.nx * d, z: spot.z + spot.nz * d };
}

/** Orientación (yaw) que mira hacia fuera del escondite. forward = (-sin yaw, -cos yaw). */
export function facingOut(spot: HideSpot): number {
  return Math.atan2(-spot.nx, -spot.nz);
}

const CACHE_LIMIT = 96;

/**
 * Escondites y cajas de colisión cercanas por chunk. `near(x, z)` devuelve las cajas fijas del nivel
 * (puerta y pedestales) más las de los escondites de los 3×3 chunks alrededor; el resultado se
 * guarda por chunk, así que en el bucle no se crean arreglos nuevos mientras no se cambie de chunk.
 */
export class HideIndex {
  private readonly spots = new Map<number, readonly HideSpot[]>();
  private readonly near = new Map<number, Box[]>();

  constructor(
    private readonly store: ChunkStore,
    private readonly fixed: readonly Box[],
  ) {}

  /** Escondites de un chunk. */
  spotsOf(cx: number, cz: number): readonly HideSpot[] {
    const key = chunkKey(cx, cz);
    let list = this.spots.get(key);
    if (list === undefined) {
      if (!insideWorld(cx, cz)) list = [];
      else list = this.store.get(cx, cz).hides.map((h) => hideSpotOf(cx, cz, h));
      if (this.spots.size >= CACHE_LIMIT) this.spots.clear();
      this.spots.set(key, list);
    }
    return list;
  }

  /** Llama a `cb` con cada escondite de los 3×3 chunks alrededor de (x, z). */
  forEachNear(x: number, z: number, cb: (spot: HideSpot) => void): void {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) for (const s of this.spotsOf(cx + dx, cz + dz)) cb(s);
    }
  }

  /** Cajas de colisión cerca de (x, z). */
  boxesNear(x: number, z: number): readonly Box[] {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    const key = chunkKey(cx, cz);
    let boxes = this.near.get(key);
    if (boxes === undefined) {
      boxes = [...this.fixed];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const s of this.spotsOf(cx + dx, cz + dz)) boxes.push(s.box);
        }
      }
      if (this.near.size >= CACHE_LIMIT) this.near.clear();
      this.near.set(key, boxes);
    }
    return boxes;
  }
}
