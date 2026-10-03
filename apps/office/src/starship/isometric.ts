import type { Point } from '../../vendor/ai-town/types.ts';
import { WORLD } from './model.ts';

// Logical floor coordinates remain independent of camera zoom and screen depth.
export const ISO = { x: 0.8, y: 0.4, originX: WORLD.height * 0.8 + 80, originY: 100, width: 1740, height: 1080 };
export function floorToScreen(p: Point, height = 0): Point {
  return { x: ISO.originX + (p.x - p.y) * ISO.x, y: ISO.originY + (p.x + p.y) * ISO.y - height };
}
export function screenToFloor(p: Point): Point {
  const x = (p.x - ISO.originX) / ISO.x, y = (p.y - ISO.originY) / ISO.y;
  return { x: (x + y) / 2, y: (y - x) / 2 };
}
