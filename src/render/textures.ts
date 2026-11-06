/**
 * Texturas procedurales dibujadas en Canvas con el RNG con semilla: moqueta, papel pintado y placas de techo.
 * Se comparten entre todos los chunks; se regeneran solo al cambiar de calidad o de nivel.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { Rng } from '../core/rng';
import type { Palette } from '../data/levels';

export interface WorldTextures {
  floor: CanvasTexture;
  wall: CanvasTexture;
  ceiling: CanvasTexture;
  dispose(): void;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D no disponible');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Manchas suaves (humedad, desgaste) que se repiten sin costura al envolver la textura. */
function stains(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  size: number,
  count: number,
  color: string,
  alpha: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(size * 0.08, size * 0.3);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * rng.range(0.4, 1);
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawCarpet(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.floor;
  ctx.fillRect(0, 0, size, size);
  // Fibras: miles de puntos pequeños más claros y más oscuros.
  const dots = size * size * 0.35;
  for (let i = 0; i < dots; i++) {
    ctx.globalAlpha = rng.range(0.08, 0.3);
    ctx.fillStyle = rng.chance(0.5) ? p.floorFleck : '#a8975f';
    ctx.fillRect(Math.floor(rng.range(0, size)), Math.floor(rng.range(0, size)), 1, 1);
  }
  ctx.globalAlpha = 1;
  stains(ctx, rng, size, 3, '#4a3f22', 0.18);
}

function drawWallpaper(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.wall;
  ctx.fillRect(0, 0, size, size);
  // Rayas verticales finas: 8 por repetición (1,5 m), muy poco contrastadas.
  const stripes = 8;
  const w = size / stripes;
  ctx.fillStyle = p.wallPattern;
  for (let i = 0; i < stripes; i++) {
    ctx.globalAlpha = 0.35;
    ctx.fillRect(i * w + w * 0.42, 0, w * 0.16, size);
  }
  // Pequeño motivo de rombos entre rayas.
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < stripes; i++) {
    for (let j = 0; j < 12; j++) {
      const cx = i * w + w * 0.5 + (j % 2 === 0 ? w * 0.5 : 0);
      const cy = (j + 0.5) * (size / 12);
      ctx.beginPath();
      ctx.moveTo(cx, cy - w * 0.12);
      ctx.lineTo(cx + w * 0.08, cy);
      ctx.lineTo(cx, cy + w * 0.12);
      ctx.lineTo(cx - w * 0.08, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // Suciedad que se acumula hacia abajo.
  const grime = ctx.createLinearGradient(0, 0, 0, size);
  grime.addColorStop(0, 'rgba(60,50,20,0)');
  grime.addColorStop(0.75, 'rgba(60,50,20,0.06)');
  grime.addColorStop(1, 'rgba(60,50,20,0.2)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, size, size);
  stains(ctx, rng, size, 2, '#6b5a2c', 0.12);
  // Zócalo (en la parte de abajo del canvas = parte de abajo de la pared).
  const baseboard = Math.round(size * 0.045);
  ctx.fillStyle = p.baseboard;
  ctx.fillRect(0, size - baseboard, size, baseboard);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, size - baseboard, size, Math.max(1, Math.round(size / 256)));
}

function drawCeiling(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.ceiling;
  ctx.fillRect(0, 0, size, size);
  // Textura de placa acústica: puntitos oscuros.
  const dots = size * size * 0.06;
  ctx.fillStyle = '#8c866f';
  for (let i = 0; i < dots; i++) {
    ctx.globalAlpha = rng.range(0.15, 0.45);
    ctx.fillRect(Math.floor(rng.range(0, size)), Math.floor(rng.range(0, size)), 1, 1);
  }
  ctx.globalAlpha = 1;
  stains(ctx, rng, size, 2, '#8a7a45', 0.15);
  // Perfilería: 5×5 placas de 0,6 m por celda de 3 m.
  const tiles = 5;
  const line = Math.max(2, Math.round(size / 128));
  ctx.fillStyle = p.ceilingGrid;
  for (let i = 0; i < tiles; i++) {
    const pos = Math.round((i * size) / tiles);
    ctx.fillRect(pos, 0, line, size);
    ctx.fillRect(0, pos, size, line);
  }
}

/** Crea las tres texturas del nivel. */
export function createWorldTextures(
  seed: number,
  palette: Palette,
  size: number,
  anisotropy: number,
): WorldTextures {
  const rng = new Rng(seed);
  const [fc, fctx] = canvas(size);
  drawCarpet(fctx, rng, size, palette);
  const [wc, wctx] = canvas(size);
  drawWallpaper(wctx, rng, size, palette);
  const [cc, cctx] = canvas(size);
  drawCeiling(cctx, rng, size, palette);
  const floor = toTexture(fc, anisotropy);
  const wall = toTexture(wc, anisotropy);
  const ceiling = toTexture(cc, anisotropy);
  return {
    floor,
    wall,
    ceiling,
    dispose() {
      floor.dispose();
      wall.dispose();
      ceiling.dispose();
    },
  };
}
