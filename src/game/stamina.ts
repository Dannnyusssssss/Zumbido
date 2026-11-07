/**
 * Resistencia al correr: se gasta corriendo y se recupera tras un momento sin correr.
 * Si se agota, no se puede volver a correr hasta superar un umbral (evita "tartamudeo" al límite).
 */
import { STAMINA } from '../data/balance';

export class Stamina {
  value: number = STAMINA.max;
  exhausted = false;
  private sinceRun: number = STAMINA.regenDelay;

  /** ¿Se puede correr ahora? */
  get canRun(): boolean {
    return !this.exhausted && this.value > 0;
  }

  /** Proporción 0..1 para el HUD. */
  get ratio(): number {
    return this.value / STAMINA.max;
  }

  /** Un paso fijo. `running` indica si el jugador corrió de verdad en este paso. */
  update(dt: number, running: boolean): void {
    if (running) {
      this.value -= STAMINA.drainPerSecond * dt;
      this.sinceRun = 0;
      if (this.value <= 0) {
        this.value = 0;
        this.exhausted = true;
      }
      return;
    }
    this.sinceRun += dt;
    if (this.sinceRun >= STAMINA.regenDelay) {
      this.value = Math.min(STAMINA.max, this.value + STAMINA.regenPerSecond * dt);
    }
    if (this.exhausted && this.value >= STAMINA.recoverThreshold) this.exhausted = false;
  }
}
