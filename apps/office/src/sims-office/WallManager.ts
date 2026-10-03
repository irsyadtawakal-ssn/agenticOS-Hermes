import * as THREE from 'three';

export type WallDisplayMode = 'cutaway' | 'down' | 'full';

export interface WallSegment {
  mesh: THREE.Mesh;
  originalHeight: number;
  facing: 'north' | 'south' | 'east' | 'west' | 'interior';
  /** objects mounted on this wall (windows, paintings, clocks) */
  decor: THREE.Object3D[];
}

export class WallManager {
  private walls: WallSegment[] = [];
  private mode: WallDisplayMode = 'cutaway';

  constructor() {
    try {
      const saved = localStorage.getItem('aos.sims.wallMode');
      if (saved === 'cutaway' || saved === 'down' || saved === 'full') {
        this.mode = saved;
      }
    } catch {
      // defaults to cutaway
    }
  }

  public registerWall(mesh: THREE.Mesh, facing: 'north' | 'south' | 'east' | 'west' | 'interior', originalHeight: number = 2.6): void {
    this.walls.push({ mesh, facing, originalHeight, decor: [] });
  }

  /** Mount an object on a registered wall; it hides while the wall is cut down. */
  public attachDecor(mesh: THREE.Mesh, obj: THREE.Object3D): void {
    this.walls.find((w) => w.mesh === mesh)?.decor.push(obj);
  }

  public getMode(): WallDisplayMode {
    return this.mode;
  }

  public setMode(mode: WallDisplayMode): void {
    this.mode = mode;
    try {
      localStorage.setItem('aos.sims.wallMode', mode);
    } catch {
      // ignore
    }
  }

  public cycleMode(): WallDisplayMode {
    if (this.mode === 'cutaway') this.setMode('down');
    else if (this.mode === 'down') this.setMode('full');
    else this.setMode('cutaway');
    return this.mode;
  }

  /**
   * Updates wall heights and opacities based on camera angle and current mode.
   * cameraAngleIndex: 0 = NW, 1 = NE, 2 = SE, 3 = SW
   */
  public update(cameraAngleIndex: number, dt: number): void {
    const lerpSpeed = Math.min(1.0, dt * 8);

    for (const wall of this.walls) {
      let desiredScaleY = 1.0;
      let desiredOpacity = 1.0;

      if (this.mode === 'down') {
        desiredScaleY = 0.12; // Wall cut down to low trim baseboard
        desiredOpacity = 0.8;
      } else if (this.mode === 'full') {
        desiredScaleY = 1.0;
        desiredOpacity = 1.0;
      } else {
        // Cutaway mode: lower walls that block the camera's line of sight
        // Depending on which quadrant the camera is looking from
        let shouldCut = false;

        // Camera viewing from South / West / North / East
        if (cameraAngleIndex === 0) {
          // Camera looking from South-East toward North-West
          if (wall.facing === 'south' || wall.facing === 'east') shouldCut = true;
        } else if (cameraAngleIndex === 1) {
          // Camera looking from South-West toward North-East
          if (wall.facing === 'south' || wall.facing === 'west') shouldCut = true;
        } else if (cameraAngleIndex === 2) {
          // Camera looking from North-West toward South-East
          if (wall.facing === 'north' || wall.facing === 'west') shouldCut = true;
        } else if (cameraAngleIndex === 3) {
          // Camera looking from North-East toward South-West
          if (wall.facing === 'north' || wall.facing === 'east') shouldCut = true;
        }

        if (shouldCut) {
          desiredScaleY = 0.15;
          desiredOpacity = 0.6;
        } else {
          desiredScaleY = 1.0;
          desiredOpacity = 1.0;
        }
      }

      // Smoothly animate scale Y
      wall.mesh.scale.y += (desiredScaleY - wall.mesh.scale.y) * lerpSpeed;
      // Adjust position Y so bottom remains pinned to floor (y = 0)
      wall.mesh.position.y = (wall.originalHeight * wall.mesh.scale.y) / 2;
      const decorVisible = wall.mesh.scale.y > 0.75;
      for (const d of wall.decor) d.visible = decorVisible;

      const mat = wall.mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if ('opacity' in m) m.opacity += (desiredOpacity - (m.opacity as number)) * lerpSpeed;
        }
      } else if (mat && 'opacity' in mat) {
        mat.opacity += (desiredOpacity - (mat.opacity as number)) * lerpSpeed;
      }
    }
  }

  public clear(): void {
    this.walls = [];
  }
}
