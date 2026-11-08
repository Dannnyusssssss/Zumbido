import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';
import { DIFFICULTIES, DIFFICULTY, DRIFT, WORLD } from '../src/data/balance';
import { getLevel } from '../src/data/levels';
import {
  attention,
  driftBaseTuning,
  driftScore,
  DriftTracker,
  driftTuning,
} from '../src/game/drift';
import { defaultProgress, recordDrift, sanitizeProgress } from '../src/game/progress';
import { advanceRun, startRun } from '../src/game/run';
import { World } from '../src/game/world';
import { sanitizeSave } from '../src/save/storage';

const RAMP = DRIFT.attentionRampSeconds;

describe('atención de la criatura en Deriva', () => {
  it('empieza en 0, crece de forma lineal y se queda en el tope', () => {
    expect(attention(0)).toBe(0);
    expect(attention(RAMP / 2)).toBeCloseTo(0.5);
    expect(attention(RAMP)).toBe(1);
    expect(attention(RAMP * 10)).toBe(1);
  });

  it('valores no válidos cuentan como el inicio', () => {
    expect(attention(-5)).toBe(0);
    expect(attention(Number.NaN)).toBe(0);
    expect(attention(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('nunca disminuye con el tiempo', () => {
    let prev = 0;
    for (let t = 0; t <= RAMP * 1.5; t += 7) {
      const a = attention(t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe.each(DIFFICULTIES)('parámetros de Deriva (%s)', (difficulty) => {
  const base = driftBaseTuning(difficulty);
  const d = DIFFICULTY[difficulty];

  it('la base es la de la dificultad, con la segunda criatura a su hora', () => {
    expect(base.hearing).toBe(d.hearing);
    expect(base.chaseSpeed).toBe(d.chaseSpeed);
    expect(base.graceSeconds + base.secondCreatureDelay).toBe(DRIFT.secondCreatureSeconds);
  });

  it('al empezar no cambia nada', () => {
    const t = driftTuning(base, 0);
    expect(t.hearing).toBe(base.hearing);
    expect(t.sight).toBe(base.sight);
    expect(t.wanderBias).toBe(base.wanderBias);
    expect(t.respawnSeconds).toEqual(base.respawnSeconds);
  });

  it('en el tope oye y ve más, vaga más cerca y vuelve antes', () => {
    const t = driftTuning(base, RAMP * 3);
    expect(t.hearing).toBeCloseTo(base.hearing * DRIFT.maxHearingBoost);
    expect(t.sight).toBeCloseTo(base.sight * DRIFT.maxSightBoost);
    expect(t.wanderBias).toBeLessThanOrEqual(DRIFT.wanderBiasCap);
    expect(t.wanderBias).toBeGreaterThan(base.wanderBias);
    expect(t.respawnSeconds.min).toBeCloseTo(base.respawnSeconds.min * DRIFT.minRespawnFactor);
    expect(t.respawnSeconds.max).toBeCloseTo(base.respawnSeconds.max * DRIFT.minRespawnFactor);
  });

  it('la velocidad de persecución nunca cambia (correr sigue sirviendo para escapar)', () => {
    for (let s = 0; s <= RAMP * 2; s += 60) {
      expect(driftTuning(base, s).chaseSpeed).toBe(base.chaseSpeed);
    }
  });

  it('el oído crece con el tiempo y no pasa del tope', () => {
    let prev = 0;
    for (let s = 0; s <= RAMP * 2; s += 30) {
      const h = driftTuning(base, s).hearing;
      expect(h).toBeGreaterThanOrEqual(prev);
      expect(h).toBeLessThanOrEqual(base.hearing * DRIFT.maxHearingBoost + 1e-9);
      prev = h;
    }
  });
});

describe('puntuación de Deriva', () => {
  it('suma metros y segundos con sus pesos y es entera', () => {
    expect(driftScore(0, 0)).toBe(0);
    expect(driftScore(100, 0)).toBe(100 * DRIFT.pointsPerMeter);
    expect(driftScore(0, 10)).toBe(10 * DRIFT.pointsPerSecond);
    expect(Number.isInteger(driftScore(33.3, 12.7))).toBe(true);
  });

  it('valores negativos o no válidos no restan', () => {
    expect(driftScore(-50, -3)).toBe(0);
    expect(driftScore(Number.NaN, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('DriftTracker: terreno explorado', () => {
  it('la celda de inicio no cuenta; cada celda nueva suma su lado', () => {
    const t = new DriftTracker(5, 5);
    expect(t.cells).toBe(0);
    expect(t.visit(6, 5)).toBe(true);
    expect(t.visit(7, 5)).toBe(true);
    expect(t.cells).toBe(2);
    expect(t.meters).toBe(2 * WORLD.cellSize);
  });

  it('ir y volver por las mismas celdas no suma', () => {
    const t = new DriftTracker(0, 0);
    for (let i = 0; i < 50; i++) {
      t.visit(1, 0);
      t.visit(0, 0);
    }
    expect(t.cells).toBe(1);
  });

  it('el resultado usa la puntuación de distancia y tiempo', () => {
    const t = new DriftTracker(0, 0);
    t.visit(0, 1);
    t.visit(0, 2);
    const r = t.result(30);
    expect(r).toEqual({ meters: 2 * WORLD.cellSize, time: 30, score: driftScore(6, 30) });
  });
});

describe('mejor deriva guardada', () => {
  it('los guardados antiguos sin deriva quedan sin marca', () => {
    const old = { unlocked: 2, bestTimes: [50, null, null], bestRun: null };
    expect(sanitizeProgress(old).drift).toBeNull();
    expect(defaultProgress().drift).toBeNull();
  });

  it('valida la marca y recalcula la puntuación (una editada a mano no cuenta)', () => {
    const p = sanitizeProgress({ drift: { score: 999999, meters: 30, time: 10 } });
    expect(p.drift).toEqual({ meters: 30, time: 10, score: driftScore(30, 10) });
  });

  it('descarta marcas corruptas', () => {
    for (const bad of [
      { meters: -1, time: 10 },
      { meters: 10, time: 0 },
      { meters: 'x', time: 10 },
      { meters: 10, time: Number.NaN },
      { meters: 1e12, time: 10 },
      { meters: 10, time: 1e9 },
      [1, 2],
      'deriva',
    ]) {
      expect(sanitizeProgress({ drift: bad }).drift).toBeNull();
    }
  });

  it('recordDrift guarda solo una puntuación mejor', () => {
    const p = defaultProgress();
    expect(recordDrift(p, { meters: 30, time: 10, score: 50 })).toBe(true);
    expect(recordDrift(p, { meters: 3, time: 5, score: 13 })).toBe(false);
    expect(p.drift?.score).toBe(50);
    expect(recordDrift(p, { meters: 90, time: 20, score: 130 })).toBe(true);
    expect(p.drift).toEqual({ score: 130, meters: 90, time: 20 });
    expect(recordDrift(p, { meters: 0, time: 0, score: 0 })).toBe(false);
  });

  it('pasa por el guardado completo sin perderse', () => {
    const save = sanitizeSave(
      { version: 1, progress: { unlocked: 1, drift: { meters: 12, time: 4 } } },
      false,
    );
    expect(save.progress.drift).toEqual({ meters: 12, time: 4, score: driftScore(12, 4) });
  });
});

describe('partida de Deriva', () => {
  it('empieza en el nivel 1 y no avanza de nivel', () => {
    const run = startRun('drift', 3, 'ABC');
    expect(run.levelId).toBe(1);
    expect(advanceRun(run)).toBe(false);
  });
});

describe('mundo de Deriva', () => {
  it('no tiene salida ni fusibles y nunca se completa', () => {
    const world = new World('DEMO', getLevel(1), { drift: true });
    expect(world.layout.exit).toBeNull();
    expect(world.layout.fuses).toHaveLength(0);
    expect(world.exitActive).toBe(false);
    const input = new InputState();
    input.keyDown('KeyE');
    world.step(1 / 60, input);
    expect(world.completed).toBe(false);
  });

  it('tiene dos criaturas y la segunda llega a su hora', () => {
    const world = new World('DEMO', getLevel(1), { drift: true, difficulty: 'normal' });
    expect(world.enemies).toHaveLength(DRIFT.creatures);
    expect(world.director.timers[1]).toBe(DRIFT.secondCreatureSeconds);
  });

  it('las zonas tienen niveles distintos y la de inicio es la Oficina', () => {
    const world = new World('DEMO', getLevel(1), { drift: true });
    expect(world.levelAt(world.player.x, world.player.z).id).toBe(1);
    const size = WORLD.cellSize * WORLD.chunkCells * DRIFT.regionChunks;
    const ids = new Set<number>();
    for (let rz = -4; rz <= 4; rz++)
      for (let rx = -4; rx <= 4; rx++) ids.add(world.levelAt(rx * size + 1, rz * size + 1).id);
    expect(ids.size).toBe(3);
  });

  it('caminar suma terreno explorado', () => {
    const world = new World('DEMO', getLevel(1), { drift: true, creatures: false });
    const input = new InputState();
    input.keyDown('KeyW');
    for (let i = 0; i < 120; i++) world.step(1 / 60, input);
    expect(world.drift?.tracker.cells ?? 0).toBeGreaterThan(0);
  });

  it('la atención de la criatura sube con el tiempo de partida', () => {
    const world = new World('DEMO', getLevel(1), { drift: true, creatures: false });
    const input = new InputState();
    const base = world.tuning.hearing;
    world.time = RAMP;
    world.step(1 / 60, input);
    expect(world.tuning.hearing).toBeCloseTo(base * DRIFT.maxHearingBoost);
  });

  it('el modo Salida no cambia: sin estado de Deriva y con las criaturas del nivel', () => {
    const level = getLevel(3);
    const world = new World('DEMO', level);
    expect(world.drift).toBeNull();
    expect(world.enemies).toHaveLength(level.creatures);
    expect(world.layout.exit).not.toBeNull();
  });
});
