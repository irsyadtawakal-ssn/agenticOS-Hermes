import * as THREE from 'three';

/**
 * High-fidelity procedural textures for The Sims 2 aesthetic:
 * - Expressive Sims 2 face textures (eyes with iris, pupils, specular shine, brows, lips)
 * - Detailed clothing textures (collars, ties, buttons, pockets, seams)
 * - Floor materials (realistic wood parquet, glossy checkered pantry tiles, office carpet)
 * - Wall materials with baseboards and moldings
 */

export interface FaceConfig {
  eyeColor: string;
  hairColor: string;
  skinTone: string;
  lipColor: string;
  expression?: 'smile' | 'smart' | 'focused' | 'cheerful';
  glasses?: boolean;
}

export function createSimsFaceTexture(config: FaceConfig): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. Skin Base with subtle warm gradient
  const skinGrad = ctx.createRadialGradient(256, 256, 80, 256, 256, 280);
  skinGrad.addColorStop(0, config.skinTone);
  skinGrad.addColorStop(1, adjustBrightness(config.skinTone, -0.1));
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft cheek blush
  ctx.fillStyle = 'rgba(244, 114, 182, 0.18)';
  ctx.beginPath();
  ctx.arc(150, 310, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(362, 310, 50, 0, Math.PI * 2);
  ctx.fill();

  // 2. Eyes (Sims 2 expressive, alive eyes)
  const drawEye = (cx: number, cy: number, flip: boolean) => {
    // Sclera (White)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 42, 28, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2d2522';
    ctx.stroke();
    ctx.clip();

    // Iris (Colored with gradient)
    const irisGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 24);
    irisGrad.addColorStop(0, '#ffffff');
    irisGrad.addColorStop(0.3, config.eyeColor);
    irisGrad.addColorStop(1, adjustBrightness(config.eyeColor, -0.4));
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();

    // Specular Highlight (The iconic twinkle in Sims eyes)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 7, cy - 7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 6, cy + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Eyelid line & Eyelashes
    ctx.strokeStyle = '#1e1b18';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 43, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // Lashes
    if (flip) {
      ctx.beginPath();
      ctx.moveTo(cx + 38, cy - 10);
      ctx.lineTo(cx + 48, cy - 18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 38, cy - 10);
      ctx.lineTo(cx - 48, cy - 18);
      ctx.stroke();
    }
  };

  drawEye(170, 240, false);
  drawEye(342, 240, true);

  // 3. Eyebrows
  ctx.strokeStyle = config.hairColor;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';

  // Left Brow
  ctx.beginPath();
  ctx.moveTo(125, 185);
  ctx.quadraticCurveTo(170, 168, 215, 185);
  ctx.stroke();

  // Right Brow
  ctx.beginPath();
  ctx.moveTo(297, 185);
  ctx.quadraticCurveTo(342, 168, 387, 185);
  ctx.stroke();

  // 4. Cute stylized nose
  ctx.strokeStyle = adjustBrightness(config.skinTone, -0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(256, 270);
  ctx.lineTo(256, 310);
  ctx.quadraticCurveTo(256, 320, 246, 322);
  ctx.stroke();

  // Nostril curves
  ctx.beginPath();
  ctx.arc(264, 322, 4, 0, Math.PI);
  ctx.stroke();

  // 5. Expressive Mouth / Smile
  ctx.strokeStyle = config.lipColor;
  ctx.fillStyle = config.lipColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(215, 380);
  ctx.quadraticCurveTo(256, 420, 297, 380);
  ctx.stroke();

  // Lip highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(256, 396, 6, 0, Math.PI * 2);
  ctx.fill();

  // 6. Glasses if configured
  if (config.glasses) {
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 6;
    // Left lens frame
    ctx.strokeRect(125, 205, 90, 70);
    // Right lens frame
    ctx.strokeRect(297, 205, 90, 70);
    // Bridge
    ctx.beginPath();
    ctx.moveTo(215, 235);
    ctx.lineTo(297, 235);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Realistic Wood Parquet Floor (Chief Office) */
export function createWoodParquetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a2f1b';
  ctx.fillRect(0, 0, 512, 512);

  const plankW = 128;
  const plankH = 32;

  for (let y = 0; y < 512; y += plankH) {
    const rowOffset = (Math.floor(y / plankH) % 2) * (plankW / 2);
    for (let x = -plankW; x < 512 + plankW; x += plankW) {
      const px = x + rowOffset;
      const shade = Math.sin(px * 12.3 + y * 45.6) * 15;
      const r = Math.min(255, Math.max(0, 90 + shade));
      const g = Math.min(255, Math.max(0, 55 + shade * 0.7));
      const b = Math.min(255, Math.max(0, 32 + shade * 0.5));

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px + 1, y + 1, plankW - 2, plankH - 2);

      // Wood grain lines
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 3; g++) {
        ctx.beginPath();
        const gy = y + 4 + g * 8;
        ctx.moveTo(px, gy);
        ctx.bezierCurveTo(px + 40, gy + 2, px + 80, gy - 2, px + plankW, gy);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

/** Glossy Checkered Pantry Tiles (Pantry) */
export function createCheckeredTilesTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const tileSize = 64;
  for (let y = 0; y < 512; y += tileSize) {
    for (let x = 0; x < 512; x += tileSize) {
      const isAlt = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0;

      // Marble look: Cream vs Warm Terracotta
      ctx.fillStyle = isAlt ? '#faf7f2' : '#c47d52';
      ctx.fillRect(x, y, tileSize, tileSize);

      // Bevel border highlight
      ctx.fillStyle = isAlt ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
      ctx.fillRect(x + 1, y + 1, tileSize - 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, tileSize - 2);

      // Dark grout line
      ctx.strokeStyle = '#33271e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, tileSize, tileSize);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

/** Modern Office Carpet Texture (Workstations) */
export function createCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5b6b80';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle crosshatch fabric weave
  ctx.fillStyle = '#6a7b91';
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      if ((x + y) % 8 === 0) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // Grid carpet tile borders
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeRect(128, 0, 128, 128);
  ctx.strokeRect(0, 128, 128, 128);
  ctx.strokeRect(128, 128, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

/** Meeting Room Wood Slate Texture */
export function createMeetingFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#6b482b';
  ctx.fillRect(0, 0, 512, 512);

  const plankW = 256;
  const plankH = 40;

  for (let y = 0; y < 512; y += plankH) {
    const offset = (Math.floor(y / plankH) % 2) * (plankW / 2);
    for (let x = -plankW; x < 512 + plankW; x += plankW) {
      const px = x + offset;
      ctx.fillStyle = (x + y) % 3 === 0 ? '#785232' : '#6b482b';
      ctx.fillRect(px + 1, y + 1, plankW - 2, plankH - 2);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, y, plankW, plankH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

/** Wallpaper Texture with Baseboard */
export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Warm Sims 2 cream interior paint
  ctx.fillStyle = '#e8e2d8';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle vertical stripe wallpaper pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let x = 0; x < 256; x += 16) {
    ctx.fillRect(x, 0, 8, 256);
  }

  // Wooden baseboard trim at bottom
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(0, 224, 256, 32);

  // Baseboard highlight & shadow
  ctx.fillStyle = '#85532f';
  ctx.fillRect(0, 224, 256, 3);
  ctx.fillStyle = '#26150a';
  ctx.fillRect(0, 253, 256, 3);

  // Chair rail molding trim in upper middle
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(0, 140, 256, 6);
  ctx.fillStyle = '#85532f';
  ctx.fillRect(0, 140, 256, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  texture.needsUpdate = true;
  return texture;
}

function adjustBrightness(hex: string, percent: number): string {
  let num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  let b = (num & 0x0000ff) + Math.round(255 * percent);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Exterior brick siding with a stone plinth (outer face of perimeter walls). */
export function createBrickTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d8cfc2';
  ctx.fillRect(0, 0, 256, 256);
  const bw = 32;
  const bh = 12;
  for (let y = 0; y < 220; y += bh) {
    const off = (Math.floor(y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < 256 + bw; x += bw) {
      const shade = Math.sin(x * 3.1 + y * 7.7) * 12;
      ctx.fillStyle = `rgb(${172 + shade},${92 + shade * 0.6},${70 + shade * 0.5})`;
      ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // stone plinth
  ctx.fillStyle = '#8f877a';
  ctx.fillRect(0, 220, 256, 36);
  ctx.fillStyle = '#a8a092';
  ctx.fillRect(0, 220, 256, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Polished marble tiles for the reception lobby. */
export function createMarbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const tile = 128;
  for (let y = 0; y < 256; y += tile) {
    for (let x = 0; x < 256; x += tile) {
      ctx.fillStyle = (x + y) % (tile * 2) === 0 ? '#ece8e1' : '#ddd7cc';
      ctx.fillRect(x, y, tile, tile);
      ctx.strokeStyle = 'rgba(120,110,100,0.25)';
      ctx.lineWidth = 1.2;
      for (let v = 0; v < 3; v++) {
        ctx.beginPath();
        const sy = y + Math.abs(Math.sin(x * 0.7 + v * 2.1)) * tile;
        ctx.moveTo(x, sy);
        ctx.bezierCurveTo(x + 40, sy - 30, x + 80, sy + 30, x + tile, sy - 10);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(90,80,70,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, tile, tile);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
