import { describe, expect, it } from 'vitest';
import { hashSeed } from '../src/core/rng';
import { PLAYER, WORLD } from '../src/data/balance';
import { getLevel, LEVELS, type LevelDef } from '../src/data/levels';
import { EDGE } from '../src/data/balance';
import {
  analyzeChunk,
  cellIndex,
  generateChunk,
  hIndex,
  N,
  SPAWN_POINT,
  START_ROOM,
  vIndex,
  type ChunkData,
} from '../src/game/worldgen';

const SEEDS = Array.from({ length: 40 }, (_, i) => hashSeed(`SEMILLA${i}`));
const COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 2],
  [5, -3],
  [-17, -40],
  [123, 456],
];

function same(a: ChunkData, b: ChunkData): boolean {
  return (
    a.vWalls.every((v, i) => v === b.vWalls[i]) &&
    a.hWalls.every((v, i) => v === b.hWalls[i]) &&
    a.columns.every((v, i) => v === b.columns[i]) &&
    a.panels.every((v, i) => v === b.panels[i])
  );
}

describe.each(LEVELS)('nivel $id ($name)', (level) => {
  describe('generateChunk: determinismo', () => {
    it('misma entrada, mismo chunk', () => {
      for (const seed of SEEDS.slice(0, 10)) {
        for (const [cx, cz] of COORDS) {
          expect(same(generateChunk(seed, level, cx, cz), generateChunk(seed, level, cx, cz))).toBe(
            true,
          );
        }
      }
    });

    it('no depende del orden en que se generan los chunks', () => {
      const seed = SEEDS[0] as number;
      const forward = COORDS.map(([x, z]) => generateChunk(seed, level, x, z));
      const backward = [...COORDS]
        .reverse()
        .map(([x, z]) => generateChunk(seed, level, x, z))
        .reverse();
      forward.forEach((c, i) => expect(same(c, backward[i] as ChunkData)).toBe(true));
    });

    it('semillas distintas dan chunks distintos', () => {
      let different = 0;
      for (let i = 1; i < SEEDS.length; i++) {
        if (
          !same(
            generateChunk(SEEDS[0] as number, level, 3, 3),
            generateChunk(SEEDS[i] as number, level, 3, 3),
          )
        ) {
          different++;
        }
      }
      expect(different).toBe(SEEDS.length - 1);
    });
  });

  describe('generateChunk: bordes compartidos', () => {
    it('las aberturas coinciden con el vecino del este y del sur', () => {
      for (const seed of SEEDS) {
        for (const [cx, cz] of COORDS) {
          const c = generateChunk(seed, level, cx, cz);
          const east = generateChunk(seed, level, cx + 1, cz);
          const south = generateChunk(seed, level, cx, cz + 1);
          for (let i = 0; i < N; i++) {
            expect(c.vWalls[vIndex(N, i)]).toBe(east.vWalls[vIndex(0, i)]);
            expect(c.hWalls[hIndex(i, N)]).toBe(south.hWalls[hIndex(i, 0)]);
          }
        }
      }
    });

    it('cada borde interior tiene al menos una abertura', () => {
      for (const seed of SEEDS) {
        const c = generateChunk(seed, level, 2, -1);
        const count = (pick: (i: number) => number): number => {
          let n = 0;
          for (let i = 0; i < N; i++) if (pick(i) === 0) n++;
          return n;
        };
        expect(count((i) => c.vWalls[vIndex(0, i)] as number)).toBeGreaterThanOrEqual(1);
        expect(count((i) => c.vWalls[vIndex(N, i)] as number)).toBeGreaterThanOrEqual(1);
        expect(count((i) => c.hWalls[hIndex(i, 0)] as number)).toBeGreaterThanOrEqual(1);
        expect(count((i) => c.hWalls[hIndex(i, N)] as number)).toBeGreaterThanOrEqual(1);
      }
    });

    it('el límite del mundo queda cerrado', () => {
      const M = WORLD.maxChunk;
      const seed = SEEDS[1] as number;
      const eastEdge = generateChunk(seed, level, M, 0);
      const westEdge = generateChunk(seed, level, -M, 0);
      const southEdge = generateChunk(seed, level, 0, M);
      const northEdge = generateChunk(seed, level, 0, -M);
      for (let i = 0; i < N; i++) {
        expect(eastEdge.vWalls[vIndex(N, i)]).toBe(1);
        expect(westEdge.vWalls[vIndex(0, i)]).toBe(1);
        expect(southEdge.hWalls[hIndex(i, N)]).toBe(1);
        expect(northEdge.hWalls[hIndex(i, 0)]).toBe(1);
      }
    });
  });

  describe('generateChunk: forma del laberinto', () => {
    it('todas las celdas del chunk están conectadas (y con ellas todas las aberturas)', () => {
      for (const seed of SEEDS) {
        for (const [cx, cz] of COORDS) {
          expect(analyzeChunk(generateChunk(seed, level, cx, cz)).reachableCells).toBe(N * N);
        }
      }
    });

    it('tiene bucles, cruces en T y en X y pocos callejones sin salida', () => {
      let largeRooms = 0;
      let columns = 0;
      for (const seed of SEEDS) {
        for (const [cx, cz] of COORDS) {
          const chunk = generateChunk(seed, level, cx, cz);
          const s = analyzeChunk(chunk);
          expect(s.loops).toBeGreaterThanOrEqual(level.gen.minLoops);
          expect(s.deadEnds / (N * N)).toBeLessThanOrEqual(level.gen.maxDeadEndRatio);
          expect(s.junctionsT).toBeGreaterThan(0);
          expect(s.junctionsX).toBeGreaterThan(0);
          if (chunk.rooms.some((r) => r.large)) largeRooms++;
          columns += chunk.columns.reduce((a, b) => a + b, 0);
        }
      }
      const total = SEEDS.length * COORDS.length;
      // Salas grandes "ocasionales": ni nunca ni siempre.
      // La frecuencia de salas grandes sigue el parámetro del nivel (ocasionales en la Oficina).
      const chance = level.gen.largeRoomChance;
      expect(largeRooms).toBeGreaterThan(total * chance * 0.4);
      expect(largeRooms).toBeLessThanOrEqual(total * Math.min(1, chance + 0.3));
      if (level.gen.columnSpacing > 0) expect(columns).toBeGreaterThan(0);
      else expect(columns).toBe(0);
    });

    it('las columnas solo están dentro de salas grandes y con las cuatro caras abiertas', () => {
      for (const seed of SEEDS) {
        const chunk = generateChunk(seed, level, 4, 4);
        for (let z = 0; z < N; z++) {
          for (let x = 0; x < N; x++) {
            if (chunk.columns[cellIndex(x, z)] !== 1) continue;
            const inLarge = chunk.rooms.some(
              (r) => r.large && x > r.x && x < r.x + r.w - 1 && z > r.z && z < r.z + r.h - 1,
            );
            expect(inLarge).toBe(true);
          }
        }
      }
    });

    it('el ancho de paso deja sitio de sobra al jugador', () => {
      const corridor = WORLD.cellSize - WORLD.wallThickness;
      expect(corridor).toBeGreaterThanOrEqual(4 * PLAYER.radius);
      // Hueco entre una columna y la pared de su celda.
      const besideColumn = (WORLD.cellSize - WORLD.columnSize) / 2 - WORLD.wallThickness / 2;
      expect(besideColumn).toBeGreaterThan(2 * PLAYER.radius + 0.2);
    });

    it('hay paneles de luz pero no en todas las celdas', () => {
      const chunk = generateChunk(SEEDS[2] as number, level, 0, 1);
      const panels = chunk.panels.reduce((a, b) => a + b, 0);
      expect(panels).toBeGreaterThan(N * N * 0.5 * level.gen.lightDensity * 0.6);
      expect(panels).toBeLessThan(N * N * 0.5 + 1);
    });
  });

  describe('punto de inicio', () => {
    it('está dentro de la sala de inicio, sin paredes ni columnas', () => {
      for (const seed of SEEDS) {
        const chunk = generateChunk(seed, level, 0, 0);
        const gx = Math.floor(SPAWN_POINT.x / WORLD.cellSize);
        expect(Math.floor(SPAWN_POINT.z / WORLD.cellSize)).toBeGreaterThanOrEqual(START_ROOM.z);
        expect(gx).toBeGreaterThanOrEqual(START_ROOM.x);
        expect(gx).toBeLessThan(START_ROOM.x + START_ROOM.w);
        for (let z = START_ROOM.z; z < START_ROOM.z + START_ROOM.h; z++) {
          for (let x = START_ROOM.x; x < START_ROOM.x + START_ROOM.w; x++) {
            expect(chunk.columns[cellIndex(x, z)]).toBe(0);
            if (x > START_ROOM.x) expect(chunk.vWalls[vIndex(x, z)]).toBe(0);
            if (z > START_ROOM.z) expect(chunk.hWalls[hIndex(x, z)]).toBe(0);
          }
        }
      }
    });
  });
});

describe('datos de niveles', () => {
  it('los parámetros están en rangos razonables', () => {
    for (const l of LEVELS) {
      const g = l.gen;
      expect(g.borderOpenings.min).toBeGreaterThanOrEqual(1);
      expect(g.borderOpenings.max).toBeLessThanOrEqual(N - 2);
      expect(g.roomSize.min).toBeGreaterThanOrEqual(2);
      expect(g.largeRoomSize.max).toBeLessThanOrEqual(N);
      expect(g.loopRate).toBeGreaterThan(0);
      expect(g.loopRate).toBeLessThan(0.5);
      expect(g.flickerRatio).toBeLessThanOrEqual(0.1);
      expect(l.ceilingHeight).toBeGreaterThan(PLAYER.eyeHeightStand + 0.5);
    }
  });
});

describe('estantes', () => {
  const warehouse = getLevel(3);

  it('solo aparecen en el Almacén y nunca en los bordes del chunk', () => {
    let shelves = 0;
    for (const seed of SEEDS.slice(0, 15)) {
      for (const [cx, cz] of COORDS) {
        for (const l of LEVELS) {
          const c = generateChunk(seed, l, cx, cz);
          const count = [...c.vWalls, ...c.hWalls].filter((v) => v === EDGE.shelf).length;
          if (l.id !== 3) expect(count).toBe(0);
          else shelves += count;
          for (let i = 0; i < N; i++) {
            expect(c.vWalls[vIndex(0, i)]).not.toBe(EDGE.shelf);
            expect(c.vWalls[vIndex(N, i)]).not.toBe(EDGE.shelf);
            expect(c.hWalls[hIndex(i, 0)]).not.toBe(EDGE.shelf);
            expect(c.hWalls[hIndex(i, N)]).not.toBe(EDGE.shelf);
          }
        }
      }
    }
    expect(shelves).toBeGreaterThan(100);
  });

  it('el pasillo entre dos estantes es estrecho pero transitable', () => {
    const aisle = WORLD.cellSize - WORLD.shelfDepth;
    expect(aisle).toBeGreaterThan(2 * PLAYER.radius + 0.8);
    expect(aisle).toBeLessThan(2.5);
    expect(warehouse.ceilingHeight).toBeGreaterThan(WORLD.shelfHeight + 0.5);
  });
});

describe('progresión de los niveles', () => {
  it('los niveles van de menos a más difíciles', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const a = LEVELS[i - 1] as LevelDef;
      const b = LEVELS[i] as LevelDef;
      expect(b.objective.exitChunks.min).toBeGreaterThanOrEqual(a.objective.exitChunks.min);
      expect(b.objective.fuses).toBeGreaterThan(a.objective.fuses);
      expect(b.id).toBe(a.id + 1);
      expect(b.salt).not.toBe(a.salt);
    }
    expect(LEVELS.map((l) => l.objective.fuses)).toEqual([0, 2, 3]);
  });
});
