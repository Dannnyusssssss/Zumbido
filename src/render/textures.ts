/**
 * Texturas procedurales dibujadas en Canvas con el RNG con semilla: moqueta, papel pintado y placas de techo.
 * Se comparten entre todos los chunks; se regeneran solo al cambiar de calidad o de nivel.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { Rng } from '../core/rng';
import type { LevelDef, Palette } from '../data/levels';

export interface WorldTextures {
  floor: CanvasTexture;
  wall: CanvasTexture;
  ceiling: CanvasTexture;
  shelf: CanvasTexture;
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

/** Ruido de puntos para superficies de hormigón. */
function speckle(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  size: number,
  density: number,
  colors: readonly string[],
): void {
  const dots = size * size * density;
  for (let i = 0; i < dots; i++) {
    ctx.globalAlpha = rng.range(0.06, 0.25);
    ctx.fillStyle = colors[rng.int(0, colors.length - 1)] as string;
    const r = rng.chance(0.1) ? 2 : 1;
    ctx.fillRect(Math.floor(rng.range(0, size)), Math.floor(rng.range(0, size)), r, r);
  }
  ctx.globalAlpha = 1;
}

function drawConcreteFloor(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  size: number,
  p: Palette,
  oil: boolean,
): void {
  ctx.fillStyle = p.floor;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, rng, size, 0.25, [p.floorFleck, '#8a8880', '#3f3d38']);
  if (oil) stains(ctx, rng, size, 3, '#1c1b18', 0.35);
  else stains(ctx, rng, size, 2, '#2c2a26', 0.12);
  // Junta de dilatación en un borde de la losa (se repite cada celda).
  ctx.fillStyle = 'rgba(20,20,18,0.35)';
  ctx.fillRect(0, 0, size, Math.max(1, Math.round(size / 170)));
}

function drawConcreteWall(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.wall;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, rng, size, 0.2, [p.wallPattern, '#a19f97', '#5f5d57']);
  // Marcas horizontales del encofrado.
  ctx.fillStyle = 'rgba(40,40,36,0.18)';
  for (let i = 1; i < 4; i++)
    ctx.fillRect(0, Math.round((i * size) / 4), size, Math.max(1, Math.round(size / 200)));
  stains(ctx, rng, size, 2, '#3a3832', 0.15);
  // Franja pintada abajo (señalización de cochera).
  const band = Math.round(size * 0.08);
  ctx.fillStyle = p.baseboard;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0, size - band, size, band);
  ctx.globalAlpha = 1;
}

function drawSlab(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.ceiling;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, rng, size, 0.15, [p.ceilingGrid, '#b0ada4']);
  ctx.fillStyle = p.ceilingGrid;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, Math.max(2, Math.round(size / 100)), size);
  ctx.globalAlpha = 1;
  stains(ctx, rng, size, 1, '#5f5c55', 0.15);
}

function drawCorrugated(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  // Chapa ondulada: bandas verticales con degradado claro-oscuro.
  const ridges = 10;
  const w = size / ridges;
  for (let i = 0; i < ridges; i++) {
    const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, p.wallPattern);
    g.addColorStop(0.5, p.wall);
    g.addColorStop(1, p.wallPattern);
    ctx.fillStyle = g;
    ctx.fillRect(i * w, 0, w + 1, size);
  }
  speckle(ctx, rng, size, 0.05, ['#2a2c30', '#7a7e86']);
  stains(ctx, rng, size, 2, '#3a2a1a', 0.12);
  const base = Math.round(size * 0.05);
  ctx.fillStyle = p.baseboard;
  ctx.fillRect(0, size - base, size, base);
}

function drawDarkCeiling(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = p.ceiling;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, rng, size, 0.08, [p.ceilingGrid, '#4a4c50']);
  // Vigas metálicas.
  ctx.fillStyle = p.ceilingGrid;
  const beam = Math.round(size * 0.07);
  ctx.fillRect(0, Math.round(size * 0.46), size, beam);
  ctx.fillRect(Math.round(size * 0.46), 0, Math.round(beam / 2), size);
}

/** Lateral de una estantería de 1,5 m: montantes, largueros y cajas de cartón. */
function drawShelf(ctx: CanvasRenderingContext2D, rng: Rng, size: number, p: Palette): void {
  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, size, size);
  const levels = 4;
  const beamH = Math.max(3, Math.round(size * 0.025));
  const post = Math.max(4, Math.round(size * 0.05));
  for (let l = 0; l < levels; l++) {
    const top = Math.round((l * size) / levels);
    const bottom = Math.round(((l + 1) * size) / levels) - beamH;
    // Cajas sobre cada balda.
    let x = post + 2;
    while (x < size - post - 8) {
      const bw = Math.round(rng.range(size * 0.12, size * 0.3));
      const bh = Math.round(rng.range((bottom - top) * 0.45, (bottom - top) * 0.9));
      if (rng.chance(0.85)) {
        ctx.fillStyle = p.shelfBox;
        ctx.globalAlpha = rng.range(0.7, 1);
        ctx.fillRect(x, bottom - bh, Math.min(bw, size - post - x - 2), bh);
        ctx.fillStyle = 'rgba(60,40,20,0.35)';
        ctx.fillRect(x, bottom - bh + Math.round(bh * 0.3), Math.min(bw, size - post - x - 2), 2);
        ctx.globalAlpha = 1;
      }
      x += bw + Math.round(rng.range(2, size * 0.04));
    }
    // Larguero.
    ctx.fillStyle = p.shelfFrame;
    ctx.fillRect(0, bottom, size, beamH);
  }
  // Montantes en los dos extremos (se repiten cada 1,5 m).
  ctx.fillStyle = p.shelfFrame;
  ctx.fillRect(0, 0, post, size);
  ctx.fillRect(size - post, 0, post, size);
}

/** Crea las texturas del nivel según su estilo. */
export function createWorldTextures(
  seed: number,
  level: LevelDef,
  size: number,
  anisotropy: number,
): WorldTextures {
  const rng = new Rng(seed);
  const p = level.palette;
  const [fc, fctx] = canvas(size);
  const [wc, wctx] = canvas(size);
  const [cc, cctx] = canvas(size);
  const [sc, sctx] = canvas(size);
  if (level.style === 'office') {
    drawCarpet(fctx, rng, size, p);
    drawWallpaper(wctx, rng, size, p);
    drawCeiling(cctx, rng, size, p);
  } else if (level.style === 'garage') {
    drawConcreteFloor(fctx, rng, size, p, true);
    drawConcreteWall(wctx, rng, size, p);
    drawSlab(cctx, rng, size, p);
  } else {
    drawConcreteFloor(fctx, rng, size, p, false);
    drawCorrugated(wctx, rng, size, p);
    drawDarkCeiling(cctx, rng, size, p);
  }
  drawShelf(sctx, rng, size, p);
  const floor = toTexture(fc, anisotropy);
  const wall = toTexture(wc, anisotropy);
  const ceiling = toTexture(cc, anisotropy);
  const shelf = toTexture(sc, anisotropy);
  return {
    floor,
    wall,
    ceiling,
    shelf,
    dispose() {
      floor.dispose();
      wall.dispose();
      ceiling.dispose();
      shelf.dispose();
    },
  };
}
