import { describe, expect, it } from 'vitest';
import { META } from '../src/data/meta';
import {
  defaultSave,
  loadSave,
  writeSave,
  type SaveData,
  type StorageLike,
} from '../src/save/storage';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('Cuota llena', 'QuotaExceededError');
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('Bloqueado');
  }
  setItem(): void {
    throw new Error('Bloqueado');
  }
}

describe('persistencia', () => {
  it('la dificultad se guarda y se valida (Normal si falta o no es válida)', () => {
    const storage = new MemoryStorage();
    const data: SaveData = defaultSave(false);
    expect(data.settings.difficulty).toBe('normal');
    data.settings.difficulty = 'hard';
    writeSave(storage, data);
    expect(loadSave(storage, false).settings.difficulty).toBe('hard');
    for (const bad of ['imposible', 3, null, '']) {
      storage.setItem(META.storageKey, JSON.stringify({ settings: { difficulty: bad } }));
      expect(loadSave(storage, false).settings.difficulty).toBe('normal');
    }
    // Guardado de un hito anterior, sin dificultad: conserva sus ajustes y usa Normal.
    storage.setItem(META.storageKey, JSON.stringify({ version: 1, settings: { fov: 88 } }));
    const old = loadSave(storage, false);
    expect(old.settings.fov).toBe(88);
    expect(old.settings.difficulty).toBe('normal');
  });

  it('sin datos devuelve los valores por defecto', () => {
    const save = loadSave(new MemoryStorage(), false);
    expect(save).toEqual(defaultSave(false));
    expect(save.settings.reduceFlicker).toBe(false);
  });

  it('prefers-reduced-motion activa por defecto las opciones de comodidad', () => {
    const save = loadSave(new MemoryStorage(), true);
    expect(save.settings.reduceFlicker).toBe(true);
    expect(save.settings.reduceMotion).toBe(true);
  });

  it('guarda y lee usando solo la clave zumbido:v1', () => {
    const storage = new MemoryStorage();
    const data: SaveData = defaultSave(false);
    data.settings.fov = 90;
    data.settings.quality = 'high';
    data.settings.invertY = true;
    data.lastSeed = 'ABC';
    expect(writeSave(storage, data)).toBe(true);
    expect([...storage.data.keys()]).toEqual([META.storageKey]);
    expect(META.storageKey.startsWith(META.storagePrefix)).toBe(true);
    expect(loadSave(storage, false)).toEqual(data);
  });

  it('JSON corrupto o con otro tipo vuelve a los valores por defecto', () => {
    for (const raw of ['{roto', 'null', '[]', '42', '"texto"', '{"settings":[]}']) {
      const storage = new MemoryStorage();
      storage.setItem(META.storageKey, raw);
      expect(loadSave(storage, false)).toEqual(defaultSave(false));
    }
  });

  it('valida campo por campo y conserva lo que es válido', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      META.storageKey,
      JSON.stringify({
        version: 1,
        settings: {
          muted: true,
          reduceFlicker: 'sí',
          sensitivity: 1e9,
          fov: Number.NaN,
          quality: 'ultra',
          invertY: true,
          crosshair: false,
          extra: 'ignorado',
        },
        lastSeed: '<script>',
      }),
    );
    const s = loadSave(storage, false);
    expect(s.settings.muted).toBe(true);
    expect(s.settings.invertY).toBe(true);
    expect(s.settings.crosshair).toBe(false);
    expect(s.settings.reduceFlicker).toBe(false);
    expect(s.settings.sensitivity).toBe(1);
    expect(s.settings.fov).toBe(75);
    expect(s.settings.quality).toBe('medium');
    expect(s.lastSeed).toBeNull();
  });

  // Guardados con el formato de cada hito anterior: deben seguir leyéndose sin perder lo válido.
  it('lee los guardados de los hitos 1, 2 y 3 y completa lo que les falta', () => {
    const hito1 = {
      version: 1,
      settings: { muted: true, reduceFlicker: true, sensitivity: 1.5, fov: 80, quality: 'low' },
      lastSeed: 'demo',
    };
    const hito2 = {
      ...hito1,
      settings: { ...hito1.settings, subtitles: false, directionAid: true },
      progress: { unlocked: 3, bestTimes: [61.2, 90, null], bestRun: null },
    };
    const hito3 = { ...hito2, settings: { ...hito2.settings, difficulty: 'hard' } };
    for (const [raw, difficulty] of [
      [hito1, 'normal'],
      [hito2, 'normal'],
      [hito3, 'hard'],
    ] as const) {
      const storage = new MemoryStorage();
      storage.setItem(META.storageKey, JSON.stringify(raw));
      const save = loadSave(storage, false);
      // Lo que ya tenían se conserva.
      expect(save.settings.muted).toBe(true);
      expect(save.settings.sensitivity).toBe(1.5);
      expect(save.settings.quality).toBe('low');
      expect(save.lastSeed).toBe('DEMO');
      expect(save.settings.difficulty).toBe(difficulty);
      // Lo nuevo del Hito 4 toma su valor por defecto.
      expect(save.settings.dynamicResolution).toBe(true);
      expect(save.settings.renderScale).toBe(1);
      expect(save.progress.drift).toBeNull();
    }
    const storage = new MemoryStorage();
    storage.setItem(META.storageKey, JSON.stringify(hito2));
    expect(loadSave(storage, false).progress.bestTimes).toEqual([61.2, 90, null]);
  });

  it('rechaza guardados enormes', () => {
    const storage = new MemoryStorage();
    storage.setItem(META.storageKey, JSON.stringify({ x: 'A'.repeat(100000) }));
    expect(loadSave(storage, false)).toEqual(defaultSave(false));
  });

  it('entradas hostiles: __proto__, tipos cambiados, texto con control, HTML y marcas imposibles', () => {
    const storage = new MemoryStorage();
    // JSON escrito a mano: así `__proto__` llega como clave propia, igual que si el jugador editara el guardado.
    storage.setItem(
      META.storageKey,
      '{"__proto__":{"polluted":true},"version":1,' +
        '"settings":{"__proto__":{"muted":true},"fov":"90","quality":"ultra","muted":"true"},' +
        '"lastSeed":"AB\\u0000C<img onerror=x>😀",' +
        '"progress":{"unlocked":"3","bestTimes":[null,{"x":1},-5],"bestRun":1e308,' +
        '"drift":{"meters":-1,"time":"20","score":999999}}}',
    );
    const save = loadSave(storage, false);
    expect(save).toEqual(defaultSave(false));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(save.settings)).toBe(Object.prototype);
  });

  it('cuota llena o almacenamiento bloqueado no rompen el juego', () => {
    expect(writeSave(new FullStorage(), defaultSave(false))).toBe(false);
    expect(writeSave(new BrokenStorage(), defaultSave(false))).toBe(false);
    expect(writeSave(null, defaultSave(false))).toBe(false);
    expect(loadSave(new BrokenStorage(), false)).toEqual(defaultSave(false));
    expect(loadSave(null, true)).toEqual(defaultSave(true));
  });
});
