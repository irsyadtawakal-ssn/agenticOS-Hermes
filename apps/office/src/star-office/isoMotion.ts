import { route, walkable } from '../starship/model.ts';
import { screenToFloor } from '../starship/isometric.ts';
import type { Point } from '../../vendor/ai-town/types.ts';

/** Clicks use inverse projection, then the same collision grid as furniture. */
export function walkingTarget(screen: Point, start: Point): Point | null {
  const target = screenToFloor(screen);
  if (!walkable(target.x, target.y)) return null;
  const points = route(start, target);
  return points.length > 1 ? target : null;
}
