/**
 * Modelo de la Escucha: una silueta alta, delgada y oscura, sin cara ni rasgos, hecha con formas
 * simples (cuerpo estrecho, cabeza alargada y brazos demasiado largos). Se balancea un poco al andar.
 * Solo lee el estado de las criaturas (interpolando entre pasos fijos); nunca lo modifica.
 */
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Scene,
} from 'three';
import { ENEMY } from '../data/balance';
import { lerp } from '../core/math';
import type { Enemy } from '../game/enemy';

interface Body {
  readonly root: Group;
  readonly leftArm: Group;
  readonly rightArm: Group;
}

export class EnemyView {
  private readonly bodies: Body[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly material: MeshLambertMaterial;

  constructor(
    private readonly scene: Scene,
    count: number,
  ) {
    const H = ENEMY.height;
    // Casi negra, sin brillo: se recorta contra las paredes iluminadas.
    this.material = new MeshLambertMaterial({ color: '#0d0c0b' });
    const torso = new CylinderGeometry(0.16, 0.3, H * 0.62, 10, 1);
    const head = new SphereGeometry(0.17, 12, 10);
    const arm = new CylinderGeometry(0.035, 0.05, H * 0.55, 6, 1);
    // El brazo cuelga desde el hombro: se desplaza para que gire desde arriba.
    arm.translate(0, (-H * 0.55) / 2, 0);
    this.geometries.push(torso, head, arm);
    for (let i = 0; i < count; i++) {
      const root = new Group();
      const t = new Mesh(torso, this.material);
      t.position.y = H * 0.31;
      const h = new Mesh(head, this.material);
      h.scale.set(0.9, 1.7, 0.9);
      h.position.y = H * 0.62 + 0.24;
      const leftArm = new Group();
      const rightArm = new Group();
      leftArm.add(new Mesh(arm, this.material));
      rightArm.add(new Mesh(arm, this.material));
      leftArm.position.set(-0.2, H * 0.6, 0);
      rightArm.position.set(0.2, H * 0.6, 0);
      root.add(t, h, leftArm, rightArm);
      root.visible = false;
      scene.add(root);
      this.bodies.push({ root, leftArm, rightArm });
    }
  }

  /** Coloca cada silueta; `alpha` interpola entre el paso fijo anterior y el actual. */
  update(enemies: readonly Enemy[], alpha: number): void {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i] as Body;
      const e = enemies[i];
      if (e === undefined || !e.active) {
        b.root.visible = false;
        continue;
      }
      b.root.visible = true;
      b.root.position.set(lerp(e.prevX, e.x, alpha), 0, lerp(e.prevZ, e.z, alpha));
      b.root.rotation.y = e.yaw;
      // Balanceo lento ligado a la distancia recorrida (no al tiempo): quieta, no se mueve.
      const phase = e.distance * 2.2;
      const speed = Math.min(1, Math.hypot(e.vx, e.vz) / 2);
      b.leftArm.rotation.x = Math.sin(phase) * 0.25 * speed;
      b.rightArm.rotation.x = -Math.sin(phase) * 0.25 * speed;
      b.root.rotation.z = Math.sin(phase * 0.5) * 0.04 * speed;
    }
  }

  dispose(): void {
    for (const b of this.bodies) this.scene.remove(b.root);
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}
