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
  /** Fondo de un estante (tipo de pared 2): deja pasillos de unos 2,1 m. */
  shelfDepth: 0.9,
  shelfHeight: 3,
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

/** Tipos de borde de celda en la cuadrícula. */
export const EDGE = {
  open: 0,
  wall: 1,
  shelf: 2,
} as const;

/** Resistencia al correr. */
export const STAMINA = {
  max: 100,
  drainPerSecond: 20,
  regenPerSecond: 14,
  /** Segundos sin correr antes de empezar a recuperarse. */
  regenDelay: 0.8,
  /** Tras agotarse, no se puede volver a correr hasta este valor. */
  recoverThreshold: 30,
} as const;

/** Interacción con E. */
export const INTERACT = {
  range: 1.6,
  /** Coseno del ángulo máximo entre la mirada y el objeto (unos 70°). */
  minFacing: 0.34,
} as const;

/** Tiza (Q). */
export const CHALK = {
  poolSize: 48,
  wallReach: 2.5,
  floorDistance: 1.2,
  wallMarkHeight: 1.3,
  markSize: 0.6,
} as const;

/** Salida y objetos colocados. */
export const OBJECTS = {
  doorWidth: 1.0,
  doorDepth: 0.2,
  doorHeight: 2.1,
  fuseSize: 0.3,
  /** Pedestal sobre el que descansa el fusible (se ve al acercarse, no queda bajo la cámara). */
  pedestalSize: 0.35,
  pedestalHeight: 0.9,
  /** Distancia (m) a la que se muestra el subtítulo del zumbido de la salida. */
  exitCueRange: 25,
  /** Segundos entre repeticiones del subtítulo del zumbido. */
  exitCueInterval: 4,
} as const;

/** Volúmenes de las fuentes de sonido (antes del limitador). Moderados: sin sustos de volumen. */
export const SOUND = {
  humBus: 0.55,
  exitHumIdle: 0.12,
  exitHumActive: 0.22,
  exitRefDistance: 2,
  exitMaxDistance: 45,
  sfx: 0.35,
} as const;

/**
 * Ruido del jugador. Cada acción emite un evento con un alcance en metros de camino (no en línea recta):
 * las paredes lo bloquean. Quedarse quieto no hace ruido.
 */
export const NOISE = {
  radius: {
    crouch: 2.5,
    walk: 8,
    run: 18,
    chalk: 6,
    pickup: 7,
    /** Puerta de salida bloqueada (zumbido seco). */
    locked: 10,
    /** Abrir o cerrar la puerta de un escondite. */
    hide: 3,
  },
  /** Metros recorridos entre dos pasos (cada paso es un evento de ruido). */
  stepMeters: { crouch: 0.6, walk: 0.75, run: 0.9 },
  /** Hasta este alcance el HUD dice "bajo"; por encima, "alto". */
  lowMax: 9,
  /** Segundos que el HUD mantiene el último nivel de ruido. */
  hudHoldSeconds: 0.6,
  /** Ventana máxima (en celdas desde el origen) de la búsqueda de distancia de camino. */
  maxSearchCells: 16,
} as const;

/** La Escucha: movimiento, sentidos y estados. Las velocidades dependen del estado. */
export const ENEMY = {
  radius: 0.35,
  height: 2.4,
  /** Distancia a la que alcanza al jugador. */
  captureDistance: 0.9,
  speed: { wander: 1.4, investigate: 2.0, search: 1.8, retreat: 1.6 },
  acceleration: 6,
  /** Giro máximo del cuerpo (rad/s). */
  turnRate: 5,
  fovDegrees: 110,
  /** Alcance de la vista con luz y en zonas sin panel cerca. */
  sightLit: 14,
  sightDark: 7,
  /** Agachado se te ve desde menos lejos. */
  crouchSightFactor: 0.6,
  /** Muy cerca te nota aunque estés fuera del cono (si no hay pared en medio). */
  senseDistance: 1.8,
  /** Segundos sin verte antes de pasar a buscar. */
  loseSeconds: 1.5,
  /** Segundos que se queda mirando al llegar al punto de un ruido. */
  investigateLookSeconds: 2.5,
  searchRadiusCells: 3,
  wanderRadiusCells: { min: 4, max: 10 },
  /** Al retirarse se aleja hasta esta distancia del jugador (o hasta el tiempo máximo). */
  retreatDistance: 35,
  retreatMaxSeconds: 20,
  repathSeconds: { chase: 0.4, other: 1.5 },
  /** Tope de nodos de la búsqueda A* (limita el trabajo y los chunks que se generan). */
  navMaxNodes: 4000,
  /** Si en este tiempo avanza menos de `stuckMinProgress`, recalcula o cambia de objetivo. */
  stuckSeconds: 2.5,
  stuckMinProgress: 0.3,
  /** Metros recorridos entre dos pasos arrastrados (sonido y subtítulo). */
  stepMeters: 1.1,
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyParams {
  /** Velocidad de persecución: mayor que caminar (2,2) y menor que correr (4,5). */
  readonly chaseSpeed: number;
  /** Multiplicador del alcance de los ruidos que oye. */
  readonly hearing: number;
  /** Multiplicador del alcance de la vista. */
  readonly sight: number;
  /** Segundos sin criatura al empezar el nivel. */
  readonly graceSeconds: number;
  readonly respawnSeconds: { readonly min: number; readonly max: number };
  readonly searchSeconds: { readonly min: number; readonly max: number };
  /** Probabilidad de que al vagar elija un destino cerca del jugador. */
  readonly wanderBias: number;
  /** Retraso extra de la segunda criatura (nivel 3). */
  readonly secondCreatureDelay: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyParams>> = {
  easy: {
    chaseSpeed: 2.7,
    hearing: 0.8,
    sight: 0.85,
    graceSeconds: 45,
    respawnSeconds: { min: 30, max: 50 },
    searchSeconds: { min: 6, max: 8 },
    wanderBias: 0.35,
    secondCreatureDelay: 60,
  },
  normal: {
    chaseSpeed: 3.0,
    hearing: 1,
    sight: 1,
    graceSeconds: 30,
    respawnSeconds: { min: 20, max: 40 },
    searchSeconds: { min: 8, max: 12 },
    wanderBias: 0.5,
    secondCreatureDelay: 40,
  },
  hard: {
    chaseSpeed: 3.3,
    hearing: 1.2,
    sight: 1.1,
    graceSeconds: 20,
    respawnSeconds: { min: 12, max: 25 },
    searchSeconds: { min: 10, max: 14 },
    wanderBias: 0.65,
    secondCreatureDelay: 25,
  },
};

/** Aparición de las criaturas: siempre fuera de la vista y lejos por camino. */
export const DIRECTOR = {
  spawnDistance: { min: 25, max: 45 },
  spawnAttemptsPerStep: 6,
  /** Separación mínima entre dos criaturas al aparecer. */
  minSeparation: 15,
} as const;

/** Escondites (taquillas y armarios) contra una pared. */
export const HIDING = {
  width: 1.0,
  depth: 0.6,
  height: 2.0,
  /** Duración del fundido al entrar o salir (no se mueve ni se gira la cámara de forma continua). */
  fadeSeconds: 0.35,
  /** Distancia del frente del escondite a la que queda el jugador al salir. */
  exitGap: 0.5,
} as const;

/** Señales de cercanía de la criatura (sonido, HUD, luces y subtítulos). */
export const THREAT = {
  /** Recalcular distancia de camino y línea de visión con este periodo (segundos). */
  updateSeconds: 0.1,
  /** Hasta dónde se mide la distancia de camino para las señales. */
  range: 45,
  nearDistance: 15,
  veryNearDistance: 7,
  vignetteDistance: 20,
  heartDistance: 22,
  /** Subtítulos: pasos audibles hasta esta distancia, cada cierto tiempo. */
  stepsSubtitleDistance: 30,
  stepsSubtitleInterval: 3.5,
  breathSubtitleDistance: 10,
  breathSubtitleInterval: 5,
  /** Luces que se atenúan cerca de la criatura (suave, por debajo de 3 por segundo). */
  lightDimRadius: 9,
  lightDimDepth: 0.3,
  lightDimHz: 1.3,
} as const;

/** Volúmenes de la criatura y del latido (antes del limitador). */
export const CREATURE_SOUND = {
  steps: 0.5,
  breath: 0.22,
  heart: 0.2,
  /** Frecuencias de corte del paso bajo: sin paredes de por medio y con paredes. */
  openCutoff: 5000,
  occludedCutoff: 650,
} as const;
