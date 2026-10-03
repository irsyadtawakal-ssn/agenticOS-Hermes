import { describe, expect, it } from 'vitest';
import {
  DECOR_CATALOG,
  DEFAULT_DECOR,
  decorBox,
  loadDecorLayout,
  resetDecorLayout,
  saveDecorLayout,
} from '../src/sims-office/DecorLayout.ts';
import type { DecorItem } from '../src/sims-office/DecorLayout.ts';
import {
  validatePlacement,
  getDecorObstacles,
  setDecorObstacles,
  isWalkable,
} from '../src/sims-office/NavigationMesh.ts';

describe('The Sims 2 Office: DecorLayout & Build/Buy', () => {
  it('defines valid dimensions and icons for all catalog entries', () => {
    const entries = Object.values(DECOR_CATALOG);
    expect(entries.length).toBeGreaterThanOrEqual(15);
    for (const item of entries) {
      expect(item.width).toBeGreaterThan(0);
      expect(item.depth).toBeGreaterThan(0);
      expect(item.height).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it('computes correct footprint box and swaps width/depth on 90 degree rotation', () => {
    const unrotated: DecorItem = {
      id: 'test1',
      kind: 'sofa_lounge', // width 1.8, depth 0.8
      x: 0,
      z: 0,
      rot: 0,
    };
    const box0 = decorBox(unrotated);
    expect(box0.maxX - box0.minX).toBeCloseTo(1.8, 2);
    expect(box0.maxZ - box0.minZ).toBeCloseTo(0.8, 2);

    const rotated: DecorItem = {
      id: 'test2',
      kind: 'sofa_lounge',
      x: 0,
      z: 0,
      rot: Math.PI / 2, // 90 degrees
    };
    const box90 = decorBox(rotated);
    expect(box90.maxX - box90.minX).toBeCloseTo(0.8, 2);
    expect(box90.maxZ - box90.minZ).toBeCloseTo(1.8, 2);
  });

  it('validates placement collisions against office walls and obstacles', () => {
    // 1. Outside office perimeter: invalid
    const outsideBox = { minX: 12, maxX: 13, minZ: 0, maxZ: 1 };
    expect(validatePlacement(outsideBox)).toBe(false);

    // 2. Inside solid desk: invalid
    const insideDesk = { minX: -7.8 - 0.4, maxX: -7.8 + 0.4, minZ: 3.0 - 0.4, maxZ: 3.0 + 0.4 };
    expect(validatePlacement(insideDesk)).toBe(false);

    // 3. Right on top of an agent workstation approach spot: invalid
    const chiefApproach = { minX: -6.6, maxX: -6.4, minZ: -8.6, maxZ: -8.4 };
    expect(validatePlacement(chiefApproach)).toBe(false);

    // 4. Open corridor spot away from obstacles: valid
    const openSpot = { minX: 0.8, maxX: 1.2, minZ: 0.8, maxZ: 1.2 };
    expect(validatePlacement(openSpot)).toBe(true);
  });

  it('updates dynamic obstacles and maintains pathfinding', () => {
    const origBoxes = getDecorObstacles();
    expect(origBoxes.length).toBe(DEFAULT_DECOR.length);

    // Add a temporary dynamic obstacle
    const tempBox = { minX: -0.2, maxX: 0.2, minZ: -0.2, maxZ: 0.2 };
    setDecorObstacles([...origBoxes, tempBox]);
    expect(isWalkable(0, 0)).toBe(false);

    // Restore
    setDecorObstacles(origBoxes);
    expect(isWalkable(0, 0)).toBe(true);
  });

  it('saves and resets layout cleanly', () => {
    const defaults = resetDecorLayout();
    expect(defaults.length).toBe(DEFAULT_DECOR.length);

    const custom: DecorItem[] = [
      { id: 'custom_lamp', kind: 'lamp_floor_round', x: 1, z: 1, rot: 0 },
    ];
    saveDecorLayout(custom);
    const loaded = loadDecorLayout();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('custom_lamp');

    resetDecorLayout();
    const restored = loadDecorLayout();
    expect(restored.length).toBe(DEFAULT_DECOR.length);
  });
});
