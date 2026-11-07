/**
 * Arranque y bucle principal. Une la lógica pura (World, partida, progreso), el render, la interfaz,
 * la entrada y el audio. La semilla aleatoria se crea aquí con crypto.getRandomValues y la fecha
 * de la semilla del día se lee aquí: nunca en la lógica.
 */
import { startAmbientHum } from './audio/ambient';
import { AudioEngine } from './audio/engine';
import { ExitHum } from './audio/exit';
import { Sfx } from './audio/sfx';
import { InputState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { parseDebugParams, seedFromBytes } from './core/params';
import { dailySeed } from './core/seeds';
import { OBJECTS } from './data/balance';
import type { Action } from './data/controls';
import { getLevel } from './data/levels';
import { META } from './data/meta';
import { QUALITY_PRESETS } from './data/quality';
import { TEXTS } from './data/texts';
import { relativeAngle, SECTOR_ARROWS, sectorOf } from './game/cues';
import { chunkOf } from './game/grid';
import { applyLook } from './game/player';
import { recordLevel, recordRun } from './game/progress';
import {
  advanceRun,
  completeLevel,
  retryLevel,
  startRun,
  type RunMode,
  type RunState,
} from './game/run';
import { World, type GameEvent } from './game/world';
import { CameraRig } from './render/camera-rig';
import { Hud } from './render/hud';
import { ObjectsView } from './render/objects';
import {
  applyFog,
  applyLevelLook,
  createRenderContext,
  resizeRenderer,
  type RenderContext,
} from './render/scene';
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

type State =
  'loading' | 'start' | 'select' | 'playing' | 'paused' | 'levelEnd' | 'victory' | 'error';

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

function todaySeed(): string {
  const d = new Date();
  return dailySeed(d.getFullYear(), d.getMonth() + 1, d.getDate()) ?? 'D00000000';
}

class Game {
  private state: State = 'loading';
  private readonly storage = getStorage();
  private readonly save: SaveData;
  private readonly params = parseDebugParams(window.location.search);
  private readonly input = new InputState();
  private readonly loop = new FixedStepLoop(60);
  private readonly audio = new AudioEngine();
  private readonly sfx = new Sfx(this.audio);
  private readonly controls: SettingsControls;
  private readonly screens: Screens;
  private readonly hud: Hud;
  private readonly events: GameEvent[] = [];
  private world: World | null = null;
  private ctx: RenderContext | null = null;
  private view: WorldView | null = null;
  private objects: ObjectsView | null = null;
  private exitHum: ExitHum | null = null;
  private rig: CameraRig | null = null;
  private binding: InputBinding | null = null;
  private run: RunState | null = null;
  private humStarted = false;
  private lastTime = 0;
  private lastExitCue = -Infinity;
  private saveWarned = false;
  // Medición del overlay de depuración (solo si está activo).
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(private readonly app: HTMLElement) {
    document.title = META.title;
    this.save = loadSave(this.storage, prefersReducedMotion());
    this.controls = new SettingsControls(
      () => this.save.settings,
      (patch) => this.changeSettings(patch),
    );
    this.screens = new Screens(app, this.controls, {
      openSelect: () => this.openSelect(),
      start: (mode, levelId, seed) => this.startRun(mode, levelId, seed),
      resume: () => this.resume(),
      retry: () => this.retry(),
      menu: () => this.toMenu(),
      next: () => this.next(),
    });
    this.hud = new Hud(app, this.params.debug);
    this.controls.sync();
    if (this.params.seed !== null) this.screens.presetSeed(this.params.seed);
  }

  get settings(): Settings {
    return this.save.settings;
  }

  /** Crea el render y un mundo de fondo para el menú. Se hace tras pintar "Cargando…". */
  boot(): void {
    const level = getLevel(1);
    const ctx = createRenderContext(this.app, level);
    if (ctx === null) {
      this.fail(TEXTS.errors.noWebGL);
      return;
    }
    this.ctx = ctx;
    this.loadLevel(1, this.params.seed ?? randomSeed());

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
      this.showPause();
    });
    window.addEventListener('resize', () => {
      if (this.ctx !== null) resizeRenderer(this.ctx, QUALITY_PRESETS[this.settings.quality]);
    });

    this.state = 'start';
    this.screens.showStart();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Crea el mundo de un nivel y su vista, liberando los del nivel anterior. */
  private loadLevel(levelId: number, seed: string): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    this.view?.dispose();
    this.objects?.dispose();
    this.exitHum?.dispose();
    const level = getLevel(levelId);
    const world = new World(seed, level);
    this.world = world;
    applyLevelLook(ctx, level);
    this.view = new WorldView(ctx, world.store, level, world.seed);
    this.objects = new ObjectsView(ctx.scene, world);
    this.rig = new CameraRig(ctx.camera);
    this.applyQuality();
    this.view.warmUp(world.player.x, world.player.z, 9);
    this.exitHum = new ExitHum(this.audio, world.layout.exit.x, world.layout.exit.z);
    this.exitHum.setActive(world.exitActive);
    this.audio.whenReady((e) => e.setReverb(level.audio.reverb, level.audio.reverbSeconds));
    this.lastExitCue = -Infinity;
    this.hud.clearTransient();
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
    this.hud.setCrosshair(next.crosshair);
    if (!next.directionAid) this.hud.setDirection('');
    this.controls.sync();
    this.persist();
  }

  private applyQuality(): void {
    if (this.ctx === null || this.view === null || this.world === null) return;
    const preset = QUALITY_PRESETS[this.settings.quality];
    resizeRenderer(this.ctx, preset);
    applyFog(this.ctx, preset, this.world.level.lighting.fogScale);
    this.view.applyQuality(preset);
  }

  private openSelect(): void {
    this.state = 'select';
    this.screens.showSelect(this.save.progress, todaySeed());
  }

  /** Empieza una partida (desde un clic: permite audio y captura del puntero). */
  private startRun(mode: RunMode, levelId: number, seed: string | null): void {
    const chosen = seed ?? randomSeed();
    this.run = startRun(mode, levelId, chosen);
    this.save.lastSeed = chosen;
    this.persist();
    this.ensureAudio();
    this.loadLevel(this.run.levelId, chosen);
    this.enterPlaying();
    this.announceLevel();
  }

  private ensureAudio(): void {
    this.audio.start(this.settings.muted);
    if (!this.humStarted) {
      this.humStarted = true;
      this.audio.whenReady((e) => startAmbientHum(e));
    }
    this.audio.resume();
  }

  private announceLevel(): void {
    const w = this.world;
    if (w === null) return;
    const m = TEXTS.messages;
    const goal = w.fusesRequired > 0 ? m.objectiveFuses(w.fusesRequired) : m.objectiveExit;
    this.screens.toast(`${m.levelIntro(w.level.id, w.level.name)}. ${goal}`, 5);
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.ensureAudio();
    this.enterPlaying();
  }

  private retry(): void {
    if (this.run === null) return;
    retryLevel(this.run);
    this.ensureAudio();
    this.loadLevel(this.run.levelId, this.run.seed);
    this.enterPlaying();
    this.announceLevel();
  }

  private next(): void {
    if (this.run === null || !advanceRun(this.run)) return;
    this.ensureAudio();
    this.loadLevel(this.run.levelId, this.run.seed);
    this.enterPlaying();
    this.announceLevel();
  }

  private toMenu(): void {
    this.state = 'start';
    this.run = null;
    this.binding?.releaseLock();
    this.hud.setVisible(false);
    this.audio.resume();
    this.screens.showStart();
  }

  private enterPlaying(): void {
    this.state = 'playing';
    this.screens.hide();
    this.hud.setVisible(true);
    this.hud.setCrosshair(this.settings.crosshair);
    this.input.clear();
    this.loop.reset();
    this.binding?.requestLock();
    this.ctx?.renderer.domElement.focus();
  }

  private showPause(): void {
    const w = this.world;
    if (w !== null) this.screens.showPause(w.seedText, w.level.name, w.time);
  }

  private pause(): void {
    if (this.state !== 'playing' || this.world === null) return;
    this.state = 'paused';
    this.input.clear();
    this.binding?.releaseLock();
    this.audio.suspend();
    this.hud.setVisible(false);
    this.showPause();
  }

  private onLevelComplete(): void {
    const world = this.world;
    const run = this.run;
    if (world === null || run === null) return;
    this.state = 'levelEnd';
    this.input.clear();
    this.binding?.releaseLock();
    this.hud.setVisible(false);
    const result = completeLevel(run, world.time);
    const progress = this.save.progress;
    const newBest = recordLevel(progress, result.levelId, result.time);
    if (result.runFinished && result.runTotal !== null) {
      const runBest = recordRun(progress, result.runTotal);
      this.persist();
      this.state = 'victory';
      this.screens.showVictory({
        total: result.runTotal,
        best: progress.bestRun,
        newBest: runBest,
      });
      return;
    }
    this.persist();
    const next = result.nextLevelId === null ? null : getLevel(result.nextLevelId);
    this.screens.showLevelEnd({
      levelName: world.level.name,
      time: result.time,
      best: progress.bestTimes[result.levelId - 1] ?? null,
      newBest,
      next: next === null ? null : TEXTS.results.continueTo(next.id, next.name),
    });
  }

  private onAction(action: Action, code: string): void {
    if (action === 'mute') {
      const muted = !this.settings.muted;
      this.changeSettings({ muted });
      this.screens.toast(muted ? TEXTS.notices.muted : TEXTS.notices.unmuted, 2);
      return;
    }
    const panel = this.screens.panel;
    // Pausa: Esc o P mientras se juega; en la pausa, P continúa y Esc cierra los ajustes.
    if (this.state === 'playing') this.pause();
    else if (panel === 'settings') {
      if (code === 'Escape') this.screens.closeSettings();
    } else if (this.state === 'paused') {
      if (code === 'KeyP') this.resume();
    } else if (this.state === 'select' && code === 'Escape') {
      this.state = 'start';
      this.screens.showStart();
    }
  }

  /** Sucesos del mundo: sonido, avisos y subtítulos. */
  private handleEvents(world: World, now: number): void {
    const m = TEXTS.messages;
    const sub = TEXTS.subtitles;
    const subs = this.settings.subtitles;
    for (const e of world.drainEvents(this.events)) {
      if (e.type === 'chalk') {
        this.sfx.play('chalk');
        if (subs) this.hud.subtitle(sub.chalk, now);
      } else if (e.type === 'fuse') {
        this.sfx.play('pickup');
        this.screens.toast(m.fusePicked(e.remaining), 3);
        if (subs) this.hud.subtitle(sub.pickup, now);
      } else if (e.type === 'exitActivated') {
        this.sfx.play('activated');
        this.exitHum?.setActive(true);
        this.screens.toast(m.exitActivated, 4);
        if (subs) this.hud.subtitle(sub.activated, now);
      } else if (e.type === 'exitLocked') {
        this.sfx.play('locked');
        this.screens.toast(m.exitLocked(e.missing), 3);
        if (subs) this.hud.subtitle(sub.locked, now);
      } else {
        this.onLevelComplete();
      }
    }
  }

  /** HUD de juego: resistencia, fusibles, interacción, ayuda de dirección y subtítulo de la salida. */
  private updateHud(world: World, now: number): void {
    const p = world.player;
    this.hud.setStamina(world.stamina.ratio, world.stamina.exhausted);
    this.hud.setFuses(world.fusesCollected, world.fusesRequired);
    const f = world.focus;
    const h = TEXTS.hud;
    this.hud.setPrompt(
      f === null
        ? ''
        : f.kind === 'fuse'
          ? h.promptFuse
          : world.exitActive
            ? h.promptExit
            : h.promptExitLocked,
    );
    const exit = world.layout.exit;
    const sector = sectorOf(relativeAngle(p.x, p.z, p.yaw, exit.x, exit.z));
    const dirText = TEXTS.subtitles.directions[sector] ?? '';
    this.hud.setDirection(
      this.settings.directionAid
        ? `${h.directionAid}: ${SECTOR_ARROWS[sector] ?? ''} ${dirText}`
        : '',
    );
    // El zumbido de la salida se oye cerca: su subtítulo dice de qué lado viene.
    const dist = Math.hypot(exit.x - p.x, exit.z - p.z);
    if (
      this.settings.subtitles &&
      dist < OBJECTS.exitCueRange &&
      world.time - this.lastExitCue >= OBJECTS.exitCueInterval
    ) {
      this.lastExitCue = world.time;
      this.hud.subtitle(TEXTS.subtitles.exitHum(dirText), now);
    }
  }

  private readonly frame = (nowMs: number): void => {
    requestAnimationFrame(this.frame);
    const frameDt = Math.min(0.25, Math.max(0, (nowMs - this.lastTime) / 1000));
    this.lastTime = nowMs;
    const now = nowMs / 1000;
    const world = this.world;
    const ctx = this.ctx;
    if (world === null || ctx === null || this.view === null || this.rig === null) return;
    if (this.state === 'error') return;

    let alpha = 1;
    if (this.state === 'playing') {
      // La mirada se aplica en cada frame de render (sin retraso); el movimiento va en el paso fijo.
      applyLook(
        world.player,
        this.input.takeMouseX(),
        this.input.takeMouseY(),
        this.input.axis('turnLeft', 'turnRight'),
        this.input.axis('lookDown', 'lookUp'),
        frameDt,
        this.settings,
      );
      alpha = this.loop.advance(frameDt, (dt) => world.step(dt, this.input));
      this.handleEvents(world, now);
      if (this.state === 'playing') this.updateHud(world, now);
    }
    this.hud.tick(now);

    const s = this.settings;
    this.rig.update(world.player, alpha, frameDt, s);
    const cam = ctx.camera.position;
    const debug = this.hud.debugEnabled;
    this.view.update(cam.x, cam.z, world.time, s.reduceFlicker, debug);
    this.objects?.update(world);
    this.audio.setListener(cam.x, cam.y, cam.z, world.player.yaw);
    ctx.renderer.render(ctx.scene, ctx.camera);

    if (debug) this.updateDebug(frameDt, world, ctx);
  };

  private updateDebug(frameDt: number, world: World, ctx: RenderContext): void {
    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime < 0.25 || this.view === null) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    const st = this.view.stats;
    const info = ctx.renderer.info;
    this.hud.setDebug({
      fps,
      seed: world.seedText,
      level: world.level.name,
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
