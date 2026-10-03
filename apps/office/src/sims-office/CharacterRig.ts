import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Rigged GLB characters (Quaternius, CC0) driven by THREE.AnimationMixer.
 *
 * Two rig families are supported and normalised to one slot vocabulary:
 * - "modular"  (CharacterArmature|Idle/Walk/Wave/Interact…, 62 bones, ~1.8 m)
 * - "animated" (HumanArmature|Man_Idle/Man_Walk/Man_Sitting…, 31 bones, ~4.8 units)
 *
 * Missing slots fall back: `sit` without a clip is produced by posing the leg
 * bones on top of the idle clip; `type` is always an arm overlay on top of sit.
 */

export type AnimSlot = 'idle' | 'walk' | 'sit' | 'wave' | 'interact' | 'talk' | 'clap';

export const CHARACTER_MODELS = ['business', 'casual', 'suit', 'sleeves'] as const;
export type CharacterModel = (typeof CHARACTER_MODELS)[number];

/** Ordered regexes per slot; first match against clip names wins. */
const SLOT_PATTERNS: Record<AnimSlot, RegExp[]> = {
  idle: [/\|Idle$/, /Man_Idle$/, /Idle_Loop$/, /Idle/],
  walk: [/\|Walk$/, /Man_Walk$/, /Walk_Loop$/, /Walk/],
  sit: [/Man_Sitting$/, /Sitting_Idle_Loop$/, /Sitting/],
  wave: [/\|Wave$/, /Man_Clapping$/],
  interact: [/\|Interact$/, /Interact/],
  talk: [/Idle_Talking/, /\|Wave$/],
  clap: [/Clapping/],
};

export function mapAnimationSlots(clips: THREE.AnimationClip[]): Partial<Record<AnimSlot, THREE.AnimationClip>> {
  const out: Partial<Record<AnimSlot, THREE.AnimationClip>> = {};
  for (const slot of Object.keys(SLOT_PATTERNS) as AnimSlot[]) {
    for (const re of SLOT_PATTERNS[slot]) {
      const hit = clips.find((c) => re.test(c.name));
      if (hit) {
        out[slot] = hit;
        break;
      }
    }
  }
  return out;
}

export interface Outfit {
  model: CharacterModel;
  /** material name -> hex colour override */
  colors?: Record<string, number>;
}

/** Target standing height in world units (metres). */
export const CHARACTER_HEIGHT = 1.72;
/** Seat surface height of office chairs in RoomBuilder. */
export const SEAT_HEIGHT = 0.47;

interface LegBones {
  hips: THREE.Object3D | null;
  upperL: THREE.Object3D;
  lowerL: THREE.Object3D;
  upperR: THREE.Object3D;
  lowerR: THREE.Object3D;
  footL: THREE.Object3D | null;
  armUL: THREE.Object3D | null;
  armLL: THREE.Object3D | null;
  armUR: THREE.Object3D | null;
  armLR: THREE.Object3D | null;
  head: THREE.Object3D | null;
}

const _q = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();
const _v = new THREE.Vector3();
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Rotate a bone by `angle` around the character-space X axis (right), independent of bone local axes. */
function rotateBoneAroundCharacterX(bone: THREE.Object3D, characterRoot: THREE.Object3D, angle: number): void {
  // world-space axis of the character's local +X
  const rootQ = characterRoot.getWorldQuaternion(new THREE.Quaternion());
  const axisWorld = _v.copy(AXIS_X).applyQuaternion(rootQ).normalize();
  _q.setFromAxisAngle(axisWorld, angle);
  bone.parent!.getWorldQuaternion(_qParent);
  _qParentInv.copy(_qParent).invert();
  // local' = parentInv * R * parent * local
  bone.quaternion.premultiply(_qParent).premultiply(_q).premultiply(_qParentInv);
  bone.updateMatrixWorld(true);
}

function findBone(root: THREE.Object3D, names: RegExp): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && names.test(o.name)) hit = o;
  });
  return hit;
}

/**
 * One instantiated, animated character. `object` is what you add to the scene
 * (feet at y = 0, facing +Z, scaled to CHARACTER_HEIGHT).
 */
export class CharacterRig {
  public readonly object: THREE.Group;
  public readonly model: CharacterModel;
  private readonly inner: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<AnimSlot, THREE.AnimationAction>> = {};
  private readonly bones: LegBones | null;
  private current: AnimSlot | null = null;
  private seatDrop = 0;
  /** true when the sit slot is synthesised from leg posing */
  public readonly proceduralSit: boolean;
  private typing = false;
  private time = 0;

  constructor(model: CharacterModel, gltf: Pick<GLTF, 'scene' | 'animations'>, outfit?: Outfit) {
    this.model = model;
    this.object = new THREE.Group();
    this.object.name = `rig:${model}`;
    this.inner = cloneSkinned(gltf.scene);

    // Per-instance materials so outfits can be recoloured independently.
    this.inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false; // skinned bounds are stale while animating
      const recolor = (m: THREE.Material) => {
        const c = m.clone() as THREE.MeshStandardMaterial;
        const override = outfit?.colors?.[m.name];
        if (override !== undefined && c.color) c.color.setHex(override);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
    });

    // Normalise height & ground contact in bind/idle pose.
    this.inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.inner);
    const height = box.max.y - box.min.y || 1;
    const s = CHARACTER_HEIGHT / height;
    this.inner.scale.multiplyScalar(s);
    this.inner.position.y -= box.min.y * s;
    this.object.add(this.inner);
    this.object.updateMatrixWorld(true);

    this.mixer = new THREE.AnimationMixer(this.inner);
    const slots = mapAnimationSlots(gltf.animations);
    for (const [slot, clip] of Object.entries(slots) as [AnimSlot, THREE.AnimationClip][]) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions[slot] = action;
    }
    this.proceduralSit = !this.actions.sit;

    const upperL = findBone(this.inner, /^UpperLegL$/);
    const lowerL = findBone(this.inner, /^LowerLegL$/);
    const upperR = findBone(this.inner, /^UpperLegR$/);
    const lowerR = findBone(this.inner, /^LowerLegR$/);
    this.bones =
      upperL && lowerL && upperR && lowerR
        ? {
            hips: findBone(this.inner, /^Hips$/),
            upperL,
            lowerL,
            upperR,
            lowerR,
            footL: findBone(this.inner, /^FootL$/),
            armUL: findBone(this.inner, /^UpperArmL$/),
            armLL: findBone(this.inner, /^LowerArmL$/),
            armUR: findBone(this.inner, /^UpperArmR$/),
            armLR: findBone(this.inner, /^LowerArmR$/),
            head: findBone(this.inner, /^Head$/),
          }
        : null;

    this.calibrateSeat();
    this.play('idle', 0);
  }

  /** Measure how far the body must drop / shift so the pelvis rests on a chair seat. */
  private calibrateSeat(): void {
    if (!this.bones) return;
    // Evaluate the sit pose once (clip or procedural) and measure the thigh joint height.
    const sit = this.actions.sit;
    const idle = this.actions.idle;
    this.mixer.stopAllAction();
    if (sit) {
      sit.play();
      this.mixer.setTime(sit.getClip().duration * 0.5);
    } else if (idle) {
      idle.play();
      this.mixer.setTime(0);
      this.object.updateMatrixWorld(true);
      this.applySitLegs();
    }
    this.object.updateMatrixWorld(true);
    const hip = this.bones.upperL.getWorldPosition(new THREE.Vector3());
    const local = this.object.worldToLocal(hip.clone());
    this.seatDrop = Math.max(0, local.y - SEAT_HEIGHT);
    this.mixer.stopAllAction();
    this.current = null;
  }

  private applySitLegs(): void {
    if (!this.bones) return;
    const b = this.bones;
    for (const [upper, lower] of [
      [b.upperL, b.lowerL],
      [b.upperR, b.lowerR],
    ] as const) {
      rotateBoneAroundCharacterX(upper, this.object, -Math.PI / 2);
      rotateBoneAroundCharacterX(lower, this.object, Math.PI / 2);
    }
  }

  private applyTypingArms(t: number): void {
    if (!this.bones) return;
    const b = this.bones;
    const tap = Math.sin(t * 15) * 0.06;
    if (b.armUL && b.armLL) {
      rotateBoneAroundCharacterX(b.armUL, this.object, -0.75);
      rotateBoneAroundCharacterX(b.armLL, this.object, -0.85 + tap);
    }
    if (b.armUR && b.armLR) {
      rotateBoneAroundCharacterX(b.armUR, this.object, -0.75);
      rotateBoneAroundCharacterX(b.armLR, this.object, -0.85 - tap);
    }
    if (b.head) rotateBoneAroundCharacterX(b.head, this.object, 0.12);
  }

  public has(slot: AnimSlot): boolean {
    return slot === 'sit' ? !!(this.actions.sit || (this.bones && this.actions.idle)) : !!this.actions[slot];
  }

  public get state(): AnimSlot | null {
    return this.current;
  }

  /** Cross-fade to a slot. `sit` uses the clip or idle + posed legs. */
  public play(slot: AnimSlot, fade = 0.25): void {
    const resolved: AnimSlot = slot === 'sit' && !this.actions.sit ? 'idle' : slot;
    const next = this.actions[resolved] ?? this.actions.idle;
    if (!next) return;
    if (this.current === slot) return;
    const prevSlot = this.current;
    const prevResolved = prevSlot === 'sit' && !this.actions.sit ? 'idle' : prevSlot;
    const prev = prevResolved ? this.actions[prevResolved] : undefined;
    this.current = slot;
    if (prev === next) return; // e.g. idle <-> procedural sit share the clip
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
  }

  public setTyping(on: boolean): void {
    this.typing = on;
  }

  /** Advance animation. Call once per frame. */
  public update(dt: number): void {
    this.time += dt;
    this.mixer.update(dt);
    const sitting = this.current === 'sit';
    this.object.position.y = sitting ? -this.seatDrop : 0;
    if (sitting && this.bones) {
      this.object.updateMatrixWorld(true);
      if (this.proceduralSit) this.applySitLegs();
      if (this.typing) this.applyTypingArms(this.time);
    }
  }

  /** World-space positions of key joints relative to the rig origin (tests). */
  public probeJoints(): { hip: THREE.Vector3; knee: THREE.Vector3; foot: THREE.Vector3 | null } | null {
    if (!this.bones) return null;
    const root = this.object.parent ?? this.object;
    root.updateMatrixWorld(true);
    const toLocal = (o: THREE.Object3D) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    return { hip: toLocal(this.bones.upperL), knee: toLocal(this.bones.lowerL), foot: this.bones.footL ? toLocal(this.bones.footL) : null };
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    });
  }
}

/** Loads each GLB once and hands out independent rig instances. */
export class CharacterLibrary {
  private readonly cache = new Map<CharacterModel, Promise<GLTF>>();
  private readonly baseUrl: string;
  private readonly load: (url: string) => Promise<GLTF>;
  constructor(baseUrl: string, load: (url: string) => Promise<GLTF>) {
    this.baseUrl = baseUrl;
    this.load = load;
  }

  public get(model: CharacterModel): Promise<GLTF> {
    let p = this.cache.get(model);
    if (!p) {
      p = this.load(`${this.baseUrl}${model}.glb`);
      this.cache.set(model, p);
    }
    return p;
  }

  public async create(outfit: Outfit): Promise<CharacterRig> {
    const gltf = await this.get(outfit.model);
    return new CharacterRig(outfit.model, gltf, outfit);
  }
}
