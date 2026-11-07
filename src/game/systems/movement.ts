/** Sistema de movimiento: traduce la entrada en intención, aplica la resistencia y mueve al jugador. */
import type { InputState } from '../../core/input';
import { stepLength } from '../noise';
import type { World } from '../world';

export function movementSystem(world: World, input: InputState, dt: number): void {
  const player = world.player;
  if (world.hidden !== null) {
    // Escondido no se mueve ni hace ruido; la resistencia se recupera.
    player.prevX = player.x;
    player.prevZ = player.z;
    player.prevDistance = player.distance;
    player.vx = 0;
    player.vz = 0;
    player.running = false;
    input.consumePressed('crouch');
    world.stamina.update(dt, false);
    return;
  }
  // C alterna agacharse (más cómodo que mantenerla pulsada mientras se usa WASD).
  if (input.consumePressed('crouch')) player.crouching = !player.crouching;
  const intent = world.intent;
  intent.forward = input.axis('back', 'forward');
  intent.strafe = input.axis('left', 'right');
  // Solo se corre si queda resistencia.
  intent.run = input.isHeld('run') && world.stamina.canRun;
  // Correr cancela el agachado, como en la mayoría de juegos en primera persona.
  if (intent.run && intent.forward > 0 && player.crouching) player.crouching = false;
  player.step(dt, intent, world.grid, world.obstaclesNear(player.x, player.z));
  world.stamina.update(dt, player.running);

  // Pasos: cada cierta distancia recorrida se emite un ruido según la postura. Quieto, ninguno.
  const moved = player.distance - player.prevDistance;
  if (moved <= 0) return;
  world.stepMeter += moved;
  const kind = player.crouching ? 'crouch' : player.running ? 'run' : 'walk';
  if (world.stepMeter >= stepLength(kind)) {
    world.stepMeter = 0;
    world.emitNoise(kind);
  }
}
