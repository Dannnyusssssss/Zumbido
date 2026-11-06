/**
 * Estado de una partida y orden fijo de los sistemas de lógica.
 * Todo lo que hay aquí es puro: no usa Three.js ni el DOM.
 */
import type { InputState } from '../core/input';
import { hashSeed } from '../core/rng';
import type { LevelDef } from '../data/levels';
import { ChunkStore, WorldGrid } from './grid';
import { Player, type MoveIntent } from './player';
import { movementSystem } from './systems/movement';
import { SPAWN_POINT } from './worldgen';

type System = (world: World, input: InputState, dt: number) => void;

/** Orden de ejecución de los sistemas en cada paso fijo. Es el único lugar donde se declara. */
const SYSTEMS: readonly System[] = [movementSystem];

export class World {
  readonly seedText: string;
  readonly seed: number;
  readonly level: LevelDef;
  readonly store: ChunkStore;
  readonly grid: WorldGrid;
  readonly player: Player;
  readonly intent: MoveIntent = { forward: 0, strafe: 0, run: false };
  /** Tiempo de juego en segundos (solo avanza en pasos fijos). */
  time = 0;

  constructor(seedText: string, level: LevelDef) {
    this.seedText = seedText;
    this.seed = hashSeed(seedText);
    this.level = level;
    this.store = new ChunkStore(this.seed, level);
    this.grid = new WorldGrid(this.store);
    this.player = new Player(SPAWN_POINT.x, SPAWN_POINT.z);
  }

  step(dt: number, input: InputState): void {
    for (const system of SYSTEMS) system(this, input, dt);
    this.time += dt;
  }
}
