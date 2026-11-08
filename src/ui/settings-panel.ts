/**
 * Controles de ajustes. Se usan en el panel de ajustes completo y, para las opciones de comodidad,
 * también directamente en las pantallas de inicio y pausa. Todos se mantienen sincronizados.
 */
import { DIFFICULTIES, SETTINGS_LIMITS } from '../data/balance';
import { QUALITIES, type Quality } from '../data/quality';
import { TEXTS } from '../data/texts';
import type { Settings } from '../save/storage';
import { el } from './dom';

type BoolKey =
  | 'muted'
  | 'reduceFlicker'
  | 'reduceMotion'
  | 'invertY'
  | 'crosshair'
  | 'subtitles'
  | 'directionAid'
  | 'dynamicResolution';

let idCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${++idCounter}`;

export class SettingsControls {
  private readonly syncers: Array<(s: Settings) => void> = [];

  constructor(
    private readonly get: () => Settings,
    private readonly change: (patch: Partial<Settings>) => void,
  ) {}

  /** Casilla para un ajuste booleano. */
  checkbox(key: BoolKey, label: string): HTMLElement {
    const id = nextId(key);
    const input = el('input', { attrs: { type: 'checkbox', id } });
    input.addEventListener('change', () => this.change({ [key]: input.checked }));
    this.syncers.push((s) => {
      input.checked = s[key];
    });
    return el('div', { className: 'field field-check' }, [
      input,
      el('label', { text: label, attrs: { for: id } }),
    ]);
  }

  /** Deslizador para un ajuste numérico, con el valor visible en texto. */
  slider(
    key: 'sensitivity' | 'fov',
    label: string,
    step: number,
    format: (v: number) => string,
  ): HTMLElement {
    const limits = SETTINGS_LIMITS[key];
    const id = nextId(key);
    const input = el('input', {
      attrs: {
        type: 'range',
        id,
        min: String(limits.min),
        max: String(limits.max),
        step: String(step),
      },
    });
    const value = el('span', { className: 'field-value' });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) this.change({ [key]: v });
    });
    this.syncers.push((s) => {
      input.value = String(s[key]);
      value.textContent = format(s[key]);
    });
    return el('div', { className: 'field field-range' }, [
      el('label', { text: label, attrs: { for: id } }),
      input,
      value,
    ]);
  }

  /** Selector de calidad. */
  quality(): HTMLElement {
    const id = nextId('quality');
    const names: Record<Quality, string> = {
      low: TEXTS.settings.qualityLow,
      medium: TEXTS.settings.qualityMedium,
      high: TEXTS.settings.qualityHigh,
    };
    const select = el(
      'select',
      { attrs: { id } },
      QUALITIES.map((q) => el('option', { text: names[q], attrs: { value: q } })),
    );
    select.addEventListener('change', () => {
      const q = QUALITIES.find((v) => v === select.value);
      if (q !== undefined) this.change({ quality: q });
    });
    this.syncers.push((s) => {
      select.value = s.quality;
    });
    return el('div', { className: 'field field-select' }, [
      el('label', { text: TEXTS.settings.quality, attrs: { for: id } }),
      select,
    ]);
  }

  /** Selector de dificultad (se guarda; se aplica al empezar o reintentar un nivel). */
  difficulty(): HTMLElement {
    const id = nextId('difficulty');
    const names = TEXTS.settings.difficultyNames;
    const select = el(
      'select',
      { attrs: { id } },
      DIFFICULTIES.map((d) => el('option', { text: names[d], attrs: { value: d } })),
    );
    select.addEventListener('change', () => {
      const d = DIFFICULTIES.find((v) => v === select.value);
      if (d !== undefined) this.change({ difficulty: d });
    });
    this.syncers.push((s) => {
      select.value = s.difficulty;
    });
    return el('div', { className: 'field field-select' }, [
      el('label', { text: TEXTS.settings.difficulty, attrs: { for: id } }),
      select,
    ]);
  }

  /** Refleja los ajustes actuales en todos los controles creados. */
  sync(): void {
    const s = this.get();
    for (const f of this.syncers) f(s);
  }

  /** Panel completo de ajustes. */
  fullPanel(): HTMLElement {
    const t = TEXTS.settings;
    return el('div', { className: 'settings-grid' }, [
      this.checkbox('muted', t.muted),
      this.checkbox('reduceFlicker', t.reduceFlicker),
      this.checkbox('reduceMotion', t.reduceMotion),
      this.checkbox('crosshair', t.crosshair),
      this.checkbox('subtitles', t.subtitles),
      this.checkbox('directionAid', t.directionAid),
      this.checkbox('invertY', t.invertY),
      this.slider('sensitivity', t.sensitivity, 0.05, (v) => v.toFixed(2)),
      this.slider('fov', t.fov, 1, (v) => `${Math.round(v)}°`),
      this.quality(),
      this.checkbox('dynamicResolution', t.dynamicResolution),
      this.difficulty(),
    ]);
  }
}
