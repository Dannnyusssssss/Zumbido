/**
 * Plan de carga de chunks alrededor del jugador: qué construir (por cercanía) y qué descargar.
 * Lógica pura; el render ejecuta el plan con su presupuesto por frame.
 */
import { chunkKey, insideWorld, keyToCx, keyToCz } from './grid';

/** Chunks del radio (Chebyshev) ordenados del más cercano al más lejano. */
export function desiredChunks(cx: number, cz: number, radius: number): number[] {
  const list: Array<{ key: number; d: number }> = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (!insideWorld(x, z)) continue;
      list.push({ key: chunkKey(x, z), d: dx * dx + dz * dz });
    }
  }
  list.sort((a, b) => a.d - b.d || a.key - b.key);
  return list.map((e) => e.key);
}

export interface StreamDiff {
  toLoad: number[];
  toUnload: number[];
}

/**
 * Compara lo cargado con lo deseado. Se descarga solo lo que queda más allá de radius + 1
 * (histéresis) para no cargar y descargar el mismo chunk al caminar por un borde.
 */
export function planStreaming(
  loaded: ReadonlySet<number>,
  cx: number,
  cz: number,
  radius: number,
): StreamDiff {
  const desired = desiredChunks(cx, cz, radius);
  const toLoad = desired.filter((k) => !loaded.has(k));
  const toUnload: number[] = [];
  for (const key of loaded) {
    const dx = Math.abs(keyToCx(key) - cx);
    const dz = Math.abs(keyToCz(key) - cz);
    if (Math.max(dx, dz) > radius + 1) toUnload.push(key);
  }
  return { toLoad, toUnload };
}
