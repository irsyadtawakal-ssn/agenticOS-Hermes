import * as THREE from 'three';
import type { Environment } from './Environment.ts';
import {
  blobShadow,
  createBench,
  createBush,
  createCar,
  createHedge,
  createStreetLamp,
  createTree,
  mat,
  rng,
} from './Props.ts';

/**
 * The lot around the office building: grass, foundation, walkway, street with
 * traffic, parking lot, trees, hedges, street lamps and a low-poly city skyline.
 * Building footprint is x -11..11, z -10..10 (see NavigationMesh.OFFICE_BOUNDS).
 */

const GROUND_Y = -0.3;

function grassTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5c9a3c';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 2600; i++) {
    const shade = r();
    ctx.fillStyle = shade < 0.5 ? 'rgba(46,110,40,0.35)' : 'rgba(140,190,80,0.3)';
    ctx.fillRect(r() * 256, r() * 256, 2, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function asphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, 128, 128);
  const r = rng(5);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(r() * 128, r() * 128, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function concreteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c9c4ba';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(80,70,60,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Building facade with a window grid; the emissive map lights windows at night. */
function facadeTextures(seed: number, cols: number, rows: number, wall: string): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const W = cols * 16;
  const H = rows * 20;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const cm = mk();
  const cg = mk();
  const m = cm.getContext('2d')!;
  const gl = cg.getContext('2d')!;
  m.fillStyle = wall;
  m.fillRect(0, 0, W, H);
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      m.fillStyle = '#25303f';
      m.fillRect(x * 16 + 3, y * 20 + 4, 10, 12);
      if (r() < 0.55) {
        gl.fillStyle = r() < 0.8 ? '#ffd58a' : '#cfe8ff';
        gl.fillRect(x * 16 + 3, y * 20 + 4, 10, 12);
      }
    }
  }
  const map = new THREE.CanvasTexture(cm);
  const glow = new THREE.CanvasTexture(cg);
  map.colorSpace = glow.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = glow.magFilter = THREE.NearestFilter;
  return { map, glow };
}

interface MovingCar {
  obj: THREE.Group;
  speed: number;
}

export class Exterior {
  private readonly group = new THREE.Group();
  private readonly cars: MovingCar[] = [];

  constructor(scene: THREE.Scene, env: Environment | null) {
    this.group.name = 'exterior';
    this.buildGround();
    this.buildFoundation();
    this.buildStreet();
    this.buildParking();
    this.buildGreenery();
    this.buildLamps(env);
    this.buildSkyline(env);
    scene.add(this.group);
  }

  private plane(w: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private slab(w: number, h: number, d: number, material: THREE.Material, x: number, yTop: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, yTop - h / 2, z);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private buildGround(): void {
    this.plane(240, 240, new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 }), 0, GROUND_Y, 0);
  }

  private buildFoundation(): void {
    // Sims-style raised lot foundation under the building
    this.slab(23, 0.3, 21, mat(0xb8b0a2, 0.85), 0, -0.006, 0);
    this.slab(23.3, 0.08, 21.3, mat(0x8f877a, 0.9), 0, GROUND_Y + 0.08, 0);
    // entrance steps + walkway from the south door (x = 0.4) to the sidewalk
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.85 });
    this.slab(2.0, 0.15, 0.5, concrete, 0.4, -0.15, 10.75);
    const walk = this.plane(1.8, 3.2, concrete.clone(), 0.4, GROUND_Y + 0.012, 12.6);
    (walk.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 2);
  }

  private buildStreet(): void {
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.85 });
    concrete.map!.repeat.set(100, 1);
    // near & far sidewalks (raised curb)
    this.slab(200, 0.08, 2.2, concrete, 0, GROUND_Y + 0.08, 15.1);
    this.slab(200, 0.08, 2.2, concrete.clone(), 0, GROUND_Y + 0.08, 24.9);
    // road
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.9 });
    asphalt.map!.repeat.set(80, 3);
    this.plane(200, 7.6, asphalt, 0, GROUND_Y + 0.01, 20);
    const paint = new THREE.MeshBasicMaterial({ color: 0xf5f5f4 });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let x = -100; x < 100; x += 4) this.plane(2, 0.14, yellow, x, GROUND_Y + 0.015, 20);
    this.plane(200, 0.1, paint, 0, GROUND_Y + 0.015, 16.6);
    this.plane(200, 0.1, paint, 0, GROUND_Y + 0.015, 23.4);
    // crosswalk in front of the entrance
    for (let i = 0; i < 7; i++) this.plane(0.45, 6.8, paint, -0.3 + i * 0.75, GROUND_Y + 0.016, 20);

    // traffic
    const colors = [0x2563eb, 0xf59e0b, 0x10b981, 0xe11d48];
    for (let i = 0; i < 4; i++) {
      const car = createCar(colors[i]);
      const eastbound = i % 2 === 0;
      car.position.set(-60 + i * 33, GROUND_Y + 0.01, eastbound ? 21.8 : 18.2);
      car.rotation.y = eastbound ? 0 : Math.PI;
      this.group.add(car);
      this.cars.push({ obj: car, speed: (eastbound ? 1 : -1) * (5 + i) });
    }
  }

  private buildParking(): void {
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.9 });
    asphalt.map!.repeat.set(4, 6);
    this.plane(12, 19, asphalt, 19.5, GROUND_Y + 0.008, 0);
    this.plane(4, 6, asphalt.clone(), 21, GROUND_Y + 0.008, 12.5); // driveway to the road
    const paint = new THREE.MeshBasicMaterial({ color: 0xf5f5f4 });
    for (let i = 0; i <= 6; i++) this.plane(5.2, 0.1, paint, 21.6, GROUND_Y + 0.012, -8.4 + i * 2.8);
    const parked: Array<[number, number]> = [
      [0xdc2626, -7.0],
      [0x1d4ed8, -1.4],
      [0xf8fafc, 1.4],
      [0x374151, 7.0],
    ];
    for (const [color, z] of parked) {
      const car = createCar(color);
      car.position.set(21.6, GROUND_Y + 0.01, z);
      car.rotation.y = Math.PI;
      this.group.add(car);
    }
    // curb stops
    for (let i = 0; i < 6; i++) {
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.2), mat(0xd6d3d1, 0.8));
      stop.position.set(24.0, GROUND_Y + 0.06, -7 + i * 2.8);
      this.group.add(stop);
    }
  }

  private buildGreenery(): void {
    const place = (obj: THREE.Object3D, x: number, z: number, rotY = 0) => {
      obj.position.set(x, GROUND_Y, z);
      obj.rotation.y = rotY;
      this.group.add(obj);
    };
    let seed = 100;
    // tree belts (west, north, south lawn, across the street, east of parking)
    const trees: Array<[number, number]> = [];
    for (let z = -16; z <= 12; z += 4.5) trees.push([-15.5 + (z % 2), z]);
    for (let x = -11; x <= 26; x += 5) trees.push([x, -16 + ((x * 7) % 3) * 0.5]);
    trees.push([-8.5, 12.4], [-4.5, 12.6], [5.5, 12.4], [9.5, 12.6]);
    for (let x = -60; x <= 60; x += 9) trees.push([x + 2, 27.5]);
    for (let z = -12; z <= 10; z += 5.5) trees.push([28.5, z]);
    for (const [x, z] of trees) place(createTree(seed++), x, z);

    // hedges framing the lot
    const hedgeN = createHedge(24);
    place(hedgeN, 0, -13);
    const hedgeW = createHedge(22);
    place(hedgeW, -13.2, -1, Math.PI / 2);

    // flower bushes along the foundation
    for (let x = -10.2; x <= -1.0; x += 1.3) place(createBush(seed++), x, 11.0);
    for (let x = 1.8; x <= 10.4; x += 1.3) place(createBush(seed++), x, 11.0);
    for (let z = -9; z <= 9; z += 1.6) place(createBush(seed++), -11.9, z);

    // benches by the walkway
    place(createBench(), 2.4, 13.0, Math.PI);
    place(createBench(), -1.6, 13.0, Math.PI);
  }

  private buildLamps(env: Environment | null): void {
    const spots: Array<[number, number, number]> = [];
    for (let x = -36; x <= 36; x += 12) spots.push([x, 15.6, Math.PI / 2]);
    spots.push([13.6, -5, 0], [13.6, 5, 0]);
    for (const [x, z, rot] of spots) {
      const lamp = createStreetLamp();
      lamp.group.position.set(x, GROUND_Y, z);
      lamp.group.rotation.y = rot;
      this.group.add(lamp.group);
      if (env) {
        env.registerNightEmissive(lamp.bulb, 2.4, 0);
        if (lamp.glow) env.registerNightEmissive(lamp.glow.material as THREE.MeshBasicMaterial, 0.55, 0, 'opacity');
      }
    }
  }

  private buildSkyline(env: Environment | null): void {
    const r = rng(77);
    const walls = ['#d6cfc4', '#b8c4d0', '#c9b8a6', '#9aa5b1', '#e2d9c8'];
    const addBuilding = (x: number, z: number, w: number, d: number, h: number) => {
      const { map, glow } = facadeTextures(Math.floor(r() * 1000), Math.max(2, Math.round(w / 1.2)), Math.max(2, Math.round(h / 1.6)), walls[Math.floor(r() * walls.length)]);
      const material = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
      const roof = mat(0x4b5563, 0.8);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [material, material, roof, roof, material, material]);
      b.position.set(x, GROUND_Y + h / 2, z);
      b.castShadow = false;
      b.receiveShadow = true;
      this.group.add(b);
      const shadow = blobShadow(w + 2, d + 2, 0.3);
      shadow.position.set(x, GROUND_Y + 0.01, z);
      this.group.add(shadow);
      env?.registerNightEmissive(material, 0.9, 0);
    };
    // across the street
    for (let x = -64; x <= 64; x += 10 + r() * 4) addBuilding(x, 34 + r() * 4, 7 + r() * 3, 7, 6 + r() * 12);
    // behind the lot (north) and to the sides
    for (let x = -60; x <= 60; x += 11 + r() * 4) addBuilding(x, -28 - r() * 6, 8 + r() * 3, 8, 8 + r() * 16);
    for (let z = -20; z <= 10; z += 12) addBuilding(-30 - r() * 4, z, 8, 9, 6 + r() * 10);
    for (let z = -20; z <= 10; z += 12) addBuilding(36 + r() * 4, z, 8, 9, 6 + r() * 10);
  }

  public update(dt: number): void {
    for (const c of this.cars) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 75) c.obj.position.x = -75;
      if (c.obj.position.x < -75) c.obj.position.x = 75;
    }
  }
}
