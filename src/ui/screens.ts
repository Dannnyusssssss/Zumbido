/**
 * Pantallas en DOM: carga, inicio (con aviso de contenido), selección de nivel y semilla, pausa,
 * ajustes, resultado de nivel, victoria final, avisos breves y errores.
 * Solo ofrecen acciones internas del juego (no hay enlaces fuera ni ventanas emergentes).
 */
import { normalizeSeed } from '../core/params';
import { LEVELS } from '../data/levels';
import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import { formatTime, type Progress } from '../game/progress';
import type { RunMode } from '../game/run';
import { button, el, show } from './dom';
import type { SettingsControls } from './settings-panel';

export type SeedKind = 'random' | 'daily' | 'typed';

export interface ScreenActions {
  openSelect(): void;
  /** Empezar una partida; `seed` ya validada (null = aleatoria). */
  start(mode: RunMode, levelId: number, seed: string | null): void;
  resume(): void;
  retry(): void;
  menu(): void;
  next(): void;
}

export type Panel =
  'loading' | 'start' | 'select' | 'pause' | 'settings' | 'levelEnd' | 'victory' | 'error' | 'none';

export interface LevelEndInfo {
  levelName: string;
  time: number;
  best: number | null;
  newBest: boolean;
  /** Texto del botón Continuar, o null si no hay siguiente nivel. */
  next: string | null;
}

export interface VictoryInfo {
  total: number;
  best: number | null;
  newBest: boolean;
}

export class Screens {
  readonly root: HTMLElement;
  private readonly panels = new Map<Panel, HTMLElement>();
  private readonly errorText: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly pauseInfo: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  // Selección.
  private readonly seedRadios = new Map<SeedKind, HTMLInputElement>();
  private readonly seedInput: HTMLInputElement;
  private readonly seedError: HTMLElement;
  private readonly dailyLabel: HTMLElement;
  private readonly levelList: HTMLElement;
  private readonly bestRunText: HTMLElement;
  private readonly fullRunButton: HTMLButtonElement;
  // Resultados.
  private readonly endTitle: HTMLElement;
  private readonly endStats: HTMLElement;
  private readonly endNext: HTMLButtonElement;
  private readonly endRetry: HTMLButtonElement;
  private readonly victoryStats: HTMLElement;
  private readonly victoryAgain: HTMLButtonElement;
  private settingsReturn: Panel = 'start';
  private current: Panel = 'loading';
  private noticeTimer = 0;
  private dailySeed = '';

  constructor(
    container: HTMLElement,
    controls: SettingsControls,
    private readonly actions: ScreenActions,
  ) {
    const t = TEXTS;
    this.root = el('div', { className: 'ui-root' });

    this.add(
      'loading',
      el('section', { className: 'panel panel-center', attrs: { 'aria-live': 'polite' } }, [
        el('p', { className: 'loading', text: t.start.loading }),
      ]),
    );

    // Inicio: título, aviso de contenido con las opciones de comodidad, controles y jugar.
    this.playButton = button(t.start.play, () => actions.openSelect(), 'btn btn-primary');
    this.add(
      'start',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-start' } }, [
        el('h1', { text: META.title, attrs: { id: 'title-start' } }),
        el('p', { className: 'subtitle', text: t.start.subtitle }),
        el('div', { className: 'warning', attrs: { role: 'note' } }, [
          el('h2', { text: t.start.warningTitle }),
          el('p', { text: t.start.warning }),
          el('p', { className: 'small', text: t.start.warningLink }),
          controls.checkbox('reduceFlicker', t.settings.reduceFlicker),
          controls.checkbox('reduceMotion', t.settings.reduceMotion),
        ]),
        el('div', { className: 'controls' }, [
          el('h2', { text: t.start.instructionsTitle }),
          el(
            'ul',
            {},
            t.start.instructions.map((line) => el('li', { text: line })),
          ),
        ]),
        el('div', { className: 'actions' }, [
          this.playButton,
          button(t.pause.settings, () => this.openSettings('start')),
        ]),
      ]),
    );

    // Selección de semilla y nivel.
    const s = t.select;
    const radio = (kind: SeedKind, label: string, extra?: HTMLElement): HTMLElement => {
      const id = `seed-${kind}`;
      const input = el('input', { attrs: { type: 'radio', name: 'seed-kind', id, value: kind } });
      input.addEventListener('change', () => this.onSeedKind());
      this.seedRadios.set(kind, input);
      const children: Node[] = [input, el('label', { text: label, attrs: { for: id } })];
      if (extra !== undefined) children.push(extra);
      return el('div', { className: 'field field-check' }, children);
    };
    this.dailyLabel = el('span', { className: 'small' });
    this.seedInput = el('input', {
      className: 'seed-input',
      attrs: {
        type: 'text',
        id: 'seed-text',
        maxlength: '16',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-describedby': 'seed-hint seed-error',
      },
    });
    this.seedInput.addEventListener('input', () => {
      this.setRadio('typed');
      this.validateSeed(false);
    });
    this.seedError = el('p', {
      className: 'error-text',
      attrs: { id: 'seed-error', 'aria-live': 'polite' },
    });
    this.levelList = el('div', { className: 'level-list' });
    this.bestRunText = el('p', { className: 'small' });
    this.fullRunButton = button(s.fullRun, () => this.startFrom('full', 1), 'btn btn-primary');
    this.add(
      'select',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-select' } }, [
        el('h2', { text: s.title, attrs: { id: 'title-select' } }),
        el('fieldset', { className: 'seed-box' }, [
          el('legend', { text: s.seedTitle }),
          radio('random', s.seedRandom),
          radio('daily', s.seedDaily, this.dailyLabel),
          radio('typed', s.seedTyped),
          el('div', { className: 'field' }, [
            el('label', { text: s.seedLabel, attrs: { for: 'seed-text', class: 'sr-only' } }),
            this.seedInput,
          ]),
          el('p', { className: 'small', text: s.seedHint, attrs: { id: 'seed-hint' } }),
          this.seedError,
        ]),
        el('h2', { text: s.modeTitle }),
        el('div', { className: 'actions' }, [this.fullRunButton]),
        this.bestRunText,
        el('h2', { text: s.singleTitle }),
        this.levelList,
        el('div', { className: 'actions' }, [button(s.back, () => this.showStart())]),
      ]),
    );
    this.setRadio('random');

    // Pausa.
    this.pauseInfo = el('p', { className: 'small seed' });
    this.resumeButton = button(t.pause.resume, () => actions.resume(), 'btn btn-primary');
    this.add(
      'pause',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-pause' } }, [
        el('h2', { text: t.pause.title, attrs: { id: 'title-pause' } }),
        this.pauseInfo,
        controls.checkbox('reduceFlicker', t.settings.reduceFlicker),
        controls.checkbox('reduceMotion', t.settings.reduceMotion),
        el('div', { className: 'actions' }, [
          this.resumeButton,
          button(t.pause.settings, () => this.openSettings('pause')),
          button(t.pause.retry, () => actions.retry()),
          button(t.pause.menu, () => actions.menu()),
        ]),
      ]),
    );

    // Ajustes completos.
    this.add(
      'settings',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-settings' } }, [
        el('h2', { text: t.settings.title, attrs: { id: 'title-settings' } }),
        controls.fullPanel(),
        el('div', { className: 'actions' }, [button(t.settings.back, () => this.closeSettings())]),
      ]),
    );

    // Resultado de nivel (pantalla intermedia).
    const r = t.results;
    this.endTitle = el('h2', { attrs: { id: 'title-end' } });
    this.endStats = el('div', { className: 'stats' });
    this.endNext = button('', () => actions.next(), 'btn btn-primary');
    this.endRetry = button(r.retry, () => actions.retry());
    this.add(
      'levelEnd',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-end' } }, [
        this.endTitle,
        this.endStats,
        el('div', { className: 'actions' }, [
          this.endNext,
          this.endRetry,
          button(r.menu, () => actions.menu()),
        ]),
      ]),
    );

    // Victoria final.
    this.victoryStats = el('div', { className: 'stats' });
    this.victoryAgain = button(r.playAgain, () => this.startFrom('full', 1), 'btn btn-primary');
    this.add(
      'victory',
      el('section', { className: 'panel', attrs: { 'aria-labelledby': 'title-victory' } }, [
        el('h1', { text: r.victoryTitle, attrs: { id: 'title-victory' } }),
        el('p', { className: 'subtitle', text: r.victoryText }),
        this.victoryStats,
        el('div', { className: 'actions' }, [
          this.victoryAgain,
          button(r.menu, () => actions.menu()),
        ]),
      ]),
    );

    this.errorText = el('p');
    this.add(
      'error',
      el('section', { className: 'panel panel-center', attrs: { role: 'alert' } }, [
        this.errorText,
      ]),
    );
    this.notice = el('div', {
      className: 'notice',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    this.notice.hidden = true;
    this.root.appendChild(this.notice);
    container.appendChild(this.root);
    this.showPanel('loading');
  }

  private add(panel: Panel, node: HTMLElement): void {
    node.hidden = true;
    this.panels.set(panel, node);
    this.root.appendChild(node);
  }

  private showPanel(panel: Panel): void {
    this.current = panel;
    for (const [key, node] of this.panels) show(node, key === panel);
    this.root.classList.toggle('ui-blocking', panel !== 'none');
  }

  get panel(): Panel {
    return this.current;
  }

  showStart(): void {
    this.showPanel('start');
    this.playButton.focus();
  }

  /** Selección: refleja el progreso (niveles desbloqueados y marcas) y la semilla del día. */
  showSelect(progress: Progress, dailySeed: string): void {
    const s = TEXTS.select;
    this.dailySeed = dailySeed;
    this.dailyLabel.textContent = ` (${dailySeed})`;
    this.levelList.replaceChildren(
      ...LEVELS.map((level) => {
        const unlocked = level.id <= progress.unlocked;
        const best = progress.bestTimes[level.id - 1] ?? null;
        const label = `${TEXTS.messages.levelIntro(level.id, level.name)} · ${
          unlocked ? `${s.best}: ${best === null ? s.noTime : formatTime(best)}` : s.locked
        }`;
        const b = button(label, () => this.startFrom('single', level.id));
        b.disabled = !unlocked;
        return b;
      }),
    );
    this.bestRunText.textContent = `${s.bestRun}: ${progress.bestRun === null ? s.noTime : formatTime(progress.bestRun)}`;
    this.seedError.textContent = '';
    this.showPanel('select');
    this.fullRunButton.focus();
  }

  private onSeedKind(): void {
    if (this.seedRadios.get('typed')?.checked === true) this.seedInput.focus();
    this.seedError.textContent = '';
  }

  /** Deja preparada una semilla escrita (parámetro de depuración ?seed=). */
  presetSeed(seed: string): void {
    this.seedInput.value = seed;
    this.setRadio('typed');
  }

  private setRadio(kind: SeedKind): void {
    const input = this.seedRadios.get(kind);
    if (input !== undefined) input.checked = true;
  }

  private selectedKind(): SeedKind {
    for (const [kind, input] of this.seedRadios) if (input.checked) return kind;
    return 'random';
  }

  /** Valida la semilla escrita. Con `final`, deja el foco en el campo si no es válida. */
  private validateSeed(final: boolean): string | null {
    const seed = normalizeSeed(this.seedInput.value);
    const empty = this.seedInput.value.trim() === '';
    this.seedError.textContent = seed === null && (!empty || final) ? TEXTS.select.seedInvalid : '';
    this.seedInput.setAttribute('aria-invalid', seed === null && !empty ? 'true' : 'false');
    if (seed === null && final) this.seedInput.focus();
    return seed;
  }

  private startFrom(mode: RunMode, levelId: number): void {
    const kind = this.selectedKind();
    if (kind === 'typed') {
      const seed = this.validateSeed(true);
      if (seed === null) return;
      this.seedInput.value = seed;
      this.actions.start(mode, levelId, seed);
    } else {
      this.actions.start(mode, levelId, kind === 'daily' ? this.dailySeed : null);
    }
  }

  showPause(seed: string, levelName: string, time: number): void {
    const p = TEXTS.pause;
    this.pauseInfo.textContent = `${p.level}: ${levelName} · ${p.time}: ${formatTime(time)} · ${p.seed}: ${seed}`;
    this.showPanel('pause');
    this.resumeButton.focus();
  }

  showLevelEnd(info: LevelEndInfo): void {
    const r = TEXTS.results;
    this.endTitle.textContent = `${r.title}: ${info.levelName}`;
    this.endStats.replaceChildren(
      el('p', {
        text: `${r.time}: ${formatTime(info.time)}${info.newBest ? ` · ${r.newBest}` : ''}`,
      }),
      el('p', {
        className: 'small',
        text: `${r.best}: ${info.best === null ? TEXTS.select.noTime : formatTime(info.best)}`,
      }),
    );
    this.endNext.hidden = info.next === null;
    this.endNext.textContent = info.next ?? '';
    this.showPanel('levelEnd');
    (info.next === null ? this.endRetry : this.endNext).focus();
  }

  showVictory(info: VictoryInfo): void {
    const r = TEXTS.results;
    this.victoryStats.replaceChildren(
      el('p', {
        text: `${r.total}: ${formatTime(info.total)}${info.newBest ? ` · ${r.newBest}` : ''}`,
      }),
      el('p', {
        className: 'small',
        text: `${TEXTS.select.bestRun}: ${info.best === null ? TEXTS.select.noTime : formatTime(info.best)}`,
      }),
    );
    this.showPanel('victory');
    this.victoryAgain.focus();
  }

  hide(): void {
    this.showPanel('none');
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.showPanel('error');
  }

  openSettings(from: Panel): void {
    this.settingsReturn = from;
    this.showPanel('settings');
    this.panels.get('settings')?.querySelector('input')?.focus();
  }

  closeSettings(): void {
    if (this.settingsReturn === 'pause') {
      this.showPanel('pause');
      this.resumeButton.focus();
    } else {
      this.showStart();
    }
  }

  /** Aviso breve que desaparece solo. */
  toast(message: string, seconds = 3): void {
    this.notice.textContent = message;
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.notice.hidden = true;
    }, seconds * 1000);
  }
}
