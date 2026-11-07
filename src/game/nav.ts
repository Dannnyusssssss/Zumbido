/**
 * Navegación A* sobre las celdas globales, a través de los chunks. Solo pasa por bordes abiertos y
 * evita las celdas con columna (su centro está ocupado). El número de nodos está acotado: si no
 * llega al destino dentro del tope, devuelve el camino hasta la celda explorada más cercana a él,
 * así la criatura sigue acercándose sin bloquear el bucle ni generar chunks de más.
 */
import type { WallQuery } from './grid';

const OFFSET = 32768;

/** Clave numérica de una celda global (|gx|, |gz| < 32768). */
export function cellKey(gx: number, gz: number): number {
  return (gx + OFFSET) * 65536 + (gz + OFFSET);
}

const keyX = (k: number): number => Math.floor(k / 65536) - OFFSET;
const keyZ = (k: number): number => (k % 65536) - OFFSET;

export type NavResult = 'found' | 'partial' | 'none';

/** Montículo binario mínimo de claves con prioridad (arreglos paralelos). */
class MinHeap {
  readonly keys: number[] = [];
  readonly prio: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  clear(): void {
    this.keys.length = 0;
    this.prio.length = 0;
  }

  push(key: number, p: number): void {
    const k = this.keys;
    const q = this.prio;
    k.push(key);
    q.push(p);
    let i = k.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((q[parent] as number) <= p) break;
      k[i] = k[parent] as number;
      q[i] = q[parent] as number;
      i = parent;
    }
    k[i] = key;
    q[i] = p;
  }

  pop(): number {
    const k = this.keys;
    const q = this.prio;
    const top = k[0] as number;
    const lastK = k.pop() as number;
    const lastP = q.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (q[r] as number) < (q[l] as number) ? r : l;
        if ((q[c] as number) >= lastP) break;
        k[i] = k[c] as number;
        q[i] = q[c] as number;
        i = c;
      }
      k[i] = lastK;
      q[i] = lastP;
    }
    return top;
  }
}

/** Buscador reutilizable (mantiene sus estructuras entre llamadas). */
export class Navigator {
  private readonly open = new MinHeap();
  private readonly cost = new Map<number, number>();
  private readonly from = new Map<number, number>();
  private readonly closed = new Set<number>();
  /** Nodos expandidos en la última búsqueda. */
  lastExpanded = 0;

  constructor(readonly maxNodes: number) {}

  /**
   * Busca un camino de (sx, sz) a (tx, tz). Escribe en `out` las celdas como pares [x0, z0, x1, z1, ...]
   * desde la siguiente a la de inicio hasta la última (incluida).
   */
  find(grid: WallQuery, sx: number, sz: number, tx: number, tz: number, out: number[]): NavResult {
    out.length = 0;
    if (sx === tx && sz === tz) return 'found';
    const open = this.open;
    const cost = this.cost;
    const from = this.from;
    const closed = this.closed;
    open.clear();
    cost.clear();
    from.clear();
    closed.clear();
    const start = cellKey(sx, sz);
    const goal = cellKey(tx, tz);
    const h = (x: number, z: number): number => Math.abs(x - tx) + Math.abs(z - tz);
    cost.set(start, 0);
    open.push(start, h(sx, sz));
    let best = start;
    let bestH = h(sx, sz);
    let expanded = 0;
    let reached = false;
    while (open.size > 0 && expanded < this.maxNodes) {
      const cur = open.pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      expanded++;
      if (cur === goal) {
        reached = true;
        break;
      }
      const x = keyX(cur);
      const z = keyZ(cur);
      const hc = h(x, z);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      const g = (cost.get(cur) as number) + 1;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
        const nz = k === 2 ? z - 1 : k === 3 ? z + 1 : z;
        const open4 =
          k === 0
            ? grid.wallV(x, z) === 0
            : k === 1
              ? grid.wallV(x + 1, z) === 0
              : k === 2
                ? grid.wallH(x, z) === 0
                : grid.wallH(x, z + 1) === 0;
        if (!open4) continue;
        const nk = cellKey(nx, nz);
        if (closed.has(nk)) continue;
        // Las columnas ocupan el centro de la celda: solo se entra si es el destino.
        if (nk !== goal && grid.column(nx, nz)) continue;
        const prev = cost.get(nk);
        if (prev !== undefined && prev <= g) continue;
        cost.set(nk, g);
        from.set(nk, cur);
        open.push(nk, g + h(nx, nz));
      }
    }
    this.lastExpanded = expanded;
    const end = reached ? goal : best;
    if (end === start) return 'none';
    // Reconstruye el camino hacia atrás y lo escribe en orden.
    let k = end;
    while (k !== start) {
      out.push(keyZ(k), keyX(k));
      k = from.get(k) as number;
    }
    out.reverse();
    return reached ? 'found' : 'partial';
  }
}
