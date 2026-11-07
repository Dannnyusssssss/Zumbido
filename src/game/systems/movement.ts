/** Sistema de movimiento: traduce la entrada en intención, aplica la resistencia y mueve al jugador. */
import type { InputState } from '../../core/input';
import type { World } from '../world';

export function movementSystem(world: World, input: InputState, dt: number): void {
  const player = world.player;
  // C alterna agacharse (más cómodo que mantenerla pulsada mientras se usa WASD).
  if (input.consumePressed('crouch')) player.crouching = !player.crouching;
  const intent = world.intent;
  intent.forward = input.axis('back', 'forward');
  intent.strafe = input.axis('left', 'right');
  // Solo se corre si queda resistencia.
  intent.run = input.isHeld('run') && world.stamina.canRun;
  // Correr cancela el agachado, como en la mayoría de juegos en primera persona.
  if (intent.run && intent.forward > 0 && player.crouching) player.crouching = false;
  player.step(dt, intent, world.grid, world.obstacles);
  world.stamina.update(dt, player.running);
}
