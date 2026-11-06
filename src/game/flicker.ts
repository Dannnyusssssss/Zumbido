/**
 * Parpadeo suave y determinista de los paneles de luz.
 * Devuelve un factor de brillo en [1 - depth, 1]; con "Reducir parpadeo" siempre 1.
 */
import { FLICKER } from '../data/balance';
import { hash3, hashToUnit } from '../core/rng';
import { smoothstep, TAU } from '../core/math';

const SELECT_CHANNEL = 0xf1;
const PARAM_CHANNEL = 0xf2;

/** ¿Este panel (celda global) es de los que parpadean? */
export function isFlickering(seed: number, gx: number, gz: number, ratio: number): boolean {
  const r = Math.min(ratio, FLICKER.maxRatio);
  return hashToUnit(hash3(seed, gx, gz, SELECT_CHANNEL)) < r;
}

/** Parámetros fijos de un panel que parpadea, derivados de su celda. */
export interface FlickerParams {
  freq: number;
  phase: number;
  phase2: number;
  episodeFreq: number;
  episodePhase: number;
}

export function flickerParams(
  seed: number,
  gx: number,
  gz: number,
  out: FlickerParams,
): FlickerParams {
  const h1 = hash3(seed, gx, gz, PARAM_CHANNEL);
  const h2 = hash3(seed, gx, gz, PARAM_CHANNEL + 1);
  const h3 = hash3(seed, gx, gz, PARAM_CHANNEL + 2);
  out.freq = FLICKER.minHz + hashToUnit(h1) * (FLICKER.maxHz - FLICKER.minHz);
  out.phase = hashToUnit(h2) * TAU;
  out.phase2 = hashToUnit(h3) * TAU;
  const period =
    FLICKER.episodeMinSeconds +
    hashToUnit(h1 ^ h3) * (FLICKER.episodeMaxSeconds - FLICKER.episodeMinSeconds);
  out.episodeFreq = 1 / period;
  out.episodePhase = hashToUnit(h2 ^ h3) * TAU;
  return out;
}

/** Brillo del panel en el instante t (segundos). */
export function flickerLevel(p: FlickerParams, t: number, reduceFlicker: boolean): number {
  if (reduceFlicker) return 1;
  // Envolvente lenta: el panel solo parpadea durante episodios cortos.
  const episode = smoothstep(
    0.6,
    0.95,
    0.5 + 0.5 * Math.sin(TAU * p.episodeFreq * t + p.episodePhase),
  );
  if (episode <= 0) return 1;
  // Dos ondas lentas (máximo ~2 Hz) dan un vaivén irregular pero suave.
  const wave =
    0.5 +
    0.25 * Math.sin(TAU * p.freq * t + p.phase) +
    0.25 * Math.sin(TAU * p.freq * FLICKER.secondRatio * t + p.phase2);
  return 1 - FLICKER.depth * episode * wave;
}
