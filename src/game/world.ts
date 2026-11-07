/**
 * Estado de una partida de un nivel y orden fijo de los sistemas de lógica.
 * Todo lo que hay aquí es puro: no usa Three.js ni el DOM.
 */
import type { InputState } from '../core/input';
import { hashSeed } from '../core/rng';
import type { LevelDef } from '../data/levels';
import { ChalkPool } from './chalk';
import type { Box } from './collision';
import { ChunkStore, WorldGrid } from './grid';
import { exitBox, fuseBox, levelLayout, type LevelLayout, type PlacedObject } from './layout';
import { Player, type MoveIntent } from './player';
import { Stamina } from './stamina';
import { chalkSystem } from './systems/chalk';
import { interactionSystem } from './systems/interaction';
import { movementSystem } from './systems/movement';
import { SPAWN_POINT } from './worldgen';

/** Sucesos de un paso que la capa de presentación (HUD, audio) consume. */
export type GameEvent =
  | { readonly type: 'fuse'; readonly index: number; readonly remaining: number }
  | { readonly type: 'exitActivated' }
  | { readonly type: 'exitLocked'; readonly missing: number }
  | { readonly type: 'levelComplete' }
  | { readonly type: 'chalk'; readonly onWall: boolean };

type System = (world: World, input: InputState, dt: number) => void;

/** Orden de ejecución de los sistemas en cada paso fijo. Es el único lugar donde se declara. */
const SYSTEMS: readonly System[] = [movementSystem, interactionSystem, chalkSystem];

export class World {
  readonly seedText: string;
  readonly seed: number;
  readonly level: LevelDef;
  readonly store: ChunkStore;
  readonly grid: WorldGrid;
  readonly player: Player;
  readonly layout: LevelLayout;
  readonly stamina = new Stamina();
  readonly chalk = new ChalkPool();
  readonly intent: MoveIntent = { forward: 0, strafe: 0, run: false };
  /** Cajas de colisión de los objetos colocados (la puerta y los pedestales de los fusibles). */
  readonly obstacles: readonly Box[];
  /** Fusibles ya recogidos (por índice). */
  readonly fuseTaken: boolean[];
  /** Objeto con el que se puede interactuar ahora (o null). */
  focus: PlacedObject | null = null;
  completed = false;
  /** Tiempo de juego en segundos (solo avanza en pasos fijos; la pausa no cuenta). */
  time = 0;
  readonly events: GameEvent[] = [];

  constructor(seedText: string, level: LevelDef) {
    this.seedText = seedText;
    this.seed = hashSeed(seedText);
    this.level = level;
    this.store = new ChunkStore(this.seed, level);
    this.grid = new WorldGrid(this.store);
    this.player = new Player(SPAWN_POINT.x, SPAWN_POINT.z);
    this.layout = levelLayout(this.seed, level);
    this.obstacles = [exitBox(this.layout.exit), ...this.layout.fuses.map(fuseBox)];
    this.fuseTaken = this.layout.fuses.map(() => false);
  }

  get fusesCollected(): number {
    return this.fuseTaken.filter((t) => t).length;
  }

  get fusesRequired(): number {
    return this.layout.fuses.length;
  }

  /** La salida funciona cuando están todos los fusibles (en el nivel 1 desde el principio). */
  get exitActive(): boolean {
    return this.fusesCollected >= this.fusesRequired;
  }

  step(dt: number, input: InputState): void {
    if (this.completed) return;
    for (const system of SYSTEMS) system(this, input, dt);
    this.time += dt;
  }

  /** Devuelve y vacía los sucesos acumulados. */
  drainEvents(out: GameEvent[]): GameEvent[] {
    out.length = 0;
    for (const e of this.events) out.push(e);
    this.events.length = 0;
    return out;
  }
}
