/**
 * Bucle de paso fijo. La lógica avanza siempre en pasos de `step` segundos;
 * el render usa `alpha` para interpolar entre el estado anterior y el actual.
 */
export class FixedStepLoop {
  readonly step: number;
  private readonly maxFrameTime: number;
  private accumulator = 0;

  /**
   * @param hz frecuencia de la lógica (60 por defecto)
   * @param maxSteps pasos máximos por frame; evita la "espiral de la muerte" tras un parón
   */
  constructor(hz = 60, maxSteps = 5) {
    this.step = 1 / hz;
    this.maxFrameTime = this.step * maxSteps;
  }

  /**
   * Avanza el tiempo real `frameTime` (segundos) y llama a `update` tantas veces como pasos completos quepan.
   * Devuelve el factor de interpolación en [0, 1).
   */
  advance(frameTime: number, update: (dt: number) => void): number {
    const dt =
      Number.isFinite(frameTime) && frameTime > 0 ? Math.min(frameTime, this.maxFrameTime) : 0;
    this.accumulator += dt;
    while (this.accumulator >= this.step) {
      update(this.step);
      this.accumulator -= this.step;
    }
    return this.accumulator / this.step;
  }

  /** Descarta el tiempo acumulado (al reanudar desde la pausa). */
  reset(): void {
    this.accumulator = 0;
  }
}
