/**
 * Semillas: la "semilla del día" se deriva de la fecha local, sin red.
 * La fecha la lee la capa de arranque; esta función es pura.
 */
import { normalizeSeed } from './params';

/** Semilla del día: "D" + AAAAMMDD (por ejemplo D20261106). Devuelve null si la fecha no es válida. */
export function dailySeed(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const text = `D${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  return normalizeSeed(text);
}
