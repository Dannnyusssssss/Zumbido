import { describe, expect, it } from 'vitest';
import { InputState } from '../src/core/input';

describe('InputState', () => {
  it('mantiene acciones y genera una sola pulsación', () => {
    const input = new InputState();
    expect(input.keyDown('KeyW')).toBe('forward');
    expect(input.isHeld('forward')).toBe(true);
    expect(input.consumePressed('forward')).toBe(true);
    expect(input.consumePressed('forward')).toBe(false);
    input.keyDown('KeyW', true);
    expect(input.consumePressed('forward')).toBe(false);
    input.keyUp('KeyW');
    expect(input.isHeld('forward')).toBe(false);
  });
  it('ignora teclas sin asignar y Ctrl', () => {
    const input = new InputState();
    expect(input.keyDown('ControlLeft')).toBeNull();
    expect(input.keyDown('KeyZ')).toBeNull();
  });
  it('calcula ejes', () => {
    const input = new InputState();
    input.keyDown('KeyD');
    expect(input.axis('left', 'right')).toBe(1);
    input.keyDown('KeyA');
    expect(input.axis('left', 'right')).toBe(0);
  });
  it('limita los saltos anómalos del ratón', () => {
    const input = new InputState();
    input.addMouse(5000, -5000, 100);
    input.addMouse(10, 3, 100);
    input.addMouse(Number.NaN, 1, 100);
    expect(input.takeMouseX()).toBe(110);
    expect(input.takeMouseY()).toBe(-97);
    expect(input.takeMouseX()).toBe(0);
  });
  it('clear suelta todo', () => {
    const input = new InputState();
    input.keyDown('ShiftLeft');
    input.addMouse(3, 3, 100);
    input.clear();
    expect(input.isHeld('run')).toBe(false);
    expect(input.takeMouseX()).toBe(0);
  });
});
