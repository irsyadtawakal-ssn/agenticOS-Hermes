import { describe, expect, it } from 'vitest';
import { walkingTarget } from '../src/star-office/isoMotion.ts';
import { floorToScreen } from '../src/starship/isometric.ts';
import { consoleFootprint, route, standbyPosition, walkable, workPosition } from '../src/starship/model.ts';
import { PROFILES } from '../src/hermes/labels.ts';

describe('isometric click-to-walk', () => {
  it('rejects walls, desk surfaces and space outside the deck', () => {
    const start = standbyPosition(0), desk = consoleFootprint('chief');
    for (const p of [{ x: -100, y: -100 }, { x: 432, y: 96 }, { x: desk.x + 10, y: desk.y + 10 }])
      expect(walkingTarget(floorToScreen(p), start)).toBeNull();
  });
  it('reaches each work station from an inverse-projected floor click', () => {
    PROFILES.forEach((profile, index) => {
      const start = standbyPosition(index), end = workPosition(profile);
      const target = walkingTarget(floorToScreen(end), start);
      expect(target).not.toBeNull();
      expect(target!.x).toBeCloseTo(end.x);
      expect(target!.y).toBeCloseTo(end.y);
      expect(route(start, target!).every(p => walkable(p.x, p.y))).toBe(true);
    });
  });
});
