import { describe, expect, it } from 'vitest';
import { DynamicResolution, snapScale } from '../src/core/dynamic-res';
import { WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import { DYNAMIC_RES, QUALITY_PRESETS } from '../src/data/quality';
import { chunkOf, ChunkStore, keyToCx, keyToCz } from '../src/game/grid';
import { driftLevelMap } from '../src/game/regions';
import { planStreaming } from '../src/game/streaming';
import { defaultSettings, sanitizeSettings } from '../src/save/storage';

const STEPS = DYNAMIC_RES.steps;

/** Simula `seconds` de juego a `fps` constantes; devuelve cuántas veces bajó la escala. */
function run(d: DynamicResolution, fps: number, seconds: number): number {
  let drops = 0;
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) if (d.update(dt)) drops++;
  return drops;
}

describe('resolución dinámica', () => {
  it('a 60 FPS nunca baja', () => {
    const d = new DynamicResolution();
    expect(run(d, 60, 120)).toBe(0);
    expect(d.scale).toBe(1);
  });

  it('a 40 FPS sostenidos baja un escalón tras el calentamiento y los segundos lentos', () => {
    const d = new DynamicResolution();
    // Antes de calentamiento + tiempo sostenido no puede bajar.
    expect(run(d, 40, DYNAMIC_RES.warmupSeconds + DYNAMIC_RES.sustainSeconds - 0.5)).toBe(0);
    expect(run(d, 40, 1.5)).toBe(1);
    expect(d.scale).toBe(STEPS[1]);
  });

  it('nunca baja del último escalón ni sube sola', () => {
    const d = new DynamicResolution();
    run(d, 30, 300);
    expect(d.scale).toBe(STEPS[STEPS.length - 1]);
    run(d, 144, 300);
    expect(d.scale).toBe(STEPS[STEPS.length - 1]);
  });

  it('una caída breve no cuenta (debe ser sostenida)', () => {
    const d = new DynamicResolution();
    run(d, 60, DYNAMIC_RES.warmupSeconds);
    for (let i = 0; i < 20; i++) {
      run(d, 40, DYNAMIC_RES.sustainSeconds - 2);
      run(d, 60, 2);
    }
    expect(d.scale).toBe(1);
  });

  it('ignora los frames muy largos (pestaña oculta) y vuelve a calentar al reiniciar', () => {
    const d = new DynamicResolution();
    for (let i = 0; i < 100; i++) expect(d.update(2)).toBe(false);
    run(d, 40, DYNAMIC_RES.warmupSeconds + DYNAMIC_RES.sustainSeconds - 1);
    d.reset();
    expect(run(d, 40, DYNAMIC_RES.warmupSeconds + 0.5)).toBe(0);
  });

  it('restore vuelve a la resolución completa', () => {
    const d = new DynamicResolution(STEPS[2]);
    expect(d.scale).toBe(STEPS[2]);
    d.restore();
    expect(d.scale).toBe(1);
  });

  it('snapScale ajusta a un escalón válido', () => {
    expect(snapScale(1)).toBe(1);
    expect(snapScale(0.9)).toBe(STEPS[1]);
    expect(snapScale(0.1)).toBe(STEPS[STEPS.length - 1]);
    expect(snapScale(Number.NaN)).toBe(1);
  });

  it('el ajuste se guarda validado (guardados antiguos: activada y a escala completa)', () => {
    expect(sanitizeSettings({}, false).dynamicResolution).toBe(true);
    expect(sanitizeSettings({}, false).renderScale).toBe(1);
    expect(sanitizeSettings({ renderScale: STEPS[1] }, false).renderScale).toBe(STEPS[1]);
    expect(sanitizeSettings({ renderScale: 0.01 }, false).renderScale).toBe(1);
    expect(sanitizeSettings({ renderScale: 'x' }, false).renderScale).toBe(1);
    expect(sanitizeSettings({ dynamicResolution: false }, false).dynamicResolution).toBe(false);
    expect(defaultSettings(false).renderScale).toBe(1);
  });
});

describe('recorrido largo: memoria acotada', () => {
  it('15 minutos corriendo por la Deriva no hacen crecer la caché ni los chunks cargados', () => {
    const seed = 0x5eed;
    const store = new ChunkStore(seed, getLevel(1), WORLD.chunkCacheSize, driftLevelMap(seed));
    const radius = QUALITY_PRESETS.medium.chunkRadius;
    const loaded = new Set<number>();
    // Máximo con histéresis: lo cargado puede llegar hasta radius + 1 alrededor del jugador.
    const maxLoaded = (2 * (radius + 1) + 1) ** 2;
    let x = 24;
    let z = 24;
    let heading = 0;
    for (let t = 0; t < 900; t += 0.5) {
      // Corre a 4,5 m/s cambiando de rumbo poco a poco (no respeta paredes: solo mide el streaming).
      heading += Math.sin(t * 0.01) * 0.02;
      x += Math.cos(heading) * 4.5 * 0.5;
      z += Math.sin(heading) * 4.5 * 0.5;
      const plan = planStreaming(loaded, chunkOf(x), chunkOf(z), radius);
      for (const key of plan.toUnload) loaded.delete(key);
      for (const key of plan.toLoad) {
        store.get(keyToCx(key), keyToCz(key));
        loaded.add(key);
      }
      expect(loaded.size).toBeLessThanOrEqual(maxLoaded);
      expect(store.size).toBeLessThanOrEqual(WORLD.chunkCacheSize);
    }
    // Recorrió terreno de verdad (no se quedó en el sitio).
    expect(store.generatedCount).toBeGreaterThan(WORLD.chunkCacheSize);
  });
});
