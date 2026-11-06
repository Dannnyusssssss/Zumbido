/**
 * Vista 3D del mundo: ejecuta el plan de streaming construyendo mallas de chunks dentro de un
 * presupuesto de milisegundos por frame, descarga (con dispose) lo lejano, anima el parpadeo
 * de los paneles y reparte el pool de luces reales. Nunca modifica el estado del juego.
 */
import {
  Color,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from 'three';
import { hashSeed, mix32 } from '../core/rng';
import type { LevelDef } from '../data/levels';
import type { QualityPreset } from '../data/quality';
import { flickerLevel, type FlickerParams } from '../game/flicker';
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
  private textures: WorldTextures | null = null;
  private readonly materials: ChunkMaterials;
  private readonly panelGeometry: BufferGeometry;
  private readonly lights: LightPool;
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
    private readonly level: LevelDef,
    private readonly seedHash: number,
  ) {
    this.materials = {
      floor: new MeshLambertMaterial({ color: 0xffffff }),
      ceiling: new MeshLambertMaterial({ color: 0xffffff }),
      wall: new MeshLambertMaterial({ color: 0xffffff }),
      panel: new MeshBasicMaterial({ color: new Color(level.palette.panel) }),
    };
    this.panelGeometry = new PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2);
    this.lights = new LightPool(ctx.scene, level);
  }

  /** Aplica una calidad: texturas, radio de carga, presupuesto y número de luces. */
  applyQuality(preset: QualityPreset): void {
    this.textures?.dispose();
    const texSeed = mix32(this.seedHash ^ hashSeed(this.level.name));
    this.textures = createWorldTextures(
      texSeed,
      this.level.palette,
      preset.textureSize,
      preset.anisotropy,
    );
    const m = this.materials;
    (m.floor as MeshLambertMaterial).map = this.textures.floor;
    (m.ceiling as MeshLambertMaterial).map = this.textures.ceiling;
    (m.wall as MeshLambertMaterial).map = this.textures.wall;
    m.floor.needsUpdate = true;
    m.ceiling.needsUpdate = true;
    m.wall.needsUpdate = true;
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
    const chunk = this.store.get(keyToCx(key), keyToCz(key));
    const view = buildChunkView(
      key,
      chunk,
      this.level,
      this.materials,
      this.panelGeometry,
      this.seedHash,
    );
    this.ctx.scene.add(view.mesh);
    if (view.panels !== null) this.ctx.scene.add(view.panels);
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

    this.updateFlicker(time, reduceFlicker);
    this.lights.update(this.viewList, x, z, time, reduceFlicker);

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

  dispose(): void {
    for (const key of [...this.views.keys()]) this.unload(key);
    this.lights.dispose();
    this.textures?.dispose();
    this.panelGeometry.dispose();
    this.materials.floor.dispose();
    this.materials.ceiling.dispose();
    this.materials.wall.dispose();
    this.materials.panel.dispose();
  }
}
