/** Parámetros numéricos del jugador, la cámara y los ajustes. */

export const PLAYER = {
  radius: 0.3,
  walkSpeed: 2.2,
  runSpeed: 4.5,
  crouchSpeed: 1.1,
  /** Rapidez con la que la velocidad alcanza la deseada (1/s). */
  acceleration: 12,
  eyeHeightStand: 1.6,
  eyeHeightCrouch: 1.0,
  /** Velocidad de transición de la altura de cámara al agacharse (1/s). */
  crouchBlendSpeed: 8,
} as const;

export const LOOK = {
  /** Radianes por píxel de ratón con sensibilidad 1. */
  mouseRadiansPerPixel: 0.0022,
  /** Movimiento máximo aceptado por evento de ratón (píxeles); filtra saltos anómalos. */
  maxMouseDeltaPerEvent: 120,
  /** Giro con flechas (rad/s) con sensibilidad 1. */
  arrowTurnSpeed: 2.2,
  arrowPitchSpeed: 1.4,
  maxPitch: (85 * Math.PI) / 180,
} as const;

export const CAMERA_FX = {
  bobAmplitude: 0.035,
  /** Ciclos de balanceo por metro recorrido. */
  bobFrequencyPerMeter: 0.9,
  runFovBoost: 6,
  near: 0.05,
} as const;

export const SETTINGS_LIMITS = {
  sensitivity: { min: 0.2, max: 3, default: 1 },
  fov: { min: 60, max: 100, default: 75 },
} as const;

export const WORLD = {
  cellSize: 3,
  chunkCells: 16,
  wallThickness: 0.15,
  columnSize: 0.6,
  /** Límite del mundo en chunks desde el origen (más allá, pared). */
  maxChunk: 1000,
  /** Tamaño de la caché de datos de chunks generados. */
  chunkCacheSize: 256,
} as const;

export const AUDIO = {
  masterVolume: 0.22,
  fadeInSeconds: 2.5,
  muteRampSeconds: 0.15,
} as const;

/**
 * Parpadeo de luces. Es modulación suave de intensidad: nunca se apaga del todo
 * y la frecuencia más alta (maxHz * secondRatio) queda por debajo de 3 destellos por segundo.
 */
export const FLICKER = {
  /** Caída máxima de brillo (0.35 => el panel nunca baja del 65 %). */
  depth: 0.35,
  minHz: 0.4,
  maxHz: 1.2,
  /** Relación de la segunda onda; 1.2 * 1.7 = 2.04 Hz como máximo. */
  secondRatio: 1.7,
  /** Periodo de los episodios de parpadeo (segundos): el panel pasa largos ratos estable. */
  episodeMinSeconds: 7,
  episodeMaxSeconds: 15,
  /** Tope de destellos por segundo (WCAG 2.3.1). */
  maxFlashesPerSecond: 3,
  /** Tope de proporción de paneles que parpadean en un nivel. */
  maxRatio: 0.1,
} as const;
