import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Procedural low-poly furniture & props in a soft, rounded "Sims 2" style.
 * Every factory returns an object whose origin is on the floor (y = 0) at the
 * footprint centre and which faces +Z (backrests / backs toward -Z).
 */

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, roughness = 0.6, metalness = 0.05): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}

export function rbox(w: number, h: number, d: number, material: THREE.Material, r = 0.04, seg = 3): THREE.Mesh {
  const radius = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, radius)), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function put<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

/** Tiny deterministic PRNG so layouts are stable between reloads. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

let blobTexture: THREE.CanvasTexture | null = null;
function getBlobTexture(): THREE.CanvasTexture {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(c);
  }
  return blobTexture;
}

/** Soft contact-shadow decal (cheap ambient occlusion under furniture). */
export function blobShadow(w: number, d: number, opacity = 0.35): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: getBlobTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

let glowTexture: THREE.CanvasTexture | null = null;
/** Additive warm light pool decal on the ground. */
export function glowDecal(radius: number, color = 0xffd08a): THREE.Mesh {
  if (!glowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------------------
// seating
// ---------------------------------------------------------------------------

export function createOfficeChair(color = 0x27272a): THREE.Group {
  const g = new THREE.Group();
  const fabric = mat(color, 0.75);
  const metal = mat(0x9ca3af, 0.3, 0.8);
  const dark = mat(0x1f2937, 0.5, 0.3);

  put(g, rbox(0.5, 0.09, 0.48, fabric, 0.04), 0, 0.445, 0.02); // seat cushion (top ≈ 0.49)
  const back = put(g, rbox(0.46, 0.52, 0.07, fabric, 0.035), 0, 0.8, -0.22);
  back.rotation.x = -0.08;
  put(g, rbox(0.06, 0.32, 0.05, dark, 0.02), 0, 0.56, -0.24); // spine
  for (const s of [-1, 1]) {
    put(g, rbox(0.05, 0.03, 0.3, dark, 0.012), s * 0.27, 0.64, 0.0); // armrest pad
    put(g, rbox(0.03, 0.17, 0.03, dark, 0.01), s * 0.27, 0.55, -0.02);
  }
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 10), metal), 0, 0.25, 0);
  // 5-star base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = put(g, rbox(0.3, 0.035, 0.05, dark, 0.012), Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15);
    leg.rotation.y = a + Math.PI / 2;
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dark), Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
  }
  return g;
}

/** Sofa facing +Z. Seat top ≈ 0.47 m. */
export function createSofa(width: number, color: number, seats = 2): THREE.Group {
  const g = new THREE.Group();
  const fabric = mat(color, 0.85);
  const cushion = mat(new THREE.Color(color).offsetHSL(0, 0, 0.06).getHex(), 0.9);
  const legMat = mat(0x3b2416, 0.5);
  const depth = 0.85;
  put(g, rbox(width, 0.26, depth, fabric, 0.05), 0, 0.23, 0); // base
  put(g, rbox(width, 0.5, 0.2, fabric, 0.07), 0, 0.6, -depth / 2 + 0.1); // back
  for (const s of [-1, 1]) put(g, rbox(0.18, 0.42, depth, fabric, 0.07), s * (width / 2 - 0.09), 0.43, 0); // arms
  const inner = width - 0.36;
  for (let i = 0; i < seats; i++) {
    const cx = -inner / 2 + inner / seats / 2 + (i * inner) / seats;
    put(g, rbox(inner / seats - 0.03, 0.12, depth - 0.24, cushion, 0.05), cx, 0.41, 0.08);
    put(g, rbox(inner / seats - 0.05, 0.36, 0.14, cushion, 0.06), cx, 0.66, -depth / 2 + 0.25);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.1, 8), legMat), sx * (width / 2 - 0.08), 0.05, sz * (depth / 2 - 0.08));
  }
  put(g, blobShadow(width + 0.5, depth + 0.5, 0.4), 0, 0, 0);
  return g;
}

export function createStool(): THREE.Group {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16), mat(0xb45309, 0.5)), 0, 0.62, 0).castShadow = true;
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), mat(0x9ca3af, 0.3, 0.8)), 0, 0.31, 0);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.03, 16), mat(0x6b7280, 0.3, 0.8)), 0, 0.015, 0);
  return g;
}

// ---------------------------------------------------------------------------
// tables & storage
// ---------------------------------------------------------------------------

export function createCoffeeTable(w: number, d: number, top = 0x3d2010): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(w, 0.06, d, mat(top, 0.3), 0.025), 0, 0.38, 0);
  put(g, rbox(w - 0.1, 0.03, d - 0.1, mat(top, 0.4), 0.01), 0, 0.12, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(g, rbox(0.05, 0.36, 0.05, mat(0x1f1309, 0.5), 0.01), sx * (w / 2 - 0.06), 0.18, sz * (d / 2 - 0.06));
  }
  put(g, blobShadow(w + 0.4, d + 0.4, 0.3), 0, 0, 0);
  return g;
}

export function createRoundTable(radius = 0.5): THREE.Group {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 28), mat(0xf5f5f4, 0.25)), 0, 0.74, 0).castShadow = true;
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10), mat(0x374151, 0.4, 0.6)), 0, 0.37, 0);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.03, 20), mat(0x374151, 0.4, 0.6)), 0, 0.015, 0);
  put(g, blobShadow(radius * 2.6, radius * 2.6, 0.3), 0, 0, 0);
  return g;
}

const BOOK_COLORS = [0x991b1b, 0x1e40af, 0x166534, 0xa16207, 0x6b21a8, 0x0f766e, 0xe5e7eb, 0x7c2d12, 0x334155];

export function createBookshelf(w = 2.2, h = 2.0, d = 0.4, seed = 7, wood = 0x3d2010): THREE.Group {
  const g = new THREE.Group();
  const woodMat = mat(wood, 0.55);
  const r = rng(seed);
  put(g, rbox(w, h, 0.03, woodMat, 0.01), 0, h / 2, -d / 2 + 0.015); // back panel
  for (const s of [-1, 1]) put(g, rbox(0.05, h, d, woodMat, 0.015), s * (w / 2 - 0.025), h / 2, 0);
  const shelves = 5;
  for (let i = 0; i <= shelves; i++) {
    const y = 0.04 + (i * (h - 0.08)) / shelves;
    put(g, rbox(w - 0.06, 0.035, d, woodMat, 0.01), 0, y, 0);
    if (i === shelves) break;
    // books
    let x = -w / 2 + 0.08;
    const shelfH = (h - 0.08) / shelves - 0.06;
    while (x < w / 2 - 0.12) {
      if (r() < 0.12) {
        x += 0.12 + r() * 0.2; // gap
        continue;
      }
      const bw = 0.03 + r() * 0.04;
      const bh = shelfH * (0.65 + r() * 0.3);
      const book = rbox(bw, bh, d * (0.7 + r() * 0.2), mat(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], 0.8), 0.006, 1);
      book.castShadow = false;
      put(g, book, x + bw / 2, y + 0.02 + bh / 2, 0.02);
      if (r() < 0.08) book.rotation.z = 0.25;
      x += bw + 0.004;
    }
  }
  put(g, blobShadow(w + 0.3, d + 0.4, 0.35), 0, 0, 0.05);
  return g;
}

export function createKitchenCounter(len: number): THREE.Group {
  // runs along X, front toward +Z
  const g = new THREE.Group();
  const cab = mat(0xf8fafc, 0.4);
  put(g, rbox(len, 0.84, 0.6, cab, 0.02), 0, 0.42, 0);
  put(g, rbox(len + 0.04, 0.05, 0.64, mat(0x52525b, 0.2, 0.1), 0.01), 0, 0.865, 0.01);
  const doors = Math.max(1, Math.round(len / 0.6));
  for (let i = 0; i < doors; i++) {
    const x = -len / 2 + (i + 0.5) * (len / doors);
    put(g, rbox(len / doors - 0.04, 0.7, 0.02, mat(0xe2e8f0, 0.35), 0.01), x, 0.42, 0.305);
    put(g, rbox(0.12, 0.015, 0.02, mat(0x9ca3af, 0.2, 0.9), 0.005), x, 0.72, 0.32);
  }
  put(g, blobShadow(len + 0.3, 0.9, 0.3), 0, 0, 0);
  return g;
}

export function createFridge(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0xcbd5e1, 0.25, 0.6);
  put(g, rbox(0.8, 1.9, 0.75, steel, 0.05), 0, 0.95, 0);
  put(g, rbox(0.78, 0.01, 0.02, mat(0x64748b, 0.4), 0.002), 0, 1.25, 0.38);
  for (const y of [0.85, 1.6]) put(g, rbox(0.03, 0.35, 0.04, mat(0x94a3b8, 0.2, 0.9), 0.01), 0.3, y, 0.4);
  put(g, blobShadow(1.1, 1.0, 0.35), 0, 0, 0);
  return g;
}

export function createVendingMachine(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.9, 1.85, 0.7, mat(0xdc2626, 0.35, 0.2), 0.05), 0, 0.925, 0);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x93c5fd, emissiveIntensity: 0.35, roughness: 0.1 });
  put(g, rbox(0.56, 1.3, 0.02, glass, 0.01), -0.1, 1.1, 0.35);
  const r = rng(3);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), mat(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], 0.4));
    put(g, can, -0.3 + col * 0.13, 0.6 + row * 0.24, 0.3);
  }
  put(g, rbox(0.18, 0.5, 0.03, mat(0x1f2937, 0.4), 0.01), 0.3, 1.2, 0.35);
  put(g, blobShadow(1.2, 1.0, 0.35), 0, 0, 0);
  return g;
}

export function createWaterCooler(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.4, 0.95, 0.4, mat(0xf1f5f9, 0.4), 0.04), 0, 0.475, 0);
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7, roughness: 0.05 })
  );
  put(g, bottle, 0, 1.17, 0);
  put(g, rbox(0.06, 0.05, 0.05, mat(0x2563eb, 0.4), 0.01), -0.07, 0.8, 0.21);
  put(g, rbox(0.06, 0.05, 0.05, mat(0xdc2626, 0.4), 0.01), 0.07, 0.8, 0.21);
  put(g, blobShadow(0.7, 0.7, 0.35), 0, 0, 0);
  return g;
}

export function createPrinter(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.62, 0.7, 0.52, mat(0x4b5563, 0.5), 0.03), 0, 0.35, 0); // cabinet
  put(g, rbox(0.56, 0.32, 0.48, mat(0xe5e7eb, 0.45), 0.04), 0, 0.86, 0);
  put(g, rbox(0.4, 0.02, 0.22, mat(0xffffff, 0.8), 0.005), 0, 1.03, 0.08);
  put(g, rbox(0.12, 0.03, 0.06, mat(0x22c55e, 0.3), 0.01), 0.18, 1.03, 0.2);
  put(g, blobShadow(0.9, 0.8, 0.3), 0, 0, 0);
  return g;
}

export function createTV(width = 1.3): THREE.Group {
  // wall-mounted, screen toward +Z
  const g = new THREE.Group();
  put(g, rbox(width, width * 0.58, 0.05, mat(0x111827, 0.3, 0.3), 0.015), 0, 0, 0);
  const screen = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x3b82f6, emissiveIntensity: 0.55, roughness: 0.15 });
  put(g, new THREE.Mesh(new THREE.PlaneGeometry(width - 0.06, width * 0.58 - 0.06), screen), 0, 0, 0.026);
  return g;
}

export function createTrashBin(): THREE.Group {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.38, 14, 1, true), mat(0x6b7280, 0.5, 0.4)), 0, 0.19, 0).castShadow = true;
  return g;
}

// ---------------------------------------------------------------------------
// plants & lights
// ---------------------------------------------------------------------------

export type PlantKind = 'ficus' | 'snake' | 'monstera' | 'palm';

export function createPlant(kind: PlantKind = 'ficus', seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const potColor = [0xe7e5e4, 0xc2410c, 0x1f2937, 0x0f766e][Math.floor(r() * 4)];
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.42, 16), mat(potColor, 0.45)), 0, 0.21, 0).castShadow = true;
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), mat(0x3f2a1d, 0.9)), 0, 0.41, 0);
  const leaf = mat(kind === 'snake' ? 0x3f6212 : 0x2f7d32, 0.7);
  const leafLight = mat(kind === 'snake' ? 0x65a30d : 0x4caf50, 0.7);
  if (kind === 'snake') {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const blade = rbox(0.07, 0.6 + r() * 0.35, 0.02, i % 2 ? leaf : leafLight, 0.01, 1);
      blade.position.set(Math.sin(a) * 0.07, 0.7 + r() * 0.1, Math.cos(a) * 0.07);
      blade.rotation.set((r() - 0.5) * 0.4, a, (r() - 0.5) * 0.4);
      g.add(blade);
    }
  } else if (kind === 'palm' || kind === 'monstera') {
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.7, 6), mat(0x6b4f2a, 0.8)), 0, 0.75, 0);
    const n = kind === 'palm' ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.3;
      const frond = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 4), i % 2 ? leaf : leafLight);
      frond.scale.set(kind === 'palm' ? 0.35 : 0.8, 0.12, 1.2);
      frond.position.set(Math.sin(a) * 0.25, 1.05 + r() * 0.15, Math.cos(a) * 0.25);
      frond.rotation.set(0.5, a, 0);
      frond.castShadow = true;
      g.add(frond);
    }
  } else {
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.55, 6), mat(0x6b4f2a, 0.8)), 0, 0.68, 0);
    for (let i = 0; i < 5; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.1, 1), i % 2 ? leaf : leafLight);
      blob.position.set((r() - 0.5) * 0.35, 0.95 + r() * 0.4, (r() - 0.5) * 0.35);
      blob.castShadow = true;
      g.add(blob);
    }
  }
  put(g, blobShadow(0.8, 0.8, 0.35), 0, 0, 0);
  return g;
}

export interface LampHandle {
  group: THREE.Group;
  /** emissive material to brighten at night */
  bulb: THREE.MeshStandardMaterial;
  glow?: THREE.Mesh;
}

export function createFloorLamp(): LampHandle {
  const g = new THREE.Group();
  const metal = mat(0x27272a, 0.4, 0.6);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 16), metal), 0, 0.02, 0);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), metal), 0, 0.77, 0);
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfff7e6, emissive: 0xffc46b, emissiveIntensity: 0.2, roughness: 0.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 18, 1, true), bulb);
  put(g, shade, 0, 1.6, 0);
  const glow = glowDecal(1.3);
  put(g, glow, 0, 0, 0);
  put(g, blobShadow(0.5, 0.5, 0.3), 0, 0, 0);
  return { group: g, bulb, glow };
}

export function createDeskLamp(): LampHandle {
  const g = new THREE.Group();
  const metal = mat(0x1f2937, 0.4, 0.5);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 12), metal), 0, 0.01, 0);
  const arm = put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6), metal), 0, 0.17, 0);
  arm.rotation.z = 0.25;
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xffc46b, emissiveIntensity: 0.2 });
  const head = put(g, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 12, 1, true), bulb), -0.06, 0.34, 0);
  head.rotation.z = -0.6;
  return { group: g, bulb };
}

export function createStreetLamp(): LampHandle {
  const g = new THREE.Group();
  const metal = mat(0x1f2937, 0.4, 0.6);
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), metal), 0, 2.1, 0).castShadow = true;
  const arm = put(g, rbox(0.9, 0.06, 0.06, metal, 0.02), 0.4, 4.15, 0);
  arm.castShadow = false;
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0xffd28a, emissiveIntensity: 0, roughness: 0.4 });
  put(g, rbox(0.36, 0.1, 0.22, metal, 0.03), 0.8, 4.1, 0);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.17), bulb), 0.8, 4.04, 0);
  const glow = glowDecal(2.6);
  put(g, glow, 0.8, 0, 0);
  return { group: g, bulb, glow };
}

// ---------------------------------------------------------------------------
// wall decor
// ---------------------------------------------------------------------------

export function createWallClock(): { group: THREE.Group; hour: THREE.Object3D; minute: THREE.Object3D } {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32), mat(0x1f2937, 0.4, 0.4));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.21, 32), mat(0xfafaf9, 0.6));
  face.position.z = 0.026;
  g.add(face);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, i % 3 ? 0.025 : 0.045, 0.005), mat(0x111827, 0.5));
    tick.position.set(Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0.03);
    tick.rotation.z = -a;
    g.add(tick);
  }
  const mkHand = (len: number, w: number, color: number) => {
    const pivot = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.006), mat(color, 0.5));
    hand.position.y = len / 2 - 0.015;
    pivot.add(hand);
    pivot.position.z = 0.034;
    g.add(pivot);
    return pivot;
  };
  const hour = mkHand(0.11, 0.018, 0x111827);
  const minute = mkHand(0.16, 0.012, 0x111827);
  return { group: g, hour, minute };
}

function paintingTexture(seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const palettes = [
    ['#f4d35e', '#ee964b', '#f95738', '#0d3b66', '#faf0ca'],
    ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
    ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff'],
    ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'],
  ];
  const p = palettes[seed % palettes.length];
  ctx.fillStyle = p[4];
  ctx.fillRect(0, 0, 192, 128);
  if (seed % 2 === 0) {
    // landscape: sky, sun, hills
    ctx.fillStyle = p[3];
    ctx.fillRect(0, 0, 192, 70);
    ctx.fillStyle = p[0];
    ctx.beginPath();
    ctx.arc(140, 40, 18, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = p[1 + (i % 2)];
      ctx.beginPath();
      ctx.ellipse(40 + i * 60, 128, 80, 60 - i * 10, 0, Math.PI, 0);
      ctx.fill();
    }
  } else {
    // abstract shapes
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = p[Math.floor(r() * 4)];
      if (r() < 0.5) {
        ctx.beginPath();
        ctx.arc(r() * 192, r() * 128, 10 + r() * 30, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(r() * 160, r() * 100, 20 + r() * 50, 10 + r() * 40);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPainting(w: number, h: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(w + 0.08, h + 0.08, 0.04, mat(0x3d2010, 0.4), 0.015), 0, 0, 0);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTexture(seed), roughness: 0.7 }));
  art.position.z = 0.021;
  g.add(art);
  return g;
}

export function createLogoSign(text: string): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.moveTo(64, 20);
  ctx.lineTo(92, 64);
  ctx.lineTo(64, 108);
  ctx.lineTo(36, 64);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 54px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 120, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.4 })
  );
  sign.position.z = 0.03;
  g.add(sign);
  put(g, rbox(2.5, 0.7, 0.05, mat(0x1e293b, 0.3, 0.4), 0.02), 0, 0, 0);
  return g;
}

/**
 * Window spanning the full wall thickness. Glass is emissive so the
 * Environment can tint it with the sky colour.
 */
export function createWindow(width: number, height: number, wallThickness: number): { group: THREE.Group; glass: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const frame = mat(0xf8fafc, 0.4);
  const d = wallThickness + 0.06;
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x93cff8,
    emissiveIntensity: 0.7,
    roughness: 0.05,
    metalness: 0.2,
  });
  put(g, new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThickness + 0.02), glass), 0, 0, 0);
  const t = 0.07;
  put(g, rbox(width + t * 2, t, d, frame, 0.015), 0, height / 2 + t / 2, 0);
  put(g, rbox(width + t * 2 + 0.08, t, d + 0.08, frame, 0.015), 0, -height / 2 - t / 2, 0); // sill
  for (const s of [-1, 1]) put(g, rbox(t, height, d, frame, 0.015), s * (width / 2 + t / 2), 0, 0);
  put(g, rbox(0.035, height, d - 0.02, frame, 0.01), 0, 0, 0); // mullion
  put(g, rbox(width, 0.035, d - 0.02, frame, 0.01), 0, height * 0.15, 0); // transom
  return { group: g, glass };
}

export function createRug(w: number, d: number, base: string, accent: string, pattern: 'border' | 'stripes' | 'round' = 'border'): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.max(64, Math.round((256 * d) / w));
  const ctx = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  if (pattern === 'stripes') {
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 10, H);
  } else {
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, W / 6, H / 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // fabric noise
  const img = ctx.getImageData(0, 0, W, H);
  const r = rng(W * 31 + H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = pattern === 'round' ? new THREE.CircleGeometry(w / 2, 40) : new THREE.PlaneGeometry(w, d);
  const rug = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.006;
  rug.receiveShadow = true;
  return rug;
}

// ---------------------------------------------------------------------------
// desk props
// ---------------------------------------------------------------------------

export function createMug(color = 0xffffff): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), mat(color, 0.3));
  m.position.y = 0.045;
  m.castShadow = true;
  return m;
}

export function createBookStack(seed = 1, n = 4): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.03 + r() * 0.03;
    const b = rbox(0.22 + r() * 0.06, h, 0.16 + r() * 0.04, mat(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], 0.8), 0.005, 1);
    b.position.y = y + h / 2;
    b.rotation.y = (r() - 0.5) * 0.4;
    g.add(b);
    y += h;
  }
  return g;
}

export function createPhone(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.18, 0.05, 0.16, mat(0x1f2937, 0.4), 0.015), 0, 0.025, 0);
  put(g, rbox(0.17, 0.035, 0.05, mat(0x111827, 0.4), 0.015), 0, 0.065, -0.04);
  return g;
}

export function createPaperTray(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    put(g, rbox(0.26, 0.04, 0.33, mat(0x334155, 0.5), 0.005), 0, 0.02 + i * 0.07, 0);
    put(g, rbox(0.21, 0.015, 0.29, mat(0xffffff, 0.9), 0.002), 0, 0.045 + i * 0.07, 0);
  }
  return g;
}

export function createCamera(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.14, 0.09, 0.07, mat(0x111827, 0.4), 0.015), 0, 0.045, 0);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14), mat(0x374151, 0.3, 0.5));
  lens.rotation.x = Math.PI / 2;
  put(g, lens, 0, 0.045, 0.06);
  return g;
}

export function createLaptop(): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(0.34, 0.015, 0.24, mat(0x9ca3af, 0.3, 0.7), 0.006), 0, 0.008, 0);
  const lid = put(g, rbox(0.34, 0.22, 0.012, mat(0x9ca3af, 0.3, 0.7), 0.006), 0, 0.12, -0.12);
  lid.rotation.x = -0.25;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 0.5 }));
  screen.name = 'laptopScreen';
  screen.position.set(0, 0, 0.007);
  lid.add(screen);
  return g;
}

export function createCan(color = 0x16a34a): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10), mat(color, 0.3, 0.6));
  m.position.y = 0.055;
  return m;
}

// ---------------------------------------------------------------------------
// exterior
// ---------------------------------------------------------------------------

export function createTree(seed: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const trunkH = 1.4 + r() * 0.8;
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, trunkH, 7), mat(0x6b4423, 0.9)), 0, trunkH / 2, 0).castShadow = true;
  const greens = [0x2e7d32, 0x388e3c, 0x43a047, 0x1b5e20, 0x558b2f];
  const conifer = r() < 0.3;
  if (conifer) {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - i * 0.28, 1.3, 8), mat(greens[3], 0.8));
      cone.position.y = trunkH + 0.2 + i * 0.75;
      cone.castShadow = true;
      g.add(cone);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + r() * 0.4, 1), mat(greens[Math.floor(r() * greens.length)], 0.8));
      (blob.material as THREE.MeshStandardMaterial).flatShading = true;
      blob.position.set((r() - 0.5) * 0.9, trunkH + 0.4 + r() * 0.7, (r() - 0.5) * 0.9);
      blob.castShadow = true;
      g.add(blob);
    }
  }
  g.scale.setScalar(scale * (0.85 + r() * 0.35));
  put(g, blobShadow(2.4, 2.4, 0.3), 0, 0.005, 0);
  return g;
}

export function createBush(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + r() * 0.15, 1), mat(r() < 0.5 ? 0x2e7d32 : 0x4c9a2a, 0.85));
    b.position.set((r() - 0.5) * 0.5, 0.25 + r() * 0.1, (r() - 0.5) * 0.3);
    b.castShadow = true;
    g.add(b);
  }
  if (r() < 0.4) {
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat([0xf472b6, 0xfacc15, 0xffffff][i % 3], 0.6));
      f.position.set((r() - 0.5) * 0.6, 0.45 + r() * 0.15, (r() - 0.5) * 0.4 + 0.15);
      g.add(f);
    }
  }
  return g;
}

export function createCar(color: number): THREE.Group {
  // length along X
  const g = new THREE.Group();
  const paint = mat(color, 0.25, 0.5);
  put(g, rbox(3.9, 0.55, 1.7, paint, 0.18), 0, 0.55, 0);
  put(g, rbox(2.1, 0.5, 1.5, paint, 0.2), -0.25, 1.05, 0);
  const glass = mat(0x1e293b, 0.1, 0.6);
  put(g, rbox(2.14, 0.36, 1.52, glass, 0.15), -0.25, 1.08, 0);
  put(g, rbox(2.0, 0.08, 1.4, paint, 0.03), -0.25, 1.31, 0);
  const wheel = mat(0x111111, 0.8);
  for (const sx of [-1.25, 1.25]) for (const sz of [-0.82, 0.82]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), wheel);
    w.rotation.x = Math.PI / 2;
    put(g, w, sx, 0.34, sz);
  }
  put(g, rbox(0.06, 0.14, 0.4, mat(0xfef9c3, 0.2), 0.03), 1.95, 0.62, 0.5);
  put(g, rbox(0.06, 0.14, 0.4, mat(0xfef9c3, 0.2), 0.03), 1.95, 0.62, -0.5);
  put(g, rbox(0.06, 0.12, 0.35, mat(0xdc2626, 0.3), 0.03), -1.95, 0.65, 0.55);
  put(g, rbox(0.06, 0.12, 0.35, mat(0xdc2626, 0.3), 0.03), -1.95, 0.65, -0.55);
  put(g, blobShadow(4.6, 2.4, 0.45), 0, 0, 0);
  return g;
}

export function createHedge(len: number): THREE.Group {
  // runs along X
  const g = new THREE.Group();
  put(g, rbox(len, 0.8, 0.7, mat(0x2f6b2a, 0.9), 0.25), 0, 0.4, 0);
  put(g, blobShadow(len + 0.4, 1.3, 0.3), 0, 0, 0);
  return g;
}

export function createBench(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x8b5a2b, 0.7);
  for (let i = 0; i < 3; i++) put(g, rbox(1.6, 0.04, 0.12, wood, 0.01), 0, 0.45, -0.15 + i * 0.15);
  for (let i = 0; i < 2; i++) put(g, rbox(1.6, 0.12, 0.04, wood, 0.01), 0, 0.65 + i * 0.16, -0.24);
  const iron = mat(0x1f2937, 0.5, 0.6);
  for (const s of [-0.7, 0.7]) put(g, rbox(0.05, 0.45, 0.45, iron, 0.01), s, 0.225, 0);
  return g;
}
