/**
 * HUD en DOM: punto central (ancla visual, desactivable) y overlay de depuración (solo con ?debug).
 */
import { el } from '../ui/dom';

export interface DebugInfo {
  fps: number;
  seed: string;
  cx: number;
  cz: number;
  x: number;
  z: number;
  /** Rumbo en grados. */
  heading: number;
  loaded: number;
  queued: number;
  buildMs: number;
  peakBuildMs: number;
  lights: number;
  calls: number;
  geometries: number;
  textures: number;
  cachedChunks: number;
}

export class Hud {
  private readonly crosshair: HTMLElement;
  private readonly debug: HTMLElement | null;

  constructor(container: HTMLElement, debugEnabled: boolean) {
    this.crosshair = el('div', { className: 'crosshair', attrs: { 'aria-hidden': 'true' } });
    this.crosshair.hidden = true;
    container.appendChild(this.crosshair);
    this.debug = debugEnabled
      ? el('pre', { className: 'debug', attrs: { 'aria-hidden': 'true' } })
      : null;
    if (this.debug !== null) container.appendChild(this.debug);
  }

  setCrosshair(visible: boolean): void {
    this.crosshair.hidden = !visible;
  }

  get debugEnabled(): boolean {
    return this.debug !== null;
  }

  setDebug(info: DebugInfo): void {
    if (this.debug === null) return;
    this.debug.textContent = [
      `FPS ${info.fps.toFixed(0)}`,
      `Semilla ${info.seed}`,
      `Posición ${info.x.toFixed(1)}, ${info.z.toFixed(1)} · Rumbo ${info.heading.toFixed(1)}° · Chunk ${info.cx}, ${info.cz}`,
      `Chunks cargados ${info.loaded} (cola ${info.queued}, caché ${info.cachedChunks})`,
      `Generación ${info.buildMs.toFixed(2)} ms (pico ${info.peakBuildMs.toFixed(2)} ms)`,
      `Luces reales ${info.lights}`,
      `Draw calls ${info.calls}`,
      `Geometrías ${info.geometries} · Texturas ${info.textures}`,
    ].join('\n');
  }
}
