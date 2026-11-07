/**
 * Señales visuales de la criatura, para que todo el juego se pueda jugar sin sonido:
 * indicador "Algo cerca" con flecha y dirección, viñeta direccional y subtítulos de sonido
 * (pasos arrastrados, respiración y latido). Los intervalos usan el tiempo de juego (la pausa no cuenta).
 */
import { THREAT } from '../data/balance';
import { TEXTS } from '../data/texts';
import { closeness, nearestThreat, relativeAngle, SECTOR_ARROWS, sectorOf } from '../game/cues';
import type { World } from '../game/world';
import type { Hud } from '../render/hud';

export class ThreatCues {
  private readonly lastSteps: number[] = [];
  private readonly lastBreath: number[] = [];
  private lastHeart = -Infinity;

  /** Reinicia los temporizadores (al cargar un nivel). */
  reset(): void {
    this.lastSteps.length = 0;
    this.lastBreath.length = 0;
    this.lastHeart = -Infinity;
  }

  update(world: World, hud: Hud, now: number, subtitles: boolean): void {
    const p = world.player;
    const dirs = TEXTS.subtitles.directions;
    const best = nearestThreat(world.enemies);
    const nearest = best >= 0 ? world.enemies[best] : undefined;

    if (nearest === undefined || nearest.threatDistance >= THREAT.nearDistance) {
      hud.setThreat('', false);
    } else {
      const sector = sectorOf(relativeAngle(p.x, p.z, p.yaw, nearest.x, nearest.z));
      const veryNear = nearest.threatDistance < THREAT.veryNearDistance;
      const label = veryNear ? TEXTS.hud.threatVeryNear : TEXTS.hud.threatNear;
      hud.setThreat(`${label} ${SECTOR_ARROWS[sector] ?? ''} ${dirs[sector] ?? ''}`, veryNear);
    }

    if (nearest === undefined) {
      hud.setVignette(0, 0);
    } else {
      hud.setVignette(
        closeness(nearest.threatDistance, THREAT.vignetteDistance),
        relativeAngle(p.x, p.z, p.yaw, nearest.x, nearest.z),
      );
    }

    if (!subtitles) return;
    const t = world.time;
    world.enemies.forEach((e, i) => {
      if (!e.active || !Number.isFinite(e.threatDistance)) return;
      const dir = dirs[sectorOf(relativeAngle(p.x, p.z, p.yaw, e.x, e.z))] ?? '';
      const moving = Math.hypot(e.vx, e.vz) > 0.3;
      if (
        moving &&
        e.threatDistance < THREAT.stepsSubtitleDistance &&
        t - (this.lastSteps[i] ?? -Infinity) >= THREAT.stepsSubtitleInterval
      ) {
        this.lastSteps[i] = t;
        const s = TEXTS.subtitles;
        hud.subtitle(e.threatLos ? s.steps(dir) : s.stepsMuffled(dir), now);
      }
      if (
        e.threatDistance < THREAT.breathSubtitleDistance &&
        t - (this.lastBreath[i] ?? -Infinity) >= THREAT.breathSubtitleInterval
      ) {
        this.lastBreath[i] = t;
        hud.subtitle(TEXTS.subtitles.breath(dir), now);
      }
    });
    if (
      nearest !== undefined &&
      closeness(nearest.threatDistance, THREAT.heartDistance) > 0.6 &&
      t - this.lastHeart >= 6
    ) {
      this.lastHeart = t;
      hud.subtitle(TEXTS.subtitles.heart, now);
    }
  }
}
