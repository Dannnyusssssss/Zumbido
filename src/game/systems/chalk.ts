/** Sistema de tiza: con Q deja una marca en la pared que se mira o en el suelo. */
import type { InputState } from '../../core/input';
import { makeMark } from '../chalk';
import type { World } from '../world';

export function chalkSystem(world: World, input: InputState): void {
  if (!input.consumePressed('mark') || world.hidden !== null) return;
  const p = world.player;
  const mark = makeMark(world.grid, p.x, p.z, p.yaw);
  world.chalk.add(mark);
  world.events.push({ type: 'chalk', onWall: mark.onWall });
  world.emitNoise('chalk');
}
