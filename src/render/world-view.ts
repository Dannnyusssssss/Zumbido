/**
 * Vista 3D del mundo: ejecuta el plan de streaming construyendo mallas de chunks dentro de un
 * presupuesto de milisegundos por frame, descarga (con dispose) lo lejano, anima el parpadeo
 * de los paneles y reparte el pool de luces reales. Nunca modifica el estado del juego.
 * Cada nivel tiene su juego de texturas, materiales y panel; se crea cuando aparece su primer chunk
 * (en el modo Deriva conviven chunks de niveles distintos).
 */
import {
  BoxGeometry,
  Color,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from 'three';
import { hashSeed, mix32 } from '../core/rng';
import { HIDING, THREAT, WORLD } from '../data/balance';
import { getLevel, type LevelDef } from '../data/levels';
import type { QualityPreset } from '../data/quality';
import { creatureDim, flickerLevel, type FlickerParams } from '../game/flicker';
import { chunkOf, keyToCx, keyToCz, type ChunkStore } from '../game/grid';
import { planStreaming } from '../game/streaming';
import {
  buildChunkView,
  disposeChunkView,
  type ChunkMaterials,
  type ChunkView,
} from './chunk-mesh';
import { LightPool } from './lights';
import type { RenderContext } from './scene';
import { createWorldTextures, type WorldTextures } from './textures';

export interface ViewStats {
  loadedChunks: number;
  queuedChunks: number;
  /** Milisegundos de generación y construcción en el último frame con trabajo. */
  lastBuildMs: number;
  /** Máximo de milisegundos de construcción por frame en la última ventana. */
  peakBuildMs: number;
  realLights: number;
}

const MAX_THREATS = 4;

/** Texturas, materiales y geometría del panel de un nivel. */
interface LevelLook {
  readonly level: LevelDef;
  readonly materials: ChunkMaterials;
  readonly panelGeometry: BufferGeometry;
  textures: WorldTextures | null;
}

function createLook(level: LevelDef): LevelLook {
  return {
    level,
    materials: {
      floor: new MeshLambertMaterial({ color: 0xffffff }),
      ceiling: new MeshLambertMaterial({ color: 0xffffff }),
      wall: new MeshLambertMaterial({ color: 0xffffff }),
      shelf: new MeshLambertMaterial({ color: 0xffffff }),
      panel: new MeshBasicMaterial({ color: new Color(level.palette.panel) }),
      hide: new MeshLambertMaterial({ color: 0xffffff }),
    },
    panelGeometry: new PlaneGeometry(level.lighting.panelWidth, level.lighting.panelDepth).rotateX(
      Math.PI / 2,
    ),
    textures: null,
  };
}

function disposeLook(look: LevelLook): void {
  look.textures?.dispose();
  look.panelGeometry.dispose();
  const m = look.materials;
  m.floor.dispose();
  m.ceiling.dispose();
  m.wall.dispose();
  m.shelf.dispose();
  m.panel.dispose();
  m.hide.dispose();
}

/** Posiciones de las criaturas activas; las luces cercanas a ellas se atenúan suavemente. */
export class ThreatLights {
  readonly x = new Float64Array(MAX_THREATS);
  readonly z = new Float64Array(MAX_THREATS);
  count = 0;
  time = 0;
  reduce = false;

  set(
    points: readonly { readonly active: boolean; readonly x: number; readonly z: number }[],
  ): void {
    this.count = 0;
    for (const p of points) {
      if (!p.active || this.count >= MAX_THREATS) continue;
      this.x[this.count] = p.x;
      this.z[this.count] = p.z;
      this.count++;
    }
  }

  /** Factor de brillo (1 = normal) de una luz en (px, pz); 1 si no hay criatura cerca. */
  dimAt(px: number, pz: number): number {
    if (this.reduce || this.count === 0) return 1;
    let d = Infinity;
    for (let i = 0; i < this.count; i++) {
      d = Math.min(d, Math.hypot((this.x[i] as number) - px, (this.z[i] as number) - pz));
    }
    return creatureDim(d, this.time, false);
  }

  /** ¿Hay alguna criatura a menos del radio de atenuación de la caja dada? */
  near(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    if (this.reduce) return false;
    const r = THREAT.lightDimRadius;
    for (let i = 0; i < this.count; i++) {
      const x = this.x[i] as number;
      const z = this.z[i] as number;
      if (x > minX - r && x < maxX + r && z > minZ - r && z < maxZ + r) return true;
    }
    return false;
  }
}

export class WorldView {
  private readonly views = new Map<number, ChunkView>();
  /** Copia en arreglo de los chunks cargados para recorrerlos sin crear iteradores por frame. */
  private viewList: ChunkView[] = [];
  private readonly loadedKeys = new Set<number>();
  private queue: number[] = [];
  private currentCx = Number.NaN;
  private currentCz = Number.NaN;
  private radius = 2;
  private budgetMs = 4;
  private preset: QualityPreset | null = null;
  /** Juego de texturas y materiales de cada nivel que ya apareció. */
  private readonly looks = new Map<number, LevelLook>();
  private readonly hideGeometry: BufferGeometry;
  /** Techos de los cuatro vecinos del chunk que se construye (reutilizado). */
  private readonly neighborHeights = [0, 0, 0, 0];
  private readonly lights: LightPool;
  /** Criaturas cerca de las que se atenúan las luces. */
  readonly threats = new ThreatLights();
  /** Chunks con paneles atenuados por una criatura (hay que restaurarlos al alejarse). */
  private readonly dimmed = new Set<number>();
  private readonly tmpColor = new Color();
  private reducedApplied = false;
  readonly stats: ViewStats = {
    loadedChunks: 0,
    queuedChunks: 0,
    lastBuildMs: 0,
    peakBuildMs: 0,
    realLights: 0,
  };
  private peakWindow = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly store: ChunkStore,
    /** Niveles que pueden aparecer (uno en el modo Salida, todos en Deriva). */
    levels: readonly LevelDef[],
    private readonly seedHash: number,
  ) {
    this.hideGeometry = new BoxGeometry(HIDING.width, HIDING.height, HIDING.depth);
    this.lights = new LightPool(ctx.scene, levels);
  }

  /** Juego del nivel; se crea (con las texturas de la calidad actual) la primera vez que se pide. */
  private look(level: LevelDef): LevelLook {
    let look = this.looks.get(level.id);
    if (look === undefined) {
      look = createLook(level);
      this.looks.set(level.id, look);
      if (this.preset !== null) this.applyTextures(look, this.preset);
    }
    return look;
  }

  /** (Re)crea las texturas de un nivel con la calidad dada y las asigna a sus materiales. */
  private applyTextures(look: LevelLook, preset: QualityPreset): void {
    look.textures?.dispose();
    const texSeed = mix32(this.seedHash ^ hashSeed(look.level.name));
    const t = createWorldTextures(texSeed, look.level, preset.textureSize, preset.anisotropy);
    look.textures = t;
    const m = look.materials;
    (m.floor as MeshLambertMaterial).map = t.floor;
    (m.ceiling as MeshLambertMaterial).map = t.ceiling;
    (m.wall as MeshLambertMaterial).map = t.wall;
    (m.shelf as MeshLambertMaterial).map = t.shelf;
    (m.hide as MeshLambertMaterial).map = t.hide;
    m.shelf.needsUpdate = true;
    m.hide.needsUpdate = true;
    m.floor.needsUpdate = true;
    m.ceiling.needsUpdate = true;
    m.wall.needsUpdate = true;
  }

  /** Nivel del chunk que contiene (x, z) en metros. */
  levelAt(x: number, z: number): LevelDef {
    return this.store.levelAt(chunkOf(x), chunkOf(z));
  }

  /** Aplica una calidad: texturas, radio de carga, presupuesto y número de luces. */
  applyQuality(preset: QualityPreset): void {
    this.preset = preset;
    for (const look of this.looks.values()) this.applyTextures(look, preset);
    this.radius = preset.chunkRadius;
    this.budgetMs = preset.buildBudgetMs;
    this.lights.setCount(preset.realLights);
    // Fuerza a recalcular el plan con el nuevo radio.
    this.currentCx = Number.NaN;
  }

  /** Construye de inmediato los chunks más cercanos (antes del primer frame, tras la pantalla de carga). */
  warmUp(x: number, z: number, count: number): void {
    this.refreshPlan(x, z, true);
    for (let i = 0; i < count && this.queue.length > 0; i++) this.buildNext();
  }

  private refreshPlan(x: number, z: number, force: boolean): void {
    const cx = chunkOf(x);
    const cz = chunkOf(z);
    if (!force && cx === this.currentCx && cz === this.currentCz) return;
    this.currentCx = cx;
    this.currentCz = cz;
    const plan = planStreaming(this.loadedKeys, cx, cz, this.radius);
    for (const key of plan.toUnload) this.unload(key);
    this.queue = plan.toLoad;
  }

  private buildNext(): void {
    const key = this.queue.shift();
    if (key === undefined || this.views.has(key)) return;
    const cx = keyToCx(key);
    const cz = keyToCz(key);
    const chunk = this.store.get(cx, cz);
    const look = this.look(getLevel(chunk.levelId));
    // Techos de los vecinos (oeste, este, norte, sur) para los faldones entre niveles.
    const at = this.store.levelAt;
    const nh = this.neighborHeights;
    nh[0] = at(cx - 1, cz).ceilingHeight;
    nh[1] = at(cx + 1, cz).ceilingHeight;
    nh[2] = at(cx, cz - 1).ceilingHeight;
    nh[3] = at(cx, cz + 1).ceilingHeight;
    const view = buildChunkView(
      key,
      chunk,
      look.level,
      look.materials,
      look.panelGeometry,
      this.seedHash,
      this.hideGeometry,
      nh,
    );
    this.ctx.scene.add(view.mesh);
    if (view.panels !== null) this.ctx.scene.add(view.panels);
    if (view.hides !== null) this.ctx.scene.add(view.hides);
    this.views.set(key, view);
    this.loadedKeys.add(key);
    this.viewList.push(view);
    this.reducedApplied = false;
  }

  private unload(key: number): void {
    const view = this.views.get(key);
    if (view === undefined) return;
    this.ctx.scene.remove(view.mesh);
    if (view.panels !== null) this.ctx.scene.remove(view.panels);
    if (view.hides !== null) this.ctx.scene.remove(view.hides);
    this.dimmed.delete(key);
    disposeChunkView(view);
    this.views.delete(key);
    this.loadedKeys.delete(key);
    this.viewList = this.viewList.filter((v) => v !== view);
  }

  /** Llamar una vez por frame de render. */
  update(x: number, z: number, time: number, reduceFlicker: boolean, measure: boolean): void {
    this.refreshPlan(x, z, false);

    // Construcción repartida entre frames: como mínimo un chunk por frame, y más si sobra presupuesto.
    if (this.queue.length > 0) {
      const start = performance.now();
      do {
        this.buildNext();
      } while (this.queue.length > 0 && performance.now() - start < this.budgetMs * 0.5);
      if (measure) {
        const ms = performance.now() - start;
        this.stats.lastBuildMs = ms;
        this.peakWindow = Math.max(this.peakWindow, ms);
      }
    }

    this.threats.time = time;
    this.threats.reduce = reduceFlicker;
    this.updateFlicker(time, reduceFlicker);
    this.updateThreatDim(time, reduceFlicker);
    this.lights.update(this.viewList, x, z, time, reduceFlicker, this.threats);

    if (measure) {
      this.stats.loadedChunks = this.views.size;
      this.stats.queuedChunks = this.queue.length;
      this.stats.realLights = this.lights.activeCount;
    }
  }

  /** Cierra la ventana de medición del pico de construcción (la llama el overlay de depuración). */
  takePeakBuildMs(): number {
    const v = this.peakWindow;
    this.peakWindow = 0;
    this.stats.peakBuildMs = v;
    return v;
  }

  private updateFlicker(time: number, reduceFlicker: boolean): void {
    // Con "Reducir parpadeo" se fija el brillo una vez y no se vuelve a tocar.
    if (reduceFlicker && this.reducedApplied) return;
    for (const v of this.viewList) {
      if (v.panels === null || v.flicker.length === 0) continue;
      for (let i = 0; i < v.flicker.length; i++) {
        const level = flickerLevel(v.flicker[i] as FlickerParams, time, reduceFlicker);
        this.tmpColor.setScalar(level);
        v.panels.setColorAt(v.flickerInstance[i] as number, this.tmpColor);
      }
      if (v.panels.instanceColor !== null) v.panels.instanceColor.needsUpdate = true;
    }
    this.reducedApplied = reduceFlicker;
  }

  /**
   * Paneles cerca de una criatura: su brillo pasa a ser el vaivén lento de la atenuación (sustituye
   * al parpadeo propio, nunca se suman). Al alejarse, el chunk vuelve a su brillo normal.
   */
  private updateThreatDim(time: number, reduceFlicker: boolean): void {
    const size = WORLD.cellSize * WORLD.chunkCells;
    for (const v of this.viewList) {
      if (v.panels === null) continue;
      const cx = keyToCx(v.key) * size;
      const cz = keyToCz(v.key) * size;
      const near = this.threats.near(cx, cz, cx + size, cz + size);
      if (!near && !this.dimmed.has(v.key)) continue;
      for (let i = 0; i < v.panelX.length; i++) {
        const fi = v.panelFlicker[i] as number;
        const own = fi >= 0 ? flickerLevel(v.flicker[fi] as FlickerParams, time, reduceFlicker) : 1;
        const dim = near ? this.threats.dimAt(v.panelX[i] as number, v.panelZ[i] as number) : 1;
        this.tmpColor.setScalar(dim < 1 ? dim : own);
        v.panels.setColorAt(i, this.tmpColor);
      }
      if (v.panels.instanceColor !== null) v.panels.instanceColor.needsUpdate = true;
      if (near) this.dimmed.add(v.key);
      else this.dimmed.delete(v.key);
    }
  }

  dispose(): void {
    for (const key of [...this.views.keys()]) this.unload(key);
    this.hideGeometry.dispose();
    this.lights.dispose();
    for (const look of this.looks.values()) disposeLook(look);
    this.looks.clear();
  }
}
