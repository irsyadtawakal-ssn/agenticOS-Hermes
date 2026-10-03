import * as THREE from 'three';
import {
  DECOR_CATALOG,
  decorBox,
  loadDecorLayout,
  resetDecorLayout,
  saveDecorLayout,
} from './DecorLayout.ts';
import type { DecorCatalogEntry, DecorItem, DecorKind, ObstacleBox } from './DecorLayout.ts';
import {
  setDecorObstacles,
  validatePlacement,
} from './NavigationMesh.ts';
import { createKenney } from './KenneyModels.ts';
import {
  createCoffeeTable,
  createDeskLamp,
  createFloorLamp,
  createOfficeChair,
  createPlant,
  createPrinter,
  createRoundTable,
  createSofa,
  createStool,
  createTrashBin,
  createVendingMachine,
  createWaterCooler,
} from './Props.ts';
import type { LampHandle } from './Props.ts';
import type { Environment } from './Environment.ts';
import { simsAudio } from './SimsAudio.ts';

export class DecorManager {
  private scene: THREE.Scene;
  private env: Environment | null;
  private items: DecorItem[] = [];
  private meshMap = new Map<string, THREE.Group>();
  private lampMap = new Map<string, LampHandle>();

  // Build/Buy mode state
  private buildMode = false;
  private selectedId: string | null = null;
  private placingKind: DecorKind | null = null;
  private cursorCoords = new THREE.Vector3(0, 0, 0);
  private currentRot = 0;

  // Visual ghost indicator for placement
  private ghostGroup: THREE.Group;
  private ghostBoxMesh: THREE.Mesh;
  private ghostMatValid: THREE.MeshBasicMaterial;
  private ghostMatInvalid: THREE.MeshBasicMaterial;

  // Ground plane for raycasting
  private groundPlane: THREE.Mesh;

  private onLayoutChangeCb?: () => void;

  constructor(scene: THREE.Scene, env: Environment | null = null) {
    this.scene = scene;
    this.env = env;

    // Invisible infinite ground plane for raycasting
    this.groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundPlane);

    // Ghost placement preview
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.ghostMatValid = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    this.ghostMatInvalid = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.ghostBoxMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ghostMatValid);
    this.ghostBoxMesh.rotation.x = -Math.PI / 2;
    this.ghostBoxMesh.position.y = 0.02;
    this.ghostGroup.add(this.ghostBoxMesh);
    this.scene.add(this.ghostGroup);

    // Load initial layout
    this.items = loadDecorLayout();
    this.syncObstacles();
  }

  public setOnLayoutChange(cb: () => void): void {
    this.onLayoutChangeCb = cb;
  }

  public getItems(): DecorItem[] {
    return this.items;
  }

  public getSelectedId(): string | null {
    return this.selectedId;
  }

  public isBuildMode(): boolean {
    return this.buildMode;
  }

  public setBuildMode(enabled: boolean): void {
    this.buildMode = enabled;
    if (!enabled) {
      this.selectedId = null;
      this.placingKind = null;
      this.ghostGroup.visible = false;
    }
    this.onLayoutChangeCb?.();
  }

  /** Spawn 3D meshes for all decor items */
  public spawnAll(): void {
    for (const item of this.items) {
      this.spawnItemMesh(item);
    }
  }

  private syncObstacles(): void {
    const boxes = this.items.map(decorBox);
    setDecorObstacles(boxes);
  }

  private spawnItemMesh(item: DecorItem): void {
    const group = new THREE.Group();
    group.name = `decor_${item.id}`;
    group.userData = { decorId: item.id };

    let obj: THREE.Object3D;

    switch (item.kind) {
      case 'plant_monstera':
        obj = createKenney('pottedPlant', { height: 1.2 }, () => createPlant('monstera', 1));
        break;
      case 'plant_snake':
        obj = createKenney('plantSmall1', { height: 0.9 }, () => createPlant('snake', 2));
        break;
      case 'plant_palm':
        obj = createKenney('pottedPlant', { height: 1.4 }, () => createPlant('palm', 3));
        break;
      case 'plant_ficus':
        obj = createKenney('pottedPlant', { height: 1.3 }, () => createPlant('ficus', 4));
        break;
      case 'plant_potted':
        obj = createKenney('pottedPlant', { height: 1.1 }, () => createPlant('ficus', 5));
        break;
      case 'plant_small':
        obj = createKenney('plantSmall2', { height: 0.35 });
        break;

      case 'lamp_floor_round': {
        const handle = createFloorLamp();
        obj = createKenney('lampRoundFloor', { height: 1.7 }, () => handle.group);
        this.lampMap.set(item.id, handle);
        if (this.env) {
          this.env.registerNightEmissive(handle.bulb, 1.6, 0.15);
          if (handle.glow) {
            this.env.registerNightEmissive(handle.glow.material as THREE.MeshBasicMaterial, 0.35, 0, 'opacity');
          }
        }
        break;
      }
      case 'lamp_floor_square': {
        const handle = createFloorLamp();
        obj = createKenney('lampSquareFloor', { height: 1.7 }, () => handle.group);
        this.lampMap.set(item.id, handle);
        if (this.env) {
          this.env.registerNightEmissive(handle.bulb, 1.6, 0.15);
          if (handle.glow) {
            this.env.registerNightEmissive(handle.glow.material as THREE.MeshBasicMaterial, 0.35, 0, 'opacity');
          }
        }
        break;
      }
      case 'lamp_desk': {
        const handle = createDeskLamp();
        obj = handle.group;
        this.lampMap.set(item.id, handle);
        if (this.env) this.env.registerNightEmissive(handle.bulb, 1.2, 0.05);
        break;
      }

      case 'chair_desk':
        obj = createKenney('chairDesk', { height: 0.95 }, () => createOfficeChair(0x1e293b));
        break;
      case 'chair_visitor':
        obj = createKenney('chairDesk', { height: 0.9 }, () => createOfficeChair(0x7c2d12));
        break;
      case 'sofa_lounge':
        obj = createKenney('loungeSofa', { width: 1.8 }, () => createSofa(1.8, 0x475569));
        break;
      case 'sofa_modern':
        obj = createKenney('loungeDesignSofa', { width: 2.0 }, () => createSofa(2.0, 0x0f766e));
        break;
      case 'stool_bar':
        obj = createKenney('stoolBar', { height: 0.55 }, () => createStool());
        break;

      case 'table_bistro':
        obj = createKenney('tableRound', { height: 0.75, width: 1.0 }, () => createRoundTable(0.5));
        break;
      case 'table_coffee_glass':
        obj = createKenney('tableCoffeeGlass', { width: 1.1, depth: 0.55 }, () => createCoffeeTable(1.0, 0.5, 0x3f3f46));
        break;
      case 'table_coffee_wood':
        obj = createKenney('tableCoffee', { width: 1.2, depth: 0.6 }, () => createCoffeeTable(1.2, 0.6));
        break;

      case 'cooler':
        obj = createWaterCooler();
        break;
      case 'vending':
        obj = createVendingMachine();
        break;
      case 'trashbin':
        obj = createKenney('trashcan', { height: 0.45 }, () => createTrashBin());
        break;
      case 'coatrack':
        obj = createKenney('coatRackStanding', { height: 1.75 });
        break;
      case 'printer':
        obj = createPrinter();
        break;

      default:
        obj = createPlant('ficus');
    }

    group.add(obj);
    group.position.set(item.x, 0, item.z);
    group.rotation.y = item.rot;

    this.scene.add(group);
    this.meshMap.set(item.id, group);
  }

  private removeItemMesh(id: string): void {
    const mesh = this.meshMap.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
        }
      });
      this.meshMap.delete(id);
    }

    const lamp = this.lampMap.get(id);
    if (lamp && this.env) {
      this.env.unregisterNightEmissive(lamp.bulb);
      if (lamp.glow) {
        this.env.unregisterNightEmissive(lamp.glow.material as THREE.Material);
      }
      this.lampMap.delete(id);
    }
  }

  // -------------------------------------------------------------------------
  // Build / Buy controls
  // -------------------------------------------------------------------------

  public startPlacing(kind: DecorKind): void {
    this.setBuildMode(true);
    this.selectedId = null;
    this.placingKind = kind;
    this.currentRot = 0;
    this.updateGhost();
    simsAudio.playClick();
  }

  public selectItem(id: string | null): void {
    this.selectedId = id;
    this.placingKind = null;
    if (id) {
      const item = this.items.find((i) => i.id === id);
      if (item) {
        this.currentRot = item.rot;
      }
    }
    this.updateGhost();
    this.onLayoutChangeCb?.();
  }

  public rotateCurrent(): void {
    this.currentRot = (this.currentRot + Math.PI / 2) % (Math.PI * 2);
    simsAudio.playRotate();

    if (this.selectedId) {
      const item = this.items.find((i) => i.id === this.selectedId);
      if (item) {
        item.rot = this.currentRot;
        const mesh = this.meshMap.get(this.selectedId);
        if (mesh) mesh.rotation.y = this.currentRot;
        this.syncObstacles();
        saveDecorLayout(this.items);
      }
    }
    this.updateGhost();
    this.onLayoutChangeCb?.();
  }

  public deleteCurrent(): void {
    if (!this.selectedId) return;
    const idx = this.items.findIndex((i) => i.id === this.selectedId);
    if (idx !== -1) {
      const id = this.selectedId;
      this.removeItemMesh(id);
      this.items.splice(idx, 1);
      this.selectedId = null;
      this.ghostGroup.visible = false;
      this.syncObstacles();
      saveDecorLayout(this.items);
      simsAudio.playClick();
      this.onLayoutChangeCb?.();
    }
  }

  public resetToDefault(): void {
    for (const item of this.items) {
      this.removeItemMesh(item.id);
    }
    this.items = resetDecorLayout();
    this.selectedId = null;
    this.placingKind = null;
    this.ghostGroup.visible = false;
    this.spawnAll();
    this.syncObstacles();
    simsAudio.playRotate();
    this.onLayoutChangeCb?.();
  }

  public handlePointerMove(raycaster: THREE.Raycaster): void {
    if (!this.buildMode) return;

    const hits = raycaster.intersectObject(this.groundPlane, false);
    if (hits.length > 0) {
      const pt = hits[0].point;
      // Grid snap to 0.25 meters
      const snap = 0.25;
      this.cursorCoords.set(
        Math.round(pt.x / snap) * snap,
        0,
        Math.round(pt.z / snap) * snap
      );

      // If moving selected item
      if (this.selectedId) {
        const item = this.items.find((i) => i.id === this.selectedId);
        const mesh = this.meshMap.get(this.selectedId);
        if (item && mesh) {
          item.x = this.cursorCoords.x;
          item.z = this.cursorCoords.z;
          mesh.position.set(item.x, 0, item.z);
        }
      }

      this.updateGhost();
    }
  }

  public handlePointerDown(raycaster: THREE.Raycaster): boolean {
    if (!this.buildMode) return false;

    // 1. If currently placing a new item from catalog
    if (this.placingKind) {
      const kind = this.placingKind;
      const testItem: DecorItem = {
        id: 'test',
        kind,
        x: this.cursorCoords.x,
        z: this.cursorCoords.z,
        rot: this.currentRot,
      };
      const box = decorBox(testItem);

      if (validatePlacement(box)) {
        const newId = `decor_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newItem: DecorItem = {
          id: newId,
          kind,
          x: this.cursorCoords.x,
          z: this.cursorCoords.z,
          rot: this.currentRot,
        };
        this.items.push(newItem);
        this.spawnItemMesh(newItem);
        this.syncObstacles();
        saveDecorLayout(this.items);

        simsAudio.playClick();
        this.placingKind = null;
        this.selectedId = newId;
        this.updateGhost();
        this.onLayoutChangeCb?.();
        return true;
      } else {
        // Placement invalid, chime warning
        simsAudio.playAlert();
        return true;
      }
    }

    // 2. If moving an already selected item, place it down
    if (this.selectedId) {
      const item = this.items.find((i) => i.id === this.selectedId);
      if (item) {
        const box = decorBox(item);
        if (validatePlacement(box, box)) {
          this.syncObstacles();
          saveDecorLayout(this.items);
          simsAudio.playClick();
          this.selectedId = null;
          this.ghostGroup.visible = false;
          this.onLayoutChangeCb?.();
          return true;
        } else {
          simsAudio.playAlert();
          return true;
        }
      }
    }

    // 3. Raycast decor meshes to select one
    const meshRoots = Array.from(this.meshMap.values());
    const hits = raycaster.intersectObjects(meshRoots, true);
    if (hits.length > 0) {
      let cur: THREE.Object3D | null = hits[0].object;
      while (cur) {
        if (cur.userData && cur.userData.decorId) {
          const hitId = cur.userData.decorId as string;
          this.selectItem(hitId);
          simsAudio.playClick();
          return true;
        }
        cur = cur.parent;
      }
    }

    return false;
  }

  private updateGhost(): void {
    let entry: DecorCatalogEntry | null = null;
    let x = this.cursorCoords.x;
    let z = this.cursorCoords.z;
    let rot = this.currentRot;
    let excludeBox: ObstacleBox | undefined;

    if (this.placingKind) {
      entry = DECOR_CATALOG[this.placingKind];
    } else if (this.selectedId) {
      const item = this.items.find((i) => i.id === this.selectedId);
      if (item) {
        entry = DECOR_CATALOG[item.kind];
        x = item.x;
        z = item.z;
        rot = item.rot;
        excludeBox = decorBox(item);
      }
    }

    if (!entry) {
      this.ghostGroup.visible = false;
      return;
    }

    this.ghostGroup.visible = true;
    this.ghostGroup.position.set(x, 0, z);
    this.ghostGroup.rotation.y = rot;

    // Adjust geometry size
    const w = entry.width;
    const d = entry.depth;

    this.ghostBoxMesh.geometry.dispose();
    this.ghostBoxMesh.geometry = new THREE.PlaneGeometry(w, d);

    // Validate placement
    const candidate = decorBox({ id: 'ghost', kind: entry.kind, x, z, rot });
    const isValid = validatePlacement(candidate, excludeBox);
    this.ghostBoxMesh.material = isValid ? this.ghostMatValid : this.ghostMatInvalid;
  }

  public destroy(): void {
    for (const item of this.items) {
      this.removeItemMesh(item.id);
    }
    this.meshMap.clear();
    this.lampMap.clear();
    this.scene.remove(this.groundPlane);
    this.scene.remove(this.ghostGroup);
  }
}
