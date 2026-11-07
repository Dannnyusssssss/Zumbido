/**
 * Marcas de tiza: un rayo sobre la cuadrícula decide si se marca la pared que se mira (una X)
 * o el suelo delante del jugador (una flecha hacia donde mira). Las marcas viven en un pool de
 * tamaño fijo: cuando se llena se reutiliza la más antigua. Solo duran la partida del nivel.
 */
import { CHALK, WORLD } from '../data/balance';
import { edgeHalf, type WallQuery } from './grid';

export interface RayHit {
  dist: number;
  x: number;
  z: number;
  /** Normal de la superficie golpeada (hacia el jugador). */
  nx: number;
  nz: number;
}

const CELL = WORLD.cellSize;
const HALF_COLUMN = WORLD.columnSize / 2;

/** Intersección del rayo con una caja; devuelve la distancia de entrada o -1. */
function rayBox(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  out: RayHit,
): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0;
  let nz = 0;
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    const t1 = (minX - ox) / dx;
    const t2 = (maxX - ox) / dx;
    const near = Math.min(t1, t2);
    if (near > tmin) {
      tmin = near;
      nx = dx > 0 ? -1 : 1;
      nz = 0;
    }
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    const t1 = (minZ - oz) / dz;
    const t2 = (maxZ - oz) / dz;
    const near = Math.min(t1, t2);
    if (near > tmin) {
      tmin = near;
      nx = 0;
      nz = dz > 0 ? -1 : 1;
    }
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (tmax < Math.max(0, tmin) || tmin < 0) return -1;
  out.nx = nx;
  out.nz = nz;
  return tmin;
}

/**
 * Lanza un rayo horizontal desde (ox, oz) en la dirección unitaria (dx, dz) hasta maxDist.
 * Recorre las celdas con DDA y comprueba bordes (con su grosor) y columnas. Devuelve true si choca.
 */
export function castRay(
  grid: WallQuery,
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  maxDist: number,
  out: RayHit,
): boolean {
  let gx = Math.floor(ox / CELL);
  let gz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : CELL / Math.abs(dx);
  const tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : CELL / Math.abs(dz);
  let tMaxX =
    Math.abs(dx) < 1e-9 ? Infinity : ((stepX > 0 ? (gx + 1) * CELL : gx * CELL) - ox) / dx;
  let tMaxZ =
    Math.abs(dz) < 1e-9 ? Infinity : ((stepZ > 0 ? (gz + 1) * CELL : gz * CELL) - oz) / dz;

  for (let i = 0; i < 64; i++) {
    // Columna de la celda actual.
    if (grid.column(gx, gz)) {
      const cx = (gx + 0.5) * CELL;
      const cz = (gz + 0.5) * CELL;
      const t = rayBox(
        ox,
        oz,
        dx,
        dz,
        cx - HALF_COLUMN,
        cx + HALF_COLUMN,
        cz - HALF_COLUMN,
        cz + HALF_COLUMN,
        out,
      );
      if (t >= 0 && t <= maxDist) return finish(out, ox, oz, dx, dz, t);
    }
    const t = Math.min(tMaxX, tMaxZ);
    if (t > maxDist + WORLD.shelfDepth) return false;
    if (tMaxX < tMaxZ) {
      const line = stepX > 0 ? gx + 1 : gx;
      const type = grid.wallV(line, gz);
      if (type !== 0) {
        // La superficie está medio grosor antes de la línea.
        const surface = Math.max(0, t - edgeHalf(type) / Math.abs(dx));
        if (surface > maxDist) return false;
        out.nx = -stepX;
        out.nz = 0;
        return finish(out, ox, oz, dx, dz, surface);
      }
      gx += stepX;
      tMaxX += tDeltaX;
    } else {
      const line = stepZ > 0 ? gz + 1 : gz;
      const type = grid.wallH(gx, line);
      if (type !== 0) {
        const surface = Math.max(0, t - edgeHalf(type) / Math.abs(dz));
        if (surface > maxDist) return false;
        out.nx = 0;
        out.nz = -stepZ;
        return finish(out, ox, oz, dx, dz, surface);
      }
      gz += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return false;
}

function finish(out: RayHit, ox: number, oz: number, dx: number, dz: number, t: number): boolean {
  out.dist = t;
  out.x = ox + dx * t;
  out.z = oz + dz * t;
  return true;
}

export interface ChalkMark {
  x: number;
  y: number;
  z: number;
  /** Normal de la pared (0, 0 en el suelo). */
  nx: number;
  nz: number;
  onWall: boolean;
  /** Ángulo de la flecha en el suelo (mismo convenio que el yaw del jugador). */
  angle: number;
}

/** Pool de marcas de tamaño fijo; `version` cambia con cada marca para que el render se actualice. */
export class ChalkPool {
  readonly marks: ChalkMark[] = [];
  private next = 0;
  version = 0;

  constructor(readonly capacity: number = CHALK.poolSize) {}

  get count(): number {
    return this.marks.length;
  }

  add(mark: ChalkMark): void {
    if (this.marks.length < this.capacity) {
      this.marks.push(mark);
    } else {
      // Pool lleno: se reutiliza la marca más antigua.
      this.marks[this.next] = mark;
    }
    this.next = (this.next + 1) % this.capacity;
    this.version++;
  }

  clear(): void {
    this.marks.length = 0;
    this.next = 0;
    this.version++;
  }
}

const tmpHit: RayHit = { dist: 0, x: 0, z: 0, nx: 0, nz: 0 };

/** Crea la marca que corresponde a la posición y la mirada del jugador. */
export function makeMark(grid: WallQuery, x: number, z: number, yaw: number): ChalkMark {
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);
  if (castRay(grid, x, z, dx, dz, CHALK.wallReach, tmpHit)) {
    return {
      x: tmpHit.x + tmpHit.nx * 0.012,
      y: CHALK.wallMarkHeight,
      z: tmpHit.z + tmpHit.nz * 0.012,
      nx: tmpHit.nx,
      nz: tmpHit.nz,
      onWall: true,
      angle: yaw,
    };
  }
  return {
    x: x + dx * CHALK.floorDistance,
    y: 0.012,
    z: z + dz * CHALK.floorDistance,
    nx: 0,
    nz: 0,
    onWall: false,
    angle: yaw,
  };
}
