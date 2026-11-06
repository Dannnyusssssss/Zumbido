/**
 * Estado y movimiento del jugador en el plano (x, z). La altura de la cámara es solo de render.
 * Convención: yaw = 0 mira hacia -z; yaw positivo gira a la izquierda (como la cámara de Three.js).
 */
import { LOOK, PLAYER } from '../data/balance';
import { clamp } from '../core/math';
import { moveCircle } from './collision';
import type { WallQuery } from './grid';

export interface MoveIntent {
  /** -1 atrás, 1 adelante. */
  forward: number;
  /** -1 izquierda, 1 derecha. */
  strafe: number;
  run: boolean;
}

export interface LookSettings {
  sensitivity: number;
  invertY: boolean;
}

export class Player {
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  crouching = false;
  /** Verdadero si en el último paso corría de verdad (con movimiento). */
  running = false;
  /** Distancia total recorrida (para el balanceo de cámara). */
  distance = 0;
  prevDistance = 0;
  private readonly pos = { x: 0, z: 0 };

  constructor(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.prevX = x;
    this.prevZ = z;
  }

  /** Velocidad máxima según la postura y si corre. */
  targetSpeed(intent: MoveIntent): number {
    if (this.crouching) return PLAYER.crouchSpeed;
    return intent.run && intent.forward > 0 ? PLAYER.runSpeed : PLAYER.walkSpeed;
  }

  /** Un paso fijo de movimiento con colisión. */
  step(dt: number, intent: MoveIntent, grid: WallQuery): void {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.prevDistance = this.distance;

    // Dirección deseada en el mundo a partir de la orientación.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dirX = -sin * intent.forward + cos * intent.strafe;
    let dirZ = -cos * intent.forward - sin * intent.strafe;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1) {
      dirX /= len;
      dirZ /= len;
    }
    const speed = this.targetSpeed(intent);
    const k = Math.min(1, PLAYER.acceleration * dt);
    this.vx += (dirX * speed - this.vx) * k;
    this.vz += (dirZ * speed - this.vz) * k;

    this.pos.x = this.x;
    this.pos.z = this.z;
    moveCircle(grid, this.pos, this.vx * dt, this.vz * dt, PLAYER.radius);
    const movedX = this.pos.x - this.x;
    const movedZ = this.pos.z - this.z;
    // La velocidad real tras chocar evita acumular empuje contra la pared.
    this.vx = movedX / dt;
    this.vz = movedZ / dt;
    this.x = this.pos.x;
    this.z = this.pos.z;
    const moved = Math.hypot(movedX, movedZ);
    this.distance += moved;
    this.running =
      !this.crouching && speed === PLAYER.runSpeed && moved > 0.5 * PLAYER.walkSpeed * dt;
  }
}

/**
 * Aplica la mirada (ratón y flechas). Se llama en cada frame de render para que no haya retraso.
 * @param mouseDX,mouseDY píxeles acumulados desde el frame anterior
 * @param turnAxis -1..1 (flechas izquierda/derecha), pitchAxis -1..1 (flechas abajo/arriba)
 */
export function applyLook(
  player: Player,
  mouseDX: number,
  mouseDY: number,
  turnAxis: number,
  pitchAxis: number,
  dt: number,
  settings: LookSettings,
): void {
  const s = settings.sensitivity;
  const ySign = settings.invertY ? -1 : 1;
  player.yaw -= mouseDX * LOOK.mouseRadiansPerPixel * s;
  player.pitch -= mouseDY * LOOK.mouseRadiansPerPixel * s * ySign;
  player.yaw -= turnAxis * LOOK.arrowTurnSpeed * s * dt;
  player.pitch += pitchAxis * LOOK.arrowPitchSpeed * s * dt * ySign;
  player.pitch = clamp(player.pitch, -LOOK.maxPitch, LOOK.maxPitch);
  // Mantiene el ángulo acotado para no perder precisión en partidas largas.
  if (player.yaw > Math.PI) player.yaw -= Math.PI * 2;
  else if (player.yaw < -Math.PI) player.yaw += Math.PI * 2;
}
