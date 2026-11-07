/**
 * Sonido del nivel que depende del estado del mundo: voces de las criaturas (posición, volumen por
 * distancia de camino y oclusión), latido del jugador y oclusión del zumbido de la salida.
 * Solo lee el mundo; nunca lo modifica.
 */
import { ENEMY, THREAT } from '../data/balance';
import { closeness, nearestThreat } from '../game/cues';
import { lineOfSight } from '../game/vision';
import type { World } from '../game/world';
import { CreatureVoice, Heartbeat } from './creature';
import type { AudioEngine } from './engine';
import type { ExitHum } from './exit';

/** Cada cuánto se recalcula la línea de visión con la salida (segundos de juego). */
const EXIT_OCCLUSION_SECONDS = 0.25;

export class SceneAudio {
  private voices: CreatureVoice[] = [];
  private readonly heart: Heartbeat;
  private exitTimer = 0;

  constructor(private readonly engine: AudioEngine) {
    this.heart = new Heartbeat(engine);
  }

  /** Prepara las voces del nivel (una por criatura). */
  setWorld(world: World): void {
    for (const v of this.voices) v.dispose();
    this.voices = world.enemies.map(() => new CreatureVoice(this.engine));
    this.exitTimer = 0;
  }

  update(world: World, exitHum: ExitHum | null, dt: number): void {
    world.enemies.forEach((e, i) => {
      this.voices[i]?.update(
        e.active,
        e.x,
        e.z,
        e.distance,
        ENEMY.stepMeters,
        e.threatDistance,
        !e.threatLos,
        e.state === 'chase',
      );
    });
    const best = nearestThreat(world.enemies);
    const d = best >= 0 ? (world.enemies[best]?.threatDistance ?? Infinity) : Infinity;
    this.heart.update(closeness(d, THREAT.heartDistance), dt);

    this.exitTimer -= dt;
    if (exitHum !== null && this.exitTimer <= 0) {
      this.exitTimer = EXIT_OCCLUSION_SECONDS;
      const p = world.player;
      const exit = world.layout.exit;
      exitHum.setOccluded(!lineOfSight(world.grid, p.x, p.z, exit.x, exit.z));
    }
  }

  dispose(): void {
    for (const v of this.voices) v.dispose();
    this.voices = [];
  }
}
