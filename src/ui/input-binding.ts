/**
 * Conecta los eventos del navegador con el estado de entrada del juego y gestiona la captura del puntero.
 * - La captura solo se pide desde un gesto del jugador.
 * - preventDefault solo en flechas y espacio mientras se juega; Tab y Esc siguen funcionando.
 * - Al perder el foco o la visibilidad se sueltan todas las teclas.
 */
import type { InputState } from '../core/input';
import { LOOK } from '../data/balance';
import { KEY_BINDINGS, PREVENT_DEFAULT_CODES, type Action } from '../data/controls';

export interface InputHandlers {
  isPlaying(): boolean;
  /** Acción inmediata (pausa, silencio) fuera del paso fijo. */
  onAction(action: Action, code: string): void;
  onFocusLost(): void;
  onPointerLockChange(locked: boolean): void;
  onPointerLockError(): void;
  /** Clic sobre el juego mientras se juega sin captura: se reintenta. */
  onCanvasClick(): void;
}

function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
  );
}

export class InputBinding {
  locked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: InputState,
    private readonly handlers: InputHandlers,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('click', this.onClick);
  }

  /** Pide la captura del puntero (debe llamarse dentro de un gesto del jugador). */
  requestLock(): void {
    try {
      const result: unknown = this.canvas.requestPointerLock();
      if (result instanceof Promise) result.catch(() => this.handlers.onPointerLockError());
    } catch {
      this.handlers.onPointerLockError();
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const playing = this.handlers.isPlaying();
    // En los menús, las teclas pertenecen a los controles (deslizadores, botones), salvo P y M.
    if (!playing && isFormField(e.target) && e.code !== 'KeyM' && e.code !== 'KeyP') return;
    if (playing && PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Mientras se juega, la tecla pasa al estado de entrada; en los menús solo cuentan pausa y silencio.
    const action: Action | null = playing
      ? this.input.keyDown(e.code, e.repeat)
      : (KEY_BINDINGS[e.code] ?? null);
    if (!e.repeat && (action === 'pause' || action === 'mute'))
      this.handlers.onAction(action, e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.input.keyUp(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked || !this.handlers.isPlaying()) return;
    this.input.addMouse(e.movementX, e.movementY, LOOK.maxMouseDeltaPerEvent);
  };

  private readonly onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    this.handlers.onPointerLockChange(this.locked);
  };

  private readonly onLockError = (): void => {
    this.handlers.onPointerLockError();
  };

  private readonly onBlur = (): void => {
    this.input.clear();
    this.handlers.onFocusLost();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.input.clear();
      this.handlers.onFocusLost();
    }
  };

  private readonly onClick = (): void => {
    if (this.handlers.isPlaying() && !this.locked) this.handlers.onCanvasClick();
  };
}
