import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../src/data/balance';
import { playLevel, type BotResult } from './helpers/bot';

/**
 * Ruta por nivel con la criatura activa: un bot que juega como una persona prudente
 * (camina hacia el objetivo, se agacha y se aleja si hay algo cerca, huye corriendo si lo
 * persiguen y se esconde si puede) gana cada nivel en las tres dificultades con semillas fijas.
 * Las semillas son fijas, así que el resultado es siempre el mismo.
 */
const SEEDS = ['RUTA1', 'RUTA2', 'RUTA3', 'RUTA4'];
/** Victorias mínimas de 4 por nivel: Fácil y Normal casi siempre; Difícil, al menos una. */
const MIN_WINS: Readonly<Record<Difficulty, number>> = { easy: 3, normal: 3, hard: 1 };

describe.each(['easy', 'normal', 'hard'] as const)('dificultad %s', (difficulty) => {
  it.each([1, 2, 3])(
    'el nivel %i se puede ganar con la criatura activa',
    (level) => {
      const results: BotResult[] = SEEDS.map((s) => playLevel(level, s, difficulty));
      const wins = results.filter((r) => r.won).length;
      expect(wins).toBeGreaterThanOrEqual(MIN_WINS[difficulty]);
    },
    120000,
  );
});
