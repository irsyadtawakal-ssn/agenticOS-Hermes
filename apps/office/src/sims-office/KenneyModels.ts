import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface KenneyFitOptions {
  height?: number; // target bounding box height in meters
  width?: number;  // target bounding box width in meters
  depth?: number;  // target bounding box depth in meters
  scale?: number;  // direct scale multiplier
  yaw?: number;    // rotation in radians around Y
  xOffset?: number;
  yOffset?: number;
  zOffset?: number;
  color?: number;  // optional color tint for main material
}

interface LoadedTemplate {
  scene: THREE.Group;
  baseSize: THREE.Vector3;
}

export class KenneyLibrary {
  private cache = new Map<string, Promise<LoadedTemplate>>();
  private loader: GLTFLoader | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getLoader(): GLTFLoader {
    if (!this.loader) {
      this.loader = new GLTFLoader();
    }
    return this.loader;
  }

  public get(name: string): Promise<LoadedTemplate> {
    let p = this.cache.get(name);
    if (!p) {
      p = new Promise((resolve, reject) => {
        const url = `${this.baseUrl}${name}.glb`;
        this.getLoader().load(
          url,
          (gltf) => {
            const root = gltf.scene;
            root.updateMatrixWorld(true);

            // Compute bounds
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            // Center horizontally around (0,0) and place bottom at y = 0
            root.position.set(-center.x, -box.min.y, -center.z);

            const wrapper = new THREE.Group();
            wrapper.add(root);

            wrapper.traverse((child) => {
              const mesh = child as THREE.Mesh;
              if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                if (mesh.material) {
                  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                  for (const m of mats) {
                    if (m instanceof THREE.MeshStandardMaterial) {
                      m.roughness = Math.max(0.2, m.roughness ?? 0.5);
                    }
                  }
                }
              }
            });

            resolve({ scene: wrapper, baseSize: size });
          },
          undefined,
          (err) => reject(err)
        );
      });
      this.cache.set(name, p);
    }
    return p;
  }

  public async instantiate(name: string, fit?: KenneyFitOptions): Promise<THREE.Group> {
    const template = await this.get(name);
    const container = new THREE.Group();
    const cloned = template.scene.clone(true);

    let scale = fit?.scale ?? 1.0;
    if (fit?.height && template.baseSize.y > 0.001) {
      scale = fit.height / template.baseSize.y;
    } else if (fit?.width && template.baseSize.x > 0.001) {
      scale = fit.width / template.baseSize.x;
    } else if (fit?.depth && template.baseSize.z > 0.001) {
      scale = fit.depth / template.baseSize.z;
    }

    cloned.scale.setScalar(scale);

    if (fit?.yaw) {
      cloned.rotation.y = fit.yaw;
    }

    if (fit?.xOffset || fit?.yOffset || fit?.zOffset) {
      cloned.position.set(fit.xOffset ?? 0, fit.yOffset ?? 0, fit.zOffset ?? 0);
    }

    if (fit?.color !== undefined) {
      cloned.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) {
              const clonedMat = m.clone();
              clonedMat.color.setHex(fit.color!);
              mesh.material = clonedMat;
            }
          }
        }
      });
    }

    container.add(cloned);
    return container;
  }
}

let sharedKenney: KenneyLibrary | null = null;
export function kenneyLibrary(): KenneyLibrary {
  if (!sharedKenney) {
    sharedKenney = new KenneyLibrary(`${import.meta.env.BASE_URL}sims/furniture/kenney/`);
  }
  return sharedKenney;
}

/**
 * Creates an object that asynchronously loads a Kenney CC0 model,
 * while synchronously displaying a procedural fallback until ready.
 */
export function createKenney(
  name: string,
  fit?: KenneyFitOptions,
  fallback?: () => THREE.Object3D
): THREE.Group {
  const group = new THREE.Group();
  let fb: THREE.Object3D | null = null;
  if (fallback) {
    fb = fallback();
    group.add(fb);
  }

  // Load async in background
  kenneyLibrary()
    .instantiate(name, fit)
    .then((inst) => {
      if (fb) {
        group.remove(fb);
        fb.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry) {
            m.geometry.dispose();
          }
        });
      }
      group.add(inst);
    })
    .catch((_err) => {
      // In tests or offline environments, fallback stays active seamlessly
    });

  return group;
}
