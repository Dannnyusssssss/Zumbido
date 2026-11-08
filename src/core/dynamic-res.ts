/**
 * Resolución dinámica: si los FPS se mantienen por debajo del umbral durante varios segundos
 * seguidos, baja un escalón la resolución interna del render. Solo baja (nunca sube sola), así no
 * oscila entre dos escalones; vuelve a la resolución completa al cambiar la calidad o desactivar
 * el ajuste. Lógica pura: recibe la duración de cada frame y dice si hay que cambiar la escala.
 */
import { DYNAMIC_RES } from '../data/quality';

/** Escalón más cercano por debajo (o igual) a la escala dada. */
export function snapScale(scale: number): number {
  const steps = DYNAMIC_RES.steps;
  if (!Number.isFinite(scale)) return steps[0] as number;
  for (const s of steps) if (scale >= s - 1e-6) return s;
  return steps[steps.length - 1] as number;
}

export class DynamicResolution {
  /** Escala actual de la resolución interna (1 = completa). */
  scale: number;
  private windowTime = 0;
  private windowFrames = 0;
  private slowTime = 0;
  private warmup: number = DYNAMIC_RES.warmupSeconds;

  constructor(scale = 1) {
    this.scale = snapScale(scale);
  }

  /** Empieza a medir de nuevo (al entrar en juego): se ignoran los primeros segundos. */
  reset(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.slowTime = 0;
    this.warmup = DYNAMIC_RES.warmupSeconds;
  }

  /** Vuelve a la resolución completa. */
  restore(): void {
    this.scale = DYNAMIC_RES.steps[0] as number;
    this.reset();
  }

  /**
   * Cuenta un frame de `dt` segundos. Devuelve true si la escala acaba de bajar.
   * Los frames muy largos (pestaña oculta, pausa del navegador) no se cuentan.
   */
  update(dt: number): boolean {
    if (!(dt > 0) || dt > DYNAMIC_RES.maxFrameSeconds) return false;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return false;
    }
    this.windowTime += dt;
    this.windowFrames++;
    if (this.windowTime < DYNAMIC_RES.windowSeconds) return false;
    const fps = this.windowFrames / this.windowTime;
    // Cada ventana lenta suma; una sola ventana fluida reinicia la cuenta (debe ser sostenido).
    this.slowTime = fps < DYNAMIC_RES.minFps ? this.slowTime + this.windowTime : 0;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (this.slowTime < DYNAMIC_RES.sustainSeconds) return false;
    this.slowTime = 0;
    const steps = DYNAMIC_RES.steps;
    const i = steps.indexOf(this.scale);
    if (i < 0 || i >= steps.length - 1) return false;
    this.scale = steps[i + 1] as number;
    return true;
  }
}
