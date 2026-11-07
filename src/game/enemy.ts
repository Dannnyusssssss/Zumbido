/**
 * La Escucha: una criatura que oye antes de ver. Máquina de estados pura y determinista:
 * - Vagar: recorre la zona (a veces cerca del jugador, según la dificultad).
 * - Investigar: va al último ruido que oyó y se queda mirando un momento.
 * - Perseguir: te ve; si te pierde de vista un rato, pasa a buscar.
 * - Buscar: rastrea alrededor del último punto conocido unos segundos.
 * - Retirarse: se aleja sin atender a nada y desaparece (el director la vuelve a traer más tarde).
 * Se mueve por caminos A* entre centros de celda y choca con las paredes como el jugador.
 */
import { ENEMY, WORLD, type DifficultyParams } from '../data/balance';
import { TAU, wrapAngle } from '../core/math';
import { hash3, Rng } from '../core/rng';
import { moveCircle, type Box } from './collision';
import type { LightQuery, WallQuery } from './grid';
import { Navigator } from './nav';
import { hearStrength, type NoiseEvent, type PathDistance } from './noise';
import { canSee } from './vision';

const CELL = WORLD.cellSize;
const ENEMY_CHANNEL = 0x3e;
const ARRIVE = 0.35;
const LOOK_TURN = 1.4;

export type EnemyState = 'dormant' | 'wander' | 'investigate' | 'chase' | 'search' | 'retreat';

/** Lo que la criatura necesita del mundo (World lo cumple; los tests pueden dar uno falso). */
export interface EnemyHost {
  readonly grid: WallQuery & LightQuery;
  readonly paths: PathDistance;
  readonly tuning: DifficultyParams;
  readonly player: { readonly x: number; readonly z: number; readonly crouching: boolean };
  readonly playerHidden: boolean;
  readonly noiseCountThisStep: number;
  noiseAt(i: number): NoiseEvent;
  obstaclesNear(x: number, z: number): readonly Box[];
}

const cellCenter = (c: number): number => (c + 0.5) * CELL;

export class Enemy {
  state: EnemyState = 'dormant';
  x = 0;
  z = 0;
  prevX = 0;
  prevZ = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  /** Segundos en el estado actual. */
  stateTime = 0;
  /** ¿Ve al jugador en este paso? */
  seesPlayer = false;
  /** Fuerza (0..1) del ruido más fuerte oído en este paso. */
  heard = 0;
  /** Distancia total recorrida (para los pasos arrastrados del audio). */
  distance = 0;
  lastKnownX = 0;
  lastKnownZ = 0;
  /** Segundos sin ver al jugador durante la persecución. */
  lostTime = 0;
  searchLeft = 0;
  /** Escondite en el que vio entrar al jugador (lo sabe y va a por él). */
  knownHide: { readonly x: number; readonly z: number } | null = null;
  caught = false;
  /** Señales para la presentación (las calcula el sistema de amenaza): metros de camino y si hay línea de visión. */
  threatDistance = Infinity;
  threatLos = false;
  spawnCount = 0;

  private rng: Rng;
  private readonly nav = new Navigator(ENEMY.navMaxNodes);
  private readonly path: number[] = [];
  private pathIndex = 0;
  private goalX = 0;
  private goalZ = 0;
  private goalCellX = Number.NaN;
  private goalCellZ = Number.NaN;
  private hasGoal = false;
  private arrived = true;
  private repathIn = 0;
  private lookLeft = 0;
  /** Pausa antes de elegir otro destino (al llegar o si no encontró ninguno). */
  private waitLeft = 0;
  private progressTime = 0;
  private progressX = 0;
  private progressZ = 0;
  private readonly pos = { x: 0, z: 0 };

  constructor(
    readonly id: number,
    private readonly seed: number,
  ) {
    this.rng = new Rng(hash3(seed, id, 0, ENEMY_CHANNEL));
  }

  get active(): boolean {
    return this.state !== 'dormant';
  }

  /** Aparece en (x, z). Cada aparición tiene su propio generador: el resultado no depende de las anteriores. */
  spawn(x: number, z: number, yaw: number): void {
    this.spawnCount++;
    this.rng = new Rng(hash3(this.seed, this.id, this.spawnCount, ENEMY_CHANNEL));
    this.x = x;
    this.z = z;
    this.prevX = x;
    this.prevZ = z;
    this.yaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.knownHide = null;
    this.caught = false;
    this.resetProgress();
    this.enter('wander');
  }

  private enter(state: EnemyState): void {
    this.state = state;
    this.stateTime = 0;
    this.lookLeft = 0;
    this.waitLeft = 0;
    this.hasGoal = false;
    this.arrived = true;
    this.path.length = 0;
    this.goalCellX = Number.NaN;
  }

  /** Espera la pausa pendiente; devuelve true cuando ya puede elegir otro destino. */
  private ready(dt: number): boolean {
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      this.yaw = wrapAngle(this.yaw + LOOK_TURN * 0.5 * dt);
      return false;
    }
    return true;
  }

  /** Un paso fijo de lógica. */
  update(host: EnemyHost, dt: number): void {
    if (this.state === 'dormant') return;
    this.prevX = this.x;
    this.prevZ = this.z;
    this.stateTime += dt;
    const p = host.player;

    // Sentidos. Al retirarse no atiende a nada; escondido no se te ve.
    const attentive = this.state !== 'retreat';
    this.seesPlayer =
      attentive &&
      !host.playerHidden &&
      canSee(
        host.grid,
        host.grid,
        this.x,
        this.z,
        this.yaw,
        p.x,
        p.z,
        p.crouching,
        host.tuning.sight,
      );
    let heard = 0;
    let hx = 0;
    let hz = 0;
    if (attentive) {
      for (let i = 0; i < host.noiseCountThisStep; i++) {
        const n = host.noiseAt(i);
        const s = hearStrength(host.paths, host.grid, n, this.x, this.z, host.tuning.hearing);
        if (s > heard) {
          heard = s;
          hx = n.x;
          hz = n.z;
        }
      }
    }
    this.heard = heard;
    if (this.knownHide !== null && !host.playerHidden) this.knownHide = null;

    this.think(host, dt, heard, hx, hz);
    this.move(host, dt);

    // Captura: cerca y sin estar escondido (o escondido donde ella lo vio entrar).
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d < ENEMY.captureDistance && (!host.playerHidden || this.knownHide !== null)) {
      this.caught = true;
    }
  }

  private think(host: EnemyHost, dt: number, heard: number, hx: number, hz: number): void {
    const p = host.player;
    switch (this.state) {
      case 'wander':
      case 'investigate':
      case 'search': {
        if (this.seesPlayer) {
          this.startChase(p.x, p.z);
          return;
        }
        if (heard > 0) this.startInvestigate(host, hx, hz);
        if (this.state === 'wander') {
          if (this.arrived && this.ready(dt)) {
            this.pickWander(host);
            // La próxima vez que llegue, se detiene un momento antes de seguir.
            this.waitLeft = this.rng.range(0.4, 1.6);
          }
        } else if (this.state === 'investigate') {
          if (this.arrived) {
            // Al llegar al ruido se queda mirando alrededor un momento y vuelve a vagar.
            if (this.lookLeft <= 0) this.lookLeft = ENEMY.investigateLookSeconds;
            this.yaw = wrapAngle(this.yaw + LOOK_TURN * dt);
            this.lookLeft -= dt;
            if (this.lookLeft <= 0) this.enter('wander');
          }
        } else {
          this.searchLeft -= dt;
          if (this.searchLeft <= 0) {
            this.startRetreat(host);
            return;
          }
          if (this.arrived && this.ready(dt)) {
            this.pickNear(host, this.lastKnownX, this.lastKnownZ, ENEMY.searchRadiusCells);
            this.waitLeft = this.rng.range(0.3, 1);
          }
        }
        return;
      }
      case 'chase': {
        if (this.seesPlayer) {
          this.lastKnownX = p.x;
          this.lastKnownZ = p.z;
          this.lostTime = 0;
        } else {
          this.lostTime += dt;
          // Mientras persigue, el ruido le dice por dónde vas, pero no le basta para seguir persiguiendo.
          if (heard > 0) {
            this.lastKnownX = hx;
            this.lastKnownZ = hz;
          }
          if (this.lostTime >= ENEMY.loseSeconds && this.knownHide === null) {
            this.startSearch(host);
            return;
          }
        }
        const target = this.knownHide;
        const tx = target !== null ? target.x : this.seesPlayer ? p.x : this.lastKnownX;
        const tz = target !== null ? target.z : this.seesPlayer ? p.z : this.lastKnownZ;
        this.repathIn -= dt;
        if (this.repathIn <= 0) {
          this.repathIn = ENEMY.repathSeconds.chase;
          this.setGoal(host, tx, tz, true);
        } else {
          // Entre recálculos el último tramo apunta al punto exacto.
          this.goalX = tx;
          this.goalZ = tz;
        }
        return;
      }
      case 'retreat': {
        const away = Math.hypot(this.x - p.x, this.z - p.z);
        if (away >= ENEMY.retreatDistance || this.stateTime >= ENEMY.retreatMaxSeconds) {
          this.enter('dormant');
          return;
        }
        if (this.arrived && this.ready(dt)) {
          this.pickAway(host);
          this.waitLeft = 0.3;
        }
        return;
      }
      default:
        return;
    }
  }

  /** Empieza a perseguir. Lo usa también el sistema de escondites al verte entrar. */
  startChase(x: number, z: number): void {
    if (this.state !== 'chase') this.enter('chase');
    this.lastKnownX = x;
    this.lastKnownZ = z;
    this.lostTime = 0;
    this.repathIn = 0;
  }

  /** Te vio entrar en el escondite: va a por ti. */
  sawHiding(x: number, z: number): void {
    this.knownHide = { x, z };
    this.startChase(x, z);
  }

  private startInvestigate(host: EnemyHost, x: number, z: number): void {
    if (this.state !== 'investigate') this.enter('investigate');
    this.lookLeft = 0;
    this.setGoal(host, x, z, false);
  }

  private startSearch(host: EnemyHost): void {
    this.enter('search');
    const s = host.tuning.searchSeconds;
    this.searchLeft = this.rng.range(s.min, s.max);
    this.setGoal(host, this.lastKnownX, this.lastKnownZ, true);
  }

  private startRetreat(host: EnemyHost): void {
    this.enter('retreat');
    this.pickAway(host);
  }

  private pickWander(host: EnemyHost): void {
    const p = host.player;
    const r = ENEMY.wanderRadiusCells;
    for (let attempt = 0; attempt < 6; attempt++) {
      // Según la dificultad, a veces elige un destino alrededor del jugador (sin saber dónde está exactamente).
      const nearPlayer = this.rng.chance(host.tuning.wanderBias);
      const ox = nearPlayer ? p.x : this.x;
      const oz = nearPlayer ? p.z : this.z;
      if (this.tryRandomGoal(host, ox, oz, r.min, r.max)) return;
    }
    this.idle();
  }

  private pickNear(host: EnemyHost, x: number, z: number, radius: number): void {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.tryRandomGoal(host, x, z, 0, radius)) return;
    }
    this.idle();
  }

  private pickAway(host: EnemyHost): void {
    const p = host.player;
    const base = Math.atan2(this.z - p.z, this.x - p.x);
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = base + this.rng.range(-0.7, 0.7);
      const r = this.rng.int(8, 14);
      const gx = Math.floor(this.x / CELL) + Math.round(Math.cos(a) * r);
      const gz = Math.floor(this.z / CELL) + Math.round(Math.sin(a) * r);
      if (host.grid.column(gx, gz)) continue;
      if (this.setGoal(host, cellCenter(gx), cellCenter(gz), true)) return;
    }
    this.idle();
  }

  private tryRandomGoal(
    host: EnemyHost,
    ox: number,
    oz: number,
    min: number,
    max: number,
  ): boolean {
    const a = this.rng.range(0, TAU);
    const r = this.rng.range(min, max);
    const gx = Math.floor(ox / CELL) + Math.round(Math.cos(a) * r);
    const gz = Math.floor(oz / CELL) + Math.round(Math.sin(a) * r);
    if (host.grid.column(gx, gz)) return false;
    return this.setGoal(host, cellCenter(gx), cellCenter(gz), true);
  }

  /** Sin destino posible: se queda quieta mirando alrededor un instante y vuelve a intentarlo. */
  private idle(): void {
    this.waitLeft = Math.max(this.waitLeft, 0.5);
    this.hasGoal = false;
    this.arrived = true;
    this.path.length = 0;
  }

  /**
   * Fija el destino y calcula el camino si cambia de celda (o si `force`).
   * Devuelve false si no hay forma de acercarse (ya está en la celda o no hay camino).
   */
  private setGoal(host: EnemyHost, x: number, z: number, force: boolean): boolean {
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    this.goalX = x;
    this.goalZ = z;
    this.hasGoal = true;
    this.arrived = false;
    if (!force && gx === this.goalCellX && gz === this.goalCellZ) return true;
    this.goalCellX = gx;
    this.goalCellZ = gz;
    const sx = Math.floor(this.x / CELL);
    const sz = Math.floor(this.z / CELL);
    this.pathIndex = 0;
    if (sx === gx && sz === gz) {
      this.path.length = 0;
      return true;
    }
    const result = this.nav.find(host.grid, sx, sz, gx, gz, this.path);
    if (result === 'none') {
      this.idle();
      return false;
    }
    this.resetProgress();
    return true;
  }

  private speedFor(host: EnemyHost): number {
    switch (this.state) {
      case 'chase':
        return host.tuning.chaseSpeed;
      case 'investigate':
        return ENEMY.speed.investigate;
      case 'search':
        return ENEMY.speed.search;
      case 'retreat':
        return ENEMY.speed.retreat;
      default:
        return ENEMY.speed.wander;
    }
  }

  private move(host: EnemyHost, dt: number): void {
    let dirX = 0;
    let dirZ = 0;
    if (this.hasGoal && !this.arrived) {
      // Siguiente punto: centro de la siguiente celda del camino; en la última, el punto exacto.
      let tx = this.goalX;
      let tz = this.goalZ;
      const cells = this.path.length / 2;
      while (this.pathIndex < cells) {
        const last = this.pathIndex === cells - 1;
        tx = last ? this.goalX : cellCenter(this.path[this.pathIndex * 2] as number);
        tz = last ? this.goalZ : cellCenter(this.path[this.pathIndex * 2 + 1] as number);
        if (last || Math.hypot(tx - this.x, tz - this.z) > ARRIVE) break;
        this.pathIndex++;
      }
      if (this.pathIndex >= cells) {
        tx = this.goalX;
        tz = this.goalZ;
      }
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      const finalLeg = this.pathIndex >= cells - 1;
      if (finalLeg && d <= ARRIVE) {
        this.arrived = true;
      } else if (d > 1e-6) {
        dirX = dx / d;
        dirZ = dz / d;
      }
    }
    const speed = this.speedFor(host);
    const k = Math.min(1, ENEMY.acceleration * dt);
    this.vx += (dirX * speed - this.vx) * k;
    this.vz += (dirZ * speed - this.vz) * k;
    this.pos.x = this.x;
    this.pos.z = this.z;
    moveCircle(
      host.grid,
      this.pos,
      this.vx * dt,
      this.vz * dt,
      ENEMY.radius,
      host.obstaclesNear(this.x, this.z),
    );
    const mx = this.pos.x - this.x;
    const mz = this.pos.z - this.z;
    this.vx = mx / dt;
    this.vz = mz / dt;
    this.x = this.pos.x;
    this.z = this.pos.z;
    const moved = Math.hypot(mx, mz);
    this.distance += moved;

    // El cuerpo gira hacia donde camina, con un giro máximo por segundo.
    if (moved > 0.2 * dt) {
      const want = Math.atan2(-mx, -mz);
      const diff = wrapAngle(want - this.yaw);
      const maxTurn = ENEMY.turnRate * dt;
      this.yaw = wrapAngle(this.yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    }

    this.checkProgress(dt);
  }

  private resetProgress(): void {
    this.progressTime = 0;
    this.progressX = this.x;
    this.progressZ = this.z;
  }

  /** Si lleva un rato sin avanzar hacia su destino, recalcula o cambia de destino. */
  private checkProgress(dt: number): void {
    if (!this.hasGoal || this.arrived) {
      this.resetProgress();
      return;
    }
    if (Math.hypot(this.x - this.progressX, this.z - this.progressZ) >= ENEMY.stuckMinProgress) {
      this.resetProgress();
      return;
    }
    this.progressTime += dt;
    if (this.progressTime < ENEMY.stuckSeconds) return;
    this.resetProgress();
    if (this.state === 'chase') {
      this.repathIn = 0;
      return;
    }
    // Atascada: da el destino por terminado y el estado elegirá otro.
    this.idle();
  }
}
