/**
 * Pool fijo de luces reales (PointLight) asignado a los paneles más cercanos a la cámara.
 * El número de luces nunca cambia durante la partida (evita recompilar shaders).
 * Cada luz se atenúa hasta cero al acercarse al límite de asignación, así el cambio de panel no se nota.
 */
import { Color, PointLight, type Scene } from 'three';
import type { LevelDef } from '../data/levels';
import { flickerLevel, type FlickerParams } from '../game/flicker';
import type { ChunkView } from './chunk-mesh';

/** Atenuación por la cercanía de una criatura (1 = sin cambio). */
export interface LightDimmer {
  dimAt(x: number, z: number): number;
}

const MAX_LIGHTS = 8;

export class LightPool {
  private readonly lights: PointLight[] = [];
  // Selección de los más cercanos sin crear objetos por frame.
  private readonly bestD = new Float64Array(MAX_LIGHTS + 1);
  private readonly bestX = new Float64Array(MAX_LIGHTS + 1);
  private readonly bestZ = new Float64Array(MAX_LIGHTS + 1);
  private readonly bestF = new Float64Array(MAX_LIGHTS + 1);
  private count = 0;
  activeCount = 0;

  constructor(
    private readonly scene: Scene,
    private level: LevelDef,
  ) {}

  /** Ajusta el número de luces (solo al cambiar de calidad). */
  setCount(n: number): void {
    const target = Math.max(0, Math.min(MAX_LIGHTS, n));
    while (this.lights.length > target) {
      const l = this.lights.pop();
      if (l !== undefined) {
        this.scene.remove(l);
        l.dispose();
      }
    }
    const color = new Color(this.level.palette.light);
    while (this.lights.length < target) {
      const l = new PointLight(color, 0, this.level.lighting.pointDistance, 2);
      l.position.y = this.level.ceilingHeight - 0.25;
      this.scene.add(l);
      this.lights.push(l);
    }
    this.count = target;
  }

  private insert(d: number, x: number, z: number, f: number): void {
    const n = this.count + 1;
    if (d >= (this.bestD[n - 1] as number)) return;
    let i = n - 1;
    while (i > 0 && (this.bestD[i - 1] as number) > d) {
      this.bestD[i] = this.bestD[i - 1] as number;
      this.bestX[i] = this.bestX[i - 1] as number;
      this.bestZ[i] = this.bestZ[i - 1] as number;
      this.bestF[i] = this.bestF[i - 1] as number;
      i--;
    }
    this.bestD[i] = d;
    this.bestX[i] = x;
    this.bestZ[i] = z;
    this.bestF[i] = f;
  }

  /** Recoloca las luces en los paneles más cercanos a (x, z). */
  update(
    views: Iterable<ChunkView>,
    x: number,
    z: number,
    time: number,
    reduceFlicker: boolean,
    dimmer: LightDimmer,
  ): void {
    const n = this.count + 1;
    const maxD = this.level.lighting.pointDistance * 1.6;
    const maxD2 = maxD * maxD;
    for (let i = 0; i < n; i++) this.bestD[i] = maxD2;
    for (const v of views) {
      for (let i = 0; i < v.panelX.length; i++) {
        const px = v.panelX[i] as number;
        const pz = v.panelZ[i] as number;
        const dx = px - x;
        const dz = pz - z;
        const d = dx * dx + dz * dz;
        if (d >= maxD2) continue;
        const fi = v.panelFlicker[i] as number;
        const own = fi >= 0 ? flickerLevel(v.flicker[fi] as FlickerParams, time, reduceFlicker) : 1;
        // Cerca de una criatura manda su atenuación (igual que en los paneles).
        const dim = dimmer.dimAt(px, pz);
        this.insert(d, px, pz, dim < 1 ? dim : own);
      }
    }
    // El (count + 1)-ésimo panel marca la distancia de corte: en ella la intensidad llega a 0.
    const cut = Math.sqrt(this.bestD[this.count] as number);
    let active = 0;
    for (let i = 0; i < this.count; i++) {
      const light = this.lights[i] as PointLight;
      const d2 = this.bestD[i] as number;
      if (d2 >= maxD2) {
        light.intensity = 0;
        continue;
      }
      const ratio = Math.sqrt(d2) / cut;
      const fade = Math.max(0, 1 - ratio * ratio);
      light.position.x = this.bestX[i] as number;
      light.position.z = this.bestZ[i] as number;
      light.intensity = this.level.lighting.pointIntensity * fade * (this.bestF[i] as number);
      if (light.intensity > 0.01) active++;
    }
    this.activeCount = active;
  }

  dispose(): void {
    this.setCount(0);
  }
}
