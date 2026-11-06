/**
 * Pantallas en DOM: carga, inicio (con aviso de contenido), pausa, ajustes, avisos breves y errores.
 * Solo ofrecen acciones internas del juego (no hay enlaces fuera ni ventanas emergentes).
 */
import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import { button, el, show } from './dom';
import type { SettingsControls } from './settings-panel';

export interface ScreenActions {
  play(): void;
  resume(): void;
}

type Panel = 'loading' | 'start' | 'pause' | 'settings' | 'error' | 'none';

export class Screens {
  readonly root: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly start: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly error: HTMLElement;
  private readonly errorText: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly seedText: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly startFlicker: HTMLElement;
  private settingsReturn: Panel = 'start';
  private current: Panel = 'loading';
  private noticeTimer = 0;

  constructor(container: HTMLElement, controls: SettingsControls, actions: ScreenActions) {
    const t = TEXTS;
    this.root = el('div', { className: 'ui-root' });

    this.loading = el(
      'section',
      { className: 'panel panel-center', attrs: { 'aria-live': 'polite' } },
      [el('p', { className: 'loading', text: t.start.loading })],
    );

    // Inicio: título, aviso de contenido con acceso directo a las opciones de comodidad, controles y jugar.
    this.playButton = button(t.start.play, () => actions.play(), 'btn btn-primary');
    this.startFlicker = controls.checkbox('reduceFlicker', t.settings.reduceFlicker);
    this.start = el(
      'section',
      { className: 'panel', attrs: { 'aria-labelledby': 'title-start' } },
      [
        el('h1', { text: META.title, attrs: { id: 'title-start' } }),
        el('p', { className: 'subtitle', text: t.start.subtitle }),
        el('div', { className: 'warning', attrs: { role: 'note' } }, [
          el('h2', { text: t.start.warningTitle }),
          el('p', { text: t.start.warning }),
          el('p', { className: 'small', text: t.start.warningLink }),
          this.startFlicker,
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
      ],
    );

    // Pausa.
    this.seedText = el('p', { className: 'small seed' });
    this.resumeButton = button(t.pause.resume, () => actions.resume(), 'btn btn-primary');
    this.pause = el(
      'section',
      { className: 'panel', attrs: { 'aria-labelledby': 'title-pause' } },
      [
        el('h2', { text: t.pause.title, attrs: { id: 'title-pause' } }),
        this.seedText,
        controls.checkbox('reduceFlicker', t.settings.reduceFlicker),
        controls.checkbox('reduceMotion', t.settings.reduceMotion),
        el('div', { className: 'actions' }, [
          this.resumeButton,
          button(t.pause.settings, () => this.openSettings('pause')),
        ]),
      ],
    );

    // Ajustes completos.
    this.settings = el(
      'section',
      { className: 'panel', attrs: { 'aria-labelledby': 'title-settings' } },
      [
        el('h2', { text: t.settings.title, attrs: { id: 'title-settings' } }),
        controls.fullPanel(),
        el('div', { className: 'actions' }, [button(t.settings.back, () => this.closeSettings())]),
      ],
    );

    this.errorText = el('p');
    this.error = el('section', { className: 'panel panel-center', attrs: { role: 'alert' } }, [
      this.errorText,
    ]);
    this.notice = el('div', {
      className: 'notice',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });

    for (const p of [this.loading, this.start, this.pause, this.settings, this.error]) {
      p.hidden = true;
      this.root.appendChild(p);
    }
    this.notice.hidden = true;
    this.root.appendChild(this.notice);
    container.appendChild(this.root);
    this.showPanel('loading');
  }

  private showPanel(panel: Panel): void {
    this.current = panel;
    show(this.loading, panel === 'loading');
    show(this.start, panel === 'start');
    show(this.pause, panel === 'pause');
    show(this.settings, panel === 'settings');
    show(this.error, panel === 'error');
    this.root.classList.toggle('ui-blocking', panel !== 'none');
  }

  get panel(): Panel {
    return this.current;
  }

  showStart(): void {
    this.showPanel('start');
    this.playButton.focus();
  }

  showPause(seed: string): void {
    this.seedText.textContent = `${TEXTS.pause.seed}: ${seed}`;
    this.showPanel('pause');
    this.resumeButton.focus();
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
    const first = this.settings.querySelector('input');
    first?.focus();
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
