/**
 * Construye la malla fusionada de un chunk (suelo, techo, paredes y columnas en una sola geometría
 * con tres grupos de material) y los paneles de luz instanciados.
 * Los vértices van en coordenadas locales del chunk; la malla se coloca en su origen
 * para no perder precisión lejos del centro del mundo.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Material,
} from 'three';
import { WORLD } from '../data/balance';
import type { LevelDef } from '../data/levels';
import { flickerParams, isFlickering, type FlickerParams } from '../game/flicker';
import { cellIndex, hIndex, N, vIndex, type ChunkData } from '../game/worldgen';

const CS = WORLD.cellSize;
const T = WORLD.wallThickness / 2;
const COL = WORLD.columnSize / 2;
/** Ancho en metros de una repetición del papel pintado. */
const WALL_TILE = 1.5;
const SIZE = N * CS;

export interface ChunkMaterials {
  floor: Material;
  ceiling: Material;
  wall: Material;
  panel: Material;
}

export interface ChunkView {
  readonly key: number;
  readonly mesh: Mesh;
  readonly panels: InstancedMesh | null;
  /** Posiciones de los paneles en metros globales (para el pool de luces reales). */
  readonly panelX: Float32Array;
  readonly panelZ: Float32Array;
  /** Para cada panel, índice en `flicker` o -1 si no parpadea. */
  readonly panelFlicker: Int16Array;
  readonly flicker: FlickerParams[];
  /** Índice de instancia de cada entrada de `flicker`. */
  readonly flickerInstance: Int16Array;
}

/** Escritor de quads sobre arreglos preasignados. */
class QuadWriter {
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly uv: Float32Array;
  readonly idx: Uint32Array;
  private v = 0;
  private i = 0;

  constructor(quads: number) {
    this.pos = new Float32Array(quads * 12);
    this.nor = new Float32Array(quads * 12);
    this.uv = new Float32Array(quads * 8);
    this.idx = new Uint32Array(quads * 6);
  }

  get indexCount(): number {
    return this.i;
  }

  /**
   * Añade un quad con esquinas a, b, c, d (en sentido antihorario visto desde la normal)
   * y sus coordenadas de textura.
   */
  quad(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    nx: number,
    ny: number,
    nz: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): void {
    const base = this.v;
    const p = this.pos;
    const o = base * 3;
    p[o] = ax;
    p[o + 1] = ay;
    p[o + 2] = az;
    p[o + 3] = bx;
    p[o + 4] = by;
    p[o + 5] = bz;
    p[o + 6] = cx;
    p[o + 7] = cy;
    p[o + 8] = cz;
    p[o + 9] = dx;
    p[o + 10] = dy;
    p[o + 11] = dz;
    for (let k = 0; k < 4; k++) {
      this.nor[o + k * 3] = nx;
      this.nor[o + k * 3 + 1] = ny;
      this.nor[o + k * 3 + 2] = nz;
    }
    const t = base * 2;
    this.uv[t] = u0;
    this.uv[t + 1] = v0;
    this.uv[t + 2] = u1;
    this.uv[t + 3] = v0;
    this.uv[t + 4] = u1;
    this.uv[t + 5] = v1;
    this.uv[t + 6] = u0;
    this.uv[t + 7] = v1;
    const ix = this.idx;
    ix[this.i++] = base;
    ix[this.i++] = base + 1;
    ix[this.i++] = base + 2;
    ix[this.i++] = base;
    ix[this.i++] = base + 2;
    ix[this.i++] = base + 3;
    this.v += 4;
  }

  /** Caja vertical (sin tapa: la cubre el techo) de x0..x1, z0..z1 y altura h. */
  box(x0: number, x1: number, z0: number, z1: number, h: number): void {
    const v1 = 1;
    const W = WALL_TILE;
    // Orden antihorario visto desde fuera de cada cara; u crece hacia la derecha del observador.
    // Cara -x (u a lo largo de +z) y cara +x (u a lo largo de -z).
    this.quad(x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0, -1, 0, 0, z0 / W, 0, z1 / W, v1);
    this.quad(x1, 0, z1, x1, 0, z0, x1, h, z0, x1, h, z1, 1, 0, 0, -z1 / W, 0, -z0 / W, v1);
    // Cara -z (u a lo largo de -x) y cara +z (u a lo largo de +x).
    this.quad(x1, 0, z0, x0, 0, z0, x0, h, z0, x1, h, z0, 0, 0, -1, -x1 / W, 0, -x0 / W, v1);
    this.quad(x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1, 0, 0, 1, x0 / W, 0, x1 / W, v1);
  }
}

/** ¿Se dibuja la línea `line` (0..N) del borde? El borde lejano lo dibuja el vecino, salvo en el límite del mundo. */
function drawsLine(line: number, chunkCoord: number): boolean {
  return line < N || chunkCoord === WORLD.maxChunk;
}

const tmpMatrix = new Matrix4();
const tmpColor = new Color(1, 1, 1);

export function buildChunkView(
  key: number,
  chunk: ChunkData,
  level: LevelDef,
  materials: ChunkMaterials,
  panelGeometry: BufferGeometry,
  seed: number,
): ChunkView {
  const H = level.ceilingHeight;

  // 1. Contar quads para reservar memoria exacta.
  let walls = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x <= N; x++)
      if (chunk.vWalls[vIndex(x, z)] === 1 && drawsLine(x, chunk.cx)) walls++;
  for (let z = 0; z <= N; z++)
    for (let x = 0; x < N; x++)
      if (chunk.hWalls[hIndex(x, z)] === 1 && drawsLine(z, chunk.cz)) walls++;
  let columns = 0;
  for (let i = 0; i < N * N; i++) if (chunk.columns[i] === 1) columns++;
  const w = new QuadWriter(2 + (walls + columns) * 4);

  // 2. Suelo y techo: un quad cada uno; una repetición de textura por celda.
  w.quad(0, 0, SIZE, SIZE, 0, SIZE, SIZE, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, N, N);
  const floorEnd = w.indexCount;
  w.quad(0, H, 0, SIZE, H, 0, SIZE, H, SIZE, 0, H, SIZE, 0, -1, 0, 0, 0, N, N);
  const ceilingEnd = w.indexCount;

  // 3. Paredes: cajas finas alargadas T por cada extremo para cerrar las esquinas.
  for (let z = 0; z < N; z++) {
    for (let x = 0; x <= N; x++) {
      if (chunk.vWalls[vIndex(x, z)] !== 1 || !drawsLine(x, chunk.cx)) continue;
      w.box(x * CS - T, x * CS + T, z * CS - T, (z + 1) * CS + T, H);
    }
  }
  for (let z = 0; z <= N; z++) {
    for (let x = 0; x < N; x++) {
      if (chunk.hWalls[hIndex(x, z)] !== 1 || !drawsLine(z, chunk.cz)) continue;
      w.box(x * CS - T, (x + 1) * CS + T, z * CS - T, z * CS + T, H);
    }
  }
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (chunk.columns[cellIndex(x, z)] !== 1) continue;
      const cx = (x + 0.5) * CS;
      const cz = (z + 0.5) * CS;
      w.box(cx - COL, cx + COL, cz - COL, cz + COL, H);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(w.pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(w.nor, 3));
  geometry.setAttribute('uv', new BufferAttribute(w.uv, 2));
  geometry.setIndex(new BufferAttribute(w.idx, 1));
  geometry.addGroup(0, floorEnd, 0);
  geometry.addGroup(floorEnd, ceilingEnd - floorEnd, 1);
  geometry.addGroup(ceilingEnd, w.indexCount - ceilingEnd, 2);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const mesh = new Mesh(geometry, [materials.floor, materials.ceiling, materials.wall]);
  const ox = chunk.cx * SIZE;
  const oz = chunk.cz * SIZE;
  mesh.position.set(ox, 0, oz);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  // 4. Paneles de luz instanciados.
  let panelCount = 0;
  for (let i = 0; i < N * N; i++) if (chunk.panels[i] === 1) panelCount++;
  const panelX = new Float32Array(panelCount);
  const panelZ = new Float32Array(panelCount);
  const panelFlicker = new Int16Array(panelCount).fill(-1);
  const flicker: FlickerParams[] = [];
  const flickerInstance: number[] = [];
  let panels: InstancedMesh | null = null;
  if (panelCount > 0) {
    panels = new InstancedMesh(panelGeometry, materials.panel, panelCount);
    panels.instanceColor = new InstancedBufferAttribute(
      new Float32Array(panelCount * 3).fill(1),
      3,
    );
    panels.instanceColor.setUsage(DynamicDrawUsage);
    let k = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        if (chunk.panels[cellIndex(x, z)] !== 1) continue;
        const lx = (x + 0.5) * CS;
        const lz = (z + 0.5) * CS;
        tmpMatrix.makeTranslation(lx, H - 0.01, lz);
        panels.setMatrixAt(k, tmpMatrix);
        panels.setColorAt(k, tmpColor);
        panelX[k] = ox + lx;
        panelZ[k] = oz + lz;
        const gx = chunk.cx * N + x;
        const gz = chunk.cz * N + z;
        if (isFlickering(seed ^ level.salt, gx, gz, level.gen.flickerRatio)) {
          panelFlicker[k] = flicker.length;
          flicker.push(
            flickerParams(seed ^ level.salt, gx, gz, {
              freq: 0,
              phase: 0,
              phase2: 0,
              episodeFreq: 0,
              episodePhase: 0,
            }),
          );
          flickerInstance.push(k);
        }
        k++;
      }
    }
    panels.position.set(ox, 0, oz);
    panels.matrixAutoUpdate = false;
    panels.updateMatrix();
    panels.computeBoundingSphere();
  }

  return {
    key,
    mesh,
    panels,
    panelX,
    panelZ,
    panelFlicker,
    flicker,
    flickerInstance: Int16Array.from(flickerInstance),
  };
}

/** Libera la memoria de GPU propia del chunk (los materiales y la geometría del panel son compartidos). */
export function disposeChunkView(view: ChunkView): void {
  view.mesh.geometry.dispose();
  view.panels?.dispose();
}
