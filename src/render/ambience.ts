/**
 * Ambiente de la escena según el nivel de la zona en la que está el jugador: color de fondo y de la
 * niebla, distancia de la niebla y luz ambiente. Al cambiar de zona (modo Deriva) pasa del ambiente
 * anterior al nuevo de forma gradual, en unos segundos, sin cortes ni destellos.
 */
import { Color } from 'three';
import { smoothstep } from '../core/math';
import { DRIFT } from '../data/balance';
import type { LevelDef } from '../data/levels';
import type { QualityPreset } from '../data/quality';
import { applyFog, type RenderContext } from './scene';

export class AmbienceBlend {
  private preset: QualityPreset | null = null;
  private target: LevelDef | null = null;
  /** Avance de la transición (1 = terminada). */
  private progress = 1;
  private readonly fromFog = new Color();
  private readonly toFog = new Color();
  private readonly fromAmbient = new Color();
  private readonly toAmbient = new Color();
  private fromIntensity = 0;
  private fromFogScale = 1;
  private curIntensity = 0;
  private curFogScale = 1;

  constructor(private readonly ctx: RenderContext) {}

  get level(): LevelDef | null {
    return this.target;
  }

  /** Calidad actual (distancias de niebla); se aplica de inmediato. */
  setPreset(preset: QualityPreset): void {
    this.preset = preset;
    this.applyNow();
  }

  /** Pone el ambiente del nivel sin transición (al cargar). */
  jump(level: LevelDef): void {
    this.target = level;
    this.toFog.set(level.palette.fog);
    this.toAmbient.set(level.palette.ambient);
    this.curIntensity = level.lighting.ambientIntensity;
    this.curFogScale = level.lighting.fogScale;
    this.ctx.fog.color.copy(this.toFog);
    this.ctx.ambient.color.copy(this.toAmbient);
    this.progress = 1;
    this.applyNow();
  }

  /** Empieza la transición hacia el ambiente de otro nivel (no hace nada si ya es ese). */
  blendTo(level: LevelDef): void {
    if (this.target === null) {
      this.jump(level);
      return;
    }
    if (level.id === this.target.id) return;
    this.target = level;
    // Parte del estado actual, aunque la transición anterior no hubiera terminado.
    this.fromFog.copy(this.ctx.fog.color);
    this.fromAmbient.copy(this.ctx.ambient.color);
    this.fromIntensity = this.curIntensity;
    this.fromFogScale = this.curFogScale;
    this.toFog.set(level.palette.fog);
    this.toAmbient.set(level.palette.ambient);
    this.progress = 0;
  }

  /** Avanza la transición `dt` segundos. */
  update(dt: number): void {
    if (this.progress >= 1 || this.target === null) return;
    this.progress = Math.min(1, this.progress + dt / DRIFT.ambienceBlendSeconds);
    // Avance suave: empieza y acaba despacio.
    const k = smoothstep(0, 1, this.progress);
    const l = this.target.lighting;
    this.ctx.fog.color.lerpColors(this.fromFog, this.toFog, k);
    this.ctx.ambient.color.lerpColors(this.fromAmbient, this.toAmbient, k);
    this.curIntensity = this.fromIntensity + (l.ambientIntensity - this.fromIntensity) * k;
    this.curFogScale = this.fromFogScale + (l.fogScale - this.fromFogScale) * k;
    this.applyNow();
  }

  private applyNow(): void {
    const bg = this.ctx.scene.background;
    if (bg instanceof Color) bg.copy(this.ctx.fog.color);
    this.ctx.ambient.intensity = this.curIntensity;
    if (this.preset !== null) applyFog(this.ctx, this.preset, this.curFogScale);
  }
}
