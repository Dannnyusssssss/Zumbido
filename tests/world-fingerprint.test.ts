/**
 * Huella de los mundos del modo Salida. Fija lo que generan varias semillas en los tres niveles
 * (paredes, columnas, paneles, salas, escondites y colocación de la salida y los fusibles).
 * Si un cambio en la generación altera estos valores, los mundos de las semillas existentes
 * cambiarían: el test lo detecta.
 */
import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src/core/rng';
import { LEVELS } from '../src/data/levels';
import { levelLayout } from '../src/game/layout';
import { generateChunk, type ChunkData } from '../src/game/worldgen';

const SEEDS = ['DEMO', 'OFICINA1', 'D20261106'];

/** FNV-1a sobre una secuencia de enteros. */
function fnv(values: Iterable<number>, h = 0x811c9dc5): number {
  for (const v of values) {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function chunkPrint(c: ChunkData, h: number): number {
  h = fnv(c.vWalls, h);
  h = fnv(c.hWalls, h);
  h = fnv(c.columns, h);
  h = fnv(c.panels, h);
  h = fnv(
    c.rooms.flatMap((r) => [r.x, r.z, r.w, r.h, r.large ? 1 : 0]),
    h,
  );
  return fnv(
    c.hides.flatMap((s) => [s.x, s.z, s.side]),
    h,
  );
}

function worldPrint(seedText: string, levelIndex: number): string {
  const level = LEVELS[levelIndex];
  if (level === undefined) throw new Error('nivel');
  const seed = hashSeed(seedText);
  let h = 0x811c9dc5;
  for (let cz = -2; cz <= 2; cz++) {
    for (let cx = -2; cx <= 2; cx++) h = chunkPrint(generateChunk(seed, level, cx, cz), h);
  }
  const layout = levelLayout(seed, level);
  h = fnv(
    [layout.exit, ...layout.fuses].flatMap((o) => [o.gx + 50000, o.gz + 50000, o.rot]),
    h,
  );
  return h.toString(16);
}

describe('huella de los mundos del modo Salida', () => {
  it('las semillas existentes generan exactamente los mismos mundos', () => {
    const prints = SEEDS.flatMap((s) => LEVELS.map((_, i) => `${s}/${i + 1}:${worldPrint(s, i)}`));
    expect(prints).toMatchInlineSnapshot(`
      [
        "DEMO/1:929bc0e2",
        "DEMO/2:11642af",
        "DEMO/3:a69b4139",
        "OFICINA1/1:9fccd0f0",
        "OFICINA1/2:8aacaf97",
        "OFICINA1/3:14c16ef3",
        "D20261106/1:c093abae",
        "D20261106/2:c2172c7d",
        "D20261106/3:aca436d",
      ]
    `);
  });
});
