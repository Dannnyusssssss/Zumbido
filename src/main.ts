/**
 * Arranque y bucle principal. Une la lógica pura (World), el render, la interfaz, la entrada y el audio.
 * La semilla aleatoria inicial se crea aquí con crypto.getRandomValues, nunca en la lógica.
 */
import { AmbientAudio } from './audio/ambient';
import { InputState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { parseDebugParams, seedFromBytes } from './core/params';
import type { Action } from './data/controls';
import { getLevel } from './data/levels';
import { META } from './data/meta';
import { QUALITY_PRESETS } from './data/quality';
import { TEXTS } from './data/texts';
import { chunkOf } from './game/grid';
import { applyLook } from './game/player';
import { World } from './game/world';
import { CameraRig } from './render/camera-rig';
import { Hud } from './render/hud';
import { applyFog, createRenderContext, resizeRenderer, type RenderContext } from './render/scene';
import { WorldView } from './render/world-view';
import {
  loadSave,
  writeSave,
  type SaveData,
  type Settings,
  type StorageLike,
} from './save/storage';
import { InputBinding } from './ui/input-binding';
import { Screens } from './ui/screens';
import { SettingsControls } from './ui/settings-panel';

type State = 'loading' | 'start' | 'playing' | 'paused' | 'error';

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function randomSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return seedFromBytes(bytes);
}

class Game {
  private state: State = 'loading';
  private readonly storage = getStorage();
  private readonly save: SaveData;
  private readonly params = parseDebugParams(window.location.search);
  private readonly input = new InputState();
  private readonly loop = new FixedStepLoop(60);
  private readonly audio = new AmbientAudio();
  private readonly controls: SettingsControls;
  private readonly screens: Screens;
  private readonly hud: Hud;
  private world: World | null = null;
  private ctx: RenderContext | null = null;
  private view: WorldView | null = null;
  private rig: CameraRig | null = null;
  private binding: InputBinding | null = null;
  private lastTime = 0;
  private saveWarned = false;
  // Medición del overlay de depuración (solo si está activo).
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;

  constructor(private readonly app: HTMLElement) {
    document.title = META.title;
    this.save = loadSave(this.storage, prefersReducedMotion());
    this.controls = new SettingsControls(
      () => this.save.settings,
      (patch) => this.changeSettings(patch),
    );
    this.screens = new Screens(app, this.controls, {
      play: () => this.play(),
      resume: () => this.resume(),
    });
    this.hud = new Hud(app, this.params.debug);
    this.controls.sync();
  }

  get settings(): Settings {
    return this.save.settings;
  }

  /** Crea el mundo y el render. Se hace tras pintar "Cargando…" para que la pantalla no quede en blanco. */
  boot(): void {
    const level = getLevel(1);
    const seed = this.params.seed ?? randomSeed();
    const ctx = createRenderContext(this.app, level);
    if (ctx === null) {
      this.fail(TEXTS.errors.noWebGL);
      return;
    }
    this.ctx = ctx;
    this.world = new World(seed, level);
    this.save.lastSeed = seed;
    this.persist();

    this.view = new WorldView(ctx, this.world.store, level, this.world.seed);
    this.rig = new CameraRig(ctx.camera);
    this.applyQuality();
    this.view.warmUp(this.world.player.x, this.world.player.z, 9);

    this.binding = new InputBinding(ctx.renderer.domElement, this.input, {
      isPlaying: () => this.state === 'playing',
      onAction: (a, code) => this.onAction(a, code),
      onFocusLost: () => this.pause(),
      onPointerLockChange: (locked) => {
        if (!locked && this.state === 'playing') this.pause();
      },
      onPointerLockError: () => {
        if (this.state === 'playing') this.screens.toast(TEXTS.notices.pointerLockFailed, 5);
      },
      onCanvasClick: () => this.binding?.requestLock(),
    });

    const canvas = ctx.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.pause();
      this.state = 'error';
      this.screens.showError(TEXTS.errors.contextLost);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // Three.js vuelve a subir geometrías y texturas por su cuenta; se reanuda en pausa.
      this.state = 'paused';
      if (this.world !== null) this.screens.showPause(this.world.seedText);
    });
    window.addEventListener('resize', () => {
      if (this.ctx !== null) resizeRenderer(this.ctx, QUALITY_PRESETS[this.settings.quality]);
    });

    this.state = 'start';
    this.screens.showStart();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private fail(message: string): void {
    this.state = 'error';
    this.screens.showError(message);
  }

  private persist(): void {
    if (!writeSave(this.storage, this.save) && !this.saveWarned) {
      this.saveWarned = true;
      this.screens.toast(TEXTS.settings.saveFailed, 4);
    }
  }

  private changeSettings(patch: Partial<Settings>): void {
    const before = this.save.settings;
    const next: Settings = { ...before, ...patch };
    this.save.settings = next;
    if (next.muted !== before.muted) this.audio.setMuted(next.muted);
    if (next.quality !== before.quality) this.applyQuality();
    this.hud.setCrosshair(next.crosshair && this.state === 'playing');
    this.controls.sync();
    this.persist();
  }

  private applyQuality(): void {
    if (this.ctx === null || this.view === null) return;
    const preset = QUALITY_PRESETS[this.settings.quality];
    resizeRenderer(this.ctx, preset);
    applyFog(this.ctx, preset);
    this.view.applyQuality(preset);
  }

  private play(): void {
    if (this.state !== 'start') return;
    this.audio.start(this.settings.muted);
    this.enterPlaying();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.audio.resume();
    this.enterPlaying();
  }

  private enterPlaying(): void {
    this.state = 'playing';
    this.screens.hide();
    this.hud.setCrosshair(this.settings.crosshair);
    this.input.clear();
    this.loop.reset();
    this.binding?.requestLock();
    this.ctx?.renderer.domElement.focus();
  }

  private pause(): void {
    if (this.state !== 'playing' || this.world === null) return;
    this.state = 'paused';
    this.input.clear();
    this.binding?.releaseLock();
    this.audio.suspend();
    this.hud.setCrosshair(false);
    this.screens.showPause(this.world.seedText);
  }

  private onAction(action: Action, code: string): void {
    if (action === 'mute') {
      const muted = !this.settings.muted;
      this.changeSettings({ muted });
      this.screens.toast(muted ? TEXTS.notices.muted : TEXTS.notices.unmuted, 2);
      return;
    }
    // Pausa: Esc o P mientras se juega; en la pausa, P continúa y Esc cierra los ajustes.
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') {
      if (this.screens.panel === 'settings') {
        if (code === 'Escape') this.screens.closeSettings();
      } else if (code === 'KeyP') this.resume();
    } else if (this.state === 'start' && this.screens.panel === 'settings' && code === 'Escape') {
      this.screens.closeSettings();
    }
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const frameDt = Math.min(0.25, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const world = this.world;
    const ctx = this.ctx;
    if (world === null || ctx === null || this.view === null || this.rig === null) return;
    if (this.state === 'error') return;

    let alpha = 1;
    if (this.state === 'playing') {
      // La mirada se aplica en cada frame de render (sin retraso); el movimiento va en el paso fijo.
      const s = this.settings;
      applyLook(
        world.player,
        this.input.takeMouseX(),
        this.input.takeMouseY(),
        this.input.axis('turnLeft', 'turnRight'),
        this.input.axis('lookDown', 'lookUp'),
        frameDt,
        s,
      );
      alpha = this.loop.advance(frameDt, (dt) => world.step(dt, this.input));
    }

    const s = this.settings;
    this.rig.update(world.player, alpha, frameDt, s);
    const debug = this.hud.debugEnabled;
    this.view.update(
      ctx.camera.position.x,
      ctx.camera.position.z,
      world.time,
      s.reduceFlicker,
      debug,
    );
    ctx.renderer.render(ctx.scene, ctx.camera);

    if (debug) this.updateDebug(frameDt, world, ctx);
  };

  private updateDebug(frameDt: number, world: World, ctx: RenderContext): void {
    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime < 0.25 || this.view === null) return;
    this.fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    const st = this.view.stats;
    const info = ctx.renderer.info;
    this.hud.setDebug({
      fps: this.fps,
      seed: world.seedText,
      cx: chunkOf(world.player.x),
      cz: chunkOf(world.player.z),
      x: world.player.x,
      z: world.player.z,
      heading: (world.player.yaw * 180) / Math.PI,
      loaded: st.loadedChunks,
      queued: st.queuedChunks,
      buildMs: st.lastBuildMs,
      peakBuildMs: this.view.takePeakBuildMs(),
      lights: st.realLights,
      calls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      cachedChunks: world.store.size,
    });
  }
}

const app = document.getElementById('app');
if (app !== null) {
  const game = new Game(app);
  // Dos frames para que "Cargando…" llegue a pintarse antes del trabajo de arranque.
  requestAnimationFrame(() => requestAnimationFrame(() => game.boot()));
}
