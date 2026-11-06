/**
 * Estado de entrada independiente del DOM. La capa de UI le pasa los eventos;
 * la lógica solo consulta acciones mantenidas, pulsaciones y movimiento del ratón.
 */
import { KEY_BINDINGS, type Action } from '../data/controls';
import { clamp } from './math';

export class InputState {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private mouseDX = 0;
  private mouseDY = 0;

  /** Registra una tecla pulsada. Devuelve la acción asociada o null. */
  keyDown(code: string, repeat = false): Action | null {
    const action = KEY_BINDINGS[code];
    if (action === undefined) return null;
    if (!repeat && !this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
    return action;
  }

  /** Registra una tecla soltada. */
  keyUp(code: string): void {
    const action = KEY_BINDINGS[code];
    if (action === undefined) return;
    // Si dos teclas comparten acción (las dos Shift) basta con soltar una para dejarla.
    this.held.delete(action);
  }

  /** Acumula movimiento de ratón, limitando cada evento para ignorar saltos anómalos. */
  addMouse(dx: number, dy: number, maxPerEvent: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.mouseDX += clamp(dx, -maxPerEvent, maxPerEvent);
    this.mouseDY += clamp(dy, -maxPerEvent, maxPerEvent);
  }

  /** Devuelve y reinicia el movimiento acumulado del ratón en X. */
  takeMouseX(): number {
    const v = this.mouseDX;
    this.mouseDX = 0;
    return v;
  }

  /** Devuelve y reinicia el movimiento acumulado del ratón en Y. */
  takeMouseY(): number {
    const v = this.mouseDY;
    this.mouseDY = 0;
    return v;
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** Verdadero una sola vez por pulsación. */
  consumePressed(action: Action): boolean {
    return this.pressed.delete(action);
  }

  /** Eje -1..1 a partir de dos acciones opuestas. */
  axis(negative: Action, positive: Action): number {
    return (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);
  }

  /** Suelta todo (al perder el foco, para que no queden teclas "pegadas"). */
  clear(): void {
    this.held.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
