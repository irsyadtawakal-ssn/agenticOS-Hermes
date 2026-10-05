import * as THREE from 'three';
import type { WallManager } from './WallManager.ts';
import type { Environment } from './Environment.ts';
import {
  createWoodParquetTexture,
  createCheckeredTilesTexture,
  createCarpetTexture,
  createMeetingFloorTexture,
  createWallTexture,
  createBrickTexture,
  createMarbleTexture,
} from './SimsTextures.ts';
import {
  CHIEF_DESK,
  CHIEF_SEAT,
  DESK_LAYOUT,
  DESK_SIZE,
  LOBBY,
  MEETING_CHAIRS,
  deskOwner,
  deskSeat,
} from './NavigationMesh.ts';
import {
  blobShadow,
  createBookshelf,
  createBookStack,
  createCamera,
  createCan,
  createDeskLamp,
  createFridge,
  createKitchenCounter,
  createLaptop,
  createLogoSign,
  createMug,
  createOfficeChair,
  createPainting,
  createPaperTray,
  createPhone,
  createPlant,
  createRug,
  createSofa,
  createSukaCabinet,
  createSukaProjectorSystem,
  createSukaRoundTable,
  createSukaWhiteboard,
  createTV,
  createWallClock,
  createWindow,
  mat,
  rbox,
} from './Props.ts';
import type { LampHandle } from './Props.ts';

import { createKenney } from './KenneyModels.ts';

export interface InteractiveObject {
  mesh: THREE.Object3D;
  type: 'agent' | 'desk' | 'coffee' | 'meeting' | 'server' | 'cooler' | 'couch' | 'floor';
  id?: string;
  actionTitle: string;
}

type Facing = 'north' | 'south' | 'east' | 'west' | 'interior';

const WALL_H = 2.6;
const WALL_T = 0.25;

function srgb<T extends THREE.Texture>(t: T): T {
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Builds the complete 3D interior of The Sims 2 Office:
 * - 4 distinct zones with realistic textures (Parquet, Checkered tile, Carpet, Hardwood)
 *   plus a marble reception lobby
 * - Molded walls with baseboards, brick exterior, windows, entrance door and wall decor
 * - Detailed furniture and props (procedural + Kenney models)
 */
export class RoomBuilder {
  private scene: THREE.Scene;
  private wallManager: WallManager;
  private env: Environment | null;
  public interactiveObjects: InteractiveObject[] = [];
  public deskScreens = new Map<string, THREE.MeshStandardMaterial[]>();
  private walls: Record<string, THREE.Mesh> = {};

  constructor(scene: THREE.Scene, wallManager: WallManager, env: Environment | null = null) {
    this.scene = scene;
    this.wallManager = wallManager;
    this.env = env;
  }

  public build(): void {
    this.buildFloors();
    this.buildWalls();
    this.buildWindowsAndDecor();
    this.buildChiefOffice();
    this.buildLobby();
    this.buildWorkstationsAndDevLab();
    this.buildPantry();
    this.buildMeetingRoom();
    this.buildLighting();
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private add<T extends THREE.Object3D>(obj: T, x: number, z: number, rotY = 0, y = 0, parent: THREE.Object3D = this.scene): T {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    parent.add(obj);
    return obj;
  }

  private registerLamp(lamp: LampHandle, night = 1.6, day = 0.15): void {
    if (!this.env) return;
    this.env.registerNightEmissive(lamp.bulb, night, day);
    if (lamp.glow) this.env.registerNightEmissive(lamp.glow.material as THREE.MeshBasicMaterial, 0.35, 0, 'opacity');
  }

  private floor(w: number, d: number, material: THREE.Material, x: number, z: number, y = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  // -------------------------------------------------------------------------
  // floors & walls
  // -------------------------------------------------------------------------

  private buildFloors(): void {
    // Neutral base under the whole building so no gaps show between rooms
    this.floor(22, 20, mat(0xcfc8bb, 0.7), 0, 0, -0.002);

    // 1. Chief Office Floor (Dark warm parquet with wood grain)
    const chiefTex = srgb(createWoodParquetTexture());
    const chiefMat = new THREE.MeshStandardMaterial({ map: chiefTex, roughness: 0.35, metalness: 0.08 });
    this.floor(8, 8, chiefMat, -7, -6);

    // 2. Open Workstation & Dev Lab Floor (Modern commercial carpet)
    const workTex = srgb(createCarpetTexture());
    const workMat = new THREE.MeshStandardMaterial({ map: workTex, roughness: 0.85, metalness: 0.02 });
    this.floor(13.5, 10, workMat, -4.25, 5);

    // Reception lobby + central corridor (polished marble)
    const marble = srgb(createMarbleTexture());
    marble.repeat.set(4, 7);
    this.floor(5.5, 10, new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18, metalness: 0.05 }), -0.25, -5);
    // Carpet strip between the chief office wall and the workstations
    this.floor(8, 2, workMat, -7, -1);
    // Welcome mat inside the entrance door
    this.floor(1.4, 0.8, mat(0x7f1d1d, 0.9), 0.4, 9.35, 0.004);

    // 3. Pantry Floor (Classic Sims 2 checkered cream/terracotta glossy tile)
    const pantryTex = srgb(createCheckeredTilesTexture());
    const pantryMat = new THREE.MeshStandardMaterial({ map: pantryTex, roughness: 0.2, metalness: 0.15 });
    this.floor(8.5, 10.5, pantryMat, 6.75, -4.75);

    // 4. Meeting Room Floor (Polished hardwood)
    const meetTex = srgb(createMeetingFloorTexture());
    const meetMat = new THREE.MeshStandardMaterial({ map: meetTex, roughness: 0.35, metalness: 0.08 });
    this.floor(8.5, 9.5, meetMat, 6.75, 5.25, 0.001);

    // Main floor baseplate for ground raycasting (floor clicking)
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ visible: false }));
    groundPlane.rotation.x = -Math.PI / 2;
    this.scene.add(groundPlane);
    this.interactiveObjects.push({ mesh: groundPlane, type: 'floor', actionTitle: 'Go Here' });
  }

  private buildWalls(): void {
    const wallTex = srgb(createWallTexture());
    const brickTex = createBrickTexture();
    const capMat = mat(0x6b5b4b, 0.6);

    const createWall = (
      name: string,
      width: number,
      depth: number,
      x: number,
      z: number,
      facing: Facing,
      /** box face index (0 +X, 1 -X, 4 +Z, 5 -Z) of the exterior side, if any */
      outerFace?: number
    ) => {
      const len = Math.max(width, depth);
      const inner = wallTex.clone();
      inner.repeat.set(len / 2.6, 1);
      inner.needsUpdate = true;
      const innerMat = new THREE.MeshStandardMaterial({ map: inner, roughness: 0.65 });
      const mats: THREE.Material[] = [innerMat, innerMat, capMat, capMat, innerMat, innerMat];
      if (outerFace !== undefined) {
        const outer = brickTex.clone();
        outer.repeat.set(len / 2.6, 1);
        outer.needsUpdate = true;
        mats[outerFace] = new THREE.MeshStandardMaterial({ map: outer, roughness: 0.85 });
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_H, depth), mats);
      mesh.position.set(x, WALL_H / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.wallManager.registerWall(mesh, facing, WALL_H);
      this.walls[name] = mesh;
    };

    // Perimeter Walls (brick outside)
    createWall('north', 22 + WALL_T, WALL_T, 0, -10, 'north', 5);
    createWall('south', 22 + WALL_T, WALL_T, 0, 10, 'south', 4);
    createWall('west', WALL_T, 20, -11, 0, 'west', 1);
    createWall('east', WALL_T, 20, 11, 0, 'east', 0);

    // Interior Dividing Walls
    createWall('chiefSouth', 6.5, WALL_T, -7.75, -2, 'south');
    createWall('wingNorth', WALL_T, 6.5, 2.5, -6.75, 'west');
    createWall('wingSouth', WALL_T, 6.5, 2.5, 6.75, 'west');
    createWall('pantryMeeting', 5, WALL_T, 8.5, 0.5, 'south');
  }

  /** Mount decor on a wall so it hides with cutaway. */
  private mount(wall: string, obj: THREE.Object3D): void {
    this.scene.add(obj);
    this.wallManager.attachDecor(this.walls[wall], obj);
  }

  private buildWindowsAndDecor(): void {
    const win = (wall: string, x: number, z: number, rotY: number, w = 1.6, h = 1.2) => {
      const { group, glass } = createWindow(w, h, WALL_T);
      group.position.set(x, 1.45, z);
      group.rotation.y = rotY;
      this.mount(wall, group);
      this.env?.registerWindow(glass);
    };
    // North wall (z = -10)
    for (const x of [-9.0, -3.7, 5.0, 10.0]) win('north', x, -10, 0);
    // South wall (z = 10)
    for (const x of [-9.0, -5.5, -2.0, 5.0]) win('south', x, 10, 0);
    // West wall (x = -11)
    for (const z of [-6.0, 1.6, 7.8]) win('west', -11, z, Math.PI / 2);
    // East wall (x = 11)
    for (const z of [-1.8, 3.4, 7.6]) win('east', 11, z, Math.PI / 2);

    // Glass entrance door on the south wall (x = 0.4)
    const door = new THREE.Group();
    const frame = mat(0x334155, 0.4, 0.5);
    const doorGlass = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x93cff8, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.3 });
    door.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, WALL_T + 0.02), doorGlass));
    for (const s of [-1, 1]) {
      const post = rbox(0.08, 2.25, WALL_T + 0.08, frame, 0.02);
      post.position.x = s * 0.69;
      door.add(post);
    }
    const lintel = rbox(1.46, 0.1, WALL_T + 0.08, frame, 0.02);
    lintel.position.y = 1.15;
    door.add(lintel);
    const split = rbox(0.04, 2.2, WALL_T + 0.04, frame, 0.01);
    door.add(split);
    door.position.set(0.4, 1.1, 10);
    this.mount('south', door);
    this.env?.registerWindow(doorGlass);

    // Paintings (inner faces)
    const art = (wall: string, x: number, z: number, rotY: number, w: number, h: number, seed: number) => {
      const p = createPainting(w, h, seed);
      p.position.set(x, 1.55, z);
      p.rotation.y = rotY;
      this.mount(wall, p);
    };
    const nIn = -10 + WALL_T / 2 + 0.02;
    const wIn = -11 + WALL_T / 2 + 0.02;
    const eIn = 11 - WALL_T / 2 - 0.02;
    art('west', wIn, -8.6, Math.PI / 2, 0.9, 0.65, 2);
    art('west', wIn, -3.4, Math.PI / 2, 0.7, 0.9, 1);
    art('west', wIn, 6.0, Math.PI / 2, 0.9, 0.6, 3);
    art('east', eIn, 5.5, -Math.PI / 2, 1.2, 0.8, 4);
    // Chief office south (interior) wall, office side
    art('chiefSouth', -7.5, -2 - WALL_T / 2 - 0.02, Math.PI, 1.4, 0.8, 6);

    // Logo + live wall clock in the lobby
    const logo = createLogoSign('AGENTIC OS');
    logo.position.set(-0.5, 1.75, nIn + 0.01);
    this.mount('north', logo);
    const logoFace = logo.children.find((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh && c.position.z > 0.02);
    if (logoFace) this.env?.registerNightEmissive(logoFace.material as THREE.MeshStandardMaterial, 0.6, 0.3);

    const clock = createWallClock();
    clock.group.position.set(1.7, 1.9, nIn + 0.02);
    this.mount('north', clock.group);
    this.env?.registerClock(clock.hour, clock.minute);

    // TV in the pantry facing the couch
    const tv = createTV(1.3);
    tv.position.set(8.2, 1.45, nIn + 0.02);
    this.mount('north', tv);

    // Divisi SukaShawarma illuminated sign on the south wall behind Row B
    const ssSign = createLogoSign('SUKASHAWARMA');
    ssSign.position.set(-4.5, 1.85, 10 - WALL_T / 2 - 0.02);
    ssSign.rotation.y = Math.PI;
    this.mount('south', ssSign);
    const ssFace = ssSign.children.find((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh && c.position.z > 0.02);
    if (ssFace) this.env?.registerNightEmissive(ssFace.material as THREE.MeshStandardMaterial, 0.6, 0.3);
  }

  // -------------------------------------------------------------------------
  // rooms
  // -------------------------------------------------------------------------

  private buildChiefOffice(): void {
    const group = new THREE.Group();

    // Executive Desk (Rich Mahogany with beveled edge)
    const deskTop = rbox(CHIEF_DESK.w, 0.08, CHIEF_DESK.d, mat(0x3d2010, 0.25), 0.03);
    deskTop.position.set(CHIEF_DESK.x, 0.75, CHIEF_DESK.z);
    group.add(deskTop);

    // Desk Pedestals + modesty panel facing the visitors
    const legMat = mat(0x241208, 0.4);
    for (const s of [-1, 1]) {
      const ped = rbox(0.5, 0.71, 1.0, legMat, 0.02);
      ped.position.set(CHIEF_DESK.x + s * 0.9, 0.355, CHIEF_DESK.z);
      group.add(ped);
      for (let i = 0; i < 3; i++) {
        const knob = rbox(0.12, 0.02, 0.02, mat(0xd4a017, 0.3, 0.8), 0.005);
        knob.position.set(CHIEF_DESK.x + s * 0.9, 0.2 + i * 0.2, CHIEF_DESK.z - 0.51);
        group.add(knob);
      }
    }
    const modesty = rbox(1.3, 0.5, 0.04, legMat, 0.01);
    modesty.position.set(CHIEF_DESK.x, 0.45, CHIEF_DESK.z + 0.5);
    group.add(modesty);
    this.add(blobShadow(3.0, 1.8, 0.4), CHIEF_DESK.x, CHIEF_DESK.z, 0, 0, group);

    // Chief's Executive Leather High-back Chair (Kenney chairDesk)
    const chair = createKenney('chairDesk', { height: 0.95 }, () => createOfficeChair(0x1c1917));
    this.add(chair, CHIEF_SEAT.x, CHIEF_SEAT.z, CHIEF_SEAT.rotationY, 0, group);

    // Executive Laptop, desk lamp, mug, paper tray
    const laptopObj = createLaptop();
    this.add(laptopObj, -6.5, -6.95, 0, 0.79, group);
    const chiefScreen = laptopObj.getObjectByName('laptopScreen') as THREE.Mesh | undefined;
    if (chiefScreen && chiefScreen.material instanceof THREE.MeshStandardMaterial) {
      let list = this.deskScreens.get('chief');
      if (!list) {
        list = [];
        this.deskScreens.set('chief', list);
      }
      list.push(chiefScreen.material);
    }

    const lamp = createDeskLamp();
    this.add(lamp.group, -7.45, -7.1, 0.6, 0.79, group);
    this.registerLamp(lamp, 1.4, 0.1);
    this.add(createMug(0x1e3a8a), -5.8, -7.0, 0, 0.79, group);
    this.add(createPaperTray(), -5.6, -6.6, 0.2, 0.79, group);

    // Rug under guest area (sofa/visitor chairs/plants handled by DecorManager)
    this.add(createRug(2.6, 3.2, '#7c2d12', '#e9c46a'), -9.4, -4.4, 0, 0, group);

    // Bookshelf against north wall
    this.add(createBookshelf(2.2, 2.0, 0.4, 11), -6.5, -9.7, 0, 0, group);

    this.scene.add(group);
    this.interactiveObjects.push({ mesh: deskTop, type: 'desk', id: 'chief', actionTitle: 'Chief of Staff Desk' });
  }

  private buildLobby(): void {
    const group = new THREE.Group();
    this.add(createRug(3.2, 2.6, '#1e3a8a', '#93c5fd'), LOBBY.sofa.x, -8.2, 0, 0, group);
    this.add(
      createKenney('loungeDesignSofa', { width: 2.0 }, () => createSofa(2.0, 0x0f766e, 2)),
      LOBBY.sofa.x,
      LOBBY.sofa.z,
      0,
      0,
      group
    );
    this.scene.add(group);
  }

  private buildWorkstationsAndDevLab(): void {
    const group = new THREE.Group();
    const frameMat = mat(0x1e293b, 0.5, 0.3);
    const topMat = mat(0xf8fafc, 0.3);

    // Workstation desks: two back-to-back rows generated from NavigationMesh.DESK_LAYOUT
    DESK_LAYOUT.forEach((cfg, index) => {
      const owner = deskOwner(index);
      // Modern white oak desk top
      const desk = rbox(DESK_SIZE.w, 0.06, DESK_SIZE.d, topMat, 0.02);
      desk.position.set(cfg.x, 0.74, cfg.z);
      group.add(desk);

      // Black metal frame legs (sled style)
      for (const sx of [-1, 1]) {
        const lx = cfg.x + sx * (DESK_SIZE.w / 2 - 0.1);
        for (const sz of [-1, 1]) {
          const leg = rbox(0.04, 0.71, 0.04, frameMat, 0.01);
          leg.position.set(lx, 0.355, cfg.z + sz * (DESK_SIZE.d / 2 - 0.08));
          group.add(leg);
        }
        const foot = rbox(0.05, 0.03, DESK_SIZE.d - 0.1, frameMat, 0.01);
        foot.position.set(lx, 0.015, cfg.z);
        group.add(foot);
      }
      // Privacy screen between the back-to-back rows
      const screenPanel = rbox(DESK_SIZE.w - 0.05, 0.35, 0.04, mat(0x64748b, 0.8), 0.02);
      screenPanel.position.set(cfg.x, 0.95, cfg.z - cfg.seatSide * (DESK_SIZE.d / 2 - 0.02));
      group.add(screenPanel);
      this.add(blobShadow(DESK_SIZE.w + 0.4, DESK_SIZE.d + 0.5, 0.35), cfg.x, cfg.z, 0, 0, group);

      // Dual Glowing Monitors on the far side of the desk, screens facing the seat
      const zOffset = -cfg.seatSide * 0.2;
      const screenRot = cfg.seatSide === 1 ? 0 : Math.PI;
      for (const [dx, tilt] of [[-0.3, 0.12], [0.3, -0.12]] as const) {
        const mon = new THREE.Group();
        mon.add(rbox(0.56, 0.34, 0.03, mat(0x0f172a, 0.3, 0.3), 0.012));
        const scrMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: 0x0284c7,
          emissiveIntensity: 0.55,
        });
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), scrMat);
        scr.position.z = 0.016;
        mon.add(scr);

        if (owner) {
          let list = this.deskScreens.get(owner);
          if (!list) {
            list = [];
            this.deskScreens.set(owner, list);
          }
          list.push(scrMat);
        }

        const stand = rbox(0.04, 0.16, 0.03, frameMat, 0.01);
        stand.position.set(0, -0.24, -0.02);
        mon.add(stand);
        mon.position.set(cfg.x + dx, 1.03, cfg.z + zOffset);
        mon.rotation.y = screenRot + tilt;
        group.add(mon);
      }

      // Keyboard + mouse in front of the seat (Kenney models with procedural fallback)
      const kbZ = cfg.z + cfg.seatSide * 0.15;
      this.add(
        createKenney('computerKeyboard', { width: 0.45 }, () => rbox(0.45, 0.02, 0.15, mat(0x334155, 0.6), 0.008)),
        cfg.x, kbZ, 0, 0.77, group
      );
      this.add(
        createKenney('computerMouse', { depth: 0.1 }, () => rbox(0.06, 0.025, 0.1, mat(0x334155, 0.6), 0.012)),
        cfg.x + 0.35, kbZ, 0, 0.77, group
      );

      // Personal desk props per agent
      this.decorateDesk(group, owner, cfg.x, cfg.z, cfg.seatSide);

      // Ergonomic Office Chair (Kenney chairDesk with procedural fallback)
      const seat = deskSeat(cfg);
      this.add(
        createKenney('chairDesk', { height: 0.95 }, () => createOfficeChair(index % 2 ? 0x1e3a8a : 0x27272a)),
        seat.x, seat.z, seat.rotationY, 0, group
      );

      if (owner) {
        this.interactiveObjects.push({ mesh: desk, type: 'desk', id: owner, actionTitle: `${owner} Workstation` });
      }
    });

    // Dev Server Rack (Towering black steel rack with blinking server lights)
    const rack = rbox(0.9, 2.2, 0.9, mat(0x0f172a, 0.3, 0.8), 0.03);
    rack.position.set(-10.2, 1.1, 4.5);
    group.add(rack);
    this.add(blobShadow(1.3, 1.3, 0.45), -10.2, 4.5, 0, 0, group);

    // Blinking LED server blades
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.9 });
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.02), ledMat);
      blade.position.set(-9.74, 0.4 + i * 0.35, 4.5);
      blade.rotation.y = Math.PI / 2;
      group.add(blade);
    }

    // Printer, bins, plants are managed dynamically by DecorManager (Build/Buy)
    this.interactiveObjects.push({ mesh: rack, type: 'server', id: 'dev-server', actionTitle: 'Dev Server Rack (Docker Egress)' });
    this.scene.add(group);
  }

  /** Role-specific clutter on each workstation. */
  private decorateDesk(group: THREE.Group, owner: string | undefined, x: number, z: number, side: 1 | -1): void {
    const top = 0.77;
    const near = z + side * 0.25;
    const lampSpot = (dx: number) => {
      const lamp = createDeskLamp();
      this.add(lamp.group, x + dx, z - side * 0.05, side === 1 ? Math.PI : 0, top, group);
      this.registerLamp(lamp, 1.2, 0.05);
    };
    switch (owner) {
      case 'dev':
        this.add(
          createKenney('laptop', { width: 0.36 }, () => createLaptop()),
          x - 0.62, near, side === 1 ? Math.PI : 0, top, group
        );
        this.add(createCan(0x16a34a), x + 0.62, near, 0, top, group);
        this.add(createCan(0x1d4ed8), x + 0.7, near - side * 0.1, 0, top, group);
        break;
      case 'researcher':
        this.add(
          createKenney('books', { width: 0.35 }, () => createBookStack(31, 5)),
          x - 0.62, near, 0.3, top, group
        );
        this.add(
          createKenney('books', { width: 0.32 }, () => createBookStack(32, 3)),
          x + 0.65, near, -0.2, top, group
        );
        lampSpot(0.75);
        break;
      case 'secretary':
        this.add(createPhone(), x - 0.6, near, side === 1 ? Math.PI : 0, top, group);
        this.add(createPaperTray(), x + 0.62, near, 0, top, group);
        this.add(createMug(0xbe123c), x + 0.35, near + side * 0.05, 0, top, group);
        break;
      case 'content':
        this.add(createCamera(), x - 0.6, near, 0.4, top, group);
        this.add(createPlant('snake', 40), x + 0.7, z - side * 0.05, 0, top - 0.02, group).scale.setScalar(0.35);
        break;
      case 'adelia':
        // Adelia: QC Master & Forensic Verifier (paper tray, forensic file stack, lamp)
        this.add(createPaperTray(), x - 0.6, near, side === 1 ? Math.PI : 0, top, group);
        this.add(createBookStack(41, 4), x + 0.62, near, 0.1, top, group);
        lampSpot(0.75);
        break;
      case 'clara':
        // Clara: Dispatch Master & WAHA Officer (phone, teal mug, dispatch tray)
        this.add(createPhone(), x - 0.6, near, side === 1 ? Math.PI : 0, top, group);
        this.add(createMug(0x06b6d4), x + 0.35, near + side * 0.05, 0, top, group);
        this.add(createPaperTray(), x + 0.62, near, 0, top, group);
        break;
      case 'maya':
        // Maya: E-Commerce Master (marketplace laptop, gold mug)
        this.add(
          createKenney('laptop', { width: 0.36 }, () => createLaptop()),
          x - 0.62, near, side === 1 ? Math.PI : 0, top, group
        );
        this.add(createMug(0xf59e0b), x + 0.62, near, 0, top, group);
        break;
      case 'hermes-default':
        this.add(createCan(0x8b5cf6), x + 0.62, near, 0, top, group);
        lampSpot(-0.7);
        break;
      default:
        this.add(createMug([0xffffff, 0xf59e0b, 0x22c55e, 0x8b5cf6][Math.abs(Math.round(x)) % 4]), x - 0.55, near, 0, top, group);
        if (Math.round(z) % 2 === 0) lampSpot(0.75);
        else this.add(createBookStack(Math.round(x * 10), 2), x + 0.6, near, 0.2, top, group);
    }
  }

  private buildPantry(): void {
    const group = new THREE.Group();

    // Kitchen Counter against East wall (front faces -X)
    this.add(createKitchenCounter(3.5), 10.4, -7.5, -Math.PI / 2, 0, group);

    // Sims Espresso Machine (Kenney kitchenCoffeeMachine with procedural fallback)
    const coffeeFb = () => {
      const g = new THREE.Group();
      g.add(rbox(0.45, 0.42, 0.38, mat(0xe11d48, 0.2, 0.7), 0.05));
      const spout = rbox(0.1, 0.06, 0.12, mat(0xd1d5db, 0.2, 0.9), 0.02);
      spout.position.set(0, -0.1, 0.2);
      g.add(spout);
      return g;
    };
    const coffeeMachine = createKenney('kitchenCoffeeMachine', { height: 0.42, yaw: -Math.PI / 2 }, coffeeFb);
    coffeeMachine.position.set(10.25, 1.1, -7.5);
    group.add(coffeeMachine);
    this.add(createMug(0xffffff), 10.0, -7.0, 0, 0.89, group);
    this.add(createMug(0xfacc15), 10.1, -8.3, 0, 0.89, group);

    // Office Refrigerator (Stainless Steel Kenney kitchenFridgeLarge)
    const fridge = createKenney('kitchenFridgeLarge', { height: 1.75 }, () => createFridge());
    this.add(fridge, 10.35, -5.0, -Math.PI / 2, 0, group);

    // Breakroom Lounge Sofa (Sims Burnt Orange Kenney loungeSofa), facing the TV
    const couch = createKenney('loungeSofa', { width: 1.8 }, () => createSofa(1.8, 0xc2410c, 2));
    this.add(couch, 8.2, -3.0, Math.PI, 0, group);
    this.add(createRug(2.8, 2.2, '#f4a261', '#264653', 'stripes'), 8.2, -3.8, 0, 0, group);

    // Water cooler, vending machine, bistro table, stools, coffee table, plant are managed by DecorManager (Build/Buy)
    this.scene.add(group);

    this.interactiveObjects.push({ mesh: coffeeMachine, type: 'coffee', actionTitle: 'Espresso Coffee Machine (Take Break)' });
    this.interactiveObjects.push({ mesh: couch, type: 'couch', actionTitle: 'Breakroom Sofa' });
  }

  private buildMeetingRoom(): void {
    const group = new THREE.Group();

    // 1. SukaShawarma Room Rug (Rich warm terracotta & golden-amber palette)
    this.add(createRug(5.2, 5.2, '#9a3412', '#f59e0b', 'stripes'), 7.8, 5.2, 0, 0, group);

    // 2. Meja Bundar (Round Table) - Centered at x: 7.8, z: 5.2
    const roundTable = createSukaRoundTable(1.3);
    this.add(roundTable, 7.8, 5.2, 0, 0, group);

    // 3. Conference Chairs around the round table (6 chairs, arranged radially)
    for (const cp of MEETING_CHAIRS) {
      this.add(
        createKenney('chairDesk', { height: 0.95 }, () => createOfficeChair(0x3f3f46)),
        cp.x, cp.z, cp.rot, 0, group
      );
    }

    // 4. Whiteboard SukaShawarma (on South wall at x: 7.8, z: 9.85)
    const whiteboard = createSukaWhiteboard(3.4, 1.6);
    this.add(whiteboard, 7.8, 9.85, Math.PI, 0.8, group);

    // 5. Kabinet Dokumen & Arsip SukaShawarma (on East wall at x: 10.45, z: 5.2, facing West)
    const cabinet = createSukaCabinet(2.4, 2.0, 0.55);
    this.add(cabinet, 10.45, 5.2, -Math.PI / 2, 0, group);

    // 6. Sistem Proyektor 3D (Ceiling Projector, Volumetric Light Beam, Motorized Screen on North Wall)
    const { projector, screen, screenMesh } = createSukaProjectorSystem();
    // Ceiling projector unit at x: 7.8, y: 2.35, z: 3.8
    projector.position.set(7.8, 2.35, 3.8);
    group.add(projector);

    // Motorized screen mounted on North wall (z = 0.55, x: 7.8, y: 1.65)
    screen.position.set(7.8, 1.65, 0.55);
    group.add(screen);

    // 7. 3D Illuminated Room Signboard: "WAR ROOM SUKASHAWARMA"
    const roomSign = createLogoSign('WAR ROOM SUKASHAWARMA');
    roomSign.position.set(7.8, 2.45, 0.54);
    group.add(roomSign);

    this.scene.add(group);

    // Interactive Objects Registration
    this.interactiveObjects.push({ mesh: roundTable, type: 'meeting', actionTitle: 'Meja Bundar SukaShawarma (Diskusi Strategi)' });
    this.interactiveObjects.push({ mesh: whiteboard, type: 'meeting', actionTitle: 'Papan Tulis Operasional 21 Cabang' });
    this.interactiveObjects.push({ mesh: cabinet, type: 'meeting', actionTitle: 'Kabinet Arsip & SOP Resto SukaShawarma' });
    this.interactiveObjects.push({ mesh: screenMesh, type: 'meeting', actionTitle: 'Proyektor Dashboard Waktu Nyata 21 Cabang' });
  }

  private buildLighting(): void {
    // Global sun / sky lighting lives in Environment; here only warm room lights.
    if (!this.env) {
      // Fallback for callers without an Environment (tests / tools)
      this.scene.add(new THREE.HemisphereLight(0xdcf0ff, 0x605242, 1.0));
      const sun = new THREE.DirectionalLight(0xfff5e6, 1.4);
      sun.position.set(20, 30, 20);
      this.scene.add(sun);
      return;
    }
    this.env.addInteriorLight(-7.0, -6.0, 12); // chief office
    this.env.addInteriorLight(-0.3, -6.5, 10, 0xfff1d6); // lobby
    this.env.addInteriorLight(-6.0, 5.0, 13, 0xf8f4ff); // workstations (cool white)
    this.env.addInteriorLight(-1.2, 5.0, 10, 0xf8f4ff);
    this.env.addInteriorLight(6.8, -5.0, 12); // pantry
    this.env.addInteriorLight(8.0, 5.0, 12); // meeting room
  }
}
