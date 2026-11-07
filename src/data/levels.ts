/** Definición de los niveles: parámetros de generación, objetivo, paleta, iluminación y sonido. */

export interface IntRange {
  readonly min: number;
  readonly max: number;
}

export type LevelStyle = 'office' | 'garage' | 'warehouse';

export interface GenParams {
  /** Aberturas por borde compartido entre chunks. */
  readonly borderOpenings: IntRange;
  /** Probabilidad de que una abertura del borde tenga dos celdas de ancho. */
  readonly wideOpeningChance: number;
  /** Intentos de colocar salas normales por chunk. */
  readonly roomAttempts: number;
  readonly roomSize: IntRange;
  /** Probabilidad de una sala grande en un chunk. */
  readonly largeRoomChance: number;
  readonly largeRoomSize: IntRange;
  /** Separación (en celdas) entre columnas dentro de una sala grande; 0 = sin columnas. */
  readonly columnSpacing: number;
  /** Filas de estantes dentro de las salas grandes (pasillos estrechos). */
  readonly shelfRows: boolean;
  /** Proporción de paredes interiores que se convierten en estantes. */
  readonly shelfRatio: number;
  /** Probabilidad de quitar una pared extra tras el árbol (crea bucles). */
  readonly loopRate: number;
  /** Proporción máxima de celdas con una sola salida. */
  readonly maxDeadEndRatio: number;
  /** Mínimo de bucles independientes por chunk (comprobado en los tests). */
  readonly minLoops: number;
  /** Probabilidad de panel de luz en las celdas candidatas (patrón de tablero). */
  readonly lightDensity: number;
  /** Proporción de paneles que parpadean de forma suave. */
  readonly flickerRatio: number;
}

export interface ObjectiveParams {
  /** Distancia de la salida al inicio, en chunks (línea recta entre centros de chunk). */
  readonly exitChunks: IntRange;
  /** Fusibles necesarios para activar la salida. */
  readonly fuses: number;
  /** Distancia de los fusibles al inicio, en chunks. */
  readonly fuseChunks: IntRange;
}

export interface Palette {
  readonly wall: string;
  readonly wallPattern: string;
  readonly baseboard: string;
  readonly floor: string;
  readonly floorFleck: string;
  readonly ceiling: string;
  readonly ceilingGrid: string;
  readonly shelfFrame: string;
  readonly shelfBox: string;
  readonly panel: string;
  readonly light: string;
  readonly fog: string;
  readonly ambient: string;
}

export interface LightingParams {
  readonly ambientIntensity: number;
  readonly pointIntensity: number;
  readonly pointDistance: number;
  /** Tamaño del panel o tira de luz (m). */
  readonly panelWidth: number;
  readonly panelDepth: number;
  /** Multiplicador de la distancia de niebla de la calidad elegida. */
  readonly fogScale: number;
}

export interface AudioParams {
  /** Mezcla de eco (0 = seco, 1 = mucho eco). */
  readonly reverb: number;
  /** Duración del eco en segundos. */
  readonly reverbSeconds: number;
}

export interface LevelDef {
  readonly id: number;
  readonly name: string;
  readonly style: LevelStyle;
  /** Sal para que cada nivel dé un mundo distinto con la misma semilla. */
  readonly salt: number;
  readonly ceilingHeight: number;
  readonly gen: GenParams;
  readonly objective: ObjectiveParams;
  readonly palette: Palette;
  readonly lighting: LightingParams;
  readonly audio: AudioParams;
}

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: 'Oficina',
    style: 'office',
    salt: 0x0f1c1a01,
    ceilingHeight: 2.7,
    gen: {
      borderOpenings: { min: 1, max: 3 },
      wideOpeningChance: 0.3,
      roomAttempts: 9,
      roomSize: { min: 2, max: 5 },
      largeRoomChance: 0.3,
      largeRoomSize: { min: 6, max: 9 },
      columnSpacing: 2,
      shelfRows: false,
      shelfRatio: 0,
      loopRate: 0.12,
      maxDeadEndRatio: 0.06,
      minLoops: 8,
      lightDensity: 0.85,
      flickerRatio: 0.06,
    },
    objective: {
      exitChunks: { min: 2, max: 3 },
      fuses: 0,
      fuseChunks: { min: 1.5, max: 2.5 },
    },
    palette: {
      wall: '#c9b97a',
      wallPattern: '#b8a865',
      baseboard: '#6e5f3a',
      floor: '#8f7f4f',
      floorFleck: '#7a6b40',
      ceiling: '#d8d2b8',
      ceilingGrid: '#a9a28a',
      shelfFrame: '#7a6a40',
      shelfBox: '#a08a5a',
      panel: '#fff6d8',
      light: '#fff1c4',
      fog: '#2b2616',
      ambient: '#b5a77a',
    },
    lighting: {
      ambientIntensity: 0.55,
      pointIntensity: 9,
      pointDistance: 11,
      panelWidth: 1.2,
      panelDepth: 0.6,
      fogScale: 1,
    },
    audio: { reverb: 0.08, reverbSeconds: 0.6 },
  },
  {
    id: 2,
    name: 'Cochera',
    style: 'garage',
    salt: 0x0c0c4e02,
    ceilingHeight: 3,
    gen: {
      borderOpenings: { min: 2, max: 4 },
      wideOpeningChance: 0.5,
      roomAttempts: 4,
      roomSize: { min: 3, max: 5 },
      largeRoomChance: 0.85,
      largeRoomSize: { min: 8, max: 12 },
      columnSpacing: 3,
      shelfRows: false,
      shelfRatio: 0,
      loopRate: 0.3,
      maxDeadEndRatio: 0.04,
      minLoops: 20,
      lightDensity: 0.7,
      flickerRatio: 0.07,
    },
    objective: {
      exitChunks: { min: 3, max: 4 },
      fuses: 2,
      fuseChunks: { min: 1.5, max: 3 },
    },
    palette: {
      wall: '#8c8a82',
      wallPattern: '#77756d',
      baseboard: '#c9b23c',
      floor: '#6d6b65',
      floorFleck: '#5a5852',
      ceiling: '#9a978e',
      ceilingGrid: '#7e7b72',
      shelfFrame: '#5a5852',
      shelfBox: '#7a7466',
      panel: '#f2f6ff',
      light: '#e6eeff',
      fog: '#17191c',
      ambient: '#8f939a',
    },
    lighting: {
      ambientIntensity: 0.45,
      pointIntensity: 10,
      pointDistance: 12,
      panelWidth: 2.4,
      panelDepth: 0.15,
      fogScale: 1,
    },
    audio: { reverb: 0.45, reverbSeconds: 2.6 },
  },
  {
    id: 3,
    name: 'Almacén',
    style: 'warehouse',
    salt: 0x0a1a3c03,
    ceilingHeight: 4.5,
    gen: {
      borderOpenings: { min: 1, max: 3 },
      wideOpeningChance: 0.25,
      roomAttempts: 6,
      roomSize: { min: 2, max: 4 },
      largeRoomChance: 0.75,
      largeRoomSize: { min: 6, max: 10 },
      columnSpacing: 0,
      shelfRows: true,
      shelfRatio: 0.35,
      loopRate: 0.1,
      maxDeadEndRatio: 0.07,
      minLoops: 6,
      lightDensity: 0.45,
      flickerRatio: 0.08,
    },
    objective: {
      exitChunks: { min: 3, max: 5 },
      fuses: 3,
      fuseChunks: { min: 1.5, max: 3.5 },
    },
    palette: {
      wall: '#5d6168',
      wallPattern: '#4c5057',
      baseboard: '#2f3237',
      floor: '#55534c',
      floorFleck: '#46443e',
      ceiling: '#3a3c40',
      ceilingGrid: '#2a2c30',
      shelfFrame: '#b4672a',
      shelfBox: '#9c7f55',
      panel: '#fff2d0',
      light: '#ffe7b8',
      fog: '#0c0c0d',
      ambient: '#6b6a66',
    },
    lighting: {
      ambientIntensity: 0.3,
      pointIntensity: 14,
      pointDistance: 13,
      panelWidth: 1.6,
      panelDepth: 0.3,
      fogScale: 0.8,
    },
    audio: { reverb: 0.25, reverbSeconds: 1.6 },
  },
];

export function getLevel(id: number): LevelDef {
  const level = LEVELS.find((l) => l.id === id);
  if (level === undefined) throw new Error(`Nivel desconocido: ${id}`);
  return level;
}

export const LEVEL_COUNT = LEVELS.length;
