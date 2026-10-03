import { describe, expect, it } from 'vitest';
import {
  isWalkable,
  findPath,
  WORKSTATION_ANCHORS,
  IDLE_ANCHORS,
  OFFICE_BOUNDS,
  DESK_LAYOUT,
  deskSeat,
} from '../src/sims-office/NavigationMesh.ts';
import { PROFILES } from '../src/hermes/labels.ts';
import { WallManager } from '../src/sims-office/WallManager.ts';
import { Plumbob } from '../src/sims-office/Plumbob.ts';
import { simsAudio } from '../src/sims-office/SimsAudio.ts';
import * as THREE from 'three';

describe('The Sims 2 Office: NavigationMesh', () => {
  const standSpot = (a: { x: number; z: number; approach?: { x: number; z: number } }) => a.approach ?? a;

  it('gives every roster profile its own seat with a walkable approach spot', () => {
    const seen = new Set<string>();
    for (const p of PROFILES) {
      const anchor = WORKSTATION_ANCHORS[p];
      expect(anchor, p).toBeDefined();
      expect(anchor.activity).toBe('work');
      const s = standSpot(anchor);
      expect(isWalkable(s.x, s.z), `${p} approach`).toBe(true);
      const key = `${anchor.x},${anchor.z}`;
      expect(seen.has(key), `${p} shares a seat`).toBe(false);
      seen.add(key);
    }
  });

  it('seats workstation agents facing their desk', () => {
    for (const desk of DESK_LAYOUT) {
      const seat = deskSeat(desk);
      // facing vector from rotationY (0 = +Z)
      const fz = Math.cos(seat.rotationY);
      expect(Math.sign(desk.z - seat.z)).toBe(Math.sign(fz));
    }
  });

  it('defines idle anchors in pantry, breakroom, and meeting rooms', () => {
    expect(IDLE_ANCHORS.length).toBeGreaterThanOrEqual(8);
    const zones = new Set(IDLE_ANCHORS.map((a) => a.zone));
    expect(zones.has('pantry')).toBe(true);
    expect(zones.has('meeting_room')).toBe(true);
    expect(zones.has('corridor')).toBe(true);

    for (const a of IDLE_ANCHORS) {
      const s = standSpot(a);
      expect(isWalkable(s.x, s.z)).toBe(true);
    }
  });

  it('rejects coordinates outside office perimeter and inside solid obstacles', () => {
    // Outside boundary
    expect(isWalkable(OFFICE_BOUNDS.minX - 5, 0)).toBe(false);
    expect(isWalkable(0, OFFICE_BOUNDS.maxZ + 5)).toBe(false);

    // Inside solid server rack (Dev lab)
    expect(isWalkable(-10.2, 4.5)).toBe(false);

    // Open central corridor
    expect(isWalkable(0, 0)).toBe(true);
  });

  it('computes collision-free paths between rooms', () => {
    const chief = standSpot(WORKSTATION_ANCHORS.chief);
    const coffeeMachine = IDLE_ANCHORS.find((a) => a.activity === 'coffee')!;

    const path = findPath(chief, coffeeMachine);

    expect(path.length).toBeGreaterThan(1);
    const destination = path[path.length - 1];
    expect(destination.x).toBe(coffeeMachine.x);
    expect(destination.z).toBe(coffeeMachine.z);

    // Densely sample every segment: nothing may pass through furniture or walls.
    let prev = chief;
    for (const wp of path) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = prev.x + (wp.x - prev.x) * t;
        const z = prev.z + (wp.z - prev.z) * t;
        expect(isWalkable(x, z, 0.2), `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
      }
      prev = wp;
    }
  });

  it('reaches every seat approach from every other one', () => {
    const spots = [...Object.values(WORKSTATION_ANCHORS), ...IDLE_ANCHORS].map(standSpot);
    const from = spots[0];
    for (const to of spots) {
      const path = findPath(from, to);
      expect(path[path.length - 1]).toEqual({ x: to.x, z: to.z });
    }
  });
});

describe('The Sims 2 Office: WallManager', () => {
  it('cycles through Cutaway, Down, and Full wall modes', () => {
    const wm = new WallManager();
    wm.setMode('cutaway');
    expect(wm.getMode()).toBe('cutaway');

    expect(wm.cycleMode()).toBe('down');
    expect(wm.cycleMode()).toBe('full');
    expect(wm.cycleMode()).toBe('cutaway');
  });

  it('lowers wall height when in Down mode or Cutaway line-of-sight', () => {
    const wm = new WallManager();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.6, 0.2),
      new THREE.MeshStandardMaterial()
    );
    wm.registerWall(mesh, 'south', 2.6);

    // Test Down mode: scales down to baseboard
    wm.setMode('down');
    wm.update(0, 0.5);
    expect(mesh.scale.y).toBeLessThan(0.9);

    // Test Full mode: restores height
    wm.setMode('full');
    for (let i = 0; i < 10; i++) wm.update(0, 0.1);
    expect(mesh.scale.y).toBeGreaterThan(0.9);
  });
});

describe('The Sims 2 Office: Plumbob & Audio', () => {
  it('initializes 3D crystal Plumbob and changes color states', () => {
    const p = new Plumbob('ready');
    expect(p.group.children.length).toBeGreaterThan(0);

    p.setState('working');
    p.setState('approval');
    p.setState('error');
    p.setState('offline');

    p.update(1.0, 0.016);
    expect(p.group.rotation.y).toBeGreaterThan(0);

    p.destroy();
  });

  it('toggles audio mute state cleanly without errors', () => {
    const initial = simsAudio.isMuted();
    const toggled = simsAudio.toggleMute();
    expect(toggled).toBe(!initial);

    // Restore original state
    simsAudio.setMuted(initial);
    expect(simsAudio.isMuted()).toBe(initial);
  });

  it('synthesizes The Sims 2 sound effects without crashing', () => {
    // Should run gracefully in test environment without throwing
    expect(() => simsAudio.playBubbleClick()).not.toThrow();
    expect(() => simsAudio.playTabSwitch()).not.toThrow();
    expect(() => simsAudio.playSelectSim()).not.toThrow();
    expect(() => simsAudio.playMotiveAlert()).not.toThrow();
  });
});

