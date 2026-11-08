/**
 * HUD en DOM: punto central, resistencia, fusibles, ruido del jugador, cercanía de la criatura,
 * indicación de interacción, subtítulos de sonido, ayuda de dirección, viñeta direccional,
 * vista por rendijas al estar escondido, fundido a negro y overlay de depuración.
 * Todo lleva texto además de color. Solo actualiza el DOM cuando cambia lo que muestra.
 */
import { NOISE } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { NoiseLevel } from '../game/noise';
import { formatTime } from '../game/progress';
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
  /** Escala de la resolución interna (resolución dinámica). */
  scale: number;
  calls: number;
  geometries: number;
  textures: number;
  cachedChunks: number;
  /** Una línea por criatura: estado, distancia y si ve al jugador. */
  creatures: string[];
}

const NOISE_BARS = 5;

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
  /** Última distancia y tiempo mostrados en Deriva (evita rehacer el texto en cada frame). */
  private lastDriftKey = Number.NaN;
  private readonly prompt: HTMLElement;
  private readonly direction: HTMLElement;
  private readonly subtitles: HTMLElement;
  private readonly noise: HTMLElement;
  private readonly noiseBars: HTMLElement[] = [];
  private readonly noiseText: HTMLElement;
  private readonly threat: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly slits: HTMLElement;
  private readonly fade: HTMLElement;
  private readonly active: Subtitle[] = [];
  private last = {
    stamina: -1,
    exhausted: false,
    fuses: '',
    prompt: '',
    direction: '',
    noise: '',
    threat: '',
    vignette: '',
    hidden: false,
    fade: -1,
  };

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
    for (let i = 0; i < NOISE_BARS; i++)
      this.noiseBars.push(el('span', { className: 'noise-bar' }));
    this.noiseText = el('span', { className: 'bar-text' });
    this.noise = el('div', { className: 'noise' }, [
      el('span', { className: 'noise-bars', attrs: { 'aria-hidden': 'true' } }, this.noiseBars),
      this.noiseText,
    ]);
    this.threat = el('div', { className: 'threat', attrs: { role: 'status' } });
    this.vignette = el('div', { className: 'vignette', attrs: { 'aria-hidden': 'true' } });
    this.slits = el('div', { className: 'hide-slits' }, [
      el('span', { className: 'hide-label', text: TEXTS.hud.hidden }),
    ]);
    this.slits.hidden = true;
    for (const n of [
      this.crosshair,
      this.stamina,
      this.fuses,
      this.prompt,
      this.direction,
      this.threat,
    ])
      n.hidden = true;
    this.layer.append(
      this.vignette,
      this.slits,
      this.crosshair,
      this.noise,
      this.threat,
      this.stamina,
      this.fuses,
      this.prompt,
      this.direction,
      this.subtitles,
    );
    this.layer.hidden = true;
    container.appendChild(this.layer);
    // El fundido va fuera del HUD: sigue visible al pasar a la pantalla de derrota.
    this.fade = el('div', { className: 'fade', attrs: { 'aria-hidden': 'true' } });
    this.fade.style.opacity = '0';
    container.appendChild(this.fade);
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

  /** Modo Deriva: distancia explorada y tiempo sobrevivido (en el sitio de los fusibles). */
  setDriftStats(meters: number, seconds: number): void {
    // Solo se rehace el texto cuando cambia lo que se ve (metro entero o décima de segundo).
    const key = Math.floor(meters) * 1e7 + Math.floor(seconds * 10);
    if (key === this.lastDriftKey) return;
    this.lastDriftKey = key;
    const h = TEXTS.hud;
    const text = `${h.distance} ${Math.floor(meters)} m · ${h.survived} ${formatTime(seconds)}`;
    if (text === this.last.fuses) return;
    this.last.fuses = text;
    this.fuses.textContent = text;
    this.fuses.hidden = false;
  }

  setFuses(collected: number, required: number): void {
    this.lastDriftKey = Number.NaN;
    const text = required > 0 ? `${TEXTS.hud.fuses} ${collected}/${required}` : '';
    if (text === this.last.fuses) return;
    this.last.fuses = text;
    this.fuses.textContent = text;
    this.fuses.hidden = text === '';
  }

  /** Ruido del jugador: barras según el alcance y el nivel en texto. */
  setNoise(level: NoiseLevel, radius: number): void {
    const bars = radius <= 0 ? 0 : Math.max(1, Math.ceil((radius / NOISE.radius.run) * NOISE_BARS));
    const key = `${level}:${bars}`;
    if (key === this.last.noise) return;
    this.last.noise = key;
    this.noiseBars.forEach((b, i) => b.classList.toggle('on', i < bars));
    this.noise.classList.toggle('high', level === 'high');
    this.noiseText.textContent = `${TEXTS.hud.noise}: ${TEXTS.hud.noiseLevels[level]}`;
  }

  /** Cercanía de la criatura (texto con flecha); cadena vacía lo oculta. */
  setThreat(text: string, veryNear: boolean): void {
    const key = `${text}|${veryNear}`;
    if (key === this.last.threat) return;
    this.last.threat = key;
    this.threat.textContent = text;
    this.threat.hidden = text === '';
    this.threat.classList.toggle('very-near', veryNear);
  }

  /**
   * Viñeta direccional: oscurece el borde de la pantalla del lado de la criatura.
   * `angle` es relativo a la mirada (0 delante, positivo a la izquierda); `strength` 0..1.
   * Los valores se redondean a pasos de 0,05 para no tocar el estilo en cada frame.
   */
  setVignette(strength: number, angle: number): void {
    const q = (v: number): string => (Math.round(Math.max(0, v) * 20) / 20).toFixed(2);
    const s = Math.max(0, Math.min(1, strength));
    const front = q(Math.cos(angle) * s);
    const back = q(-Math.cos(angle) * s);
    const left = q(Math.sin(angle) * s);
    const right = q(-Math.sin(angle) * s);
    const base = q(s * 0.5);
    const key = `${front},${back},${left},${right},${base}`;
    if (key === this.last.vignette) return;
    this.last.vignette = key;
    const st = this.vignette.style;
    st.setProperty('--vf', front);
    st.setProperty('--vb', back);
    st.setProperty('--vl', left);
    st.setProperty('--vr', right);
    st.setProperty('--v', base);
  }

  /** Vista por rendijas dentro de un escondite. */
  setHidden(hidden: boolean): void {
    if (hidden === this.last.hidden) return;
    this.last.hidden = hidden;
    this.slits.hidden = !hidden;
  }

  /** Fundido a negro (0 = nada, 1 = negro). */
  setFade(alpha: number): void {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
    if (a === this.last.fade) return;
    this.last.fade = a;
    this.fade.style.opacity = String(a);
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
    this.setThreat('', false);
    this.setVignette(0, 0);
    this.setHidden(false);
    this.setNoise('silent', 0);
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
      `Luces reales ${info.lights} · Escala de resolución ${info.scale.toFixed(2)}`,
      `Draw calls ${info.calls}`,
      `Geometrías ${info.geometries} · Texturas ${info.textures}`,
      ...info.creatures,
    ].join('\n');
  }
}
