/** Lectura y validación de parámetros de depuración de la URL. */

export const SEED_PATTERN = /^[A-Z0-9]{1,16}$/;

/** Normaliza y valida una semilla escrita. Devuelve null si no es válida. */
export function normalizeSeed(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const seed = raw.trim().toUpperCase();
  return SEED_PATTERN.test(seed) ? seed : null;
}

export interface DebugParams {
  debug: boolean;
  seed: string | null;
}

/** Interpreta la cadena de búsqueda (`location.search`). */
export function parseDebugParams(search: string): DebugParams {
  const safe = typeof search === 'string' && search.length <= 512 ? search : '';
  const params = new URLSearchParams(safe);
  const debugValue = params.get('debug');
  const debug =
    debugValue !== null && (debugValue === '' || debugValue === '1' || debugValue === 'true');
  return { debug, seed: normalizeSeed(params.get('seed')) };
}

const SEED_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Construye una semilla de 8 caracteres a partir de bytes aleatorios (los aporta la capa de arranque). */
export function seedFromBytes(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += SEED_ALPHABET[(bytes[i] ?? 0) % SEED_ALPHABET.length];
  }
  return out;
}
