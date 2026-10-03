import { describe, expect, it, vi } from 'vitest';
import { createGuestRenderer } from '../vendor/star-office/guestRenderer.js';
import type { Visitor } from '../vendor/star-office/guestRenderer.js';
import type Phaser from 'phaser';
import { crewPost, crewStation, laneRoute, LANES } from '../src/starship/starOfficeMap.ts';
import { PROFILES } from '../src/hermes/labels.ts';

describe('adapted Star Office UI guest renderer', () => {
  it('creates actual roster sprites, updates existing guests and removes departed guests', () => {
    const object = (x: number, y: number) => ({ x, y, setOrigin() { return this; }, setScale() { return this; }, setDepth() { return this; }, setText: vi.fn(), destroy: vi.fn() });
    const sprite = vi.fn((x: number, y: number) => object(x, y));
    const text = vi.fn((x: number, y: number) => object(x, y));
    const scene = { add: { sprite, text }, textures: { exists: () => true }, anims: { exists: () => false } };
    let visitors: Visitor[] = [{ agentId: 'chief', name: 'Chief', avatar: 'crew-chief', state: 'idle', area: 'breakroom' }];
    let placement = { x: 640, y: 300 };
    const renderer = createGuestRenderer(scene as unknown as Phaser.Scene, () => visitors, () => placement);
    renderer.render();
    expect(sprite).toHaveBeenCalledWith(640, 300, 'crew-chief', 4);
    expect(Object.keys(renderer.sprites)).toEqual(['chief']);
    placement = { x: 578, y: 185 };
    renderer.render();
    expect(sprite).toHaveBeenCalledTimes(1);
    expect(renderer.sprites.chief.sprite.x).toBe(578);
    expect(renderer.sprites.chief.sprite.y).toBe(185);
    visitors = [];
    renderer.render();
    expect(sprite.mock.results[0].value.destroy).toHaveBeenCalledOnce();
    expect(Object.keys(renderer.sprites)).toEqual([]);
  });
});

describe('Odyssey artwork navigation lanes', () => {
  it('connects all ten posts to work anchors through calibrated room entrances', () => {
    for (const [i, profile] of PROFILES.entries()) {
      const station = crewStation(profile), points = laneRoute(crewPost(i), station);
      expect(points.length).toBeGreaterThan(2);
      expect(points.at(-1)).toEqual(station);
      for (const p of points) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1280); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(720); }
    }
    expect(laneRoute(crewPost(0), crewStation('chief'))).toContainEqual(LANES.bridge);
    expect(laneRoute(crewPost(4), crewStation('dev'))).toContainEqual(LANES.engineLeft);
    expect(laneRoute(crewPost(8), crewStation('crib'))).toContainEqual(LANES.engineRight);
  });
});
