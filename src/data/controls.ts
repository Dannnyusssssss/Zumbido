/** Asignación de teclas (KeyboardEvent.code) a acciones del juego. No se usa Ctrl. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'crouch'
  | 'turnLeft'
  | 'turnRight'
  | 'lookUp'
  | 'lookDown'
  | 'interact'
  | 'mark'
  | 'pause'
  | 'mute';

export const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyC: 'crouch',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  ArrowUp: 'lookUp',
  ArrowDown: 'lookDown',
  KeyE: 'interact',
  KeyQ: 'mark',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
};

/** Teclas cuyo comportamiento por defecto se bloquea mientras se juega (desplazar la página). */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);
