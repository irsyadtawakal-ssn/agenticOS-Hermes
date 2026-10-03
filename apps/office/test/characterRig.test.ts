import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHARACTER_HEIGHT, CHARACTER_MODELS, CharacterRig, mapAnimationSlots, SEAT_HEIGHT } from '../src/sims-office/CharacterRig.ts';
import type { CharacterModel } from '../src/sims-office/CharacterRig.ts';

const gltfs = new Map<CharacterModel, GLTF>();

beforeAll(async () => {
  const loader = new GLTFLoader();
  for (const model of CHARACTER_MODELS) {
    const buf = readFileSync(resolve('public/sims/characters', `${model}.glb`));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    gltfs.set(model, await new Promise<GLTF>((res, rej) => loader.parse(ab, '', res, rej)));
  }
});

function mount(model: CharacterModel) {
  const holder = new THREE.Group();
  const rig = new CharacterRig(model, gltfs.get(model)!);
  holder.add(rig.object);
  return { holder, rig };
}

describe('CharacterRig (rigged CC0 GLB characters)', () => {
  it('maps idle, walk and sit for every model', () => {
    for (const model of CHARACTER_MODELS) {
      const slots = mapAnimationSlots(gltfs.get(model)!.animations);
      expect(slots.idle, model).toBeDefined();
      expect(slots.walk, model).toBeDefined();
      const { rig } = mount(model);
      expect(rig.has('sit'), model).toBe(true);
    }
  });

  it('normalises every model to the same standing height with feet on the floor', () => {
    for (const model of CHARACTER_MODELS) {
      const { holder, rig } = mount(model);
      rig.update(0.016);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder, true);
      expect(box.max.y - box.min.y, model).toBeGreaterThan(CHARACTER_HEIGHT * 0.9);
      expect(box.max.y - box.min.y, model).toBeLessThan(CHARACTER_HEIGHT * 1.1);
      expect(Math.abs(box.min.y), model).toBeLessThan(0.08);
    }
  });

  it('seats the pelvis at chair height with thighs forward and feet on the floor', () => {
    for (const model of CHARACTER_MODELS) {
      const { rig } = mount(model);
      rig.play('sit', 0);
      for (let i = 0; i < 30; i++) rig.update(1 / 30);
      const j = rig.probeJoints()!;
      expect(j, model).not.toBeNull();
      expect(j.hip.y, `${model} hip height`).toBeGreaterThan(SEAT_HEIGHT - 0.12);
      expect(j.hip.y, `${model} hip height`).toBeLessThan(SEAT_HEIGHT + 0.15);
      expect(j.knee.z - j.hip.z, `${model} thigh forward`).toBeGreaterThan(0.2);
      if (j.foot) expect(j.foot.y, `${model} foot on floor`).toBeLessThan(0.25);
    }
  });

  it('returns to a standing pose after sitting', () => {
    for (const model of CHARACTER_MODELS) {
      const { rig } = mount(model);
      rig.play('sit', 0);
      rig.update(0.5);
      rig.play('idle', 0);
      rig.update(0.5);
      const j = rig.probeJoints()!;
      expect(j.hip.y, model).toBeGreaterThan(0.7);
      expect(Math.abs(j.knee.z - j.hip.z), model).toBeLessThan(0.2);
    }
  });

  it('walk cycle actually moves the legs', () => {
    for (const model of CHARACTER_MODELS) {
      const { rig } = mount(model);
      rig.play('walk', 0);
      const zs: number[] = [];
      for (let i = 0; i < 40; i++) {
        rig.update(1 / 40);
        zs.push(rig.probeJoints()!.knee.z);
      }
      expect(Math.max(...zs) - Math.min(...zs), model).toBeGreaterThan(0.08);
    }
  });
});
