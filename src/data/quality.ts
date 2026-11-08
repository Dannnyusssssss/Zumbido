/** Niveles de calidad del render. */
export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Radio de chunks cargados alrededor del jugador (Chebyshev). */
  readonly chunkRadius: number;
  readonly maxPixelRatio: number;
  /** Luces reales en el pool. */
  readonly realLights: number;
  readonly textureSize: number;
  readonly anisotropy: number;
  readonly fogNear: number;
  readonly fogFar: number;
  /** Milisegundos máximos por frame para construir mallas de chunks. */
  readonly buildBudgetMs: number;
}

export const QUALITY_PRESETS: Readonly<Record<Quality, QualityPreset>> = {
  low: {
    chunkRadius: 1,
    maxPixelRatio: 1,
    realLights: 4,
    textureSize: 256,
    anisotropy: 1,
    fogNear: 4,
    fogFar: 30,
    buildBudgetMs: 4,
  },
  medium: {
    chunkRadius: 2,
    maxPixelRatio: 1.5,
    realLights: 5,
    textureSize: 256,
    anisotropy: 2,
    fogNear: 5,
    fogFar: 40,
    buildBudgetMs: 4,
  },
  high: {
    chunkRadius: 2,
    maxPixelRatio: 2,
    realLights: 6,
    textureSize: 512,
    anisotropy: 4,
    fogNear: 6,
    fogFar: 48,
    buildBudgetMs: 4,
  },
};

export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

/** Resolución dinámica (ajuste opcional): baja la resolución interna si los FPS caen de forma sostenida. */
export const DYNAMIC_RES = {
  /** Por debajo de estos FPS, una ventana de medición cuenta como lenta. */
  minFps: 50,
  /** Segundos lentos seguidos antes de bajar un escalón. */
  sustainSeconds: 5,
  /** Duración de cada ventana de medición. */
  windowSeconds: 1,
  /** Segundos que no se miden al entrar en juego (carga de chunks, compilación de shaders). */
  warmupSeconds: 3,
  /** Frames más largos que esto (pestaña oculta, pausa) no se cuentan. */
  maxFrameSeconds: 0.25,
  /** Escalones de la resolución interna, de mayor a menor. */
  steps: [1, 0.85, 0.7] as readonly number[],
} as const;
