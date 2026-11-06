/** Definición de los niveles: parámetros de generación, paleta e iluminación. */

export interface IntRange {
  readonly min: number;
  readonly max: number;
}

export interface GenParams {
  /** Aberturas por borde compartido entre chunks. */
  readonly borderOpenings: IntRange;
  /** Probabilidad de que una abertura del borde tenga dos celdas de ancho. */
  readonly wideOpeningChance: number;
  /** Intentos de colocar salas normales por chunk. */
  readonly roomAttempts: number;
  readonly roomSize: IntRange;
  /** Probabilidad de una sala grande con columnas en un chunk. */
  readonly largeRoomChance: number;
  readonly largeRoomSize: IntRange;
  /** Separación (en celdas) entre columnas dentro de una sala grande. */
  readonly columnSpacing: number;
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

export interface Palette {
  readonly wall: string;
  readonly wallPattern: string;
  readonly baseboard: string;
  readonly floor: string;
  readonly floorFleck: string;
  readonly ceiling: string;
  readonly ceilingGrid: string;
  readonly panel: string;
  readonly light: string;
  readonly fog: string;
  readonly ambient: string;
}

export interface LightingParams {
  readonly ambientIntensity: number;
  readonly pointIntensity: number;
  readonly pointDistance: number;
}

export interface LevelDef {
  readonly id: number;
  readonly name: string;
  /** Sal para que cada nivel dé un mundo distinto con la misma semilla. */
  readonly salt: number;
  readonly ceilingHeight: number;
  readonly gen: GenParams;
  readonly palette: Palette;
  readonly lighting: LightingParams;
}

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: 'Oficina',
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
      loopRate: 0.12,
      maxDeadEndRatio: 0.06,
      minLoops: 8,
      lightDensity: 0.85,
      flickerRatio: 0.06,
    },
    palette: {
      wall: '#c9b97a',
      wallPattern: '#b8a865',
      baseboard: '#6e5f3a',
      floor: '#8f7f4f',
      floorFleck: '#7a6b40',
      ceiling: '#d8d2b8',
      ceilingGrid: '#a9a28a',
      panel: '#fff6d8',
      light: '#fff1c4',
      fog: '#2b2616',
      ambient: '#b5a77a',
    },
    lighting: {
      ambientIntensity: 0.55,
      pointIntensity: 9,
      pointDistance: 11,
    },
  },
];

export function getLevel(id: number): LevelDef {
  const level = LEVELS.find((l) => l.id === id);
  if (level === undefined) throw new Error(`Nivel desconocido: ${id}`);
  return level;
}
