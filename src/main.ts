/**
 * Arranque y bucle principal. Une la lógica pura (World, partida, progreso), el render, la interfaz,
 * la entrada y el audio. La semilla aleatoria se crea aquí con crypto.getRandomValues y la fecha
 * de la semilla del día se lee aquí: nunca en la lógica.
 */
import { startAmbientHum } from './audio/ambient';
import { AudioEngine } from './audio/engine';
import { ExitHum } from './audio/exit';
import { SceneAudio } from './audio/scene-audio';
import { Sfx } from './audio/sfx';
import { InputState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { DynamicResolution } from './core/dynamic-res';
import { parseDebugParams, seedFromBytes } from './core/params';
import { dailySeed } from './core/seeds';
import { HIDING, OBJECTS } from './data/balance';
import type { Action } from './data/controls';
import { getLevel, LEVELS } from './data/levels';
import { META } from './data/meta';
import { QUALITY_PRESETS } from './data/quality';
import { TEXTS } from './data/texts';
import { relativeAngle, SECTOR_ARROWS, sectorOf } from './game/cues';
import { chunkOf } from './game/grid';
import { applyLook } from './game/player';
import { recordDrift, recordLevel, recordRun } from './game/progress';
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
import { EnemyView } from './render/enemy-mesh';
import { Hud } from './render/hud';
import { ObjectsView } from './render/objects';
import { AmbienceBlend } from './render/ambience';
import { createRenderContext, resizeRenderer, type RenderContext } from './render/scene';
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
import { ThreatCues } from './ui/threat-cues';

type State =
  | 'loading'
  | 'start'
  | 'select'
  | 'playing'
  | 'paused'
  | 'levelEnd'
  | 'victory'
  | 'dying'
  | 'defeat'
  | 'error';

/** Duración del fundido a negro tras la captura (sin golpe de sonido). */
const DEFEAT_FADE_SECONDS = 1.5;

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
  /** Estado antes de perder el contexto gráfico (para volver al recuperarlo). */
  private stateBeforeLoss: State = 'start';
  private readonly storage = getStorage();
  private readonly save: SaveData;
  private readonly params = parseDebugParams(window.location.search);
  private readonly input = new InputState();
  private readonly loop = new FixedStepLoop(60);
  private readonly audio = new AudioEngine();
  private readonly sfx = new Sfx(this.audio);
  private readonly sceneAudio = new SceneAudio(this.audio);
  private readonly threatCues = new ThreatCues();
  private readonly controls: SettingsControls;
  private readonly screens: Screens;
  private readonly hud: Hud;
  private readonly events: GameEvent[] = [];
  private world: World | null = null;
  private ctx: RenderContext | null = null;
  /** Niebla, fondo y luz ambiente del nivel (con transición suave entre zonas en Deriva). */
  private ambience: AmbienceBlend | null = null;
  /** Nivel cuyo ambiente (niebla, luz, eco) está puesto; en Deriva cambia al cruzar de zona. */
  private ambienceLevelId = 0;
  /** Resolución dinámica (la escala se guarda en los ajustes). */
  private readonly dynRes: DynamicResolution;
  private view: WorldView | null = null;
  private objects: ObjectsView | null = null;
  private exitHum: ExitHum | null = null;
  private enemyView: EnemyView | null = null;
  /** Fundido al entrar o salir de un escondite (segundos restantes). */
  private hideFade = 0;
  /** Segundos desde la captura (fundido antes de la pantalla de derrota). */
  private dyingTime = 0;
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
    this.dynRes = new DynamicResolution(
      this.save.settings.dynamicResolution ? this.save.settings.renderScale : 1,
    );
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
    this.ambience = new AmbienceBlend(ctx);
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
      // Se recuerda dónde estaba el jugador para volver allí al recuperar el contexto.
      if (this.state !== 'error') this.stateBeforeLoss = this.state;
      this.pause();
      this.state = 'error';
      this.screens.showError(TEXTS.errors.contextLost);
    });
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
    window.addEventListener('resize', () => {
      this.resize();
    });
    this.watchPixelRatio();

    this.state = 'start';
    this.screens.showStart();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Crea el mundo de un nivel (o de una deriva) y su vista, liberando los del anterior. */
  private loadLevel(levelId: number, seed: string, drift = false): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    this.view?.dispose();
    this.objects?.dispose();
    this.exitHum?.dispose();
    this.enemyView?.dispose();
    const level = getLevel(levelId);
    // La dificultad se aplica al cargar el nivel; ?creature=off (depuración) quita las criaturas.
    const world = new World(seed, level, {
      difficulty: this.settings.difficulty,
      creatures: this.params.creatures,
      drift,
    });
    this.world = world;
    this.ambience?.jump(level);
    this.ambienceLevelId = level.id;
    // En Deriva pueden aparecer los tres niveles; en Salida, solo el de la partida.
    this.view = new WorldView(ctx, world.store, drift ? LEVELS : [level], world.seed);
    this.objects = new ObjectsView(ctx.scene, world);
    this.enemyView = new EnemyView(ctx.scene, world.enemies.length);
    this.sceneAudio.setWorld(world);
    this.threatCues.reset();
    this.hideFade = 0;
    this.dyingTime = 0;
    this.hud.setFade(0);
    this.rig = new CameraRig(ctx.camera);
    this.applyQuality();
    this.view.warmUp(world.player.x, world.player.z, 9);
    const exit = world.layout.exit;
    this.exitHum = exit === null ? null : new ExitHum(this.audio, exit.x, exit.z);
    this.exitHum?.setActive(world.exitActive);
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
    // Cambiar la calidad o la resolución dinámica vuelve a la resolución completa.
    if (next.quality !== before.quality || next.dynamicResolution !== before.dynamicResolution) {
      this.dynRes.restore();
      next.renderScale = this.dynRes.scale;
      this.applyQuality();
    }
    this.hud.setCrosshair(next.crosshair);
    if (!next.directionAid) this.hud.setDirection('');
    this.controls.sync();
    this.persist();
  }

  private applyQuality(): void {
    if (this.ctx === null || this.view === null || this.world === null) return;
    const preset = QUALITY_PRESETS[this.settings.quality];
    this.resize();
    this.ambience?.setPreset(preset);
    this.view.applyQuality(preset);
  }

  /**
   * Contexto gráfico recuperado: Three.js vuelve a subir geometrías y texturas por su cuenta.
   * Si se estaba jugando (o en pausa), se vuelve en pausa; si caía la pantalla de derrota, se muestra;
   * desde cualquier otra pantalla se vuelve al menú (el progreso ya está guardado).
   */
  private onContextRestored(): void {
    const before = this.stateBeforeLoss;
    this.stateBeforeLoss = 'start';
    if (before === 'playing' || before === 'paused') {
      this.state = 'paused';
      this.showPause();
    } else if (before === 'dying') {
      this.showDefeat();
    } else {
      this.toMenu();
    }
  }

  /**
   * Cambio de devicePixelRatio sin cambiar el tamaño de la ventana (por ejemplo, al moverla a otro
   * monitor o al hacer zoom): no dispara `resize`, así que se vigila con una media query.
   */
  private watchPixelRatio(): void {
    try {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener(
        'change',
        () => {
          this.resize();
          this.watchPixelRatio();
        },
        { once: true },
      );
    } catch {
      // Sin matchMedia: el redimensionado normal sigue funcionando.
    }
  }

  /** Ajusta el render al tamaño de la ventana, al devicePixelRatio y a la escala dinámica. */
  private resize(): void {
    if (this.ctx === null) return;
    const scale = this.settings.dynamicResolution ? this.dynRes.scale : 1;
    resizeRenderer(this.ctx, QUALITY_PRESETS[this.settings.quality], scale);
  }

  /** Resolución dinámica: mide los FPS mientras se juega y baja un escalón si caen de forma sostenida. */
  private updateDynamicResolution(frameDt: number): void {
    if (!this.settings.dynamicResolution || !this.dynRes.update(frameDt)) return;
    this.save.settings.renderScale = this.dynRes.scale;
    this.resize();
    this.persist();
    this.screens.toast(TEXTS.notices.resolutionLowered, 3);
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
    this.loadLevel(this.run.levelId, chosen, mode === 'drift');
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
    if (w.drift !== null) {
      this.screens.toast(m.driftIntro, 5);
      return;
    }
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
    this.loadLevel(this.run.levelId, this.run.seed, this.run.mode === 'drift');
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
    this.hud.setFade(0);
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
    this.dynRes.reset();
    this.binding?.requestLock();
    this.ctx?.renderer.domElement.focus();
  }

  private showPause(): void {
    const w = this.world;
    if (w !== null) {
      const name = w.drift !== null ? TEXTS.pause.driftName : w.level.name;
      this.screens.showPause(w.seedText, name, w.time);
    }
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

  /** La criatura alcanzó al jugador: se suelta el ratón y la pantalla funde a negro. */
  private onCaught(): void {
    this.state = 'dying';
    this.dyingTime = 0;
    this.input.clear();
    this.binding?.releaseLock();
    this.hud.setVisible(false);
  }

  private showDefeat(): void {
    this.state = 'defeat';
    this.audio.suspend();
    const drift = this.world?.drift ?? null;
    if (drift === null || this.world === null) {
      this.screens.showDefeat();
      return;
    }
    // Deriva: se registra el resultado y se muestra con la mejor marca.
    const result = drift.tracker.result(this.world.time);
    const progress = this.save.progress;
    const newBest = recordDrift(progress, result);
    this.persist();
    this.screens.showDefeat({ ...result, newBest, best: progress.drift });
  }

  private onAction(action: Action, code: string): void {
    if (action === 'mute') {
      const muted = !this.settings.muted;
      this.changeSettings({ muted });
      this.screens.toast(muted ? TEXTS.notices.muted : TEXTS.notices.unmuted, 2);
      return;
    }
    if (this.state === 'dying') return;
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
      } else if (e.type === 'hide') {
        // Fundido corto desde negro: oculta el corte de posición al entrar o salir.
        this.hideFade = HIDING.fadeSeconds;
        this.sfx.play('hide');
        if (subs) this.hud.subtitle(sub.hideDoor, now);
        if (e.seen) this.screens.toast(m.seenHiding, 3);
      } else if (e.type === 'caught') {
        this.onCaught();
      } else {
        this.onLevelComplete();
      }
    }
  }

  /** HUD de juego: resistencia, fusibles, interacción, ayuda de dirección y subtítulo de la salida. */
  private updateHud(world: World, now: number): void {
    const p = world.player;
    this.hud.setStamina(world.stamina.ratio, world.stamina.exhausted);
    if (world.drift !== null) this.hud.setDriftStats(world.drift.tracker.meters, world.time);
    else this.hud.setFuses(world.fusesCollected, world.fusesRequired);
    this.hud.setNoise(world.noiseLevel, world.recentNoise);
    this.hud.setHidden(world.hidden !== null);
    const f = world.focus;
    const h = TEXTS.hud;
    this.hud.setPrompt(
      world.hidden !== null
        ? h.promptLeave
        : world.focusHide !== null
          ? h.promptHide(world.levelAt(world.focusHide.x, world.focusHide.z).hideKind)
          : f === null
            ? ''
            : f.kind === 'fuse'
              ? h.promptFuse
              : world.exitActive
                ? h.promptExit
                : h.promptExitLocked,
    );
    const exit = world.layout.exit;
    // En Deriva no hay salida: ni ayuda de dirección ni subtítulo del zumbido.
    if (exit === null) {
      this.hud.setDirection('');
      return;
    }
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
      if (this.state === 'playing') {
        this.updateHud(world, now);
        this.threatCues.update(world, this.hud, now, this.settings.subtitles);
      }
      this.sceneAudio.update(world, this.exitHum, frameDt);
      this.updateDynamicResolution(frameDt);
    } else if (this.state === 'dying') {
      this.dyingTime += frameDt;
      if (this.dyingTime >= DEFEAT_FADE_SECONDS) this.showDefeat();
    }
    this.hud.tick(now);
    this.hideFade = Math.max(0, this.hideFade - frameDt);
    const dying =
      this.state === 'dying' || this.state === 'defeat'
        ? Math.min(1, this.dyingTime / DEFEAT_FADE_SECONDS)
        : 0;
    this.hud.setFade(Math.max(dying, this.hideFade / HIDING.fadeSeconds));

    const s = this.settings;
    this.rig.update(world.player, alpha, frameDt, s);
    const cam = ctx.camera.position;
    this.updateAmbience(world, cam.x, cam.z, frameDt);
    const debug = this.hud.debugEnabled;
    this.view.update(cam.x, cam.z, world.time, s.reduceFlicker, debug);
    this.objects?.update(world);
    this.enemyView?.update(world.enemies, alpha);
    this.view.threats.set(world.enemies);
    this.audio.setListener(cam.x, cam.y, cam.z, world.player.yaw);
    ctx.renderer.render(ctx.scene, ctx.camera);

    if (debug) this.updateDebug(frameDt, world, ctx);
  };

  /** En Deriva, al cruzar a una zona de otro nivel el ambiente y el eco pasan al suyo poco a poco. */
  private updateAmbience(world: World, x: number, z: number, dt: number): void {
    if (world.drift !== null) {
      const level = world.levelAt(x, z);
      if (level.id !== this.ambienceLevelId) {
        this.ambienceLevelId = level.id;
        this.ambience?.blendTo(level);
        this.audio.whenReady((e) => e.setReverb(level.audio.reverb, level.audio.reverbSeconds));
      }
    }
    this.ambience?.update(dt);
  }

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
      level: world.levelAt(world.player.x, world.player.z).name,
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
      scale: this.settings.dynamicResolution ? this.dynRes.scale : 1,
      calls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      cachedChunks: world.store.size,
      creatures: world.enemies.map(
        (e, i) =>
          `Criatura ${i + 1}: ${e.state} · en ${e.x.toFixed(1)}, ${e.z.toFixed(1)} · camino ${
            Number.isFinite(e.threatDistance) ? e.threatDistance.toFixed(1) : '—'
          } m · ${e.seesPlayer ? 'te ve' : 'no te ve'} · oído ${e.heard.toFixed(2)}`,
      ),
    });
  }
}

const app = document.getElementById('app');
if (app !== null) {
  const game = new Game(app);
  // Dos frames para que "Cargando…" llegue a pintarse antes del trabajo de arranque.
  requestAnimationFrame(() => requestAnimationFrame(() => game.boot()));
}
