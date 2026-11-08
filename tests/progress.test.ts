import { describe, expect, it } from 'vitest';
import { normalizeSeed } from '../src/core/params';
import { dailySeed } from '../src/core/seeds';
import { getLevel } from '../src/data/levels';
import { META } from '../src/data/meta';
import {
  defaultProgress,
  formatTime,
  recordLevel,
  recordRun,
  sanitizeProgress,
} from '../src/game/progress';
import { advanceRun, completeLevel, retryLevel, startRun } from '../src/game/run';
import { World } from '../src/game/world';
import { loadSave, type StorageLike } from '../src/save/storage';

describe('semilla del día', () => {
  it('se deriva de la fecha con ceros a la izquierda y es válida', () => {
    expect(dailySeed(2026, 11, 6)).toBe('D20261106');
    expect(dailySeed(2027, 1, 31)).toBe('D20270131');
    expect(normalizeSeed(dailySeed(2026, 12, 31))).toBe('D20261231');
  });
  it('días distintos dan semillas distintas y el mismo día la misma', () => {
    expect(dailySeed(2026, 11, 6)).toBe(dailySeed(2026, 11, 6));
    expect(dailySeed(2026, 11, 6)).not.toBe(dailySeed(2026, 11, 7));
  });
  it('rechaza fechas imposibles', () => {
    expect(dailySeed(2026, 13, 1)).toBeNull();
    expect(dailySeed(2026, 0, 1)).toBeNull();
    expect(dailySeed(2026, 1, 0)).toBeNull();
    expect(dailySeed(Number.NaN, 1, 1)).toBeNull();
    expect(dailySeed(2026.5, 1, 1)).toBeNull();
  });
});

describe('semilla escrita', () => {
  it('reproduce el mismo mundo y la misma salida', () => {
    const typed = normalizeSeed('  pasillo7 ');
    expect(typed).toBe('PASILLO7');
    const a = new World(typed ?? '', getLevel(2));
    const b = new World('PASILLO7', getLevel(2));
    expect(a.layout).toEqual(b.layout);
    expect([...a.store.get(1, 1).vWalls]).toEqual([...b.store.get(1, 1).vWalls]);
  });
  it('cada nivel da un mundo distinto con la misma semilla', () => {
    const a = new World('PASILLO7', getLevel(1));
    const b = new World('PASILLO7', getLevel(2));
    expect([...a.store.get(1, 1).vWalls]).not.toEqual([...b.store.get(1, 1).vWalls]);
  });
});

describe('partida', () => {
  it('la partida completa recorre los 3 niveles y suma el tiempo', () => {
    const run = startRun('full', 3, 'ABC');
    expect(run.levelId).toBe(1);
    expect(completeLevel(run, 60).nextLevelId).toBe(2);
    expect(advanceRun(run)).toBe(true);
    expect(completeLevel(run, 70).runFinished).toBe(false);
    advanceRun(run);
    const last = completeLevel(run, 80);
    expect(last.nextLevelId).toBeNull();
    expect(last.runFinished).toBe(true);
    expect(last.runTotal).toBe(210);
    expect(advanceRun(run)).toBe(false);
  });
  it('un nivel suelto no cuenta como partida completa', () => {
    const run = startRun('single', 3, 'ABC');
    const r = completeLevel(run, 50);
    expect(r.runFinished).toBe(false);
    expect(r.runTotal).toBeNull();
  });
  it('reintentar sustituye el tiempo del nivel repetido', () => {
    const run = startRun('full', 1, 'ABC');
    completeLevel(run, 60);
    advanceRun(run);
    completeLevel(run, 999);
    retryLevel(run);
    expect(run.times).toEqual([60]);
    advanceRun(run);
    run.levelId = 2;
    const r = completeLevel(run, 70);
    expect(r.levelId).toBe(2);
    expect(run.times).toEqual([60, 70]);
  });
  it('los niveles sueltos se limitan a los existentes', () => {
    expect(startRun('single', 99, 'A').levelId).toBe(3);
    expect(startRun('single', -4, 'A').levelId).toBe(1);
  });
});

describe('progreso', () => {
  it('completar un nivel desbloquea el siguiente y guarda el mejor tiempo', () => {
    const p = defaultProgress();
    expect(p.unlocked).toBe(1);
    expect(recordLevel(p, 1, 100)).toBe(true);
    expect(p.unlocked).toBe(2);
    expect(recordLevel(p, 1, 120)).toBe(false);
    expect(p.bestTimes[0]).toBe(100);
    expect(recordLevel(p, 1, 90)).toBe(true);
    recordLevel(p, 3, 50);
    expect(p.unlocked).toBe(3);
  });
  it('mejor partida completa', () => {
    const p = defaultProgress();
    expect(recordRun(p, 300)).toBe(true);
    expect(recordRun(p, 400)).toBe(false);
    expect(p.bestRun).toBe(300);
    expect(recordRun(p, 0)).toBe(false);
  });
  it('valida datos corruptos campo por campo', () => {
    expect(sanitizeProgress(null)).toEqual(defaultProgress());
    expect(
      sanitizeProgress({ unlocked: 7, bestTimes: [-1, 'x', 1e12], bestRun: Number.NaN }),
    ).toEqual(defaultProgress());
    expect(sanitizeProgress({ unlocked: 2, bestTimes: [42.5], bestRun: 100 })).toEqual({
      unlocked: 2,
      bestTimes: [42.5, null, null],
      bestRun: 100,
      // Sin marca de Deriva en un guardado que no la tiene.
      drift: null,
    });
  });
  it('formatea tiempos', () => {
    expect(formatTime(0)).toBe('00:00,0');
    expect(formatTime(75.36)).toBe('01:15,3');
    expect(formatTime(-3)).toBe('00:00,0');
  });
});

describe('compatibilidad con guardados anteriores', () => {
  const storageWith = (value: unknown): StorageLike => ({
    getItem: () => JSON.stringify(value),
    setItem: () => undefined,
  });
  it('un guardado del Hito 1 conserva los ajustes y añade el progreso por defecto', () => {
    const save = loadSave(
      storageWith({
        version: 1,
        settings: { muted: true, fov: 90, quality: 'low', crosshair: false },
        lastSeed: 'DEMO',
      }),
      false,
    );
    expect(save.settings.muted).toBe(true);
    expect(save.settings.fov).toBe(90);
    expect(save.settings.subtitles).toBe(true);
    expect(save.settings.directionAid).toBe(false);
    expect(save.lastSeed).toBe('DEMO');
    expect(save.progress).toEqual(defaultProgress());
  });
  it('lee el progreso guardado', () => {
    const save = loadSave(
      storageWith({ version: 1, progress: { unlocked: 3, bestTimes: [10, 20, 30], bestRun: 60 } }),
      false,
    );
    expect(save.progress.unlocked).toBe(3);
    expect(save.progress.bestRun).toBe(60);
    expect(META.storageKey).toBe('zumbido:v1');
  });
});
