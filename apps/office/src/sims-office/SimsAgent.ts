import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Plumbob } from './Plumbob.ts';
import type { PlumbobColorState } from './Plumbob.ts';
import { ThoughtBubble } from './ThoughtBubble.ts';
import type { ThoughtIcon } from './ThoughtBubble.ts';
import {
  WORKSTATION_ANCHORS,
  IDLE_ANCHORS,
  findPath,
} from './NavigationMesh.ts';
import type { AnchorPoint, Vector2D } from './NavigationMesh.ts';
import { simsAudio } from './SimsAudio.ts';
import { CharacterLibrary, CHARACTER_HEIGHT } from './CharacterRig.ts';
import type { CharacterRig, Outfit } from './CharacterRig.ts';
import { AnchorRegistry } from './AnchorRegistry.ts';
import { loadCharacterConfig, configToOutfit, type CustomCharacterConfig } from './CharacterCustomizer.ts';

/** Fallback registry for callers that don't share one (each scene should pass its own). */
const defaultRegistry = new AnchorRegistry();

/**
 * Per-profile look. Base meshes are CC0 Quaternius characters; agents are told
 * apart by model + material recolouring (material name -> hex).
 */
export const CHARACTER_OUTFITS: Record<string, Outfit> = {
  owner: { model: 'business', colors: { Suit: 0x18181b, Tie: 0xf59e0b, Shirt: 0xffffff, Pants: 0x18181b, Skin: 0xf1c7a5, Hair: 0x18181b } },
  chief: { model: 'business', colors: { Suit: 0x1e3a8a, Tie: 0xeab308, Skin: 0xf1c7a5, Hair: 0x2b1d14 } },
  researcher: { model: 'sleeves', colors: { Shirt: 0x065f46, Pants: 0x334155, Hair: 0x78350f, Skin: 0xf5d5bc } },
  secretary: { model: 'suit', colors: { Shirt: 0x9f1239, Pants: 0x1e293b, Hair: 0xd97706, Skin: 0xfde3cf } },
  content: { model: 'casual', colors: { Red_Dark: 0xdb2777, LightBlue: 0x0369a1, Hair: 0x581c87, Skin: 0xe8b993 } },
  dev: { model: 'casual', colors: { Red_Dark: 0x334155, LightBlue: 0x0f172a, Hair: 0x1c1917, Skin: 0xfae0cc } },
  'hermes-default': { model: 'business', colors: { Suit: 0x475569, Tie: 0x0ea5e9, Skin: 0xc68e6a, Hair: 0x111111 } },
  adelia: { model: 'sleeves', colors: { Shirt: 0xf59e0b, Pants: 0x1f2937, Hair: 0x3f1d0b, Skin: 0xd9a37e } },
  clara: { model: 'suit', colors: { Shirt: 0x7c3aed, Pants: 0x111827, Hair: 0xfbbf24, Skin: 0xf8d5c0 } },
  crib: { model: 'casual', colors: { Red_Dark: 0x15803d, LightBlue: 0x78350f, Hair: 0x52525b, Skin: 0xa86b45 } },
  maya: { model: 'sleeves', colors: { Shirt: 0xec4899, Pants: 0x0c4a6e, Hair: 0x111111, Skin: 0xe0ac85 } },
};

export const DEFAULT_OUTFIT: Outfit = { model: 'casual' };

let sharedLibrary: CharacterLibrary | null = null;
function characterLibrary(): CharacterLibrary {
  if (!sharedLibrary) {
    const loader = new GLTFLoader();
    sharedLibrary = new CharacterLibrary(`${import.meta.env.BASE_URL}sims/characters/`, (url) => loader.loadAsync(url));
  }
  return sharedLibrary;
}

export type AgentActionState = 'idle_seat' | 'idle_roam' | 'working' | 'approval' | 'coffee' | 'walking';

const BUSY = new Set(['working', 'thinking', 'executing']);
const WALK_SPEED = 1.5;
const TURN_SPEED = 9;

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Sims-style office character: rigged GLB model animated by THREE.AnimationMixer
 * (idle / walk / sit / wave / interact), Plumbob, thought bubbles and free will.
 */
export class SimsAgent {
  public profile: string;
  public group: THREE.Group;
  public clickMesh: THREE.Mesh;
  public plumbob: Plumbob;

  private rig: CharacterRig | null = null;
  private placeholder: THREE.Mesh;
  private destroyed = false;

  // Navigation
  public currentPos: Vector2D;
  private targetPos: Vector2D | null = null;
  private currentPath: Vector2D[] = [];
  private targetYaw: number;

  // State
  public actionState: AgentActionState = 'idle_seat';
  public liveStatus: string = 'idle';
  public inMeeting: boolean = false;
  private hasApproval = false;
  private activeBubble: ThoughtBubble | null = null;
  private nextFreeWillTime: number = 5 + Math.random() * 8;
  private activityTimer = 0;
  private currentAnchor: AnchorPoint;
  /** true while the agent occupies `currentAnchor` (seated or standing at it). */
  private atAnchor = true;
  private readonly registry: AnchorRegistry;

  constructor(profile: string, scene: THREE.Scene, registry: AnchorRegistry = defaultRegistry) {
    this.profile = profile;
    this.registry = registry;
    this.group = new THREE.Group();
    this.group.name = `agent:${profile}`;

    // Spawn at their own workstation seat
    this.currentAnchor = WORKSTATION_ANCHORS[profile] ?? IDLE_ANCHORS[IDLE_ANCHORS.length - 1];
    this.currentPos = { x: this.currentAnchor.x, z: this.currentAnchor.z };
    this.group.position.set(this.currentPos.x, 0, this.currentPos.z);
    this.group.rotation.y = this.currentAnchor.rotationY;
    this.targetYaw = this.currentAnchor.rotationY;
    this.actionState = this.currentAnchor.activity === 'work' ? 'working' : 'idle_roam';
    this.registry.reserve(this.currentAnchor, profile);

    // Lightweight placeholder until the GLB arrives
    this.placeholder = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, CHARACTER_HEIGHT - 0.44, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 })
    );
    this.placeholder.position.y = CHARACTER_HEIGHT / 2;
    this.group.add(this.placeholder);

    // Invisible Click Mesh
    this.clickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.9, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.clickMesh.position.y = 0.95;
    this.group.add(this.clickMesh);

    // Plumbob
    this.plumbob = new Plumbob('ready');
    if (this.profile === 'owner') {
      this.plumbob.setColorHex(0xf59e0b);
    }
    this.group.add(this.plumbob.group);

    if (typeof window !== 'undefined') {
      window.addEventListener('aos-character-customized', this.onCustomized as EventListener);
    }

    scene.add(this.group);
    void this.loadRig();
  }

  private onCustomized = (e: Event) => {
    const ce = e as CustomEvent<{ profile: string; config: CustomCharacterConfig }>;
    if (ce.detail?.profile === this.profile && ce.detail?.config) {
      void this.applyCustomConfig(ce.detail.config);
    }
  };

  private async loadRig(): Promise<void> {
    try {
      const config = loadCharacterConfig(this.profile);
      const outfit = configToOutfit(config);
      const rig = await characterLibrary().create(outfit);
      if (this.destroyed) {
        rig.dispose();
        return;
      }
      this.rig = rig;
      this.rig.setHeightScale(config.heightScale ?? 1.0);
      this.rig.setGlasses(config.glasses ?? 'none');
      this.group.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      (this.placeholder.material as THREE.Material).dispose();
      this.group.add(rig.object);
      this.applyAnimation(0);
    } catch (err) {
      console.warn(`[sims] failed to load character for ${this.profile}`, err);
    }
  }

  public async applyCustomConfig(config: CustomCharacterConfig): Promise<void> {
    if (this.destroyed) return;
    const outfit = configToOutfit(config);

    if (this.rig && this.rig.model === config.model) {
      if (outfit.colors) {
        this.rig.updateColors(outfit.colors);
      }
      this.rig.setHeightScale(config.heightScale ?? 1.0);
      this.rig.setGlasses(config.glasses ?? 'none');
      return;
    }

    try {
      const newRig = await characterLibrary().create(outfit);
      if (this.destroyed) {
        newRig.dispose();
        return;
      }
      if (this.rig) {
        this.group.remove(this.rig.object);
        this.rig.dispose();
      }
      this.rig = newRig;
      this.rig.setHeightScale(config.heightScale ?? 1.0);
      this.rig.setGlasses(config.glasses ?? 'none');
      this.group.add(newRig.object);
      this.applyAnimation(0);
    } catch (err) {
      console.warn(`[sims] failed to reload character for ${this.profile}`, err);
    }
  }

  /** Pick the animation slot that matches the current action state. */
  private applyAnimation(fade = 0.3): void {
    const rig = this.rig;
    if (!rig) return;
    const seated = this.atAnchor && !!this.currentAnchor.seated && this.actionState !== 'walking';
    rig.setTyping(seated && this.actionState === 'working' && BUSY.has(this.liveStatus));
    if (this.actionState === 'walking') {
      rig.play('walk', 0.2);
    } else if (seated) {
      rig.play('sit', fade);
    } else if (this.hasApproval) {
      rig.play('wave', fade);
    } else if (this.actionState === 'coffee') {
      rig.play(this.currentAnchor.activity === 'cooler' ? 'talk' : 'interact', fade);
    } else {
      rig.play('idle', fade);
    }
  }

  public updateLiveStatus(status: string, hasApproval: boolean): void {
    if (this.profile === 'owner') {
      this.liveStatus = 'idle';
      this.hasApproval = false;
      this.plumbob.setColorHex(0xf59e0b);
      return;
    }

    const changed = status !== this.liveStatus || hasApproval !== this.hasApproval;
    this.liveStatus = status;
    this.hasApproval = hasApproval;

    let pState: PlumbobColorState = 'ready';
    if (status === 'offline') pState = 'offline';
    else if (hasApproval) pState = 'approval';
    else if (BUSY.has(status)) pState = 'working';
    else if (status === 'error' || status === 'blocked') pState = 'error';

    this.plumbob.setState(pState);

    if (BUSY.has(status) && !this.inMeeting) {
      const ws = WORKSTATION_ANCHORS[this.profile];
      const atDesk = this.currentAnchor === ws && this.atAnchor;
      if (ws && !atDesk && !(this.actionState === 'walking' && this.currentAnchor === ws)) {
        this.goToAnchor(ws);
      }
      if (!this.activeBubble && Math.random() < 0.3) {
        let icon: ThoughtIcon = 'code';
        if (this.profile === 'researcher') icon = 'search';
        else if (this.profile === 'content') icon = 'idea';
        else if (this.profile === 'chief') icon = 'chat';
        this.showThought(icon);
      }
    } else if (hasApproval && !this.activeBubble) {
      this.showThought('approval');
      simsAudio.playAlert();
    }

    if (changed && this.actionState !== 'walking') this.applyAnimation();
  }

  /**
   * Walk to an anchor (uses its approach spot, then settles onto it).
   * Returns false when another Sim already claimed that seat/spot.
   */
  public goToAnchor(anchor: AnchorPoint): boolean {
    if (!this.registry.reserve(anchor, this.profile)) return false;
    this.startWalk(anchor.approach ? [anchor.approach, { x: anchor.x, z: anchor.z }] : [{ x: anchor.x, z: anchor.z }], anchor);
    return true;
  }

  /** True if this anchor is free (or already ours). */
  public canUse(anchor: AnchorPoint): boolean {
    return this.registry.isFree(anchor, this.profile);
  }

  /** Walk to a free floor point ("Go Here"). */
  public walkTo(target: Vector2D): void {
    this.registry.release(this.profile);
    this.startWalk([target], {
      x: target.x,
      z: target.z,
      rotationY: this.group.rotation.y,
      activity: 'idle',
      zone: 'floor',
    });
  }

  private startWalk(goals: Vector2D[], anchor: AnchorPoint): void {
    // Leave the current seat through its approach spot first
    let from: Vector2D = { ...this.currentPos };
    const path: Vector2D[] = [];
    if (this.atAnchor && this.currentAnchor.approach) {
      path.push(this.currentAnchor.approach);
      from = this.currentAnchor.approach;
    }
    path.push(...findPath(from, goals[0]));
    path.push(...goals.slice(1));

    this.currentAnchor = anchor;
    this.atAnchor = false;
    this.currentPath = path;
    this.targetPos = this.currentPath.shift() ?? null;
    this.actionState = 'walking';
    this.applyAnimation();
  }

  public showThought(icon: ThoughtIcon): void {
    if (this.activeBubble) {
      this.group.remove(this.activeBubble.sprite);
      this.activeBubble.destroy();
    }
    this.activeBubble = new ThoughtBubble(icon, CHARACTER_HEIGHT + 0.65);
    this.group.add(this.activeBubble.sprite);
  }

  public update(time: number, dt: number): void {
    this.plumbob.update(time, dt);

    if (this.activeBubble) {
      const alive = this.activeBubble.update(dt);
      if (!alive) {
        this.group.remove(this.activeBubble.sprite);
        this.activeBubble.destroy();
        this.activeBubble = null;
      }
    }

    // Path following
    if (this.actionState === 'walking' && this.targetPos) {
      const dx = this.targetPos.x - this.currentPos.x;
      const dz = this.targetPos.z - this.currentPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-3) this.targetYaw = Math.atan2(dx, dz);

      const step = WALK_SPEED * dt;
      if (dist <= step) {
        this.currentPos.x = this.targetPos.x;
        this.currentPos.z = this.targetPos.z;
        if (this.currentPath.length > 0) {
          this.targetPos = this.currentPath.shift()!;
        } else {
          this.targetPos = null;
          this.onArrival();
        }
      } else {
        this.currentPos.x += (dx / dist) * step;
        this.currentPos.z += (dz / dist) * step;
      }
      this.group.position.x = this.currentPos.x;
      this.group.position.z = this.currentPos.z;
    } else {
      // Idle Free Will Logic
      if (!BUSY.has(this.liveStatus) && !this.inMeeting) {
        this.nextFreeWillTime -= dt;
        if (this.nextFreeWillTime <= 0) {
          this.triggerFreeWill();
          this.nextFreeWillTime = 12 + Math.random() * 18;
        }
      }
      // Short interactions (coffee / cooler) settle back to idle
      if (this.actionState === 'coffee') {
        this.activityTimer -= dt;
        if (this.activityTimer <= 0) {
          this.actionState = 'idle_roam';
          this.applyAnimation();
        }
      }
    }

    // Smooth turning
    const dYaw = shortestAngle(this.group.rotation.y, this.targetYaw);
    this.group.rotation.y += dYaw * Math.min(1, TURN_SPEED * dt);

    this.rig?.update(dt);
  }

  private onArrival(): void {
    this.atAnchor = true;
    const a = this.currentAnchor;
    this.targetYaw = a.rotationY;
    if (a.activity === 'coffee' || a.activity === 'cooler' || a.activity === 'whiteboard') {
      this.actionState = 'coffee';
      this.activityTimer = 4 + Math.random() * 3;
      if (a.activity === 'coffee') {
        this.showThought('coffee');
        simsAudio.playCoffee();
      } else if (a.activity === 'whiteboard') {
        this.showThought('idea');
      }
    } else if (a.activity === 'meeting') {
      this.actionState = 'idle_seat';
      this.showThought('idea');
    } else if (a.activity === 'couch') {
      this.actionState = 'idle_seat';
      this.showThought('rest');
    } else if (a.activity === 'work') {
      this.actionState = 'working';
    } else if (a.seated) {
      this.actionState = 'idle_seat';
    } else {
      this.actionState = 'idle_roam';
    }
    this.applyAnimation();
  }

  private triggerFreeWill(): void {
    const choices = [...IDLE_ANCHORS];
    const ws = WORKSTATION_ANCHORS[this.profile];
    if (ws) choices.push(ws);
    // Only spots nobody else has claimed; never the one we're already at.
    const options = choices.filter((c) => c !== this.currentAnchor && this.registry.isFree(c, this.profile));
    if (options.length === 0) return;
    const pick = options[Math.floor(Math.random() * options.length)];
    this.goToAnchor(pick);
  }

  public destroy(): void {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('aos-character-customized', this.onCustomized as EventListener);
    }
    this.registry.release(this.profile);
    this.plumbob.destroy();
    if (this.activeBubble) {
      this.activeBubble.destroy();
    }
    this.rig?.dispose();
    this.group.parent?.remove(this.group);
  }
}
