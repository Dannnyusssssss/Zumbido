/** Utilidades matemáticas sin dependencias. */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** División entera hacia abajo, correcta también con negativos. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Módulo siempre positivo. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Normaliza un ángulo a [-PI, PI). */
export function wrapAngle(a: number): number {
  return mod(a + Math.PI, TAU) - Math.PI;
}
