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
