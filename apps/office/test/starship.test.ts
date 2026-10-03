import { describe, expect, it } from 'vitest';
import { crewStatus, FURNITURE, motionPath, normalizeAppearance, roomDoor, ROOMS, route, standbyPosition, walkable, workPosition } from '../src/starship/model.ts';
import { floorToScreen, screenToFloor } from '../src/starship/isometric.ts';
import { PROFILES } from '../src/hermes/labels.ts';
import { pathPosition } from '../vendor/ai-town/geometry.ts';

describe('starship routes', () => {
  it('projects logical floor coordinates independently of elevation and camera', () => {
    for (const p of [standbyPosition(0), workPosition('chief'), workPosition('adelia')]) {
      const screen = floorToScreen(p);
      const inverse = screenToFloor(screen);
      expect(inverse.x).toBeCloseTo(p.x);
      expect(inverse.y).toBeCloseTo(p.y);
      expect(floorToScreen(p, 40).y).toBeCloseTo(screen.y - 40);
    }
  });
  it('blocks furniture and room boundaries while preserving real door access', () => {
    for (const r of FURNITURE) expect(walkable(r.x + r.w / 2, r.y + r.h / 2)).toBe(false);
    for (const room of ROOMS) {
      const door = roomDoor(room);
      expect(walkable(door.x + door.w / 2, door.y + door.h / 2)).toBe(true);
      expect(walkable(room.x + 12, room.y + 12)).toBe(false);
    }
    const door = roomDoor(ROOMS[0]);
    const path = route(standbyPosition(0), workPosition('chief'));
    expect(path.some(p => p.x >= door.x && p.x < door.x + door.w && p.y >= door.y && p.y < door.y + door.h)).toBe(true);
  });
  it('connects every Hermes crew post to its station without crossing space', () => {
    for (const [i, profile] of PROFILES.entries()) {
      const destination = workPosition(profile);
      const points = route(standbyPosition(i), destination);
      expect(points.length).toBeGreaterThan(1);
      expect(points.at(-1)).toEqual(destination);
      for (const point of points) expect(walkable(point.x, point.y)).toBe(true);
      for (let j = 1; j < points.length; j++) {
        for (let step = 0; step <= 10; step++) {
          const ratio = step / 10;
          expect(walkable(points[j - 1].x + (points[j].x - points[j - 1].x) * ratio, points[j - 1].y + (points[j].y - points[j - 1].y) * ratio)).toBe(true);
        }
      }
    }
  });
  it('uses AI Town interpolation to arrive exactly at the destination', () => {
    const destination = workPosition('dev');
    const path = motionPath(route(standbyPosition(4), destination), 100);
    for (let i = 1; i < path.length; i++) expect(path[i][4]).toBeGreaterThan(path[i - 1][4]);
    expect(pathPosition(path, path.at(-1)![4] + 1).position).toEqual(destination);
  });
});
describe('real crew status and stored appearance', () => {
  it('does not present missing agents as active, and prioritizes pending approvals', () => {
    expect(crewStatus('chief', [], [])).toBe('offline');
    const agents = [{ profile: 'chief', state: 'thinking', task_id: null, detail: null, updated_at: null }];
    expect(crewStatus('chief', agents, [])).toBe('thinking');
    expect(crewStatus('chief', agents, [{ profile: 'chief', status: 'pending' } as never])).toBe('waiting');
  });
  it('rejects corrupt saved colors and hair styles', () => {
    const result = normalizeAppearance({ uniform: 'url(malicious)', skin: null, hairstyle: 'invalid', headset: true }, 0);
    expect(result.uniform).toBe('#5ed9eb');
    expect(result.hairstyle).toBe('long');
    expect(result.headset).toBe(true);
  });
});
