/** Utilidades solo para tests: cuadrícula falsa acotada y anfitrión falso para la criatura. */
import { DIFFICULTY, WORLD, type DifficultyParams } from '../../src/data/balance';
import type { Box } from '../../src/game/collision';
import type { EnemyHost } from '../../src/game/enemy';
import type { LightQuery, WallQuery } from '../../src/game/grid';
import { PathDistance, noiseRadius, type NoiseEvent, type NoiseKind } from '../../src/game/noise';

export const C = WORLD.cellSize;
export const at = (cell: number): number => (cell + 0.5) * C;

/** Sala rectangular de w×h celdas (0..w-1, 0..h-1) cerrada por fuera, con paredes interiores opcionales. */
export class ArenaGrid implements WallQuery, LightQuery {
  readonly v = new Set<string>();
  readonly h = new Set<string>();
  readonly cols = new Set<string>();
  dark = false;
  constructor(
    readonly w: number,
    readonly hgt: number,
  ) {}
  wallV(x: number, z: number): number {
    if (z < 0 || z >= this.hgt || x <= 0 || x >= this.w) return 1;
    return this.v.has(`${x},${z}`) ? 1 : 0;
  }
  wallH(x: number, z: number): number {
    if (x < 0 || x >= this.w || z <= 0 || z >= this.hgt) return 1;
    return this.h.has(`${x},${z}`) ? 1 : 0;
  }
  column(x: number, z: number): boolean {
    return this.cols.has(`${x},${z}`);
  }
  lit(): boolean {
    return !this.dark;
  }
  /** Pared vertical en la línea x, de la fila z0 a z1 (incluidas). */
  wallLineV(x: number, z0: number, z1: number): void {
    for (let z = z0; z <= z1; z++) this.v.add(`${x},${z}`);
  }
  wallLineH(z: number, x0: number, x1: number): void {
    for (let x = x0; x <= x1; x++) this.h.add(`${x},${z}`);
  }
}

export class FakeHost implements EnemyHost {
  readonly paths = new PathDistance();
  readonly player = { x: 0, z: 0, crouching: false };
  playerHidden = false;
  tuning: DifficultyParams = DIFFICULTY.normal;
  private readonly noises: NoiseEvent[] = [];
  constructor(readonly grid: ArenaGrid) {}
  get noiseCountThisStep(): number {
    return this.noises.length;
  }
  noiseAt(i: number): NoiseEvent {
    return this.noises[i] as NoiseEvent;
  }
  obstaclesNear(): readonly Box[] {
    return [];
  }
  /** Ruido del jugador durante el próximo paso. */
  noise(kind: NoiseKind, x = this.player.x, z = this.player.z): void {
    this.noises.push({ kind, x, z, radius: noiseRadius(kind) });
  }
  clearNoises(): void {
    this.noises.length = 0;
  }
}
