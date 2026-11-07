/**
 * Persistencia en localStorage con una sola clave (`zumbido:v1`).
 * Tolera datos ausentes, corruptos o de otra versión: valida campo por campo
 * y usa valores por defecto. Nunca lanza excepciones hacia el juego.
 */
import { DIFFICULTIES, SETTINGS_LIMITS, type Difficulty } from '../data/balance';
import { META } from '../data/meta';
import { QUALITIES, type Quality } from '../data/quality';
import { normalizeSeed } from '../core/params';
import { defaultProgress, sanitizeProgress, type Progress } from '../game/progress';

export interface Settings {
  muted: boolean;
  reduceFlicker: boolean;
  reduceMotion: boolean;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  crosshair: boolean;
  /** Subtítulos de sonido (texto para las señales sonoras importantes). */
  subtitles: boolean;
  /** Ayuda opcional de dirección aproximada a la salida. */
  directionAid: boolean;
  /** Dificultad de la criatura. */
  difficulty: Difficulty;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  lastSeed: string | null;
  progress: Progress;
}

/** Subconjunto de la API Storage que usa el juego (permite inyectar un falso en los tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Tamaño máximo aceptado del JSON guardado (protege de datos inflados). */
const MAX_RAW_LENGTH = 16 * 1024;

export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    muted: false,
    reduceFlicker: prefersReducedMotion,
    reduceMotion: prefersReducedMotion,
    sensitivity: SETTINGS_LIMITS.sensitivity.default,
    invertY: false,
    fov: SETTINGS_LIMITS.fov.default,
    quality: 'medium',
    crosshair: true,
    subtitles: true,
    directionAid: false,
    difficulty: 'normal',
  };
}

export function defaultSave(prefersReducedMotion: boolean): SaveData {
  return {
    version: 1,
    settings: defaultSettings(prefersReducedMotion),
    lastSeed: null,
    progress: defaultProgress(),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function readNumber(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

function readQuality(v: unknown, fallback: Quality): Quality {
  return typeof v === 'string' && (QUALITIES as readonly string[]).includes(v)
    ? (v as Quality)
    : fallback;
}

function readDifficulty(v: unknown, fallback: Difficulty): Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v)
    ? (v as Difficulty)
    : fallback;
}

/** Valida unos ajustes desconocidos campo por campo. */
export function sanitizeSettings(raw: unknown, prefersReducedMotion: boolean): Settings {
  const d = defaultSettings(prefersReducedMotion);
  if (!isRecord(raw)) return d;
  const L = SETTINGS_LIMITS;
  return {
    muted: readBool(raw.muted, d.muted),
    reduceFlicker: readBool(raw.reduceFlicker, d.reduceFlicker),
    reduceMotion: readBool(raw.reduceMotion, d.reduceMotion),
    sensitivity: readNumber(raw.sensitivity, L.sensitivity.min, L.sensitivity.max, d.sensitivity),
    invertY: readBool(raw.invertY, d.invertY),
    fov: readNumber(raw.fov, L.fov.min, L.fov.max, d.fov),
    quality: readQuality(raw.quality, d.quality),
    crosshair: readBool(raw.crosshair, d.crosshair),
    subtitles: readBool(raw.subtitles, d.subtitles),
    directionAid: readBool(raw.directionAid, d.directionAid),
    // Los guardados de los hitos anteriores no la tienen: Normal.
    difficulty: readDifficulty(raw.difficulty, d.difficulty),
  };
}

/** Valida un guardado desconocido. Campos de versiones futuras se ignoran. */
export function sanitizeSave(raw: unknown, prefersReducedMotion: boolean): SaveData {
  if (!isRecord(raw)) return defaultSave(prefersReducedMotion);
  return {
    version: 1,
    settings: sanitizeSettings(raw.settings, prefersReducedMotion),
    lastSeed: typeof raw.lastSeed === 'string' ? normalizeSeed(raw.lastSeed) : null,
    // Los guardados del Hito 1 no tienen progreso: se usan los valores por defecto.
    progress: sanitizeProgress(raw.progress),
  };
}

/** Lee el guardado. Con almacenamiento ausente, bloqueado o datos corruptos devuelve los valores por defecto. */
export function loadSave(storage: StorageLike | null, prefersReducedMotion: boolean): SaveData {
  if (storage === null) return defaultSave(prefersReducedMotion);
  let text: string | null;
  try {
    text = storage.getItem(META.storageKey);
  } catch {
    return defaultSave(prefersReducedMotion);
  }
  if (text === null || text.length > MAX_RAW_LENGTH) return defaultSave(prefersReducedMotion);
  try {
    return sanitizeSave(JSON.parse(text) as unknown, prefersReducedMotion);
  } catch {
    return defaultSave(prefersReducedMotion);
  }
}

/** Guarda. Devuelve false si no se pudo (sin almacenamiento, cuota llena, modo privado...). */
export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(META.storageKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
