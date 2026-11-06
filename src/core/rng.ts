/**
 * Aleatoriedad determinista. Toda la lógica del juego usa estas funciones:
 * misma semilla y mismas coordenadas => mismo resultado, sin estado global.
 */

/** Convierte un texto de semilla en un entero de 32 bits sin signo (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mezclador final de 32 bits (avalancha completa, estilo murmur3). */
export function mix32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash determinista de una semilla y dos coordenadas enteras. */
export function hash2(seed: number, x: number, z: number): number {
  let h = mix32(seed ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = mix32(h ^ Math.imul(z | 0, 0x165667b1));
  return h;
}

/** Hash determinista de una semilla y tres enteros (por ejemplo x, z y un canal). */
export function hash3(seed: number, x: number, z: number, w: number): number {
  return mix32(hash2(seed, x, z) ^ Math.imul(w | 0, 0x9e3779b1));
}

/** Pasa un hash de 32 bits a un número en [0, 1). */
export function hashToUnit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Generador pseudoaleatorio con semilla (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Siguiente entero de 32 bits sin signo. */
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Número en [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Número real en [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Verdadero con probabilidad p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Baraja un arreglo en el sitio (Fisher-Yates). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
