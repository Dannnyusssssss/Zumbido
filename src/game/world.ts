/**
 * Estado de una partida de un nivel y orden fijo de los sistemas de lógica.
 * Todo lo que hay aquí es puro: no usa Three.js ni el DOM.
 */
import type { InputState } from '../core/input';
import { hashSeed } from '../core/rng';
import { DIFFICULTY, NOISE, type Difficulty, type DifficultyParams } from '../data/balance';
import type { LevelDef } from '../data/levels';
import { ChalkPool } from './chalk';
import type { Box } from './collision';
import { ChunkStore, WorldGrid } from './grid';
import { Director } from './director';
import { Enemy } from './enemy';
import { HideIndex, type HideSpot } from './hiding';
import { exitBox, fuseBox, levelLayout, type LevelLayout, type PlacedObject } from './layout';
import {
  noiseLevelOf,
  noiseRadius,
  PathDistance,
  type NoiseEvent,
  type NoiseKind,
  type NoiseLevel,
} from './noise';
import { Player, type MoveIntent } from './player';
import { Stamina } from './stamina';
import { chalkSystem } from './systems/chalk';
import { captureSystem, directorSystem, enemySystem, threatSystem } from './systems/creatures';
import { interactionSystem } from './systems/interaction';
import { movementSystem } from './systems/movement';
import { SPAWN_POINT } from './worldgen';

/** Sucesos de un paso que la capa de presentación (HUD, audio) consume. */
export type GameEvent =
  | { readonly type: 'fuse'; readonly index: number; readonly remaining: number }
  | { readonly type: 'exitActivated' }
  | { readonly type: 'exitLocked'; readonly missing: number }
  | { readonly type: 'levelComplete' }
  | { readonly type: 'chalk'; readonly onWall: boolean }
  /** Entrar o salir de un escondite; `seen` = una criatura lo vio entrar. */
  | { readonly type: 'hide'; readonly entering: boolean; readonly seen: boolean }
  | { readonly type: 'caught' };

export interface WorldOptions {
  /** Dificultad (por defecto Normal). */
  readonly difficulty?: Difficulty;
  /** Con false no aparece ninguna criatura (tests y parámetro de depuración). */
  readonly creatures?: boolean;
}

type System = (world: World, input: InputState, dt: number) => void;

/** Orden de ejecución de los sistemas en cada paso fijo. Es el único lugar donde se declara. */
const SYSTEMS: readonly System[] = [
  movementSystem,
  interactionSystem,
  chalkSystem,
  directorSystem,
  enemySystem,
  captureSystem,
  threatSystem,
];

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
  /** Escondite al alcance (o en el que está el jugador). */
  focusHide: HideSpot | null = null;
  /** Escondite en el que está el jugador (null = fuera). */
  hidden: HideSpot | null = null;
  completed = false;
  /** La criatura alcanzó al jugador. */
  defeated = false;
  readonly hides: HideIndex;
  readonly enemies: Enemy[];
  readonly director: Director;
  /** Segundos hasta el próximo cálculo de las señales de amenaza. */
  threatTimer = 0;
  /** Tiempo de juego en segundos (solo avanza en pasos fijos; la pausa no cuenta). */
  time = 0;
  readonly events: GameEvent[] = [];
  /** Ruidos emitidos en el paso actual (se vacía al empezar cada paso). Objetos reutilizados. */
  private readonly noisePool: NoiseEvent[] = [];
  private noiseCount = 0;
  /** Metros recorridos desde el último paso con ruido. */
  stepMeter = 0;
  /** Alcance del ruido que muestra el HUD y hasta cuándo. */
  private noiseShown = 0;
  private noiseShownUntil = -1;
  /** Búsqueda de distancia de camino compartida por los sistemas (sin crear arreglos por consulta). */
  readonly paths = new PathDistance();

  readonly difficulty: Difficulty;
  readonly tuning: DifficultyParams;
  readonly creaturesEnabled: boolean;

  constructor(seedText: string, level: LevelDef, options: WorldOptions = {}) {
    this.difficulty = options.difficulty ?? 'normal';
    this.tuning = DIFFICULTY[this.difficulty];
    this.creaturesEnabled = options.creatures ?? true;
    this.seedText = seedText;
    this.seed = hashSeed(seedText);
    this.level = level;
    this.store = new ChunkStore(this.seed, level);
    this.grid = new WorldGrid(this.store);
    this.player = new Player(SPAWN_POINT.x, SPAWN_POINT.z);
    this.layout = levelLayout(this.seed, level);
    this.obstacles = [exitBox(this.layout.exit), ...this.layout.fuses.map(fuseBox)];
    this.fuseTaken = this.layout.fuses.map(() => false);
    this.hides = new HideIndex(this.store, this.obstacles);
    const count = this.creaturesEnabled ? level.creatures : 0;
    const creatureSeed = this.seed ^ level.salt;
    this.enemies = [];
    for (let i = 0; i < count; i++) this.enemies.push(new Enemy(i, creatureSeed));
    this.director = new Director(creatureSeed, count, this.tuning);
  }

  get playerHidden(): boolean {
    return this.hidden !== null;
  }

  /** Cajas de colisión cerca de (x, z): puerta, pedestales y escondites de los chunks vecinos. */
  obstaclesNear(x: number, z: number): readonly Box[] {
    return this.hides.boxesNear(x, z);
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

  /** Ruidos de este paso. */
  get noiseCountThisStep(): number {
    return this.noiseCount;
  }

  noiseAt(i: number): NoiseEvent {
    return this.noisePool[i] as NoiseEvent;
  }

  /** Emite un ruido en (x, z) (por defecto, donde está el jugador). */
  emitNoise(kind: NoiseKind, x: number = this.player.x, z: number = this.player.z): void {
    const radius = noiseRadius(kind);
    let ev = this.noisePool[this.noiseCount];
    if (ev === undefined) {
      ev = { kind, x, z, radius };
      this.noisePool.push(ev);
    } else {
      ev.kind = kind;
      ev.x = x;
      ev.z = z;
      ev.radius = radius;
    }
    this.noiseCount++;
    // El HUD muestra el ruido más fuerte de los últimos instantes; uno más suave no alarga al fuerte.
    if (radius >= this.noiseShown || this.time >= this.noiseShownUntil) {
      this.noiseShown = radius;
      this.noiseShownUntil = this.time + NOISE.hudHoldSeconds;
    }
  }

  /** Alcance del ruido reciente del jugador (0 = silencio). */
  get recentNoise(): number {
    return this.time < this.noiseShownUntil ? this.noiseShown : 0;
  }

  get noiseLevel(): NoiseLevel {
    return noiseLevelOf(this.recentNoise);
  }

  step(dt: number, input: InputState): void {
    if (this.completed || this.defeated) return;
    this.noiseCount = 0;
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
