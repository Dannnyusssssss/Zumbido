/**
 * HUD en DOM: punto central, resistencia, fusibles, indicación de interacción, subtítulos de sonido,
 * ayuda de dirección y overlay de depuración. Todo lleva texto además de color.
 * Solo actualiza el DOM cuando cambia lo que muestra.
 */
import { TEXTS } from '../data/texts';
import { el } from '../ui/dom';

export interface DebugInfo {
  fps: number;
  seed: string;
  level: string;
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

interface Subtitle {
  node: HTMLElement;
  until: number;
}

const SUBTITLE_SECONDS = 3.5;
const MAX_SUBTITLES = 3;

export class Hud {
  private readonly layer: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly debug: HTMLElement | null;
  private readonly stamina: HTMLElement;
  private readonly staminaFill: HTMLElement;
  private readonly staminaText: HTMLElement;
  private readonly fuses: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly direction: HTMLElement;
  private readonly subtitles: HTMLElement;
  private readonly active: Subtitle[] = [];
  private last = { stamina: -1, exhausted: false, fuses: '', prompt: '', direction: '' };

  constructor(container: HTMLElement, debugEnabled: boolean) {
    this.layer = el('div', { className: 'hud', attrs: { 'aria-hidden': 'false' } });
    this.crosshair = el('div', { className: 'crosshair', attrs: { 'aria-hidden': 'true' } });
    this.staminaFill = el('div', { className: 'bar-fill' });
    this.staminaText = el('span', { className: 'bar-text' });
    this.stamina = el('div', { className: 'stamina' }, [
      el('div', { className: 'bar' }, [this.staminaFill]),
      this.staminaText,
    ]);
    this.fuses = el('div', { className: 'fuses' });
    this.prompt = el('div', { className: 'prompt' });
    this.direction = el('div', { className: 'direction' });
    this.subtitles = el('div', {
      className: 'subtitles',
      attrs: { role: 'log', 'aria-live': 'polite' },
    });
    for (const n of [this.crosshair, this.stamina, this.fuses, this.prompt, this.direction])
      n.hidden = true;
    this.layer.append(
      this.crosshair,
      this.stamina,
      this.fuses,
      this.prompt,
      this.direction,
      this.subtitles,
    );
    this.layer.hidden = true;
    container.appendChild(this.layer);
    this.debug = debugEnabled
      ? el('pre', { className: 'debug', attrs: { 'aria-hidden': 'true' } })
      : null;
    if (this.debug !== null) container.appendChild(this.debug);
  }

  /** Muestra u oculta todo el HUD de juego (no el overlay de depuración). */
  setVisible(visible: boolean): void {
    this.layer.hidden = !visible;
  }

  setCrosshair(visible: boolean): void {
    this.crosshair.hidden = !visible;
  }

  /** Resistencia: solo visible cuando no está llena. */
  setStamina(ratio: number, exhausted: boolean): void {
    const pct = Math.round(ratio * 100);
    if (pct === this.last.stamina && exhausted === this.last.exhausted) return;
    this.last.stamina = pct;
    this.last.exhausted = exhausted;
    this.stamina.hidden = pct >= 100;
    this.staminaFill.style.width = `${pct}%`;
    this.stamina.classList.toggle('low', exhausted);
    this.staminaText.textContent = exhausted
      ? `${TEXTS.hud.stamina} ${pct} % (${TEXTS.hud.exhausted})`
      : `${TEXTS.hud.stamina} ${pct} %`;
  }

  setFuses(collected: number, required: number): void {
    const text = required > 0 ? `${TEXTS.hud.fuses} ${collected}/${required}` : '';
    if (text === this.last.fuses) return;
    this.last.fuses = text;
    this.fuses.textContent = text;
    this.fuses.hidden = text === '';
  }

  setPrompt(text: string): void {
    if (text === this.last.prompt) return;
    this.last.prompt = text;
    this.prompt.textContent = text;
    this.prompt.hidden = text === '';
  }

  setDirection(text: string): void {
    if (text === this.last.direction) return;
    this.last.direction = text;
    this.direction.textContent = text;
    this.direction.hidden = text === '';
  }

  /** Añade un subtítulo de sonido; si ya está el mismo texto, solo renueva su duración. */
  subtitle(text: string, now: number): void {
    const existing = this.active.find((s) => s.node.textContent === text);
    if (existing !== undefined) {
      existing.until = now + SUBTITLE_SECONDS;
      return;
    }
    const node = el('p', { text });
    this.subtitles.appendChild(node);
    this.active.push({ node, until: now + SUBTITLE_SECONDS });
    while (this.active.length > MAX_SUBTITLES) this.active.shift()?.node.remove();
  }

  /** Quita los subtítulos caducados. `now` en segundos de reloj real. */
  tick(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i] as Subtitle;
      if (s.until <= now) {
        s.node.remove();
        this.active.splice(i, 1);
      }
    }
  }

  clearTransient(): void {
    for (const s of this.active) s.node.remove();
    this.active.length = 0;
    this.setPrompt('');
    this.setDirection('');
  }

  get debugEnabled(): boolean {
    return this.debug !== null;
  }

  setDebug(info: DebugInfo): void {
    if (this.debug === null) return;
    this.debug.textContent = [
      `FPS ${info.fps.toFixed(0)}`,
      `Semilla ${info.seed} · ${info.level}`,
      `Posición ${info.x.toFixed(1)}, ${info.z.toFixed(1)} · Rumbo ${info.heading.toFixed(1)}° · Chunk ${info.cx}, ${info.cz}`,
      `Chunks cargados ${info.loaded} (cola ${info.queued}, caché ${info.cachedChunks})`,
      `Generación ${info.buildMs.toFixed(2)} ms (pico ${info.peakBuildMs.toFixed(2)} ms)`,
      `Luces reales ${info.lights}`,
      `Draw calls ${info.calls}`,
      `Geometrías ${info.geometries} · Texturas ${info.textures}`,
    ].join('\n');
  }
}
