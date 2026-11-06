/** Utilidades solo para tests: búsqueda de caminos en la cuadrícula global y conducción del jugador. */
import { WORLD } from '../../src/data/balance';
import type { WallQuery } from '../../src/game/grid';
import type { Player } from '../../src/game/player';

export interface Cell {
  x: number;
  z: number;
}

/** BFS por celdas globales respetando las paredes, hasta que `goal` devuelva true. */
export function findPath(
  grid: WallQuery,
  start: Cell,
  goal: (c: Cell) => boolean,
  maxNodes = 200000,
): Cell[] | null {
  const key = (x: number, z: number): string => `${x},${z}`;
  const prev = new Map<string, string | null>();
  const queue: Cell[] = [start];
  prev.set(key(start.x, start.z), null);
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const c = queue[head++] as Cell;
    if (goal(c)) {
      const path: Cell[] = [];
      let k: string | null = key(c.x, c.z);
      while (k !== null) {
        const [x, z] = k.split(',').map(Number) as [number, number];
        path.push({ x, z });
        k = prev.get(k) ?? null;
      }
      return path.reverse();
    }
    const moves: Array<[number, number, boolean]> = [
      [c.x - 1, c.z, !grid.wallV(c.x, c.z)],
      [c.x + 1, c.z, !grid.wallV(c.x + 1, c.z)],
      [c.x, c.z - 1, !grid.wallH(c.x, c.z)],
      [c.x, c.z + 1, !grid.wallH(c.x, c.z + 1)],
    ];
    for (const [x, z, open] of moves) {
      // Las celdas con columna se evitan: su centro está ocupado por la columna.
      if (!open || prev.has(key(x, z)) || grid.column(x, z)) continue;
      prev.set(key(x, z), key(c.x, c.z));
      queue.push({ x, z });
    }
  }
  return null;
}

/** Centro de la celda en metros. */
export function cellCenter(c: Cell): { x: number; z: number } {
  return { x: (c.x + 0.5) * WORLD.cellSize, z: (c.z + 0.5) * WORLD.cellSize };
}

/** Lleva al jugador por los centros de las celdas del camino. Devuelve true si llega al final. */
export function followPath(
  player: Player,
  grid: WallQuery,
  path: Cell[],
  maxSteps = 60 * 600,
): boolean {
  let i = 0;
  for (let s = 0; s < maxSteps && i < path.length; s++) {
    const target = cellCenter(path[i] as Cell);
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    if (Math.hypot(dx, dz) < 0.4) {
      i++;
      continue;
    }
    // forward = (-sin yaw, -cos yaw) => yaw = atan2(-dx, -dz)
    player.yaw = Math.atan2(-dx, -dz);
    player.step(1 / 60, { forward: 1, strafe: 0, run: true }, grid);
  }
  return i >= path.length;
}
