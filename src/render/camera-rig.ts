/**
 * Coloca la cámara en primera persona a partir del estado del jugador, interpolando entre
 * el paso fijo anterior y el actual. Altura de agachado, balanceo y cambio de campo de visión
 * son solo de render; con "Reducir movimiento" se quitan el balanceo y el cambio de FOV.
 */
import type { PerspectiveCamera } from 'three';
import { CAMERA_FX, PLAYER } from '../data/balance';
import { lerp, TAU } from '../core/math';
import type { Player } from '../game/player';

export interface CameraSettings {
  fov: number;
  reduceMotion: boolean;
}

export class CameraRig {
  private crouchBlend = 0;
  private fovBoost = 0;
  private bobWeight = 0;

  constructor(private readonly camera: PerspectiveCamera) {}

  update(player: Player, alpha: number, frameDt: number, settings: CameraSettings): void {
    const x = lerp(player.prevX, player.x, alpha);
    const z = lerp(player.prevZ, player.z, alpha);
    const dist = lerp(player.prevDistance, player.distance, alpha);

    // Transición suave de la altura de los ojos al agacharse.
    const k = Math.min(1, PLAYER.crouchBlendSpeed * frameDt);
    this.crouchBlend += ((player.crouching ? 1 : 0) - this.crouchBlend) * k;
    let y = lerp(PLAYER.eyeHeightStand, PLAYER.eyeHeightCrouch, this.crouchBlend);

    // El balanceo depende de la distancia recorrida y se desvanece al pararse.
    const speed = Math.hypot(player.vx, player.vz);
    const targetBob = settings.reduceMotion ? 0 : Math.min(1, speed / PLAYER.walkSpeed);
    this.bobWeight += (targetBob - this.bobWeight) * Math.min(1, 6 * frameDt);
    if (this.bobWeight > 0.001) {
      y +=
        Math.sin(dist * TAU * CAMERA_FX.bobFrequencyPerMeter) *
        CAMERA_FX.bobAmplitude *
        this.bobWeight;
    }

    this.camera.position.set(x, y, z);
    this.camera.rotation.set(player.pitch, player.yaw, 0);

    const targetBoost = !settings.reduceMotion && player.running ? CAMERA_FX.runFovBoost : 0;
    this.fovBoost += (targetBoost - this.fovBoost) * Math.min(1, 4 * frameDt);
    const fov = settings.fov + this.fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
